# log-explorer plugin

**Server-log exploration** for IndraMesh Core: the plugin serves its own Loki query API and
contributes the log page, nav item and task-detail actions that replaced the former Core System
Log viewer.

## Install

The plugin is distributed as its own repository and installed into a running IndraMesh Core stack.
**Requires IndraMesh Core 1.0.0 or later** (plugin API `1.0.0`). It is a read-only mirror of the
maintainer's develop repository, so it is **not standalone buildable** today — the plugin SDK ships
in a later release; the committed bundle in this repository is the supported distribution format.

**Compose stack** — from the Core checkout root:

```bash
./install_plugin_docker.sh https://github.com/weboliver/indramesh-plugin-log-explorer
```

The script clones the repository, copies the plugin to `<core>/plugins/log-explorer` and restarts
`backend` and `worker` so the plugin registry re-scans. The destination directory name comes from
the plugin's own manifest; a second argument overrides it only if you deliberately want a different
name. The same command accepts a local directory instead of the URL.

**Local k3s stack** — from the Core checkout root, with a kubeconfig for the cluster
(`KUBECONFIG=$HOME/.kube/config` when it is not already at the default location):

```bash
./install_plugin_k8s.sh https://github.com/weboliver/indramesh-plugin-log-explorer
```

The script copies the plugin directory onto the plugins PVC and restarts `backend` and `worker`.

A URL source accepts an optional ref (tag or branch) as a further argument; without one the default
branch is installed.

**Manual equivalent:** copy the plugin directory to `<core>/plugins/log-explorer` yourself and
restart `backend` **and** `worker`. Plugin discovery runs exactly once at process startup — there
is no live filesystem watch — so both processes must be restarted before the plugin is registered.

**Replacing an installed plugin:** both installers refuse an existing destination and neither offers
a way around that refusal. An installed plugin is replaced by removing its directory deliberately
first — `plugins/log-explorer` in a Compose checkout, the plugin's directory on the plugins PVC on
Kubernetes — and installing again. See **Installing and Updating Plugins** in the Core README for the removal commands, including the writable helper pod for the k3s case.

## Enable the log store

The plugin is active right after the install, but it reports **not configured** until Core has a
Loki to query: a default Core installation runs **without** a log stack. Switch it on in the root
`.env` of the Core installation — the same file the Core installer created.

**Compose stack** — activate the `logging` profile:

```bash
# root .env of the Core checkout
COMPOSE_PROFILES=logging
```

Then run `docker compose up -d` from the Core checkout root. It starts Loki, Alloy and the read-only
docker-socket-proxy; `LOKI_QUERY_URL` already defaults to the bundled `http://loki:3100`.

**Local k3s stack** — switch the log stack on and run the installer again:

```bash
# root .env of the Core checkout
LOGINFRA_ENABLED=true
```

Then run `./install_indramesh_k8s.sh`. It installs Loki and Alloy and writes the backend's
`LOKI_QUERY_URL` itself.

**Your own Loki** instead of the bundled one — keep the collector and point the query base at it:

```bash
# root .env of the Core checkout
COMPOSE_PROFILES=logging
LOKI_QUERY_URL=https://loki.example.com
LOG_EXPLORER_EXTERNAL_ONLY=true
```

**Optional "open in Grafana" link** — set `GRAFANA_EXPLORE_URL` and `GRAFANA_LOKI_DATASOURCE`.

Every value takes effect when the backend is (re)created. Each switch costs memory: the log stack
adds Loki and Alloy to the running services. IndraMesh Core's `docs/LOGGING-INFRASTRUCTURE.md`
describes every variable and the external targets (OTLP, Graylog) in full.

## Purpose

Operators and developers search and follow application logs from the bundled Loki (or the
operator's own Loki-compatible query target) without granting the backend raw Docker-socket or
Kubernetes-API log access — that access belongs to the Alloy collector only. The plugin is a pure
query client: LogQL filters with server-side clamps, a bounded result window, a follow mode, and an
"open in Grafana" deep link when configured.

- Manifest: `plugin.toml` (`capabilities = ["api_routes"]`, `active_by_default = true`).
- Backend: `module.py` (`ApiRoutesPlugin`) → `routes.py` (HTTP surface) → `logql.py` (pure
  filter→LogQL builder plus clamps) / `loki_client.py` (server-side transport).
- Frontend: `frontend/index.jsx`; committed bundle `static/log-explorer.js`.

## Permissions

| Permission | Default roles | Purpose |
|---|---|---|
| `system-logs:read` | Administrator, Viewer | Search and follow server logs through the log-explorer plugin. |

Ownership of the name transferred from Core by an explicit Alembic data migration — never by
re-declaring a Core permission. The default grants mirror the pre-cutover baseline for a **fresh**
install and are insert-only: an upgraded install creates no new grant, and a later administrative
revoke is never restored.

## Configuration

- **No `[config_schema]` on purpose:** every operator setting is deployment environment read at
  call time — `LOKI_QUERY_URL` (bare Loki query base), `LOG_EXPLORER_EXTERNAL_ONLY`,
  `GRAFANA_EXPLORE_URL`, `GRAFANA_LOKI_DATASOURCE`. A mount-time config snapshot would go stale for
  a running backend, which Core never refreshes after a config `PUT`.
- **Query scope** is derived from `ENVIRONMENT` (plus the k8s `POD_NAMESPACE` Downward-API value),
  so several instances sharing one Loki cannot read each other's streams.
- **No LLM and no key** — the plugin requires no `LLM_*` configuration; "no key = off" does not
  apply. It needs only a reachable Loki query base, and Loki is reached over a dedicated internal
  `logging_query` network (no published port, no nginx route).
- Loki tenant/auth headers are out of scope: the bundled Loki is single-tenant without auth.

## Query contract (LogQL whitelist)

The only way to build a query is the plugin's known filter set — there is deliberately no
parameter for a free-form query, selector, Loki URL or tenant anywhere in the request surface:

- the deployment-provided scope selector is resolved from the process environment and prepended to
  every query, histogram, discovery, live-tail and Grafana expression; no request parameter can
  add or change a scope label;
- selectable stream labels are limited to `service`, `level` and `category`, and every value is
  escaped as a double-quoted LogQL string; text search is literal and case-insensitive;
- results are clamped server-side: a bounded time range, result limit and bucket count are
  enforced regardless of what the client asks for.

## Task types

None — `capabilities = ["api_routes"]`; the plugin publishes no task type, connector or job.

## Frontend

Bundle `static/log-explorer.js`; extension points `pages`, `navItems`, `taskDetailActions` (the
page lives under Administration → System-Logs, and the task-detail actions deep-link a task's own
log context). Delivery uses the standard plugin mount over the read-only `./plugins` mount
(Compose) or the plugins PVC (k8s); restart `backend` and `worker` after changing the plugin
directory.

IndraMesh Core's `docs/LOGGING-INFRASTRUCTURE.md` documents the operator model of Loki, Alloy, the
docker-socket-proxy and the external-target switch.

## License

Apache-2.0 — see [`LICENSE`](LICENSE). The plugin bundles no third-party runtime code; the
committed bundle `static/log-explorer.js` is built from `plugins/log-explorer/frontend/` with the
Core repository's Vite toolchain.

## Status

This repository is a **read-only mirror** of the private develop repository: it is regenerated
from the Core source tree at release time, so issues and pull requests are applied upstream by
hand rather than merged here.
