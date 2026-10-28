"""Server-side Loki transport for the log-explorer plugin (Phase 305, LOGX-01).

The query base is read from the deployment environment (``LOKI_QUERY_URL``) at
CALL time, never at import: the worker process imports this module too, and it
receives no query env (only the backend serves plugin routes). No URL, tenant,
credential or query string ever comes from a browser request — this module only
sends LogQL that ``logql.py`` built from the whitelist.

Every provider outcome is classified here: a transport/timeout error, any
non-2xx response (4xx included — a 404 is never read as "ready"), an unparseable
body and a non-``success`` status all raise ``LokiUnreachable`` with a bounded,
non-diagnostic message. Raw provider errors and internal URLs never travel
upward.
"""

import os
from urllib.parse import quote

import httpx

# The readiness probe must answer fast — it gates a status chip, not a query.
READINESS_TIMEOUT = httpx.Timeout(3.0, connect=2.0)

# Every query call is bounded (T-305-04) so a hung Loki cannot pin a request.
QUERY_TIMEOUT = httpx.Timeout(10.0, connect=3.0)


class LokiUnreachable(RuntimeError):
    """The Loki query endpoint is not configured, not reachable or not ready.

    ``reason`` (the only enum callers may branch on), ``status_code`` (an HTTP
    status or ``None``) and ``cause`` (an exception class name or ``None``) are
    the ONLY diagnosable facts this error carries. The message stays bounded, so
    a caller can log these three attributes without ever echoing a provider
    body, an exception text, an internal URL or a tenant.
    """

    def __init__(
        self,
        message: str,
        *,
        reason: str,
        status_code: int | None = None,
        cause: str | None = None,
    ) -> None:
        super().__init__(message)
        self.reason = reason
        self.status_code = status_code
        self.cause = cause


def query_base() -> str | None:
    """The configured Loki query base, or ``None`` when unconfigured."""
    value = (os.environ.get("LOKI_QUERY_URL") or "").strip()
    return value or None


def _string_list(payload: dict) -> list[str]:
    data = payload.get("data")
    if not isinstance(data, list):
        return []
    return [str(value) for value in data]


class LokiClient:
    """A thin async httpx client scoped to one query base at call time."""

    def __init__(self, base: str | None = None) -> None:
        self._base = base

    @property
    def base(self) -> str | None:
        return self._base if self._base is not None else query_base()

    async def readiness(self) -> None:
        """Probe ``GET {base}/ready``; 2xx-and-only-2xx means ready.

        Loki's readiness probe is root-level (not under ``/loki/api/v1``).
        Raises :class:`LokiUnreachable` for every other outcome, so the only
        surviving state is a confirmed ready Loki.
        """
        base = self.base
        if not base:
            raise LokiUnreachable(
                "Loki query base is not configured", reason="not_configured"
            )
        url = f"{base.rstrip('/')}/ready"
        try:
            async with httpx.AsyncClient(timeout=READINESS_TIMEOUT) as client:
                response = await client.get(url)
        except httpx.HTTPError as exc:
            raise LokiUnreachable(
                "Loki readiness probe failed",
                reason="probe_failed",
                cause=type(exc).__name__,
            ) from exc
        if not 200 <= response.status_code < 300:
            raise LokiUnreachable(
                f"Loki readiness probe returned {response.status_code}",
                reason="probe_status",
                status_code=response.status_code,
            )

    async def query_range(
        self,
        query: str,
        start_ns: int,
        end_ns: int,
        limit: int,
        *,
        direction: str = "backward",
        step: int | None = None,
    ) -> dict:
        """``GET {base}/loki/api/v1/query_range`` (log streams or a metric)."""
        params = {
            "query": query,
            "start": str(int(start_ns)),
            "end": str(int(end_ns)),
            "limit": str(int(limit)),
            "direction": direction,
        }
        if step is not None:
            params["step"] = str(int(step))
        return await self._get_json("/loki/api/v1/query_range", params)

    async def label_names(self, query: str, start_ns: int, end_ns: int) -> list[str]:
        """``GET {base}/loki/api/v1/labels`` for the scoped query."""
        payload = await self._get_json(
            "/loki/api/v1/labels", self._range_params(query, start_ns, end_ns)
        )
        return _string_list(payload)

    async def label_values(
        self, label: str, query: str, start_ns: int, end_ns: int
    ) -> list[str]:
        """``GET {base}/loki/api/v1/label/<label>/values`` for the scoped query."""
        path = f"/loki/api/v1/label/{quote(str(label), safe='')}/values"
        payload = await self._get_json(
            path, self._range_params(query, start_ns, end_ns)
        )
        return _string_list(payload)

    @staticmethod
    def _range_params(query: str, start_ns: int, end_ns: int) -> dict:
        return {
            "query": query,
            "start": str(int(start_ns)),
            "end": str(int(end_ns)),
        }

    async def _get_json(self, path: str, params: dict) -> dict:
        base = self.base
        if not base:
            raise LokiUnreachable(
                "Loki query base is not configured", reason="not_configured"
            )
        url = f"{base.rstrip('/')}{path}"
        try:
            async with httpx.AsyncClient(timeout=QUERY_TIMEOUT) as client:
                response = await client.get(url, params=params)
        except httpx.HTTPError as exc:
            raise LokiUnreachable(
                "Loki request failed",
                reason="request_failed",
                cause=type(exc).__name__,
            ) from exc
        if not 200 <= response.status_code < 300:
            raise LokiUnreachable(
                f"Loki returned {response.status_code}",
                reason="query_status",
                status_code=response.status_code,
            )
        try:
            payload = response.json()
        except ValueError as exc:
            raise LokiUnreachable(
                "Loki returned an unparseable response",
                reason="unparseable",
                cause=type(exc).__name__,
            ) from exc
        if not isinstance(payload, dict) or payload.get("status") != "success":
            raise LokiUnreachable(
                "Loki returned a non-success response", reason="non_success"
            )
        return payload