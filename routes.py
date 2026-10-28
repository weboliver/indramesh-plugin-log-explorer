"""The log-explorer plugin's HTTP surface (Phase 305, LOGX-01..04).

Every route carries ``require_permission('system-logs','read')`` UNDER the Core
mount chain (authentication + ``plugin-runtime:use`` + active-state), so the
whole plugin is refused at mount time if any operation lacks a known business
permission.

Deployment state, never request input: the Loki query base
(``LOKI_QUERY_URL``), the declared external-only switch
(``LOG_EXPLORER_EXTERNAL_ONLY=true``), the browser-reachable Grafana pair
(``GRAFANA_EXPLORE_URL`` + ``GRAFANA_LOKI_DATASOURCE``) and the fixed instance
scope are all read from the process environment at CALL time (the route ``ctx``
is a mount-time snapshot and a config PUT never refreshes it).

The browser↔plugin contract (Plan 03 consumes it unchanged):

* ``GET /status`` -> ``{"state": ok|not_configured|external_only|unreachable, "grafana": bool}``
* ``GET /services`` -> ``{"services": [], "levels": [], "categories": []}``
* ``GET /query`` -> ``{"lines": [], "limited": bool, "olderCursor": ns|null,
  "newestCursor": ns|null, "clamped": {"start","end"}|null, "gap": {...}|null}``
* ``GET /histogram`` -> ``{"bucketSeconds": int, "buckets": [{"start","end","counts"}]}``
* ``GET /grafana-link`` -> ``{"url": str|null}``

Timestamps cross the wire as ISO-8601 UTC strings ending in ``Z`` (millisecond
precision) and, where a cursor is needed, as decimal nanosecond strings (they
exceed ``Number.MAX_SAFE_INTEGER``, so the client compares them with ``BigInt``).
Filters are a whitelist: ``start``, ``end``, ``service``, ``level``, ``category``,
``text``, ``request_id``, ``task_id`` (repeated keys for multi-value), plus
``limit`` and at most one of ``before``/``after``. Every other key is ignored —
in particular there is no parameter for a query string, selector, Loki URL or
tenant.
"""

import hashlib
import json
import logging
import os
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query

from indramesh.sdk import require_permission

from . import logql
from .loki_client import LokiClient, LokiUnreachable

router = APIRouter()

# The plugin category comes from the loader-assigned module name, so this logger
# needs no plugin field of its own (Core drops a plugin-supplied one).
logger = logging.getLogger(__name__)

_NS_PER_SECOND = 1_000_000_000
_DEFAULT_WINDOW_SECONDS = 15 * 60
_GRAFANA_PANE_ID = "logx"

# The one Core-enforced business permission, layered under the mount chain.
SYSTEM_LOGS_READ = (Depends(require_permission("system-logs", "read")),)

# A literal, bounded logfmt pair scan (structured body parsing only; never a
# user-supplied pattern).
_LOGFMT_PAIR = re.compile(r'([A-Za-z_][A-Za-z0-9_.-]*)=("(?:[^"\\]|\\.)*"|[^\s]+)')


# --- request model -----------------------------------------------------------


@dataclass(frozen=True)
class LogFilters:
    """The whitelisted common filters, already resolved to a concrete window."""

    start_ns: int
    end_ns: int
    services: list[str]
    levels: list[str]
    categories: list[str]
    text: str | None
    request_id: str | None
    task_id: str | None


def _clean_list(values) -> list[str]:
    if not values:
        return []
    return [str(value) for value in values if value is not None and str(value) != ""]


def _parse_iso_ns(value: str) -> int | None:
    raw = (value or "").strip()
    if not raw:
        return None
    candidate = raw[:-1] + "+00:00" if raw.endswith("Z") else raw
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    parsed = parsed.astimezone(timezone.utc)
    return int(parsed.timestamp()) * _NS_PER_SECOND + parsed.microsecond * 1000


def _parse_time(value: str, *, field: str) -> int:
    parsed = _parse_iso_ns(value)
    if parsed is None:
        raise HTTPException(
            status_code=422, detail=f"'{field}' must be an ISO-8601 timestamp"
        )
    return parsed


def _parse_cursor(value: str, *, field: str) -> int:
    raw = (value or "").strip()
    if not raw.isdigit():
        raise HTTPException(
            status_code=422,
            detail=f"'{field}' must be a decimal nanosecond timestamp",
        )
    return int(raw)


def common_filters(
    start: str | None = Query(None, description="ISO-8601 window start"),
    end: str | None = Query(None, description="ISO-8601 window end (exclusive)"),
    service: list[str] | None = Query(None),
    level: list[str] | None = Query(None),
    category: list[str] | None = Query(None),
    text: str | None = Query(None),
    request_id: str | None = Query(None),
    task_id: str | None = Query(None),
) -> LogFilters:
    """Parse the whitelisted filter params; every other key is ignored.

    Defaults are the last 15 minutes. ``end`` is exclusive, ``start`` inclusive.
    Unknown k8s/Compose mismatches fail closed later (``_ensure_configured``).
    """
    now_ns = time.time_ns()
    end_ns = now_ns if end is None else _parse_time(end, field="end")
    if start is None:
        start_ns = end_ns - _DEFAULT_WINDOW_SECONDS * _NS_PER_SECOND
    else:
        start_ns = _parse_time(start, field="start")
    if end_ns <= start_ns:
        raise HTTPException(status_code=422, detail="'end' must be after 'start'")
    return LogFilters(
        start_ns=start_ns,
        end_ns=end_ns,
        services=_clean_list(service),
        levels=_clean_list(level),
        categories=_clean_list(category),
        text=text,
        request_id=request_id,
        task_id=task_id,
    )


# --- response rendering ------------------------------------------------------


def _iso_from_ns(ts_ns: int) -> str:
    """ISO-8601 UTC, millisecond precision, always ``Z``-suffixed."""
    seconds, nanos = divmod(int(ts_ns), _NS_PER_SECOND)
    parsed = datetime.fromtimestamp(seconds, tz=timezone.utc)
    return parsed.strftime("%Y-%m-%dT%H:%M:%S.") + f"{nanos // 1_000_000:03d}Z"


def _optional_str(value) -> str | None:
    if value is None:
        return None
    text = str(value)
    return text if text != "" else None


def _parse_logfmt(line: str) -> dict[str, str]:
    pairs: dict[str, str] = {}
    for match in _LOGFMT_PAIR.finditer(line):
        key, raw_value = match.group(1), match.group(2)
        if raw_value.startswith('"') and raw_value.endswith('"') and len(raw_value) >= 2:
            raw_value = raw_value[1:-1]
        pairs[key] = raw_value
    return pairs


def _parse_body(raw_line: str) -> dict | None:
    stripped = raw_line.strip()
    if stripped.startswith("{"):
        try:
            parsed = json.loads(stripped)
        except ValueError:
            return None
        return parsed if isinstance(parsed, dict) else None
    parsed = _parse_logfmt(stripped)
    return parsed or None


def _line_id(labels: dict, ts_ns: int, raw_line: str) -> str:
    """A stable line identity: hash of (stream labels, ns timestamp, raw line)."""
    canonical = json.dumps(
        [sorted((str(k), str(v)) for k, v in labels.items()), str(ts_ns), raw_line],
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]


def _line_from(ts_ns: int, labels: dict, raw_line: str) -> dict:
    parsed = _parse_body(raw_line)
    message = raw_line
    fields: dict[str, str] = {}
    if parsed is not None:
        raw_message = parsed.get("message", parsed.get("msg"))
        if raw_message is not None:
            message = str(raw_message)
        fields = {
            str(key): str(value)
            for key, value in parsed.items()
            if key not in ("message", "msg")
        }

    # Structured metadata is merged into the stream labels by Loki, so it wins;
    # a body-carried id is the fallback.
    request_id = _optional_str(labels.get("request_id"))
    if request_id is None and parsed is not None:
        request_id = _optional_str(parsed.get("request_id") or parsed.get("requestId"))
    task_id = _optional_str(labels.get("task_id"))
    if task_id is None and parsed is not None:
        task_id = _optional_str(parsed.get("task_id") or parsed.get("taskId"))

    return {
        "id": _line_id(labels, ts_ns, raw_line),
        "ts": _iso_from_ns(ts_ns),
        "tsNs": str(ts_ns),
        "service": str(labels.get("service", "")),
        "level": _optional_str(labels.get("level")),
        "category": _optional_str(labels.get("category")),
        "message": message,
        "fields": fields,
        "requestId": request_id,
        "taskId": task_id,
    }


def _map_lines(payload: dict) -> tuple[list[dict], int]:
    """Map a Loki stream result to ascending ``Line`` records + the raw count.

    Duplicate identities (labels, ns timestamp, raw line) collapse to one line.
    """
    data = payload.get("data")
    result = data.get("result") if isinstance(data, dict) else None
    if not isinstance(result, list):
        return [], 0

    entries: list[tuple[int, dict, str]] = []
    for stream in result:
        if not isinstance(stream, dict):
            continue
        labels = stream.get("stream")
        if not isinstance(labels, dict):
            labels = {}
        for pair in stream.get("values") or []:
            if not isinstance(pair, (list, tuple)) or len(pair) != 2:
                continue
            try:
                ts_ns = int(str(pair[0]))
            except (TypeError, ValueError):
                continue
            entries.append((ts_ns, labels, str(pair[1])))
    entries.sort(key=lambda entry: entry[0])

    lines: list[dict] = []
    seen: set[str] = set()
    for ts_ns, labels, raw_line in entries:
        line = _line_from(ts_ns, labels, raw_line)
        if line["id"] in seen:
            continue
        seen.add(line["id"])
        lines.append(line)
    return lines, len(entries)


def _sample_ts_ns(value) -> int:
    """A Loki metric sample time (Unix seconds) as integer nanoseconds."""
    return int(Decimal(str(value)) * _NS_PER_SECOND)


def _fill_buckets(
    payload: dict, start_ns: int, step_seconds: int, bucket_total: int
) -> list[dict]:
    """Zero-filled buckets; Loki floors its grid to the step and each sample
    lands in the bucket holding its ``(t - step, t]`` window midpoint.
    """
    step_ns = step_seconds * _NS_PER_SECOND
    counts: list[dict[str, int]] = [{} for _ in range(bucket_total)]
    levels: list[str] = []

    data = payload.get("data")
    result = data.get("result") if isinstance(data, dict) else None
    for series in result or []:
        if not isinstance(series, dict):
            continue
        metric = series.get("metric") or {}
        raw_level = metric.get("level") if isinstance(metric, dict) else None
        level = str(raw_level) if raw_level not in (None, "") else "Other"
        if level not in levels:
            levels.append(level)
        for pair in series.get("values") or []:
            if not isinstance(pair, (list, tuple)) or len(pair) != 2:
                continue
            try:
                ts_ns = _sample_ts_ns(pair[0])
                value = int(float(pair[1]))
            except (TypeError, ValueError, ArithmeticError):
                continue
            index = (ts_ns - step_ns // 2 - start_ns) // step_ns
            if 0 <= index < bucket_total:
                counts[index][level] = counts[index].get(level, 0) + value

    buckets: list[dict] = []
    for index in range(bucket_total):
        bucket_start = start_ns + index * step_ns
        buckets.append(
            {
                "start": _iso_from_ns(bucket_start),
                "end": _iso_from_ns(bucket_start + step_ns),
                "counts": {
                    level: counts[index].get(level, 0) for level in levels
                },
            }
        )
    return buckets


# --- Loki access -------------------------------------------------------------


def _ensure_configured() -> None:
    """Fail closed: no query base or no complete scope -> ``not_configured``."""
    if logql.scope_missing() or not (os.environ.get("LOKI_QUERY_URL") or "").strip():
        raise HTTPException(status_code=503, detail="not_configured")


async def _call_loki(coro):
    try:
        return await coro
    except LokiUnreachable as exc:
        raise HTTPException(status_code=503, detail="unreachable") from exc


def _selector_for(filters: LogFilters) -> str:
    """The one query builder every route uses — fixed scope + whitelisted filters."""
    return logql.build_selector(
        scope=logql.scope_from_env(),
        services=filters.services,
        levels=filters.levels,
        categories=filters.categories,
        text=filters.text,
        request_id=filters.request_id,
        task_id=filters.task_id,
    )


# --- routes ------------------------------------------------------------------


@router.get("/status", dependencies=SYSTEM_LOGS_READ)
async def status():
    """Classify the deployment state: ok | not_configured | external_only | unreachable.

    ``external_only`` is the DECLARED deployment value
    (``LOG_EXPLORER_EXTERNAL_ONLY=true``) and is never inferred from
    unreachability. ``ok`` requires a 2xx readiness response from
    ``GET {base}/ready``; any non-2xx from a reachable Loki and any transport
    error classify as ``unreachable``.
    """
    grafana = bool((os.environ.get("GRAFANA_EXPLORE_URL") or "").strip()) and bool(
        (os.environ.get("GRAFANA_LOKI_DATASOURCE") or "").strip()
    )

    if not (os.environ.get("LOKI_QUERY_URL") or "").strip() or logql.scope_missing():
        return {"state": "not_configured", "grafana": grafana}

    if (os.environ.get("LOG_EXPLORER_EXTERNAL_ONLY") or "").strip() == "true":
        return {"state": "external_only", "grafana": grafana}

    try:
        await LokiClient().readiness()
    except LokiUnreachable as exc:
        # D-08: exactly one bounded warning per unreachable answer. The message
        # is a literal and the fields are an enum, an int/None and an exception
        # class name — never the exception text, a provider body or the URL.
        logger.warning(
            "Log store readiness probe failed",
            extra={
                "reason": exc.reason,
                "status_code": exc.status_code,
                "cause": exc.cause,
            },
        )
        return {"state": "unreachable", "grafana": grafana}
    return {"state": "ok", "grafana": grafana}


@router.get("/services", dependencies=SYSTEM_LOGS_READ)
async def services(filters: LogFilters = Depends(common_filters)):
    """The service/level/category values present in the applied range and scope."""
    _ensure_configured()
    start_ns, end_ns, _shortened = logql.clamp_range(filters.start_ns, filters.end_ns)
    client = LokiClient()
    selector = logql.build_selector(scope=logql.scope_from_env())

    names = await _call_loki(client.label_names(selector, start_ns, end_ns))
    if not names:
        return {"services": [], "levels": [], "categories": []}

    discovered: dict[str, list[str]] = {}
    for label in ("service", "level", "category"):
        if label in names:
            discovered[label] = await _call_loki(
                client.label_values(label, selector, start_ns, end_ns)
            )
    return {
        "services": sorted(discovered.get("service", [])),
        "levels": sorted(discovered.get("level", [])),
        "categories": sorted(discovered.get("category", [])),
    }


@router.get("/query", dependencies=SYSTEM_LOGS_READ)
async def query(
    filters: LogFilters = Depends(common_filters),
    limit: int | None = Query(None, ge=1),
    before: str | None = Query(None, description="older page: exclusive ns cursor"),
    after: str | None = Query(None, description="live poll: inclusive ns cursor"),
):
    """Newest/older/live lines in the applied range, always ascending.

    * no cursor: newest ``limit`` lines in ``[start, end)`` (``direction=backward``)
    * ``before``: ``end = before + 1`` (inclusive re-fetch; the client dedupes)
    * ``after``: ``start = after`` (inclusive), ``end = now``, ``direction=forward``;
      a cursor older than ``now - MAX_RANGE`` starts at the clamp and reports ``gap``
    """
    if before is not None and after is not None:
        raise HTTPException(
            status_code=422, detail="at most one of 'before' and 'after' is allowed"
        )
    _ensure_configured()

    now_ns = time.time_ns()
    gap: dict | None = None
    clamped: dict | None = None

    if after is not None:
        start_ns = _parse_cursor(after, field="after")
        end_ns = now_ns
        direction = "forward"
        clamp_floor = now_ns - logql.MAX_RANGE_SECONDS * _NS_PER_SECOND
        if start_ns < clamp_floor:
            gap = {
                "start": _iso_from_ns(start_ns),
                "end": _iso_from_ns(clamp_floor),
            }
            start_ns = clamp_floor
            clamped = {
                "start": _iso_from_ns(start_ns),
                "end": _iso_from_ns(end_ns),
            }
    elif before is not None:
        direction = "backward"
        end_ns = _parse_cursor(before, field="before") + 1
        start_ns = filters.start_ns
        if end_ns <= start_ns:
            raise HTTPException(
                status_code=422, detail="'before' is outside the applied window"
            )
        start_ns, end_ns, shortened = logql.clamp_range(
            start_ns, end_ns, now_ns=now_ns
        )
        if shortened:
            clamped = {
                "start": _iso_from_ns(start_ns),
                "end": _iso_from_ns(end_ns),
            }
    else:
        direction = "backward"
        start_ns, end_ns, shortened = logql.clamp_range(
            filters.start_ns, filters.end_ns, now_ns=now_ns
        )
        if shortened:
            clamped = {
                "start": _iso_from_ns(start_ns),
                "end": _iso_from_ns(end_ns),
            }

    applied_limit = logql.clamp_limit(
        limit if limit is not None else logql.DEFAULT_LIMIT
    )
    payload = await _call_loki(
        LokiClient().query_range(
            _selector_for(filters),
            start_ns,
            end_ns,
            applied_limit,
            direction=direction,
        )
    )
    lines, raw_count = _map_lines(payload)
    return {
        "lines": lines,
        "limited": raw_count == applied_limit,
        "olderCursor": lines[0]["tsNs"] if lines else None,
        "newestCursor": lines[-1]["tsNs"] if lines else None,
        "clamped": clamped,
        "gap": gap,
    }


@router.get("/histogram", dependencies=SYSTEM_LOGS_READ)
async def histogram(filters: LogFilters = Depends(common_filters)):
    """Stacked per-level volume over the applied range, every bucket zero-filled."""
    _ensure_configured()
    start_ns, end_ns, _shortened = logql.clamp_range(filters.start_ns, filters.end_ns)
    step_seconds = logql.histogram_step_seconds(start_ns, end_ns)
    bucket_total = logql.bucket_count(start_ns, end_ns)

    metric_query = logql.build_histogram(
        selector_pipeline=_selector_for(filters), bucket_seconds=step_seconds
    )
    payload = await _call_loki(
        LokiClient().query_range(
            metric_query,
            start_ns,
            end_ns + step_seconds * _NS_PER_SECOND,  # cover the trailing partial step
            logql.MAX_LIMIT,
            step=step_seconds,
        )
    )
    return {
        "bucketSeconds": step_seconds,
        "buckets": _fill_buckets(payload, start_ns, step_seconds, bucket_total),
    }


@router.get("/grafana-link", dependencies=SYSTEM_LOGS_READ)
async def grafana_link(filters: LogFilters = Depends(common_filters)):
    """The Grafana Explore deep link, or ``{"url": None}`` when unconfigured."""
    base = (os.environ.get("GRAFANA_EXPLORE_URL") or "").strip()
    datasource = (os.environ.get("GRAFANA_LOKI_DATASOURCE") or "").strip()
    if not base or not datasource:
        return {"url": None}

    window_start, window_end, _shortened = logql.clamp_range(
        filters.start_ns, filters.end_ns
    )
    pane = {
        "datasource": datasource,
        "queries": [
            {
                "refId": "A",
                "datasource": {"type": "loki", "uid": datasource},
                "expr": _selector_for(filters),
                "editorMode": "code",
            }
        ],
        "range": {
            "from": _iso_from_ns(window_start),
            "to": _iso_from_ns(window_end),
        },
    }
    panes = quote(
        json.dumps({_GRAFANA_PANE_ID: pane}, separators=(",", ":")), safe=""
    )
    return {"url": f"{base.rstrip('/')}/explore?schemaVersion=1&panes={panes}"}