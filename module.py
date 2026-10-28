"""The log-explorer plugin module (Phase 305, LOGX-01..04).

An ``ApiRoutesPlugin`` that mounts its own Loki query API under
``/api/v1/plugins/log-explorer``. The Core mount chain forces authentication,
``plugin-runtime:use`` and the active-state check onto the router, and every
route additionally carries ``require_permission('system-logs','read')``.

Imports only the public ``indramesh.sdk`` surface — never an ``app.*`` module
(the AST gate in ``tests/test_plugin_discovery.py`` enforces this). All query
logic lives in the sibling modules: ``routes.py`` (HTTP surface),
``logql.py`` (pure filter→LogQL builder + clamps) and ``loki_client.py``
(server-side transport).
"""

from indramesh.sdk import ApiRoutesPlugin

from . import routes


class LogExplorerPlugin(ApiRoutesPlugin):
    """The directory-scanned log-explorer plugin (LOGX-01)."""

    def register_routes(self, ctx):
        # The routes resolve every operator setting and the fixed instance scope
        # from deployment environment at call time, so nothing is needed from
        # the mount-time context.
        return routes.router

    async def on_load(self, ctx):
        ctx.logger.info("log-explorer plugin loaded")
        return None

    async def on_unload(self, ctx):
        ctx.logger.info("log-explorer plugin unloaded")
        return None

    async def health_check(self, ctx):
        return True