import { Fragment as e, useCallback as t, useEffect as n, useLayoutEffect as r, useMemo as i, useRef as a, useState as o } from "react";
import { useLocation as s, useNavigate as c, useSearchParams as l } from "react-router-dom";
import { Button as u, CheckboxField as d, DropdownMenu as f, DropdownMenuItem as p, EmptyState as m, FormField as h, LucideIcon as g, PageHeader as _, SelectInput as ee, TextInput as v, api as y, extractErrorMessage as te, injectPluginStyles as ne, serializeRepeatedParams as b, useCan as re, useFormatDate as ie, useFormatDateTime as ae, useFormatTime as oe, usePluginTranslation as se, useTask as x } from "@indramesh/plugin-api";
import { Fragment as S, jsx as C, jsxs as w } from "react/jsx-runtime";
//#region locales/en.json
var ce = {
	"nav.label": "System logs",
	"page.title": "System logs",
	"page.description": "Search and follow log lines from every service of this installation.",
	"action.search": "Search",
	"range.last_15m": "Last 15 minutes",
	"range.last_1h": "Last hour",
	"range.last_6h": "Last 6 hours",
	"range.last_24h": "Last 24 hours",
	"range.custom": "Custom range",
	"field.range": "Time range",
	"field.from": "From",
	"field.to": "To",
	"field.text_label": "Message contains",
	"field.text_placeholder": "Exact text, not case-sensitive",
	"field.request_id": "Request ID",
	"field.task_id": "Task ID",
	"filter.services": "Services",
	"filter.levels": "Levels",
	"filter.categories": "Categories",
	"filter.services_all": "Services: All",
	"filter.services_one": "Services: {{value}}",
	"filter.services_selected_one": "Services: {{count}} selected",
	"filter.services_selected_other": "Services: {{count}} selected",
	"filter.levels_all": "Levels: All",
	"filter.levels_one": "Levels: {{value}}",
	"filter.levels_selected_one": "Levels: {{count}} selected",
	"filter.levels_selected_other": "Levels: {{count}} selected",
	"filter.categories_all": "Categories: All",
	"filter.categories_one": "Categories: {{value}}",
	"filter.categories_selected_one": "Categories: {{count}} selected",
	"filter.categories_selected_other": "Categories: {{count}} selected",
	"filter.all": "All",
	"draft.hint": "Changes apply when you search.",
	"volume.heading": "Log volume",
	"volume.error": "Log volume could not be loaded.",
	"bucket.action_one": "Search {{start}} to {{end}}: {{count}} line",
	"bucket.action_other": "Search {{start}} to {{end}}: {{count}} lines",
	"level.other": "Other",
	"results.heading": "Log lines",
	"results.summary_one": "{{count}} matching lines",
	"results.summary_other": "{{count}} matching lines",
	"results.summary_limited": "Newest {{shown}} of {{total}} matching lines",
	"action.load_older": "Load older lines",
	"live.toggle": "Follow live",
	"live.unavailable": "Live tail needs a time range that ends now. Choose a \"Last …\" range and search.",
	"live.new_lines_one": "{{count}} new line",
	"live.new_lines_other": "{{count}} new lines",
	"row.details_show": "Show details",
	"row.details_hide": "Hide details",
	"details.time": "Time",
	"details.service": "Service",
	"details.level": "Level",
	"details.category": "Category",
	"details.logger": "Logger",
	"pivot.request": "Show all lines for request {{id}}",
	"pivot.task": "Show all lines for task {{id}}",
	"grafana.link": "Open in Grafana Explore",
	"grafana.hint": "Opens in a new tab. Grafana uses its own sign-in.",
	"task.action": "Open system logs",
	"empty.title": "No matching log lines",
	"empty.body": "Nothing was logged for these filters between {{start}} and {{end}}. Widen the time range or remove filters.",
	"empty.action": "Remove filters",
	"state.not_configured.title": "Log search is not set up",
	"state.not_configured.body": "This installation has no log store connected for searching. Ask an administrator to configure the Loki connection of the log-explorer plugin.",
	"state.unreachable.title": "Log store not reachable",
	"state.unreachable.body": "The log store did not respond, so no lines can be shown. Try again in a moment. If it keeps failing, ask an administrator to check the Loki service.",
	"state.unreachable.action": "Try again",
	"state.external.title": "Logs go to an external system",
	"state.external.body": "This installation sends its logs only to an external log platform, so they cannot be searched here. Use your organization's log tool to view them.",
	"connection.interrupted": "Connection interrupted. Loaded lines stay visible; retrying automatically.",
	"marker.gap": "Lines between {{start}} and {{end}} may be missing. Search again to reload this period.",
	"marker.evicted_one": "{{count}} older line was removed from view to keep live tail fast. Load older lines to bring it back.",
	"marker.evicted_other": "{{count}} older lines were removed from view to keep live tail fast. Load older lines to bring them back.",
	"notice.range_shortened": "The time range was shortened to {{duration}}, the maximum for one search.",
	"notice.retention": "Lines before {{date}} are no longer stored. Results start there.",
	"notice.task_window": "Showing the run of task {{id}} with {{margin}} before and after.",
	"notice.task_window_fallback": "This task has no recorded run times. Showing the period after its creation.",
	"error.search_rejected": "The search could not be run: {{reason}} Fix the filter and search again.",
	"error.list_load_failed": "Log lines could not be loaded. Try again.",
	"loading.lines": "Loading log lines…"
}, le = {
	"nav.label": "System-Logs",
	"page.title": "System-Logs",
	"page.description": "Logzeilen aller Dienste dieser Installation durchsuchen und verfolgen.",
	"action.search": "Suchen",
	"range.last_15m": "Letzte 15 Minuten",
	"range.last_1h": "Letzte Stunde",
	"range.last_6h": "Letzte 6 Stunden",
	"range.last_24h": "Letzte 24 Stunden",
	"range.custom": "Eigener Zeitraum",
	"field.range": "Zeitraum",
	"field.from": "Von",
	"field.to": "Bis",
	"field.text_label": "Nachricht enthält",
	"field.text_placeholder": "Genauer Text, ohne Groß-/Kleinschreibung",
	"field.request_id": "Request-ID",
	"field.task_id": "Task-ID",
	"filter.services": "Dienste",
	"filter.levels": "Level",
	"filter.categories": "Kategorien",
	"filter.services_all": "Dienste: Alle",
	"filter.services_one": "Dienste: {{value}}",
	"filter.services_selected_one": "Dienste: {{count}} ausgewählt",
	"filter.services_selected_other": "Dienste: {{count}} ausgewählt",
	"filter.levels_all": "Level: Alle",
	"filter.levels_one": "Level: {{value}}",
	"filter.levels_selected_one": "Level: {{count}} ausgewählt",
	"filter.levels_selected_other": "Level: {{count}} ausgewählt",
	"filter.categories_all": "Kategorien: Alle",
	"filter.categories_one": "Kategorien: {{value}}",
	"filter.categories_selected_one": "Kategorien: {{count}} ausgewählt",
	"filter.categories_selected_other": "Kategorien: {{count}} ausgewählt",
	"filter.all": "Alle",
	"draft.hint": "Änderungen gelten nach „Suchen“.",
	"volume.heading": "Log-Volumen",
	"volume.error": "Log-Volumen konnte nicht geladen werden.",
	"bucket.action_one": "{{start}} bis {{end}} durchsuchen: {{count}} Zeile",
	"bucket.action_other": "{{start}} bis {{end}} durchsuchen: {{count}} Zeilen",
	"level.other": "Sonstige",
	"results.heading": "Logzeilen",
	"results.summary_one": "{{count}} passende Zeilen",
	"results.summary_other": "{{count}} passende Zeilen",
	"results.summary_limited": "Neueste {{shown}} von {{total}} passenden Zeilen",
	"action.load_older": "Ältere Zeilen laden",
	"live.toggle": "Live verfolgen",
	"live.unavailable": "Live-Verfolgung braucht einen Zeitraum bis jetzt. Wählen Sie einen „Letzte …“-Zeitraum und suchen Sie.",
	"live.new_lines_one": "{{count}} neue Zeile",
	"live.new_lines_other": "{{count}} neue Zeilen",
	"row.details_show": "Details anzeigen",
	"row.details_hide": "Details ausblenden",
	"details.time": "Zeit",
	"details.service": "Dienst",
	"details.level": "Level",
	"details.category": "Kategorie",
	"details.logger": "Logger",
	"pivot.request": "Alle Zeilen für Request {{id}}",
	"pivot.task": "Alle Zeilen für Task {{id}}",
	"grafana.link": "In Grafana Explore öffnen",
	"grafana.hint": "Öffnet in neuem Tab. Grafana hat eine eigene Anmeldung.",
	"task.action": "System-Logs öffnen",
	"empty.title": "Keine passenden Logzeilen",
	"empty.body": "Für diese Filter wurde zwischen {{start}} und {{end}} nichts geloggt. Erweitern Sie den Zeitraum oder entfernen Sie Filter.",
	"empty.action": "Filter entfernen",
	"state.not_configured.title": "Log-Suche ist nicht eingerichtet",
	"state.not_configured.body": "Für diese Installation ist kein durchsuchbarer Log-Speicher angebunden. Bitten Sie einen Administrator, die Loki-Verbindung des Plugins log-explorer zu konfigurieren.",
	"state.unreachable.title": "Log-Speicher nicht erreichbar",
	"state.unreachable.body": "Der Log-Speicher hat nicht geantwortet, daher können keine Zeilen angezeigt werden. Versuchen Sie es gleich erneut. Bleibt der Fehler, bitten Sie einen Administrator, den Loki-Dienst zu prüfen.",
	"state.unreachable.action": "Erneut versuchen",
	"state.external.title": "Logs gehen an ein externes System",
	"state.external.body": "Diese Installation sendet ihre Logs nur an eine externe Log-Plattform, daher sind sie hier nicht durchsuchbar. Nutzen Sie das Log-Werkzeug Ihrer Organisation.",
	"connection.interrupted": "Verbindung unterbrochen. Geladene Zeilen bleiben sichtbar; neuer Versuch erfolgt automatisch.",
	"marker.gap": "Zeilen zwischen {{start}} und {{end}} fehlen möglicherweise. Suchen Sie erneut, um diesen Zeitraum neu zu laden.",
	"marker.evicted_one": "{{count}} ältere Zeile wurde ausgeblendet, damit die Live-Verfolgung schnell bleibt. Mit „Ältere Zeilen laden“ holen Sie sie zurück.",
	"marker.evicted_other": "{{count}} ältere Zeilen wurden ausgeblendet, damit die Live-Verfolgung schnell bleibt. Mit „Ältere Zeilen laden“ holen Sie sie zurück.",
	"notice.range_shortened": "Der Zeitraum wurde auf {{duration}} gekürzt, das Maximum pro Suche.",
	"notice.retention": "Zeilen vor {{date}} sind nicht mehr gespeichert. Die Ergebnisse beginnen dort.",
	"notice.task_window": "Laufzeit von Task {{id}} mit {{margin}} davor und danach.",
	"notice.task_window_fallback": "Dieser Task hat keine erfassten Laufzeiten. Gezeigt wird der Zeitraum nach seiner Erstellung.",
	"error.search_rejected": "Die Suche konnte nicht ausgeführt werden: {{reason}} Korrigieren Sie den Filter und suchen Sie erneut.",
	"error.list_load_failed": "Logzeilen konnten nicht geladen werden. Versuchen Sie es erneut.",
	"loading.lines": "Logzeilen werden geladen…"
}, ue = 9e5, de = 3e3, fe = [
	3e3,
	6e3,
	12e3
], pe = 3e4, me = 2e3, he = [
	2e3,
	4e3,
	8e3,
	16e3
], T = 3e4, E = 12e4, D = 9e5, O = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/, k = /^\d+$/;
function A(e) {
	return typeof e == "string" && k.test(e);
}
function j(e) {
	if (typeof e != "string" || !O.test(e)) return null;
	let t = Date.parse(e);
	return Number.isNaN(t) ? null : t;
}
var ge = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?$/;
function M(e) {
	if (typeof e != "string" || e === "") return null;
	if (O.test(e)) {
		let t = Date.parse(e);
		return Number.isNaN(t) ? null : t;
	}
	if (ge.test(e)) {
		let t = Date.parse(`${e}Z`);
		return Number.isNaN(t) ? null : t;
	}
	return null;
}
function N(e, t) {
	if (!e) return [];
	if (typeof e.getAll == "function") return e.getAll(t);
	let n = e[t];
	return n == null ? [] : Array.isArray(n) ? n : [n];
}
function P(e, t) {
	let n = N(e, t);
	if (n.length === 0) return "";
	let r = n[n.length - 1];
	return typeof r == "string" ? r : String(r);
}
function F(e) {
	let t = [];
	for (let n of e) {
		let e = typeof n == "string" ? n : "";
		e !== "" && (t.includes(e) || t.push(e));
	}
	return t;
}
function _e(e, t = Date.now()) {
	let n = j(P(e, "start")), r = j(P(e, "end")), i = n !== null && r !== null && r > n;
	return {
		service: F(N(e, "service")),
		level: F(N(e, "level")),
		category: F(N(e, "category")),
		text: P(e, "text"),
		request_id: P(e, "request_id"),
		task_id: P(e, "task_id"),
		start: new Date(i ? n : t - ue).toISOString(),
		end: new Date(i ? r : t).toISOString()
	};
}
function ve(e) {
	let t = new URLSearchParams();
	e?.start && t.set("start", e.start), e?.end && t.set("end", e.end);
	for (let n of e?.service ?? []) t.append("service", n);
	for (let n of e?.level ?? []) t.append("level", n);
	for (let n of e?.category ?? []) t.append("category", n);
	return e?.text && t.set("text", e.text), e?.request_id && t.set("request_id", e.request_id), e?.task_id && t.set("task_id", e.task_id), t;
}
function I(e, t = {}) {
	let n = {};
	return e?.start && (n.start = e.start), e?.end && (n.end = e.end), Array.isArray(e?.service) && e.service.length > 0 && (n.service = e.service), Array.isArray(e?.level) && e.level.length > 0 && (n.level = e.level), Array.isArray(e?.category) && e.category.length > 0 && (n.category = e.category), e?.text && (n.text = e.text), e?.request_id && (n.request_id = e.request_id), e?.task_id && (n.task_id = e.task_id), t.limit !== void 0 && t.limit !== null && (n.limit = t.limit), A(t.before) && (n.before = t.before), A(t.after) && (n.after = t.after), n;
}
function L(e) {
	return e && typeof e.id == "string" && e.id !== "" ? e.id : [
		e?.tsNs ?? "",
		e?.service ?? "",
		e?.level ?? "",
		e?.category ?? "",
		e?.message ?? ""
	].join("\0");
}
function ye(e) {
	let t = /* @__PURE__ */ new Set(), n = [];
	for (let r of e ?? []) {
		let e = L(r);
		t.has(e) || (t.add(e), n.push(r));
	}
	return n;
}
function R(e, t, n = me) {
	let r = Array.isArray(e) ? e : e?.lines ?? [], i = new Set(r.map(L)), a = [];
	for (let e of t ?? []) {
		let t = L(e);
		i.has(t) || (i.add(t), a.push(e));
	}
	let o = [...r, ...a], s = Number.isFinite(n) && n > 0 ? Math.floor(n) : me, c = Math.max(0, o.length - s);
	return {
		lines: c > 0 ? o.slice(c) : o,
		evicted: c
	};
}
function be(e, t) {
	let n = e ?? [], r = /* @__PURE__ */ new Map();
	for (let e of t ?? []) {
		let t = Number.isInteger(e?.at) ? e.at : 0, i = Math.max(0, Math.min(n.length, t));
		r.has(i) || r.set(i, []), r.get(i).push(e);
	}
	let i = [];
	for (let e = 0; e <= n.length; e += 1) {
		for (let t of r.get(e) ?? []) i.push({
			id: `marker:${t.id}`,
			markerKind: t.kind,
			kind: t.kind,
			start: t.start,
			end: t.end,
			count: t.count
		});
		e < n.length && i.push(n[e]);
	}
	return i;
}
function z(e, t = {}) {
	let n = A(e) ? e : null, r = [];
	A(t.newestCursor) && r.push(t.newestCursor);
	for (let e of t.lines ?? []) A(e?.tsNs) && r.push(e.tsNs);
	for (let e of r) (n === null || BigInt(e) > BigInt(n)) && (n = e);
	let i = t.gap ? [{
		id: `gap:${t.gap.start}:${t.gap.end}`,
		kind: "gap",
		start: t.gap.start,
		end: t.gap.end
	}] : [];
	return {
		cursor: n,
		markers: i
	};
}
function B(e, t) {
	let n = setTimeout(e, t);
	return () => clearTimeout(n);
}
function xe({ poll: e, schedule: t = B, interval: n = de, backoff: r = fe, maxBackoff: i = pe, cap: a = me } = {}) {
	let o = /* @__PURE__ */ new Set(), s = !1, c = !1, l = 0, u = null, d = [], f = 0, p = [], m = null, h = !1;
	function g() {
		return {
			active: s,
			interrupted: c,
			attempts: l,
			cursor: u,
			lines: d,
			evicted: f,
			markers: p
		};
	}
	function _() {
		let e = g();
		o.forEach((t) => {
			try {
				t(e);
			} catch {}
		});
	}
	function ee(e) {
		return typeof e == "function" ? (o.add(e), () => o.delete(e)) : () => {};
	}
	function v() {
		m &&= (m(), null);
	}
	function y(e) {
		v(), m = t(ne, e);
	}
	function te() {
		let e = Math.max(0, l - 1);
		return e < r.length ? r[e] : i;
	}
	async function ne() {
		if (!s || h) return;
		m = null, h = !0;
		let t = { cursor: u };
		try {
			let r = await e(t);
			if (!s) {
				h = !1;
				return;
			}
			let i = R({ lines: d }, r?.lines ?? [], a);
			d = i.lines, f += i.evicted;
			let o = z(u, {
				lines: r?.lines ?? [],
				newestCursor: r?.newestCursor ?? null,
				gap: r?.gap ?? null
			}), m = A(o.cursor) && (!A(u) || BigInt(o.cursor) > BigInt(u));
			A(o.cursor) && (u = o.cursor), o.markers.length > 0 && (p = [...p, ...o.markers]), l = 0, c = !1, h = !1, _(), r?.limited && m ? y(0) : y(n);
		} catch {
			if (!s) {
				h = !1;
				return;
			}
			l += 1, c = !0, h = !1, _(), y(te());
		}
	}
	function b({ cursor: e = null, lines: t = [] } = {}) {
		return s = !0, c = !1, l = 0, u = A(e) ? e : null, d = Array.isArray(t) ? t : [], f = 0, p = [], _(), ne(), g();
	}
	function re() {
		return s = !1, v(), _(), g();
	}
	return {
		start: b,
		stop: re,
		subscribe: ee,
		getSnapshot: g
	};
}
function Se({ check: e, schedule: t = B, backoff: n = he, maxBackoff: r = T, isVisible: i = () => !0 } = {}) {
	let a = !1, o = 0, s = !1, c = null;
	function l() {
		c &&= (c(), null);
	}
	function u(e) {
		return e < n.length ? n[e] : r;
	}
	function d(e) {
		l(), c = t(f, e);
	}
	async function f() {
		if (!a || s) return;
		if (c = null, !i()) {
			d(r);
			return;
		}
		s = !0;
		let t = !1;
		try {
			t = await e() === !0;
		} catch {
			t = !1;
		} finally {
			s = !1;
		}
		a && (t ? a = !1 : (o += 1, d(u(o))));
	}
	function p() {
		a = !0, o = 0, d(u(0));
	}
	function m() {
		a = !1, l();
	}
	function h() {
		a && (o = 0, l(), f());
	}
	return {
		start: p,
		stop: m,
		kick: h
	};
}
function V(e, t = Date.now()) {
	let n = e?.id ?? e?.taskId ?? null, r = e?.current_status ?? e?.status ?? null, i = r === "PENDING" || r === "RUNNING", a = M(e?.started_at), o = M(e?.completed_at), s = M(e?.created_at);
	if (a !== null) {
		let e = o === null ? t : o;
		return {
			taskId: n,
			start: (/* @__PURE__ */ new Date(a - E)).toISOString(),
			end: new Date(e + E).toISOString(),
			liveTail: i,
			creationAnchored: !1
		};
	}
	return s === null ? {
		taskId: n,
		start: new Date(t).toISOString(),
		end: new Date(t + D).toISOString(),
		liveTail: i,
		creationAnchored: !0
	} : {
		taskId: n,
		start: new Date(s).toISOString(),
		end: new Date(s + D).toISOString(),
		liveTail: i,
		creationAnchored: !0
	};
}
//#endregion
//#region explorer-page.jsx
var Ce = "log-explorer", we = "explorer", H = "/plugins/log-explorer", Te = 3e5, Ee = 15e3, De = 24, U = 5, W = [
	"CRITICAL",
	"ERROR",
	"WARNING",
	"INFO",
	"DEBUG",
	"Other"
], Oe = [
	"CRITICAL",
	"ERROR",
	"WARNING",
	"INFO",
	"DEBUG"
], ke = [
	"ERROR",
	"WARNING",
	"INFO",
	"DEBUG"
], Ae = [
	{
		value: "last_15m",
		ms: 9e5,
		key: "range.last_15m",
		fallback: "Last 15 minutes"
	},
	{
		value: "last_1h",
		ms: 36e5,
		key: "range.last_1h",
		fallback: "Last hour"
	},
	{
		value: "last_6h",
		ms: 216e5,
		key: "range.last_6h",
		fallback: "Last 6 hours"
	},
	{
		value: "last_24h",
		ms: 864e5,
		key: "range.last_24h",
		fallback: "Last 24 hours"
	},
	{
		value: "custom",
		ms: null,
		key: "range.custom",
		fallback: "Custom range"
	}
], je = "\n.logx-explorer {\n  --logx-level-debug: #94a3b8;\n  --logx-level-info: #64748b;\n  --logx-level-warning: #f59e0b;\n  --logx-level-error: #dc2626;\n  --logx-level-critical: #7f1d1d;\n  --logx-level-other: #cbd5e1;\n}\n.dark .logx-explorer {\n  --logx-level-debug: #64748b;\n  --logx-level-info: #94a3b8;\n  --logx-level-warning: #f59e0b;\n  --logx-level-error: #ef4444;\n  --logx-level-critical: #fca5a5;\n  --logx-level-other: #334155;\n}\n.logx-explorer .logx-row {\n  display: grid;\n  grid-template-columns: 96px 80px 112px 128px minmax(0, 1fr) 24px;\n  gap: 8px;\n  align-items: center;\n  width: 100%;\n  text-align: left;\n}\n.logx-explorer .logx-col-time { grid-column: 1; }\n.logx-explorer .logx-col-level { grid-column: 2; }\n.logx-explorer .logx-col-service { grid-column: 3; }\n.logx-explorer .logx-col-category { grid-column: 4; }\n.logx-explorer .logx-col-message { grid-column: 5; }\n.logx-explorer .logx-chevron { grid-column: 6; display: inline-flex; justify-content: flex-end; }\n@media (max-width: 767px) {\n  .logx-explorer .logx-row { grid-template-columns: 96px 80px minmax(0, 1fr) 24px; }\n  .logx-explorer .logx-col-service,\n  .logx-explorer .logx-col-category { display: none; }\n  .logx-explorer .logx-chevron { grid-column: 4; grid-row: 1; }\n  .logx-explorer .logx-col-message { grid-column: 1 / -1; grid-row: 2; }\n  .logx-explorer .logx-details { margin-left: 0; }\n}\n.logx-explorer .logx-details { margin-left: 96px; }\n.logx-explorer .logx-dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 16px; }\n.logx-explorer .logx-dl dt { color: hsl(var(--muted-foreground)); }\n.logx-explorer .logx-rail { border-left-width: 2px; border-left-style: solid; border-left-color: transparent; }\n.logx-explorer .logx-rail-warning { border-left-color: #f59e0b; }\n.logx-explorer .logx-rail-error { border-left-color: #dc2626; }\n.logx-explorer .logx-rail-critical { border-left-color: #7f1d1d; }\n.dark .logx-explorer .logx-rail-error { border-left-color: #ef4444; }\n.dark .logx-explorer .logx-rail-critical { border-left-color: #fca5a5; }\n.logx-explorer .logx-tint-error { background-color: rgb(239 68 68 / 0.05); }\n.logx-explorer .logx-tint-critical { background-color: rgb(239 68 68 / 0.1); }\n.logx-explorer .logx-text-warning { color: #b45309; }\n.dark .logx-explorer .logx-text-warning { color: #fcd34d; }\n.logx-explorer .logx-text-error { color: #b91c1c; }\n.dark .logx-explorer .logx-text-error { color: #f87171; }\n.logx-explorer .logx-text-other { color: hsl(var(--muted-foreground)); font-style: italic; }\n.logx-explorer .logx-chevron-icon { flex: none; }\n@media (prefers-reduced-motion: no-preference) {\n  .logx-explorer .logx-chevron-icon { transition: transform 150ms ease; }\n}\n.logx-explorer .logx-chevron-open .logx-chevron-icon { transform: rotate(90deg); }\n.logx-explorer .logx-scroll { max-height: 60vh; min-height: 320px; overflow-y: auto; }\n.logx-explorer .logx-histogram { display: flex; align-items: flex-end; gap: 2px; height: 96px; }\n.logx-explorer .logx-bucket {\n  position: relative;\n  flex: 1 1 0;\n  min-width: 0;\n  height: 96px;\n  padding: 0;\n  border: 0;\n  background: none;\n  cursor: pointer;\n  display: flex;\n  flex-direction: column;\n  justify-content: flex-end;\n}\n.logx-explorer .logx-bucket:hover,\n.logx-explorer .logx-bucket:focus-visible { outline: none; box-shadow: 0 0 0 2px hsl(var(--ring)); border-radius: 2px; }\n.logx-explorer .logx-seg { width: 100%; border-top: 1px solid hsl(var(--background)); }\n.logx-explorer .logx-seg-critical { background-color: var(--logx-level-critical); }\n.logx-explorer .logx-seg-error { background-color: var(--logx-level-error); }\n.logx-explorer .logx-seg-warning { background-color: var(--logx-level-warning); }\n.logx-explorer .logx-seg-info { background-color: var(--logx-level-info); }\n.logx-explorer .logx-seg-debug { background-color: var(--logx-level-debug); }\n.logx-explorer .logx-seg-other { background-color: var(--logx-level-other); }\n.logx-explorer .logx-zero-tick { width: 100%; height: 1px; background-color: hsl(var(--border)); }\n.logx-explorer .logx-axis { display: flex; align-items: center; justify-content: space-between; height: 16px; }\n.logx-explorer .logx-axis-label { font-size: 12px; line-height: 16px; color: hsl(var(--muted-foreground)); font-variant-numeric: tabular-nums; }\n.logx-explorer .logx-legend-swatch { display: inline-block; width: 8px; height: 8px; border-radius: 2px; }\n.logx-explorer .logx-tooltip {\n  position: absolute;\n  bottom: calc(100% + 4px);\n  left: 50%;\n  transform: translateX(-50%);\n  z-index: 40;\n  min-width: 200px;\n  padding: 8px;\n  border: 1px solid hsl(var(--border));\n  border-radius: 6px;\n  background-color: hsl(var(--popover));\n  color: hsl(var(--popover-foreground));\n  box-shadow: 0 4px 12px rgb(0 0 0 / 0.15);\n  text-align: left;\n  font-size: 12px;\n  line-height: 16px;\n}\n.logx-explorer .logx-tooltip-left { left: 0; transform: none; }\n.logx-explorer .logx-tooltip-right { left: auto; right: 0; transform: none; }\n.logx-explorer .logx-strip-loading { height: 96px; border-radius: 6px; background-color: hsl(var(--muted) / 0.4); }\n.logx-explorer .logx-live-dot {\n  width: 8px;\n  height: 8px;\n  border-radius: 9999px;\n  border: 1px solid hsl(var(--muted-foreground));\n  flex: none;\n}\n.logx-explorer .logx-live-dot-on { background-color: hsl(var(--primary)); border-color: hsl(var(--primary)); }\n", Me = Object.freeze({}), G = Object.freeze([]);
function Ne(e) {
	if (typeof e != "string") return "";
	let t = /T\d{2}:\d{2}:\d{2}\.(\d{1,9})/.exec(e);
	return t ? t[1].slice(0, 3) : "";
}
function Pe(e) {
	let t = String(e ?? "").toUpperCase();
	return t === "" ? "Other" : t;
}
function Fe(e) {
	return e === "WARNING" ? "logx-rail-warning" : e === "ERROR" ? "logx-rail-error" : e === "CRITICAL" ? "logx-rail-critical" : "";
}
function Ie(e) {
	return e === "ERROR" ? "logx-tint-error" : e === "CRITICAL" ? "logx-tint-critical" : "";
}
function K(e) {
	return e === "WARNING" ? "logx-text-warning" : e === "ERROR" || e === "CRITICAL" ? "logx-text-error" : "logx-text-other";
}
function q(e) {
	let t = String(e ?? "").toUpperCase();
	return Oe.includes(t) ? t : "Other";
}
function J(e) {
	return String(e).padStart(2, "0");
}
function Le(e) {
	let t = Date.parse(e);
	if (Number.isNaN(t)) return "";
	let n = new Date(t);
	return `${n.getFullYear()}-${J(n.getMonth() + 1)}-${J(n.getDate())}T${J(n.getHours())}:${J(n.getMinutes())}:${J(n.getSeconds())}`;
}
function Re(e) {
	if (typeof e != "string" || e === "" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(e)) return null;
	let t = Date.parse(e);
	return Number.isNaN(t) ? null : t;
}
function ze(e, t) {
	let n = Date.parse(e), r = Date.parse(t);
	if (Number.isNaN(n) || Number.isNaN(r)) return "custom";
	let i = r - n, a = Math.abs(Date.now() - r), o = Ae.find((e) => e.ms === i);
	return o && a <= 12e4 ? o.value : "custom";
}
function Be(e) {
	if (!Number.isFinite(e) || e <= 0) return "";
	let t = Math.round(e / 6e4), n = t >= 60 && t % 60 == 0 ? "hour" : "minute", r = n === "hour" ? t / 60 : t;
	try {
		return new Intl.NumberFormat(void 0, {
			style: "unit",
			unit: n,
			unitDisplay: "long"
		}).format(r);
	} catch {
		return `${r} ${n}`;
	}
}
function Ve(e, t) {
	let n = [...e ?? []].sort(), r = [...t ?? []].sort();
	return n.length === r.length && n.every((e, t) => e === r[t]);
}
function He(e) {
	return {
		preset: ze(e.start, e.end),
		from: Le(e.start),
		to: Le(e.end),
		text: e.text,
		request_id: e.request_id,
		task_id: e.task_id,
		service: e.service,
		level: e.level,
		category: e.category
	};
}
function Ue(e, t, n) {
	let r = t.start, i = t.end;
	if (e.preset === "custom") {
		let n = Re(e.from), a = Re(e.to);
		n !== null && (r = new Date(n).toISOString()), a !== null && (i = new Date(a).toISOString()), Date.parse(r) >= Date.parse(i) && (r = t.start, i = t.end);
	} else {
		let t = Ae.find((t) => t.value === e.preset);
		t?.ms && (i = new Date(n).toISOString(), r = new Date(n - t.ms).toISOString());
	}
	return {
		service: e.service,
		level: e.level,
		category: e.category,
		text: e.text,
		request_id: e.request_id,
		task_id: e.task_id,
		start: r,
		end: i
	};
}
function We(e, t) {
	return e.includes(t) ? e.filter((e) => e !== t) : [...e, t];
}
function Ge(e) {
	let t = {
		CRITICAL: 0,
		ERROR: 0,
		WARNING: 0,
		INFO: 0,
		DEBUG: 0,
		Other: 0
	}, n = 0;
	for (let [r, i] of Object.entries(e ?? Me)) {
		let e = Number(i) || 0;
		t[q(r)] += e, n += e;
	}
	return {
		counts: t,
		total: n
	};
}
function Ke(e) {
	if (e.length === 0) return [];
	let t = Math.min(U, e.length), n = Math.max(1, Math.floor((e.length - 1) / Math.max(1, t - 1))), r = [];
	for (let i = 0; i < e.length && r.length < t; i += n) r.push(e[i]);
	return r;
}
function qe({ testId: e, icon: t, title: n, body: r, actionLabel: i, onAction: a }) {
	return /* @__PURE__ */ C("div", {
		className: "rounded-lg border bg-card px-6 py-8",
		"data-testid": e,
		role: "status",
		children: /* @__PURE__ */ w("div", {
			className: "flex max-w-xl items-start gap-2",
			children: [/* @__PURE__ */ C(g, {
				name: t,
				size: 20,
				className: "mt-0.5 shrink-0 text-muted-foreground"
			}), /* @__PURE__ */ w("div", {
				className: "space-y-1",
				children: [
					/* @__PURE__ */ C("h2", {
						className: "text-sm font-semibold text-foreground",
						children: n
					}),
					/* @__PURE__ */ C("p", {
						className: "text-sm text-muted-foreground",
						children: r
					}),
					i ? /* @__PURE__ */ C(u, {
						type: "button",
						variant: "outline",
						size: "sm",
						className: "mt-2 h-auto min-h-8 whitespace-normal",
						onClick: a,
						children: i
					}) : null
				]
			})]
		})
	});
}
function Je() {
	return /* @__PURE__ */ C(S, { children: [
		100,
		80,
		60
	].map((e) => /* @__PURE__ */ C("li", {
		className: "border-l-2 border-l-transparent px-2 py-1",
		children: /* @__PURE__ */ C("span", {
			className: "block h-4 rounded-md bg-muted/40",
			style: { width: `${e}%` }
		})
	}, e)) });
}
function Ye({ line: t, open: n, onToggleRow: r, onPivot: i, formatTime: a, formatDateTime: o, tp: s }) {
	let c = Pe(t.level), l = Ne(t.ts), d = a(t.ts), f = l ? `${o(t.ts)}.${l}` : o(t.ts), p = String(t.message ?? "").split("\n")[0], m = Object.entries(t.fields ?? {}).filter(([e]) => ![
		"request_id",
		"requestId",
		"task_id",
		"taskId",
		"logger",
		"Logger"
	].includes(e)), h = t.fields?.logger ?? t.fields?.Logger ?? "";
	return /* @__PURE__ */ w("li", {
		className: [
			"border-l-2",
			Fe(c),
			Ie(c)
		].filter(Boolean).join(" "),
		"data-testid": "log-explorer-line",
		"data-level": c,
		"data-line-id": t.id,
		children: [/* @__PURE__ */ w("button", {
			type: "button",
			"aria-expanded": n,
			className: "logx-row bg-transparent px-2 py-1",
			onClick: () => r(t.id),
			children: [
				/* @__PURE__ */ w("span", {
					className: "logx-col-time truncate font-mono text-xs tabular-nums text-muted-foreground",
					title: f,
					children: [d, l ? `.${l}` : ""]
				}),
				/* @__PURE__ */ C("span", {
					className: `logx-col-level truncate text-xs font-semibold ${K(c)} ${c === "CRITICAL" ? "underline decoration-2" : ""}`.trim(),
					children: c === "Other" ? s("level.other", "Other") : c
				}),
				/* @__PURE__ */ C("span", {
					className: "logx-col-service truncate font-mono text-xs text-foreground",
					title: t.service ?? "",
					children: t.service ?? ""
				}),
				/* @__PURE__ */ C("span", {
					className: "logx-col-category truncate font-mono text-xs text-muted-foreground",
					title: t.category ?? "",
					children: t.category ?? ""
				}),
				/* @__PURE__ */ C("span", {
					className: "logx-col-message truncate text-sm text-foreground",
					title: p,
					children: p
				}),
				/* @__PURE__ */ C("span", {
					className: `logx-chevron ${n ? "logx-chevron-open" : ""}`.trim(),
					children: /* @__PURE__ */ C(g, {
						name: "chevron-right",
						size: 14,
						className: "logx-chevron-icon text-muted-foreground"
					})
				}),
				/* @__PURE__ */ C("span", {
					className: "sr-only",
					children: n ? s("row.details_hide", "Hide details") : s("row.details_show", "Show details")
				})
			]
		}), n ? /* @__PURE__ */ w("div", {
			className: "logx-details mb-2 mt-1 rounded-md border bg-background p-2",
			"data-testid": "log-explorer-line-details",
			children: [/* @__PURE__ */ C("pre", {
				className: "whitespace-pre-wrap break-words font-mono text-xs text-foreground",
				children: t.message
			}), /* @__PURE__ */ w("dl", {
				className: "logx-dl mt-1 text-xs",
				children: [
					/* @__PURE__ */ C("dt", { children: s("details.time", "Time") }),
					/* @__PURE__ */ C("dd", {
						className: "font-mono tabular-nums text-foreground",
						children: f
					}),
					t.service ? /* @__PURE__ */ w(S, { children: [/* @__PURE__ */ C("dt", { children: s("details.service", "Service") }), /* @__PURE__ */ C("dd", {
						className: "break-all font-mono text-foreground",
						children: t.service
					})] }) : null,
					t.level ? /* @__PURE__ */ w(S, { children: [/* @__PURE__ */ C("dt", { children: s("details.level", "Level") }), /* @__PURE__ */ C("dd", {
						className: `font-mono ${K(c)}`,
						children: String(t.level).toUpperCase()
					})] }) : null,
					t.category ? /* @__PURE__ */ w(S, { children: [/* @__PURE__ */ C("dt", { children: s("details.category", "Category") }), /* @__PURE__ */ C("dd", {
						className: "break-all font-mono text-foreground",
						children: t.category
					})] }) : null,
					h ? /* @__PURE__ */ w(S, { children: [/* @__PURE__ */ C("dt", { children: s("details.logger", "Logger") }), /* @__PURE__ */ C("dd", {
						className: "break-all font-mono text-foreground",
						children: h
					})] }) : null,
					t.requestId ? /* @__PURE__ */ w(S, { children: [/* @__PURE__ */ C("dt", { children: s("field.request_id", "Request ID") }), /* @__PURE__ */ C("dd", { children: /* @__PURE__ */ C(u, {
						variant: "link",
						size: "sm",
						className: "h-auto px-0 font-mono",
						"data-testid": "log-explorer-pivot-request",
						"aria-label": s("pivot.request", "Show all lines for request {{id}}", { id: t.requestId }),
						onClick: () => i("request_id", t.requestId),
						children: t.requestId
					}) })] }) : null,
					t.taskId ? /* @__PURE__ */ w(S, { children: [/* @__PURE__ */ C("dt", { children: s("field.task_id", "Task ID") }), /* @__PURE__ */ C("dd", { children: /* @__PURE__ */ C(u, {
						variant: "link",
						size: "sm",
						className: "h-auto px-0 font-mono",
						"data-testid": "log-explorer-pivot-task",
						"aria-label": s("pivot.task", "Show all lines for task {{id}}", { id: t.taskId }),
						onClick: () => i("task_id", t.taskId),
						children: t.taskId
					}) })] }) : null,
					m.map(([t, n]) => /* @__PURE__ */ w(e, { children: [/* @__PURE__ */ C("dt", {
						className: "font-mono",
						children: t
					}), /* @__PURE__ */ C("dd", {
						className: "break-all font-mono text-foreground",
						children: String(n)
					})] }, t))
				]
			})]
		}) : null]
	});
}
function Xe({ entry: e, tp: t }) {
	let n = e.markerKind === "gap", r = n ? t("marker.gap", "Lines between {{start}} and {{end}} may be missing.", {
		start: e.start,
		end: e.end
	}) : t("marker.evicted", "{{count}} older lines were removed from view to keep live tail fast.", { count: e.count });
	return /* @__PURE__ */ w("li", {
		className: "mx-2 my-2 flex items-center gap-2 rounded-md border border-dashed px-2 py-2 text-sm text-muted-foreground",
		role: "note",
		"data-testid": n ? "log-explorer-gap" : "log-explorer-evicted",
		children: [/* @__PURE__ */ C(g, {
			name: "scissors-line-dashed",
			size: 14
		}), /* @__PURE__ */ C("span", { children: r })]
	});
}
function Ze({ histogram: e, formatTime: t, tp: n, onBucketClick: r }) {
	let [s, c] = o(0), [l, u] = o(null), d = a([]), f = i(() => e.state === "ready" ? e.buckets : G, [e]), p = i(() => f.map((e) => Ge(e.counts)), [f]), m = i(() => p.reduce((e, t) => Math.max(e, t.total), 0), [p]), h = i(() => {
		let e = {
			CRITICAL: 0,
			ERROR: 0,
			WARNING: 0,
			INFO: 0,
			DEBUG: 0,
			Other: 0
		};
		for (let t of p) for (let n of W) e[q(n)] += t.counts[q(n)] ?? 0;
		return e;
	}, [p]), g = W.filter((e) => ke.includes(e) || (h[q(e)] ?? 0) > 0), _ = (e) => {
		let t = Math.max(0, Math.min(f.length - 1, e));
		c(t), d.current[t]?.focus();
	};
	return /* @__PURE__ */ w("section", {
		"aria-labelledby": "logx-volume-heading",
		"data-testid": "log-explorer-histogram",
		children: [/* @__PURE__ */ w("div", {
			className: "mb-2 flex flex-wrap items-center gap-4",
			children: [/* @__PURE__ */ C("h2", {
				id: "logx-volume-heading",
				className: "text-base font-semibold text-foreground",
				children: n("volume.heading", "Log volume")
			}), /* @__PURE__ */ C("ul", {
				className: "flex flex-wrap items-center gap-4 text-xs text-muted-foreground",
				children: g.map((e) => /* @__PURE__ */ w("li", {
					className: "flex items-center gap-1",
					children: [
						/* @__PURE__ */ C("span", { className: `logx-legend-swatch logx-seg-${q(e).toLowerCase()}` }),
						/* @__PURE__ */ C("span", { children: e === "Other" ? n("level.other", "Other") : e }),
						/* @__PURE__ */ C("span", {
							className: "tabular-nums",
							children: new Intl.NumberFormat().format(h[q(e)] ?? 0)
						})
					]
				}, e))
			})]
		}), e.state === "loading" || e.state === "idle" ? /* @__PURE__ */ C("div", {
			className: "logx-strip-loading",
			"aria-busy": "true"
		}) : e.state === "error" ? /* @__PURE__ */ C("p", {
			className: "text-xs text-muted-foreground",
			children: n("volume.error", "Log volume could not be loaded.")
		}) : /* @__PURE__ */ w(S, { children: [/* @__PURE__ */ C("div", {
			className: "logx-histogram",
			children: f.map((e, i) => {
				let a = p[i]?.counts ?? Me, o = p[i]?.total ?? 0, c = [...W].reverse(), h = W.map((e) => `${e} ${a[q(e)] ?? 0}`).join(", "), g = `${n("bucket.action", "Search {{start}} to {{end}}: {{count}} lines", {
					start: t(e.start),
					end: t(e.end),
					count: o
				})}. ${h}`;
				return /* @__PURE__ */ w("button", {
					type: "button",
					ref: (e) => {
						d.current[i] = e;
					},
					className: "logx-bucket",
					"data-testid": `log-explorer-bucket-${i}`,
					tabIndex: i === s ? 0 : -1,
					"aria-label": g,
					onKeyDown: (e) => {
						e.key === "ArrowRight" ? (e.preventDefault(), _(i + 1)) : e.key === "ArrowLeft" && (e.preventDefault(), _(i - 1));
					},
					onFocus: () => u(i),
					onBlur: () => u(null),
					onMouseEnter: () => u(i),
					onMouseLeave: () => u(null),
					onClick: () => r(e),
					children: [o > 0 && m > 0 ? c.map((e) => {
						let t = a[q(e)] ?? 0;
						if (t <= 0) return null;
						let n = Math.max(1, Math.round(t / m * 96));
						return /* @__PURE__ */ C("span", {
							className: `logx-seg logx-seg-${q(e).toLowerCase()}`,
							style: { height: `${n}px` }
						}, e);
					}) : /* @__PURE__ */ C("span", { className: "logx-zero-tick" }), l === i ? /* @__PURE__ */ w("span", {
						className: [
							"logx-tooltip",
							i >= f.length - 2 ? "logx-tooltip-right" : "",
							i === 0 ? "logx-tooltip-left" : ""
						].filter(Boolean).join(" "),
						"aria-hidden": "true",
						children: [/* @__PURE__ */ w("span", {
							className: "block text-foreground",
							children: [
								t(e.start),
								" – ",
								t(e.end)
							]
						}), W.map((e) => /* @__PURE__ */ w("span", {
							className: "block",
							children: [
								e === "Other" ? n("level.other", "Other") : e,
								" ",
								/* @__PURE__ */ C("span", {
									className: "tabular-nums",
									children: a[q(e)] ?? 0
								})
							]
						}, e))]
					}) : null]
				}, e.start);
			})
		}), /* @__PURE__ */ C("div", {
			className: "logx-axis",
			children: Ke(f).map((e) => /* @__PURE__ */ C("span", {
				className: "logx-axis-label",
				children: t(e.start)
			}, e.start))
		})] })]
	});
}
function Qe() {
	let e = re("system-logs", "read"), { t: x } = se(Ce), ce = ie(), le = ae(), ue = oe(), he = c(), T = s(), [E, D] = l(), O = E.toString(), k = i(() => _e(E), [E]), A = a(k);
	n(() => {
		A.current = k;
	}, [k]);
	let [j, ge] = o("loading"), [M, N] = o(!1), [P, F] = o(null), [L, R] = o(() => He(k)), [z, B] = o({
		state: "idle",
		lines: [],
		limited: !1,
		olderCursor: null,
		newestCursor: null,
		clamped: null,
		rejected: !1,
		reason: ""
	}), [V, U] = o({
		state: "idle",
		buckets: []
	}), [W, Oe] = o({
		state: "loading",
		services: [],
		levels: [],
		categories: []
	}), [ke, Me] = o(() => /* @__PURE__ */ new Set()), [G, Ne] = o(!1), [Pe, Fe] = o(null), [Ie, K] = o(0), [q, J] = o(!0), [Re, Ge] = o(""), [Ke, Qe] = o(!1), [et, tt] = o({
		service: !1,
		level: !1,
		category: !1
	}), [nt, rt] = o(0), Y = a(null), it = a(z), X = a(null), at = a(0), ot = a(!0), st = a(0), ct = a(null), lt = a(0), ut = a(T.state?.liveTail === !0);
	n(() => {
		it.current = z;
	}, [z]), n(() => {
		let e = ne(Ce, we, je);
		return () => e.release();
	}, []);
	let dt = t(async () => {
		try {
			let { data: e } = await y.get(`${H}/status`);
			return {
				state: e?.state ?? "unreachable",
				grafana: !!e?.grafana
			};
		} catch {
			return {
				state: "unreachable",
				grafana: !1
			};
		}
	}, []), ft = t(async () => {
		ge("loading");
		let { state: e, grafana: t } = await dt();
		N(t), ge(e);
	}, [dt]);
	n(() => {
		ft();
	}, [ft]), n(() => {
		if (j !== "unreachable") return;
		let e = !1, t = Se({
			check: async () => {
				let { state: t, grafana: n } = await dt();
				return e ? !0 : t !== "unreachable" && (N(n), ge(t), !0);
			},
			isVisible: () => typeof document > "u" || document.visibilityState !== "hidden"
		});
		t.start();
		let n = () => {
			(typeof document > "u" || document.visibilityState !== "hidden") && t.kick();
		};
		return typeof document < "u" && document.addEventListener("visibilitychange", n), () => {
			e = !0, typeof document < "u" && document.removeEventListener("visibilitychange", n), t.stop();
		};
	}, [j, dt]);
	let pt = t(async (e) => {
		let t = at.current + 1;
		at.current = t, B((e) => ({
			...e,
			state: e.lines.length > 0 ? "reloading" : "loading",
			rejected: !1,
			reason: ""
		}));
		try {
			let { data: n } = await y.get(`${H}/query`, {
				params: I(e, { limit: 500 }),
				paramsSerializer: b
			});
			if (at.current !== t) return;
			let r = ye(n?.lines ?? []);
			B({
				state: "ready",
				lines: r,
				limited: !!n?.limited,
				olderCursor: n?.olderCursor ?? null,
				newestCursor: n?.newestCursor ?? null,
				clamped: n?.clamped ?? null,
				rejected: !1,
				reason: ""
			}), Me(/* @__PURE__ */ new Set()), rt((e) => e + 1), Ge(x("results.summary", "{{count}} matching lines", { count: r.length }));
		} catch (e) {
			if (at.current !== t) return;
			let n = e?.response?.status;
			B(n && n >= 400 && n < 500 ? (t) => ({
				...t,
				state: t.lines.length > 0 ? "ready" : "rejected",
				rejected: !0,
				reason: te(e)
			}) : (e) => ({
				...e,
				state: "error",
				rejected: !1,
				reason: ""
			}));
		}
	}, [x]);
	n(() => {
		O === "" && j === "ok" && D(ve(A.current), { replace: !0 });
	}, [
		O,
		j,
		D
	]), n(() => {
		Ne(!1);
	}, [O]), n(() => {
		ut.current && k.task_id && (ut.current = !1, Ne(!0), he(`${T.pathname}${T.search}`, {
			replace: !0,
			state: null
		}));
	}, [
		k.task_id,
		O,
		T.pathname,
		T.search,
		he
	]), n(() => {
		j === "ok" && pt(A.current);
	}, [
		O,
		j,
		pt
	]), n(() => {
		R(He(A.current));
	}, [O]);
	let mt = t(async (e) => {
		U((e) => ({
			state: e.buckets.length > 0 ? "refreshing" : "loading",
			buckets: e.buckets
		}));
		try {
			let { data: t } = await y.get(`${H}/histogram`, {
				params: I(e, {}),
				paramsSerializer: b
			});
			lt.current = Date.now(), U({
				state: "ready",
				buckets: t?.buckets ?? []
			});
		} catch {
			U((e) => ({
				state: e.buckets.length > 0 ? "ready" : "error",
				buckets: e.buckets
			}));
		}
	}, []);
	n(() => {
		j === "ok" && mt(A.current);
	}, [
		O,
		j,
		mt
	]), n(() => {
		if (j !== "ok") return;
		let e = !1;
		Oe((e) => ({
			...e,
			state: "loading"
		}));
		let t = A.current;
		return y.get(`${H}/services`, {
			params: I(t, {}),
			paramsSerializer: b
		}).then(({ data: t }) => {
			e || Oe({
				state: "ready",
				services: t?.services ?? [],
				levels: t?.levels ?? [],
				categories: t?.categories ?? []
			});
		}).catch(() => {
			e || Oe((e) => ({
				...e,
				state: "error"
			}));
		}), () => {
			e = !0;
		};
	}, [O, j]), n(() => {
		if (j !== "ok" || !M) {
			F(null);
			return;
		}
		let e = !1;
		return y.get(`${H}/grafana-link`, {
			params: I(A.current, {}),
			paramsSerializer: b
		}).then(({ data: t }) => {
			e || F(t?.url ?? null);
		}).catch(() => {
			e || F(null);
		}), () => {
			e = !0;
		};
	}, [
		O,
		j,
		M
	]);
	let ht = t(async ({ cursor: e }) => {
		let t = A.current, { data: n } = await y.get(`${H}/query`, {
			params: I(t, {
				after: e,
				limit: 500
			}),
			paramsSerializer: b
		});
		return Date.now() - lt.current >= Ee && mt(t), {
			lines: n?.lines ?? [],
			newestCursor: n?.newestCursor ?? null,
			limited: !!n?.limited,
			gap: n?.gap ?? null
		};
	}, [mt]), gt = t(() => {
		X.current?.stop(), X.current = null, Fe(null);
	}, []);
	n(() => {
		if (!G) {
			gt();
			return;
		}
		let e = xe({
			poll: ht,
			interval: de,
			backoff: fe,
			maxBackoff: pe,
			cap: me
		});
		X.current = e;
		let t = e.subscribe(Fe), n = it.current;
		return e.start({
			cursor: n.newestCursor,
			lines: n.lines
		}), () => {
			t(), e.stop(), X.current === e && (X.current = null), Fe(null);
		};
	}, [
		G,
		ht,
		gt
	]);
	let _t = Date.parse(k.end), vt = Number.isFinite(_t) && Date.now() - _t <= Te, Z = G ? Pe : null, Q = Z ? Z.lines : z.lines, yt = Q.length, bt = a(yt);
	n(() => {
		bt.current = yt;
	}, [yt]), n(() => {
		if (!Z) return;
		if (ot.current) {
			st.current = Z.lines.length, K(0);
			let e = Y.current;
			e && (e.scrollTop = e.scrollHeight);
			return;
		}
		let e = Math.max(0, Z.lines.length - st.current);
		K(e), e > 0 && Ge(x("live.new_lines", "{{count}} new lines", { count: e }));
	}, [Z, x]), n(() => {
		let e = Y.current;
		e && (e.scrollTop = e.scrollHeight), ot.current = !0, J(!0);
	}, [nt]), r(() => {
		let e = ct.current;
		if (!e) return;
		ct.current = null;
		let t = Y.current;
		if (!t) return;
		let n = t.querySelector(`[data-line-id="${e.id}"]`);
		n && (t.scrollTop = n.offsetTop - e.delta);
	}, [yt]);
	let xt = t(() => {
		let e = Y.current;
		if (!e) return;
		let t = e.scrollHeight - e.scrollTop - e.clientHeight <= De;
		ot.current = t, J(t), t && (st.current = bt.current, K(0));
	}, []), St = t(() => {
		let e = Y.current;
		e && (e.scrollTop = e.scrollHeight), ot.current = !0, J(!0), st.current = bt.current, K(0);
	}, []), $ = t((e) => {
		D(ve(e));
	}, [D]), Ct = t((e, t) => {
		let n = A.current;
		$({
			...n,
			service: [],
			level: [],
			category: [],
			text: "",
			request_id: e === "request_id" ? t : "",
			task_id: e === "task_id" ? t : ""
		});
	}, [$]), wt = t((e) => {
		Me((t) => {
			let n = new Set(t);
			return n.has(e) ? n.delete(e) : n.add(e), n;
		});
	}, []), Tt = t(() => {
		let e = A.current;
		$({
			...e,
			service: [],
			level: [],
			category: [],
			text: "",
			request_id: "",
			task_id: ""
		});
	}, [$]), Et = t((e) => {
		$({
			...A.current,
			start: e.start,
			end: e.end
		});
	}, [$]), Dt = t(async () => {
		let e = Y.current, t = X.current?.getSnapshot().lines ?? it.current.lines;
		if (t.length === 0) return;
		let n = t[0]?.tsNs;
		if (n) {
			if (e) {
				let t = null;
				for (let n of e.querySelectorAll("[data-line-id]")) if (n.offsetTop + n.offsetHeight > e.scrollTop + 1) {
					t = {
						id: n.getAttribute("data-line-id"),
						delta: n.offsetTop - e.scrollTop
					};
					break;
				}
				ct.current = t;
			}
			Qe(!0);
			try {
				let { data: e } = await y.get(`${H}/query`, {
					params: I(A.current, {
						before: n,
						limit: 500
					}),
					paramsSerializer: b
				}), r = ye([...ye(e?.lines ?? []), ...t]), i = X.current;
				if (i) {
					let e = i.getSnapshot().cursor;
					i.stop(), i.start({
						cursor: e,
						lines: r
					});
				}
				B((t) => ({
					...t,
					lines: i ? t.lines : r,
					olderCursor: e?.olderCursor ?? null,
					limited: !!e?.limited
				}));
			} catch {
				ct.current = null;
			} finally {
				Qe(!1);
			}
		}
	}, []), Ot = ze(k.start, k.end), kt = L.preset !== Ot || L.text !== k.text || L.request_id !== k.request_id || L.task_id !== k.task_id || !Ve(L.service, k.service) || !Ve(L.level, k.level) || !Ve(L.category, k.category) || L.preset === "custom" && (L.from !== Le(k.start) || L.to !== Le(k.end)), At = t((e) => {
		e.preventDefault(), $(Ue(L, A.current, Date.now()));
	}, [$, L]), jt = (e) => {
		let t = L[e], n = {
			service: {
				all: ["filter.services_all", "Services: All"],
				one: ["filter.services_one", "Services: {{value}}"],
				many: ["filter.services_selected", "Services: {{count}} selected"]
			},
			level: {
				all: ["filter.levels_all", "Levels: All"],
				one: ["filter.levels_one", "Levels: {{value}}"],
				many: ["filter.levels_selected", "Levels: {{count}} selected"]
			},
			category: {
				all: ["filter.categories_all", "Categories: All"],
				one: ["filter.categories_one", "Categories: {{value}}"],
				many: ["filter.categories_selected", "Categories: {{count}} selected"]
			}
		};
		return t.length === 0 ? x(n[e].all[0], n[e].all[1]) : t.length === 1 ? x(n[e].one[0], n[e].one[1], { value: t[0] }) : x(n[e].many[0], n[e].many[1], { count: t.length });
	}, Mt = (e, t) => {
		let n = L[e], r = W[{
			service: "services",
			level: "levels",
			category: "categories"
		}[e]] ?? [], i = W.state === "loading";
		return /* @__PURE__ */ C(f, {
			open: et[e],
			onOpenChange: (t) => tt((n) => ({
				...n,
				[e]: t
			})),
			trigger: /* @__PURE__ */ C(u, {
				type: "button",
				variant: "outline",
				size: "md",
				className: "h-auto min-h-9 w-full justify-start whitespace-normal",
				"data-testid": t,
				"aria-label": jt(e),
				disabled: i,
				children: i ? /* @__PURE__ */ w("span", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ C(g, {
						name: "loader-circle",
						size: 14,
						className: "text-muted-foreground"
					}), jt(e)]
				}) : jt(e)
			}),
			children: /* @__PURE__ */ w("div", {
				className: "max-h-64 min-w-56 overflow-y-auto p-2",
				children: [
					/* @__PURE__ */ C(p, {
						type: "button",
						onClick: () => R((t) => ({
							...t,
							[e]: []
						})),
						children: x("filter.all", "All")
					}),
					r.map((t) => /* @__PURE__ */ C("div", {
						className: "px-2 py-1",
						children: /* @__PURE__ */ C(d, {
							id: `logx-filter-${e}-${t}`,
							label: t,
							checked: n.includes(t),
							onChange: () => R((n) => ({
								...n,
								[e]: We(n[e], t)
							}))
						})
					}, t)),
					n.filter((e) => !r.includes(e)).map((t) => /* @__PURE__ */ C("div", {
						className: "px-2 py-1",
						children: /* @__PURE__ */ C(d, {
							id: `logx-filter-${e}-stale-${t}`,
							label: /* @__PURE__ */ C("span", {
								className: "text-muted-foreground",
								children: t
							}),
							checked: !0,
							onChange: () => R((n) => ({
								...n,
								[e]: We(n[e], t)
							}))
						})
					}, t))
				]
			})
		}, e);
	}, Nt = i(() => {
		let e = [];
		if (Z) {
			Z.evicted > 0 && e.push({
				id: "evicted",
				kind: "evicted",
				at: 0,
				count: Z.evicted
			});
			for (let t of Z.markers ?? []) {
				let n = Date.parse(t.end), r = Q.length;
				if (Number.isFinite(n)) {
					let e = Q.findIndex((e) => Number(e.tsNs) >= n);
					r = e === -1 ? Q.length : e;
				}
				e.push({
					...t,
					at: r
				});
			}
		}
		return e;
	}, [Z, Q]), Pt = i(() => new Date(k.start).toDateString() !== new Date(k.end).toDateString(), [k.start, k.end]), Ft = i(() => new Intl.DateTimeFormat(void 0, {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric"
	}), []), It = i(() => {
		let e = be(Q, Nt);
		if (!Pt) return e;
		let t = [], n = null;
		for (let r of e) {
			if (r.markerKind) {
				t.push(r);
				continue;
			}
			let e = new Date(r.ts).toDateString();
			e !== n && (n = e, t.push({
				id: `day:${e}`,
				dayDivider: Ft.format(new Date(r.ts))
			})), t.push(r);
		}
		return t;
	}, [
		Q,
		Nt,
		Pt,
		Ft
	]), Lt = i(() => V.state === "ready" ? V.buckets.reduce((e, t) => {
		for (let n of Object.values(t.counts ?? {})) e += Number(n) || 0;
		return e;
	}, 0) : null, [V]);
	if (!e) return null;
	let Rt = j === "not_configured" || j === "external_only" || j === "unreachable" && z.lines.length === 0, zt = Z?.interrupted === !0 || j === "unreachable" && z.lines.length > 0, Bt = z.clamped ? Be(Date.parse(z.clamped.end) - Date.parse(z.clamped.start)) : "", Vt = k.task_id ? $e(x, k) : null, Ht = Lt === null ? x("results.summary", "{{count}} matching lines", { count: z.lines.length }) : x("results.summary_limited", "Newest {{shown}} of {{total}} matching lines", {
		shown: z.lines.length,
		total: Lt
	}), Ut = z.limited ? Ht : x("results.summary", "{{count}} matching lines", { count: z.lines.length }), Wt = z.state === "idle" || z.state === "loading", Gt = (e) => e.dayDivider ? /* @__PURE__ */ C("li", {
		className: "px-4 py-1 text-xs text-muted-foreground",
		children: e.dayDivider
	}, e.id) : e.markerKind ? /* @__PURE__ */ C(Xe, {
		entry: e,
		tp: x
	}, e.id) : /* @__PURE__ */ C(Ye, {
		line: e,
		open: ke.has(e.id),
		onToggleRow: wt,
		onPivot: Ct,
		formatTime: ue,
		formatDateTime: le,
		tp: x
	}, e.id);
	return /* @__PURE__ */ w("div", {
		className: "logx-explorer space-y-6",
		"data-testid": "log-explorer",
		children: [/* @__PURE__ */ C(_, {
			title: x("page.title", "System logs"),
			description: x("page.description", "Search and follow log lines from every service of this installation."),
			icon: "scroll-text",
			children: P ? /* @__PURE__ */ C(u, {
				asChild: !0,
				variant: "outline",
				size: "md",
				className: "h-auto min-h-9 whitespace-normal",
				children: /* @__PURE__ */ w("a", {
					href: P,
					target: "_blank",
					rel: "noopener noreferrer",
					"data-testid": "log-explorer-grafana",
					title: x("grafana.hint", "Opens in a new tab. Grafana uses its own sign-in."),
					children: [/* @__PURE__ */ C(g, {
						name: "external-link",
						size: 16
					}), x("grafana.link", "Open in Grafana Explore")]
				})
			}) : null
		}), Rt ? j === "not_configured" ? /* @__PURE__ */ C(qe, {
			testId: "log-explorer-state-not-configured",
			icon: "settings-2",
			title: x("state.not_configured.title", "Log search is not set up"),
			body: x("state.not_configured.body", "This installation has no log store connected for searching. Ask an administrator to configure the Loki connection of the log-explorer plugin.")
		}) : j === "external_only" ? /* @__PURE__ */ C(qe, {
			testId: "log-explorer-state-external",
			icon: "cloud-off",
			title: x("state.external.title", "Logs go to an external system"),
			body: x("state.external.body", "This installation sends its logs only to an external log platform, so they cannot be searched here. Use your organization’s log tool to view them.")
		}) : /* @__PURE__ */ C(qe, {
			testId: "log-explorer-state-unreachable",
			icon: "unplug",
			title: x("state.unreachable.title", "Log store not reachable"),
			body: x("state.unreachable.body", "The log store did not respond, so no lines can be shown. Try again in a moment. If it keeps failing, ask an administrator to check the Loki service."),
			actionLabel: x("state.unreachable.action", "Try again"),
			onAction: () => {
				ft();
			}
		}) : /* @__PURE__ */ w(S, { children: [
			/* @__PURE__ */ w("form", {
				role: "search",
				"data-testid": "log-explorer-filter",
				className: "space-y-4 rounded-lg border bg-card p-4",
				onSubmit: At,
				children: [
					/* @__PURE__ */ w("div", {
						className: "flex flex-wrap items-end gap-2",
						children: [
							/* @__PURE__ */ C(h, {
								id: "logx-range",
								label: x("field.range", "Time range"),
								children: /* @__PURE__ */ C(ee, {
									id: "logx-range",
									"data-testid": "log-explorer-range",
									value: L.preset,
									onChange: (e) => R((t) => ({
										...t,
										preset: e.target.value
									})),
									options: Ae.map((e) => ({
										value: e.value,
										label: x(e.key, e.fallback)
									}))
								})
							}),
							L.preset === "custom" ? /* @__PURE__ */ w(S, { children: [/* @__PURE__ */ C(h, {
								id: "logx-from",
								label: x("field.from", "From"),
								children: /* @__PURE__ */ C(v, {
									id: "logx-from",
									type: "datetime-local",
									step: "1",
									value: L.from,
									onChange: (e) => R((t) => ({
										...t,
										from: e.target.value
									}))
								})
							}), /* @__PURE__ */ C(h, {
								id: "logx-to",
								label: x("field.to", "To"),
								children: /* @__PURE__ */ C(v, {
									id: "logx-to",
									type: "datetime-local",
									step: "1",
									value: L.to,
									onChange: (e) => R((t) => ({
										...t,
										to: e.target.value
									}))
								})
							})] }) : null,
							/* @__PURE__ */ C("div", {
								className: "min-w-56 flex-1",
								children: /* @__PURE__ */ C(h, {
									id: "logx-text",
									label: x("field.text_label", "Message contains"),
									children: /* @__PURE__ */ C(v, {
										id: "logx-text",
										"data-testid": "log-explorer-text",
										value: L.text,
										placeholder: x("field.text_placeholder", "Exact text, not case-sensitive"),
										onChange: (e) => R((t) => ({
											...t,
											text: e.target.value
										}))
									})
								})
							}),
							/* @__PURE__ */ C(u, {
								type: "submit",
								variant: "primary",
								size: "md",
								leftIcon: "search",
								"data-testid": "log-explorer-search",
								children: x("action.search", "Search")
							})
						]
					}),
					/* @__PURE__ */ w("div", {
						className: "flex flex-wrap items-end gap-2",
						children: [
							Mt("service", "log-explorer-service-menu"),
							Mt("level", "log-explorer-level-menu"),
							Mt("category", "log-explorer-category-menu"),
							/* @__PURE__ */ C(h, {
								id: "logx-request-id",
								label: x("field.request_id", "Request ID"),
								children: /* @__PURE__ */ C(v, {
									id: "logx-request-id",
									"data-testid": "log-explorer-request-id",
									className: "w-40 font-mono",
									value: L.request_id,
									onChange: (e) => R((t) => ({
										...t,
										request_id: e.target.value
									}))
								})
							}),
							/* @__PURE__ */ C(h, {
								id: "logx-task-id",
								label: x("field.task_id", "Task ID"),
								children: /* @__PURE__ */ C(v, {
									id: "logx-task-id",
									"data-testid": "log-explorer-task-id",
									className: "w-40 font-mono",
									value: L.task_id,
									onChange: (e) => R((t) => ({
										...t,
										task_id: e.target.value
									}))
								})
							})
						]
					}),
					kt ? /* @__PURE__ */ C("p", {
						className: "text-xs text-muted-foreground",
						children: x("draft.hint", "Changes apply when you search.")
					}) : null,
					z.rejected ? /* @__PURE__ */ C("p", {
						role: "alert",
						className: "text-sm text-red-700",
						children: x("error.search_rejected", "The search could not be run: {{reason}} Fix the filter and search again.", { reason: z.reason })
					}) : null,
					Bt || Vt ? /* @__PURE__ */ w("div", {
						className: "space-y-1",
						role: "status",
						children: [Bt ? /* @__PURE__ */ C("p", {
							className: "text-xs text-muted-foreground",
							children: x("notice.range_shortened", "The time range was shortened to {{duration}}, the maximum for one search.", { duration: Bt })
						}) : null, Vt ? /* @__PURE__ */ C("p", {
							className: "text-xs text-muted-foreground",
							children: Vt
						}) : null]
					}) : null
				]
			}),
			/* @__PURE__ */ C(Ze, {
				histogram: V,
				formatTime: ue,
				tp: x,
				onBucketClick: Et
			}),
			/* @__PURE__ */ w("section", {
				className: "rounded-lg border",
				"aria-labelledby": "logx-lines-heading",
				children: [
					/* @__PURE__ */ C("h2", {
						id: "logx-lines-heading",
						className: "sr-only",
						children: x("results.heading", "Log lines")
					}),
					/* @__PURE__ */ w("div", {
						className: "flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2",
						children: [/* @__PURE__ */ C("p", {
							className: "text-sm text-foreground",
							"data-testid": "log-explorer-summary",
							children: Ut
						}), /* @__PURE__ */ w("div", {
							className: "flex flex-col items-end",
							children: [/* @__PURE__ */ w(u, {
								type: "button",
								variant: "outline",
								size: "md",
								"aria-pressed": G,
								disabled: !vt,
								"aria-describedby": vt ? void 0 : "logx-live-hint",
								"data-testid": "log-explorer-live",
								className: "h-auto min-h-9 whitespace-normal",
								onClick: () => Ne((e) => !e),
								children: [/* @__PURE__ */ C("span", { className: `logx-live-dot ${G && !Z?.interrupted ? "logx-live-dot-on" : ""}`.trim() }), x("live.toggle", "Follow live")]
							}), vt ? null : /* @__PURE__ */ C("p", {
								id: "logx-live-hint",
								className: "mt-1 max-w-72 text-xs text-muted-foreground",
								children: x("live.unavailable", "Live tail needs a time range that ends now. Choose a \"Last …\" range and search.")
							})]
						})]
					}),
					zt ? /* @__PURE__ */ w("div", {
						role: "status",
						"data-testid": "log-explorer-connection",
						className: "flex items-center gap-2 border-b border-amber-500 px-4 py-2 text-xs text-amber-700",
						children: [/* @__PURE__ */ C(g, {
							name: "circle-alert",
							size: 14
						}), /* @__PURE__ */ C("span", { children: x("connection.interrupted", "Connection interrupted. Loaded lines stay visible; retrying automatically.") })]
					}) : null,
					/* @__PURE__ */ w("div", {
						className: "relative",
						children: [/* @__PURE__ */ w("div", {
							ref: Y,
							tabIndex: 0,
							role: "region",
							"aria-label": x("results.heading", "Log lines"),
							"aria-busy": Wt ? "true" : void 0,
							"data-testid": "log-explorer-scroll",
							className: "logx-scroll bg-muted/20",
							onScroll: xt,
							children: [Wt ? /* @__PURE__ */ C("ul", { children: /* @__PURE__ */ C(Je, {}) }) : z.state === "error" ? /* @__PURE__ */ w("div", {
								className: "px-4 py-8 text-center",
								children: [/* @__PURE__ */ C("p", {
									role: "alert",
									className: "text-sm text-foreground",
									children: x("error.list_load_failed", "Log lines could not be loaded. Try again.")
								}), /* @__PURE__ */ C(u, {
									type: "button",
									variant: "outline",
									size: "sm",
									className: "mt-2 h-auto min-h-8 whitespace-normal",
									onClick: () => {
										pt(A.current);
									},
									children: x("state.unreachable.action", "Try again")
								})]
							}) : z.lines.length === 0 && z.state === "ready" ? /* @__PURE__ */ C("div", {
								className: "p-4",
								children: /* @__PURE__ */ C(m, {
									variant: "no-results",
									"data-testid": "log-explorer-empty",
									title: x("empty.title", "No matching log lines"),
									description: x("empty.body", "Nothing was logged for these filters between {{start}} and {{end}}. Widen the time range or remove filters.", {
										start: ce(k.start),
										end: ce(k.end)
									}),
									buttonLabel: x("empty.action", "Remove filters"),
									onButtonClick: Tt
								})
							}) : z.state === "reloading" ? /* @__PURE__ */ w(S, { children: [/* @__PURE__ */ C("ul", { children: /* @__PURE__ */ C(Je, {}) }), /* @__PURE__ */ C("ul", {
								className: "opacity-60",
								children: It.map((e) => Gt(e))
							})] }) : /* @__PURE__ */ C("ul", { children: It.map((e) => Gt(e)) }), z.limited && z.olderCursor && z.lines.length > 0 ? /* @__PURE__ */ C("div", {
								className: "px-2 py-2",
								children: /* @__PURE__ */ C(u, {
									type: "button",
									variant: "outline",
									size: "sm",
									loading: Ke,
									"data-testid": "log-explorer-load-older",
									className: "h-auto min-h-8 whitespace-normal",
									onClick: () => {
										Dt();
									},
									children: x("action.load_older", "Load older lines")
								})
							}) : null]
						}), !q && Ie > 0 ? /* @__PURE__ */ C(u, {
							type: "button",
							variant: "primary",
							size: "sm",
							leftIcon: "arrow-down-to-line",
							"data-testid": "log-explorer-new-lines",
							className: "absolute bottom-4 right-4 h-auto min-h-8 whitespace-normal shadow-lg",
							onClick: St,
							children: x("live.new_lines", "{{count}} new lines", { count: Ie })
						}) : null]
					})
				]
			}),
			/* @__PURE__ */ C("p", {
				className: "sr-only",
				"aria-live": "polite",
				children: Re
			}),
			null
		] })]
	});
}
function $e(e, t) {
	let n = t.task_id;
	if (!n) return null;
	let r = Date.parse(t.start), i = Date.parse(t.end);
	return !Number.isFinite(r) || !Number.isFinite(i) ? null : i - r === 9e5 ? e("notice.task_window_fallback", "This task has no recorded run times. Showing the period after its creation.") : e("notice.task_window", "Showing the run of task {{id}} with {{margin}} before and after.", {
		id: n,
		margin: Be(E)
	});
}
//#endregion
//#region task-log-action.jsx
var et = "log-explorer", tt = "/plugins/log-explorer/explorer";
function nt({ task: e }) {
	let { t } = se(et), n = c(), r = e?.id ?? null, { data: i, isLoading: a } = x(r);
	return /* @__PURE__ */ C(u, {
		type: "button",
		variant: "outline",
		size: "md",
		leftIcon: "scroll-text",
		loading: a,
		disabled: a,
		className: "h-auto min-h-9 whitespace-normal",
		"data-testid": "log-explorer-task-action",
		onClick: () => {
			let e = Date.now(), t = i ? V(i, e) : null, a = ve({
				service: [],
				level: [],
				category: [],
				text: "",
				request_id: "",
				task_id: t?.taskId ?? r ?? "",
				start: t?.start ?? (/* @__PURE__ */ new Date(e - 9e5)).toISOString(),
				end: t?.end ?? new Date(e).toISOString()
			}).toString();
			n(`${tt}?${a}`, { state: t?.liveTail ? { liveTail: !0 } : null });
		},
		children: t("task.action", "Open system logs")
	});
}
//#endregion
//#region index.jsx
var rt = {
	translations: {
		en: ce,
		de: le
	},
	pages: [{
		id: "log-explorer-page",
		path: "explorer",
		component: Qe
	}],
	navItems: [{
		id: "log-explorer-nav",
		label: "System logs",
		labelKey: "nav.label",
		path: "/plugins/log-explorer/explorer",
		icon: "scroll-text",
		group: "Administration",
		permission: "system-logs:read"
	}],
	taskDetailActions: [{
		id: "log-explorer-task-action",
		label: "Open system logs",
		labelKey: "task.action",
		permission: "system-logs:read",
		component: nt
	}]
};
//#endregion
export { rt as default };
