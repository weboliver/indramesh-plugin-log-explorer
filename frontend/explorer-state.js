// Phase 305 (LOGX-02, D-01/D-05..D-12): pure state helpers for the log-explorer
// page.
//
// This module is deliberately dependency-free: no React, no DOM, no network and
// no framework import, so `node --test explorer-state.test.js` exercises the
// whole search/live-tail state model without a browser. The page binds these
// helpers to React and to the plugin routes.
//
// Contract notes (305-01 `<api_contract>`):
//   * timestamps cross the wire as ISO-8601 UTC strings ending in `Z`;
//   * cursors are Loki nanosecond epochs as DECIMAL STRINGS and are compared
//     with `BigInt` — ns epochs exceed `Number.MAX_SAFE_INTEGER`, so a numeric
//     comparison would silently lose the ordering (Pitfall 6).

export const DEFAULT_RANGE_MS = 15 * 60 * 1000
export const LIVE_POLL_MS = 3000
export const LIVE_BACKOFF_MS = [3000, 6000, 12000]
export const LIVE_MAX_BACKOFF_MS = 30000
export const LIVE_BUFFER_CAP = 2000
// D-07: the /status retry cadence while the log store is unreachable.
export const STATUS_RETRY_BACKOFF_MS = [2000, 4000, 8000, 16000]
export const STATUS_RETRY_MAX_MS = 30000
export const PAGE_SIZE = 500
export const TASK_WINDOW_MARGIN_MS = 2 * 60 * 1000
export const TASK_WINDOW_FALLBACK_MS = 15 * 60 * 1000

// A concrete ISO instant with an explicit offset (only `Z` is produced by the
// server; an offset is accepted so a hand-built link still resolves).
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/
// A cursor is a non-negative integer rendered as a decimal string.
const CURSOR_RE = /^\d+$/

function isCursor(value) {
  return typeof value === 'string' && CURSOR_RE.test(value)
}

function parseInstant(value) {
  if (typeof value !== 'string' || !ISO_INSTANT_RE.test(value)) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

// Task timestamps are naive UTC (`DateTime` without tz, serialized without `Z`);
// a naive string is read as UTC exactly like the host `useFormatDate` does, so
// the task range never shifts with the viewer's offset.
const NAIVE_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?$/

function parseTaskInstant(value) {
  if (typeof value !== 'string' || value === '') return null
  if (ISO_INSTANT_RE.test(value)) {
    const ms = Date.parse(value)
    return Number.isNaN(ms) ? null : ms
  }
  if (NAIVE_DATETIME_RE.test(value)) {
    const ms = Date.parse(`${value}Z`)
    return Number.isNaN(ms) ? null : ms
  }
  return null
}

// `URLSearchParams`-like or plain-object reads, so a test (or a caller) may pass
// either shape without the module depending on the browser URL class.
function getAllValues(params, key) {
  if (!params) return []
  if (typeof params.getAll === 'function') return params.getAll(key)
  const value = params[key]
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function getValue(params, key) {
  const values = getAllValues(params, key)
  if (values.length === 0) return ''
  const last = values[values.length - 1]
  return typeof last === 'string' ? last : String(last)
}

function cleanValues(values) {
  const out = []
  for (const value of values) {
    const text = typeof value === 'string' ? value : ''
    if (text === '') continue
    if (!out.includes(text)) out.push(text)
  }
  return out
}

// D-12: the applied search lives in the URL as the filters plus a CONCRETE
// absolute range. Unknown keys are dropped, malformed values are ignored, and a
// missing or invalid range falls back to the default range (last 15 minutes).
export function parseUrlState(params, now = Date.now()) {
  const startMs = parseInstant(getValue(params, 'start'))
  const endMs = parseInstant(getValue(params, 'end'))
  const hasRange = startMs !== null && endMs !== null && endMs > startMs

  return {
    service: cleanValues(getAllValues(params, 'service')),
    level: cleanValues(getAllValues(params, 'level')),
    category: cleanValues(getAllValues(params, 'category')),
    text: getValue(params, 'text'),
    request_id: getValue(params, 'request_id'),
    task_id: getValue(params, 'task_id'),
    start: new Date(hasRange ? startMs : now - DEFAULT_RANGE_MS).toISOString(),
    end: new Date(hasRange ? endMs : now).toISOString(),
  }
}

// Serializes an applied search into an absolute URL search params object —
// never a relative preset (D-12: shared links carry concrete start/end).
export function buildUrlState(applied) {
  const params = new URLSearchParams()
  if (applied?.start) params.set('start', applied.start)
  if (applied?.end) params.set('end', applied.end)
  for (const value of applied?.service ?? []) params.append('service', value)
  for (const value of applied?.level ?? []) params.append('level', value)
  for (const value of applied?.category ?? []) params.append('category', value)
  if (applied?.text) params.set('text', applied.text)
  if (applied?.request_id) params.set('request_id', applied.request_id)
  if (applied?.task_id) params.set('task_id', applied.task_id)
  return params
}

// The exact whitelist of filter params the plugin routes accept (Carry-01): the
// page can never send a raw query, a target URL or a tenant. Cursors are added
// only as decimal strings.
export function buildQueryParams(applied, options = {}) {
  const params = {}
  if (applied?.start) params.start = applied.start
  if (applied?.end) params.end = applied.end
  if (Array.isArray(applied?.service) && applied.service.length > 0) params.service = applied.service
  if (Array.isArray(applied?.level) && applied.level.length > 0) params.level = applied.level
  if (Array.isArray(applied?.category) && applied.category.length > 0) params.category = applied.category
  if (applied?.text) params.text = applied.text
  if (applied?.request_id) params.request_id = applied.request_id
  if (applied?.task_id) params.task_id = applied.task_id
  if (options.limit !== undefined && options.limit !== null) params.limit = options.limit
  if (isCursor(options.before)) params.before = options.before
  if (isCursor(options.after)) params.after = options.after
  return params
}

// The stable line identity: the server already hashes stream labels + ts_ns +
// line into `id`; the fallback keeps a dedupe possible for rows that arrive
// without one.
export function lineKey(line) {
  if (line && typeof line.id === 'string' && line.id !== '') return line.id
  return [line?.tsNs ?? '', line?.service ?? '', line?.level ?? '', line?.category ?? '', line?.message ?? ''].join(
    '\u0000',
  )
}

// Identical-nanosecond lines can appear in several streams; a re-fetch may
// return them again (Pitfall 6), so every append dedupes by the stable id.
export function dedupeById(lines) {
  const seen = new Set()
  const out = []
  for (const line of lines ?? []) {
    const key = lineKey(line)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(line)
  }
  return out
}

// D-07/D-08: append a live batch at the bottom (newest at the bottom), dedupe,
// and bound the buffer. Dropping the oldest lines is never silent — the caller
// gets the evicted count for the evicted marker.
export function applyLiveBatch(state, batch, cap = LIVE_BUFFER_CAP) {
  const current = Array.isArray(state) ? state : (state?.lines ?? [])
  const seen = new Set(current.map(lineKey))
  const appended = []
  for (const line of batch ?? []) {
    const key = lineKey(line)
    if (seen.has(key)) continue
    seen.add(key)
    appended.push(line)
  }
  const merged = [...current, ...appended]
  const limit = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : LIVE_BUFFER_CAP
  const evicted = Math.max(0, merged.length - limit)
  return { lines: evicted > 0 ? merged.slice(evicted) : merged, evicted }
}

// D-07/D-08: gap, evicted and limit rows share one shape. A marker carries the
// index (`at`) it belongs before; out-of-range positions clamp to the bounds so
// a marker can never be dropped silently.
export function insertMarkers(lines, markers) {
  const list = lines ?? []
  const byIndex = new Map()
  for (const marker of markers ?? []) {
    const raw = Number.isInteger(marker?.at) ? marker.at : 0
    const index = Math.max(0, Math.min(list.length, raw))
    if (!byIndex.has(index)) byIndex.set(index, [])
    byIndex.get(index).push(marker)
  }

  const out = []
  for (let index = 0; index <= list.length; index += 1) {
    for (const marker of byIndex.get(index) ?? []) {
      out.push({
        id: `marker:${marker.id}`,
        markerKind: marker.kind,
        kind: marker.kind,
        start: marker.start,
        end: marker.end,
        count: marker.count,
      })
    }
    if (index < list.length) out.push(list[index])
  }
  return out
}

// The cursor may only move forward. Decimal strings are compared as `BigInt`
// (they exceed `Number.MAX_SAFE_INTEGER`), and a server-reported gap becomes an
// explicit marker instead of a silently truncated interval.
export function advanceCursor(cursor, batch = {}) {
  let next = isCursor(cursor) ? cursor : null
  const candidates = []
  if (isCursor(batch.newestCursor)) candidates.push(batch.newestCursor)
  for (const line of batch.lines ?? []) {
    if (isCursor(line?.tsNs)) candidates.push(line.tsNs)
  }
  for (const candidate of candidates) {
    if (next === null || BigInt(candidate) > BigInt(next)) next = candidate
  }

  const markers = batch.gap
    ? [
        {
          id: `gap:${batch.gap.start}:${batch.gap.end}`,
          kind: 'gap',
          start: batch.gap.start,
          end: batch.gap.end,
        },
      ]
    : []

  return { cursor: next, markers }
}

function defaultSchedule(fn, delayMs) {
  const id = setTimeout(fn, delayMs)
  return () => clearTimeout(id)
}

// D-05/D-06/D-08: the manual live-tail poller. It owns the bounded buffer, the
// cursor and the retry/backoff cycle; the page supplies the request and
// subscribes for re-render. The scheduler is injectable so the whole cycle is
// deterministic under `node --test` (no real waiting).
//
//   * start() polls immediately from the last cursor, then on the interval;
//   * a `limited: true` response that advanced the cursor catches up with no
//     wait; a limited response that did NOT advance falls back to the interval
//     (never a tight loop);
//   * a failure keeps the collected lines, sets `interrupted`, backs off
//     3s/6s/12s and then every 30s, and resumes from the last cursor;
//   * stop() cancels the pending poll and keeps the rows.
export function createLiveTailController({
  poll,
  schedule = defaultSchedule,
  interval = LIVE_POLL_MS,
  backoff = LIVE_BACKOFF_MS,
  maxBackoff = LIVE_MAX_BACKOFF_MS,
  cap = LIVE_BUFFER_CAP,
} = {}) {
  const listeners = new Set()
  let active = false
  let interrupted = false
  let attempts = 0
  let cursor = null
  let lines = []
  let bufferedEvicted = 0
  let markers = []
  let cancelScheduled = null
  let inFlight = false

  function getSnapshot() {
    return {
      active,
      interrupted,
      attempts,
      cursor,
      lines,
      evicted: bufferedEvicted,
      markers,
    }
  }

  function notify() {
    const snapshot = getSnapshot()
    listeners.forEach((listener) => {
      try {
        listener(snapshot)
      } catch {
        // A listener must never break the poller.
      }
    })
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {}
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function cancelPending() {
    if (cancelScheduled) {
      cancelScheduled()
      cancelScheduled = null
    }
  }

  function scheduleNext(delayMs) {
    cancelPending()
    cancelScheduled = schedule(runPoll, delayMs)
  }

  function backoffDelay() {
    const index = Math.max(0, attempts - 1)
    return index < backoff.length ? backoff[index] : maxBackoff
  }

  async function runPoll() {
    if (!active || inFlight) return
    cancelScheduled = null
    inFlight = true
    const request = { cursor }
    try {
      const result = await poll(request)
      if (!active) {
        inFlight = false
        return
      }
      const batch = applyLiveBatch({ lines }, result?.lines ?? [], cap)
      lines = batch.lines
      bufferedEvicted += batch.evicted
      const advanced = advanceCursor(cursor, {
        lines: result?.lines ?? [],
        newestCursor: result?.newestCursor ?? null,
        gap: result?.gap ?? null,
      })
      const progress =
        isCursor(advanced.cursor) && (!isCursor(cursor) || BigInt(advanced.cursor) > BigInt(cursor))
      if (isCursor(advanced.cursor)) cursor = advanced.cursor
      if (advanced.markers.length > 0) markers = [...markers, ...advanced.markers]
      attempts = 0
      interrupted = false
      inFlight = false
      notify()
      if (result?.limited && progress) scheduleNext(0)
      else scheduleNext(interval)
    } catch {
      if (!active) {
        inFlight = false
        return
      }
      attempts += 1
      interrupted = true
      inFlight = false
      notify()
      scheduleNext(backoffDelay())
    }
  }

  function start({ cursor: startCursor = null, lines: startLines = [] } = {}) {
    active = true
    interrupted = false
    attempts = 0
    cursor = isCursor(startCursor) ? startCursor : null
    lines = Array.isArray(startLines) ? startLines : []
    bufferedEvicted = 0
    markers = []
    notify()
    // The first poll runs directly (enabling the toggle fetches immediately);
    // every later poll goes through the injectable scheduler.
    runPoll()
    return getSnapshot()
  }

  function stop() {
    active = false
    cancelPending()
    notify()
    return getSnapshot()
  }

  return { start, stop, subscribe, getSnapshot }
}

// D-07: the quiet `/status` retry loop. It shares the live-tail controller's
// shape — an injected scheduler, one pending timer and one in-flight probe —
// but it never repaints the page: it only reports whether the log store answered
// anything other than `unreachable`, and the caller applies that answer.
//
//   * start() schedules the first probe after 2s;
//   * each failing probe walks 2s/4s/8s/16s and then waits the 30s ceiling;
//   * a probe that resolves `true` (or throws — a throw is not-ok) stops the
//     loop, so success ends the chain without an extra timer;
//   * while `isVisible()` is false no probe is sent and the loop waits the
//     ceiling; kick() probes at once (the visibility listener) and cancels the
//     pending timer first, so two chains can never exist side by side;
//   * stop() cancels the pending timer; a probe that finishes afterwards
//     schedules nothing.
export function createStatusRetryController({
  check,
  schedule = defaultSchedule,
  backoff = STATUS_RETRY_BACKOFF_MS,
  maxBackoff = STATUS_RETRY_MAX_MS,
  isVisible = () => true,
} = {}) {
  let active = false
  let attempts = 0
  let inFlight = false
  let cancelScheduled = null

  function cancelPending() {
    if (cancelScheduled) {
      cancelScheduled()
      cancelScheduled = null
    }
  }

  function delayFor(index) {
    return index < backoff.length ? backoff[index] : maxBackoff
  }

  function scheduleNext(delayMs) {
    cancelPending()
    cancelScheduled = schedule(runCheck, delayMs)
  }

  async function runCheck() {
    if (!active || inFlight) return
    cancelScheduled = null
    if (!isVisible()) {
      scheduleNext(maxBackoff)
      return
    }
    inFlight = true
    let ok = false
    try {
      ok = (await check()) === true
    } catch {
      // A failed probe is simply not-ok; it must never skip the reschedule.
      ok = false
    } finally {
      inFlight = false
    }
    if (!active) return
    if (ok) {
      active = false
      return
    }
    attempts += 1
    scheduleNext(delayFor(attempts))
  }

  function start() {
    active = true
    attempts = 0
    scheduleNext(delayFor(0))
  }

  function stop() {
    active = false
    cancelPending()
  }

  function kick() {
    if (!active) return
    attempts = 0
    cancelPending()
    void runCheck()
  }

  return { start, stop, kick }
}

// D-10/D-11: the task entry state. Task timestamps are naive UTC `DateTime`
// columns serialized without `Z`; a naive string is read as UTC exactly like the
// host formatter does, so the range is never shifted by the viewer's offset.
//   * running range: [started_at - 2min, (completed_at or now) + 2min];
//   * missing run times: [created_at, created_at + 15min];
//   * liveTail is true only for a task that is still PENDING or RUNNING.
export function taskEntryState(task, now = Date.now()) {
  const taskId = task?.id ?? task?.taskId ?? null
  const status = task?.current_status ?? task?.status ?? null
  const liveTail = status === 'PENDING' || status === 'RUNNING'
  const startedAt = parseTaskInstant(task?.started_at)
  const completedAt = parseTaskInstant(task?.completed_at)
  const createdAt = parseTaskInstant(task?.created_at)

  if (startedAt !== null) {
    const end = completedAt !== null ? completedAt : now
    return {
      taskId,
      start: new Date(startedAt - TASK_WINDOW_MARGIN_MS).toISOString(),
      end: new Date(end + TASK_WINDOW_MARGIN_MS).toISOString(),
      liveTail,
      creationAnchored: false,
    }
  }

  if (createdAt !== null) {
    return {
      taskId,
      start: new Date(createdAt).toISOString(),
      end: new Date(createdAt + TASK_WINDOW_FALLBACK_MS).toISOString(),
      liveTail,
      creationAnchored: true,
    }
  }

  return {
    taskId,
    start: new Date(now).toISOString(),
    end: new Date(now + TASK_WINDOW_FALLBACK_MS).toISOString(),
    liveTail,
    creationAnchored: true,
  }
}