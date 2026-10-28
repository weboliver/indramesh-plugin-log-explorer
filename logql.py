"""Pure filter→LogQL construction, scope resolution and clamps (Phase 305).

No I/O — every rule here is unit-testable without Loki. This module IS the
whitelist contract (LOGX-01/Carry-01): the only way to build a query is the
known filter set, every value is escaped, and text search is literal and
case-insensitive. There is deliberately no parameter for a free-form query,
selector, Loki URL or tenant anywhere in this file.

Scope authority (T-305-03): the deployment-provided scope selector is resolved
once per call from the process environment and prepended to every query,
histogram, discovery, live-tail and Grafana expression. No request parameter can
add or change a scope label.
"""

import json
import os
import re
import time

# Planner defaults (research A5): a bounded window, result set and bucket count.
MAX_RANGE_SECONDS = 86400
MAX_LIMIT = 500
MAX_BUCKETS = 60
DEFAULT_LIMIT = 100

_NS_PER_SECOND = 1_000_000_000
_KUBERNETES_RUNTIME_MODE = "kubernetes"

# The Compose collector-label default: `com.indramesh.env: ${ENVIRONMENT:-development}`.
# An empty ENVIRONMENT therefore resolves to exactly the label the collector emits.
_COMPOSE_ENV_DEFAULT = "development"

# The stream labels a multi-value filter may select. `env`/`namespace` are the
# deployment-provided scope and are never selectable from a request; the
# ID labels (request_id/task_id) are structured metadata, not stream labels.
_MULTI_VALUE_LABELS = ("service", "level", "category")


def escape_logql_string(value) -> str:
    """Render ``value`` as a double-quoted LogQL string literal (quotes included).

    JSON-style escaping is exactly the escape convention a LogQL double-quoted
    string accepts for ``"`` and ``\\``, and it also neutralises control
    characters — so no raw value can terminate or extend the literal.
    """
    return json.dumps(str(value), ensure_ascii=False)


def _label_condition(key: str, values) -> str | None:
    """One selector condition: ``=`` for a single value, ``=~`` for several.

    Every alternative is ``re.escape``d and the whole alternation is then
    escaped as a LogQL string, so no value can inject a regex or a selector.
    """
    cleaned = [str(value) for value in (values or []) if value is not None and str(value) != ""]
    if not cleaned:
        return None
    if len(cleaned) == 1:
        return f"{key}={escape_logql_string(cleaned[0])}"
    alternation = "|".join(re.escape(value) for value in cleaned)
    return f"{key}=~{escape_logql_string(alternation)}"


def build_selector(
    *,
    scope,
    services=None,
    levels=None,
    categories=None,
    text=None,
    request_id=None,
    task_id=None,
) -> str:
    """Build the whole LogQL selector + line/label pipeline from the whitelist.

    ``scope`` is mandatory deployment data (``{"env": ..., "namespace": ...}``).
    ``text`` is a literal, case-insensitive search — never a user regex.
    ``request_id``/``task_id`` are structured-metadata label filters AFTER the
    selector, never stream-selector labels.
    """
    parts = [
        f"{key}={escape_logql_string(value)}"
        for key, value in (scope or {}).items()
        if value is not None and str(value) != ""
    ]
    for key, values in zip(_MULTI_VALUE_LABELS, (services, levels, categories)):
        condition = _label_condition(key, values)
        if condition is not None:
            parts.append(condition)

    selector = "{" + ", ".join(parts) + "}"

    pipeline = ""
    if text is not None and str(text) != "":
        pipeline += f' |~ {escape_logql_string("(?i)" + re.escape(str(text)))}'
    if request_id is not None and str(request_id) != "":
        pipeline += f" | request_id={escape_logql_string(request_id)}"
    if task_id is not None and str(task_id) != "":
        pipeline += f" | task_id={escape_logql_string(task_id)}"

    return selector + pipeline


def build_histogram(*, selector_pipeline: str, bucket_seconds) -> str:
    """The per-level volume metric for one histogram bucket size."""
    step = max(1, int(bucket_seconds))
    return f"sum by (level) (count_over_time({selector_pipeline} [{step}s]))"


# --- clamps (T-305-04) -------------------------------------------------------


def clamp_range(start_ns: int, end_ns: int, *, now_ns: int | None = None):
    """Clamp ``[start, end)`` (ns, end exclusive) to MAX_RANGE and to ``now``.

    Returns ``(start_ns, end_ns, shortened)``; ``shortened`` is True whenever the
    server changed the caller's window, which the route reports as ``clamped``.
    """
    if now_ns is None:
        now_ns = time.time_ns()
    shortened = False
    if end_ns > now_ns:
        end_ns = now_ns
        shortened = True
    max_span = MAX_RANGE_SECONDS * _NS_PER_SECOND
    if end_ns - start_ns > max_span:
        start_ns = end_ns - max_span
        shortened = True
    return start_ns, end_ns, shortened


def clamp_limit(value) -> int:
    """Clamp a requested result limit into ``[1, MAX_LIMIT]``."""
    return max(1, min(int(value), MAX_LIMIT))


def _span_seconds(start_ns: int, end_ns: int) -> int:
    span_ns = max(1, int(end_ns) - int(start_ns))
    return max(1, -(-span_ns // _NS_PER_SECOND))


def bucket_count(start_ns: int, end_ns: int) -> int:
    """The bucket count for a window: at least 1, never above MAX_BUCKETS."""
    return max(1, min(_span_seconds(start_ns, end_ns), MAX_BUCKETS))


def histogram_step_seconds(start_ns: int, end_ns: int) -> int:
    """The per-bucket step (whole seconds) that covers the window."""
    span_seconds = _span_seconds(start_ns, end_ns)
    return max(1, -(-span_seconds // bucket_count(start_ns, end_ns)))


# --- scope authority (T-305-03) ----------------------------------------------


def _runtime_mode() -> str:
    return (os.environ.get("INDRAMESH_RUNTIME_MODE") or "").strip()


def scope_from_env() -> dict[str, str]:
    """The deployment-provided instance scope, resolved at call time.

    ``env`` comes from ``ENVIRONMENT`` in both stacks (Compose mode: an
    unset/empty value resolves to ``development``, exactly the collector's
    ``com.indramesh.env`` label default). In k8s the ``namespace`` value is
    ``POD_NAMESPACE`` (Downward API). ``LOG_ENV`` is Alloy-only and never read.
    """
    mode = _runtime_mode()
    env = (os.environ.get("ENVIRONMENT") or "").strip()
    if not env and mode != _KUBERNETES_RUNTIME_MODE:
        env = _COMPOSE_ENV_DEFAULT

    scope: dict[str, str] = {}
    if env:
        scope["env"] = env
    if mode == _KUBERNETES_RUNTIME_MODE:
        namespace = (os.environ.get("POD_NAMESPACE") or "").strip()
        if namespace:
            scope["namespace"] = namespace
    return scope


def scope_missing() -> bool:
    """True when a required scope value is absent — the caller must fail closed.

    k8s requires both ``ENVIRONMENT`` and ``POD_NAMESPACE``; Compose always has a
    value (empty ENVIRONMENT resolves to ``development``).
    """
    if _runtime_mode() != _KUBERNETES_RUNTIME_MODE:
        return False
    env = (os.environ.get("ENVIRONMENT") or "").strip()
    namespace = (os.environ.get("POD_NAMESPACE") or "").strip()
    return not env or not namespace