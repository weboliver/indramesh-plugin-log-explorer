// Phase 305 (LOGX-02/LOGX-03/LOGX-04): the log-explorer page.
//
// Realises the approved `305-UI-SPEC.md` inside the plugin:
//   * a `<form role="search">` filter bar whose edits are drafts applied on
//     Search/Enter (D-04), with the applied search living in the URL (D-12);
//   * a level-stacked volume strip over ALL matching lines in the range (D-15)
//     whose bucket click applies that interval directly;
//   * a newest-at-the-bottom result list with expandable details,
//     request_id/task_id pivots (D-09) and explicit gap/evicted markers;
//   * a manual `Follow live` toggle that polls with a bounded buffer, backs off
//     on failure and never moves the view while the user reads up (D-05..D-08);
//   * the not-configured / unreachable / external-only panels (D-14) and the
//     gated Grafana Explore link (D-13).
//
// Explorer-specific layout and colour ship as ONE scoped stylesheet through the
// host `injectPluginStyles` (the host Tailwind build does not scan `plugins/`).
// Messages, IDs and field values are rendered as React text nodes only.
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Button,
  PageHeader,
  FormField,
  TextInput,
  SelectInput,
  CheckboxField,
  DropdownMenu,
  DropdownMenuItem,
  EmptyState,
  useCan,
  api,
  serializeRepeatedParams,
  injectPluginStyles,
  usePluginTranslation,
  useFormatDate,
  useFormatDateTime,
  useFormatTime,
  extractErrorMessage,
  LucideIcon,
} from '@indramesh/plugin-api'
import {
  LIVE_BACKOFF_MS,
  LIVE_BUFFER_CAP,
  LIVE_MAX_BACKOFF_MS,
  LIVE_POLL_MS,
  PAGE_SIZE,
  TASK_WINDOW_FALLBACK_MS,
  TASK_WINDOW_MARGIN_MS,
  buildQueryParams,
  buildUrlState,
  createLiveTailController,
  createStatusRetryController,
  dedupeById,
  insertMarkers,
  parseUrlState,
} from './explorer-state.js'

const PLUGIN_NAME = 'log-explorer'
const STYLE_ID = 'explorer'
// The host `api` axios instance already carries `baseURL: '/api/v1/'`;
// an absolute '/api/v1/plugins/...' path would double the prefix and 404.
const ROUTE = '/plugins/log-explorer'
const LIVE_WINDOW_MS = 5 * 60 * 1000
const HISTOGRAM_MIN_REFRESH_MS = 15000
const NEAR_BOTTOM_PX = 24
const AXIS_LABELS = 5

// Stack order bottom -> top (UI-SPEC §Volume strip).
const STACK_ORDER = ['CRITICAL', 'ERROR', 'WARNING', 'INFO', 'DEBUG', 'Other']
const KNOWN_LEVELS = ['CRITICAL', 'ERROR', 'WARNING', 'INFO', 'DEBUG']
// Levels always listed in the legend even at 0; CRITICAL/Other only when > 0.
const ALWAYS_LEGEND = ['ERROR', 'WARNING', 'INFO', 'DEBUG']

const RANGE_PRESETS = [
  { value: 'last_15m', ms: 15 * 60 * 1000, key: 'range.last_15m', fallback: 'Last 15 minutes' },
  { value: 'last_1h', ms: 60 * 60 * 1000, key: 'range.last_1h', fallback: 'Last hour' },
  { value: 'last_6h', ms: 6 * 60 * 60 * 1000, key: 'range.last_6h', fallback: 'Last 6 hours' },
  { value: 'last_24h', ms: 24 * 60 * 60 * 1000, key: 'range.last_24h', fallback: 'Last 24 hours' },
  { value: 'custom', ms: null, key: 'range.custom', fallback: 'Custom range' },
]

// One scoped stylesheet: every selector is rooted at `.logx-explorer`, the level
// palette is declared once with `.dark` overrides, and no host selector is
// touched (303 style contract; host Tailwind does not scan plugins).
const EXPLORER_CSS = `
.logx-explorer {
  --logx-level-debug: #94a3b8;
  --logx-level-info: #64748b;
  --logx-level-warning: #f59e0b;
  --logx-level-error: #dc2626;
  --logx-level-critical: #7f1d1d;
  --logx-level-other: #cbd5e1;
}
.dark .logx-explorer {
  --logx-level-debug: #64748b;
  --logx-level-info: #94a3b8;
  --logx-level-warning: #f59e0b;
  --logx-level-error: #ef4444;
  --logx-level-critical: #fca5a5;
  --logx-level-other: #334155;
}
.logx-explorer .logx-row {
  display: grid;
  grid-template-columns: 96px 80px 112px 128px minmax(0, 1fr) 24px;
  gap: 8px;
  align-items: center;
  width: 100%;
  text-align: left;
}
.logx-explorer .logx-col-time { grid-column: 1; }
.logx-explorer .logx-col-level { grid-column: 2; }
.logx-explorer .logx-col-service { grid-column: 3; }
.logx-explorer .logx-col-category { grid-column: 4; }
.logx-explorer .logx-col-message { grid-column: 5; }
.logx-explorer .logx-chevron { grid-column: 6; display: inline-flex; justify-content: flex-end; }
@media (max-width: 767px) {
  .logx-explorer .logx-row { grid-template-columns: 96px 80px minmax(0, 1fr) 24px; }
  .logx-explorer .logx-col-service,
  .logx-explorer .logx-col-category { display: none; }
  .logx-explorer .logx-chevron { grid-column: 4; grid-row: 1; }
  .logx-explorer .logx-col-message { grid-column: 1 / -1; grid-row: 2; }
  .logx-explorer .logx-details { margin-left: 0; }
}
.logx-explorer .logx-details { margin-left: 96px; }
.logx-explorer .logx-dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 16px; }
.logx-explorer .logx-dl dt { color: hsl(var(--muted-foreground)); }
.logx-explorer .logx-rail { border-left-width: 2px; border-left-style: solid; border-left-color: transparent; }
.logx-explorer .logx-rail-warning { border-left-color: #f59e0b; }
.logx-explorer .logx-rail-error { border-left-color: #dc2626; }
.logx-explorer .logx-rail-critical { border-left-color: #7f1d1d; }
.dark .logx-explorer .logx-rail-error { border-left-color: #ef4444; }
.dark .logx-explorer .logx-rail-critical { border-left-color: #fca5a5; }
.logx-explorer .logx-tint-error { background-color: rgb(239 68 68 / 0.05); }
.logx-explorer .logx-tint-critical { background-color: rgb(239 68 68 / 0.1); }
.logx-explorer .logx-text-warning { color: #b45309; }
.dark .logx-explorer .logx-text-warning { color: #fcd34d; }
.logx-explorer .logx-text-error { color: #b91c1c; }
.dark .logx-explorer .logx-text-error { color: #f87171; }
.logx-explorer .logx-text-other { color: hsl(var(--muted-foreground)); font-style: italic; }
.logx-explorer .logx-chevron-icon { flex: none; }
@media (prefers-reduced-motion: no-preference) {
  .logx-explorer .logx-chevron-icon { transition: transform 150ms ease; }
}
.logx-explorer .logx-chevron-open .logx-chevron-icon { transform: rotate(90deg); }
.logx-explorer .logx-scroll { max-height: 60vh; min-height: 320px; overflow-y: auto; }
.logx-explorer .logx-histogram { display: flex; align-items: flex-end; gap: 2px; height: 96px; }
.logx-explorer .logx-bucket {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  height: 96px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.logx-explorer .logx-bucket:hover,
.logx-explorer .logx-bucket:focus-visible { outline: none; box-shadow: 0 0 0 2px hsl(var(--ring)); border-radius: 2px; }
.logx-explorer .logx-seg { width: 100%; border-top: 1px solid hsl(var(--background)); }
.logx-explorer .logx-seg-critical { background-color: var(--logx-level-critical); }
.logx-explorer .logx-seg-error { background-color: var(--logx-level-error); }
.logx-explorer .logx-seg-warning { background-color: var(--logx-level-warning); }
.logx-explorer .logx-seg-info { background-color: var(--logx-level-info); }
.logx-explorer .logx-seg-debug { background-color: var(--logx-level-debug); }
.logx-explorer .logx-seg-other { background-color: var(--logx-level-other); }
.logx-explorer .logx-zero-tick { width: 100%; height: 1px; background-color: hsl(var(--border)); }
.logx-explorer .logx-axis { display: flex; align-items: center; justify-content: space-between; height: 16px; }
.logx-explorer .logx-axis-label { font-size: 12px; line-height: 16px; color: hsl(var(--muted-foreground)); font-variant-numeric: tabular-nums; }
.logx-explorer .logx-legend-swatch { display: inline-block; width: 8px; height: 8px; border-radius: 2px; }
.logx-explorer .logx-tooltip {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  min-width: 200px;
  padding: 8px;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  background-color: hsl(var(--popover));
  color: hsl(var(--popover-foreground));
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.15);
  text-align: left;
  font-size: 12px;
  line-height: 16px;
}
.logx-explorer .logx-tooltip-left { left: 0; transform: none; }
.logx-explorer .logx-tooltip-right { left: auto; right: 0; transform: none; }
.logx-explorer .logx-strip-loading { height: 96px; border-radius: 6px; background-color: hsl(var(--muted) / 0.4); }
.logx-explorer .logx-live-dot {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  border: 1px solid hsl(var(--muted-foreground));
  flex: none;
}
.logx-explorer .logx-live-dot-on { background-color: hsl(var(--primary)); border-color: hsl(var(--primary)); }
`

const EMPTY_COUNTS = Object.freeze({})
const NO_BUCKETS = Object.freeze([])

function msFraction(iso) {
  if (typeof iso !== 'string') return ''
  const match = /T\d{2}:\d{2}:\d{2}\.(\d{1,9})/.exec(iso)
  return match ? match[1].slice(0, 3) : ''
}

function levelKeyOf(raw) {
  const key = String(raw ?? '').toUpperCase()
  return key === '' ? 'Other' : key
}

function rowLevelClass(key) {
  if (key === 'WARNING') return 'logx-rail-warning'
  if (key === 'ERROR') return 'logx-rail-error'
  if (key === 'CRITICAL') return 'logx-rail-critical'
  return ''
}

function rowTintClass(key) {
  if (key === 'ERROR') return 'logx-tint-error'
  if (key === 'CRITICAL') return 'logx-tint-critical'
  return ''
}

function rowLevelTextClass(key) {
  if (key === 'WARNING') return 'logx-text-warning'
  if (key === 'ERROR' || key === 'CRITICAL') return 'logx-text-error'
  return 'logx-text-other'
}

function barKeyOf(raw) {
  const key = String(raw ?? '').toUpperCase()
  return KNOWN_LEVELS.includes(key) ? key : 'Other'
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

// datetime-local draft values are LOCAL wall time; the applied state is UTC ISO.
function toLocalInput(iso) {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  const date = new Date(ms)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(
    date.getHours(),
  )}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

function parseLocalInput(value) {
  if (typeof value !== 'string' || value === '') return null
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

function presetForRange(start, end) {
  const startMs = Date.parse(start)
  const endMs = Date.parse(end)
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 'custom'
  const span = endMs - startMs
  const recency = Math.abs(Date.now() - endMs)
  const preset = RANGE_PRESETS.find((entry) => entry.ms === span)
  return preset && recency <= 2 * 60 * 1000 ? preset.value : 'custom'
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const minutes = Math.round(ms / 60000)
  const unit = minutes >= 60 && minutes % 60 === 0 ? 'hour' : 'minute'
  const value = unit === 'hour' ? minutes / 60 : minutes
  try {
    return new Intl.NumberFormat(undefined, { style: 'unit', unit, unitDisplay: 'long' }).format(value)
  } catch {
    return `${value} ${unit}`
  }
}

function listEquals(a, b) {
  const left = [...(a ?? [])].sort()
  const right = [...(b ?? [])].sort()
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function draftFromApplied(applied) {
  return {
    preset: presetForRange(applied.start, applied.end),
    from: toLocalInput(applied.start),
    to: toLocalInput(applied.end),
    text: applied.text,
    request_id: applied.request_id,
    task_id: applied.task_id,
    service: applied.service,
    level: applied.level,
    category: applied.category,
  }
}

function appliedFromDraft(draft, applied, now) {
  let start = applied.start
  let end = applied.end
  if (draft.preset === 'custom') {
    const fromMs = parseLocalInput(draft.from)
    const toMs = parseLocalInput(draft.to)
    if (fromMs !== null) start = new Date(fromMs).toISOString()
    if (toMs !== null) end = new Date(toMs).toISOString()
    if (Date.parse(start) >= Date.parse(end)) {
      start = applied.start
      end = applied.end
    }
  } else {
    const preset = RANGE_PRESETS.find((entry) => entry.value === draft.preset)
    if (preset?.ms) {
      end = new Date(now).toISOString()
      start = new Date(now - preset.ms).toISOString()
    }
  }
  return {
    service: draft.service,
    level: draft.level,
    category: draft.category,
    text: draft.text,
    request_id: draft.request_id,
    task_id: draft.task_id,
    start,
    end,
  }
}

function toggleValue(values, value) {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]
}

function aggregateCounts(counts) {
  const result = { CRITICAL: 0, ERROR: 0, WARNING: 0, INFO: 0, DEBUG: 0, Other: 0 }
  let total = 0
  for (const [level, raw] of Object.entries(counts ?? EMPTY_COUNTS)) {
    const value = Number(raw) || 0
    result[barKeyOf(level)] += value
    total += value
  }
  return { counts: result, total }
}

function axisLabels(buckets) {
  if (buckets.length === 0) return []
  const count = Math.min(AXIS_LABELS, buckets.length)
  const step = Math.max(1, Math.floor((buckets.length - 1) / Math.max(1, count - 1)))
  const out = []
  for (let index = 0; index < buckets.length && out.length < count; index += step) {
    out.push(buckets[index])
  }
  return out
}

// The explanatory panels (D-14): one local panel, never a toast, never red.
function StatePanel({ testId, icon, title, body, actionLabel, onAction }) {
  return (
    <div className="rounded-lg border bg-card px-6 py-8" data-testid={testId} role="status">
      <div className="flex max-w-xl items-start gap-2">
        <LucideIcon name={icon} size={20} className="mt-0.5 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{body}</p>
          {actionLabel ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 h-auto min-h-8 whitespace-normal"
              onClick={onAction}
            >
              {actionLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function SkeletonRows() {
  return (
    <>
      {[100, 80, 60].map((width) => (
        <li key={width} className="border-l-2 border-l-transparent px-2 py-1">
          <span className="block h-4 rounded-md bg-muted/40" style={{ width: `${width}%` }} />
        </li>
      ))}
    </>
  )
}

function LogRow({ line, open, onToggleRow, onPivot, formatTime, formatDateTime, tp }) {
  const key = levelKeyOf(line.level)
  const timeMs = msFraction(line.ts)
  const timeText = formatTime(line.ts)
  const timeTitle = timeMs ? `${formatDateTime(line.ts)}.${timeMs}` : formatDateTime(line.ts)
  const firstLine = String(line.message ?? '').split('\n')[0]
  const fields = Object.entries(line.fields ?? {}).filter(
    ([name]) => !['request_id', 'requestId', 'task_id', 'taskId', 'logger', 'Logger'].includes(name),
  )
  const logger = line.fields?.logger ?? line.fields?.Logger ?? ''

  return (
    <li
      className={['border-l-2', rowLevelClass(key), rowTintClass(key)].filter(Boolean).join(' ')}
      data-testid="log-explorer-line"
      data-level={key}
      data-line-id={line.id}
    >
      <button
        type="button"
        aria-expanded={open}
        className="logx-row bg-transparent px-2 py-1"
        onClick={() => onToggleRow(line.id)}
      >
        <span
          className="logx-col-time truncate font-mono text-xs tabular-nums text-muted-foreground"
          title={timeTitle}
        >
          {timeText}
          {timeMs ? `.${timeMs}` : ''}
        </span>
        <span
          className={`logx-col-level truncate text-xs font-semibold ${rowLevelTextClass(key)} ${
            key === 'CRITICAL' ? 'underline decoration-2' : ''
          }`.trim()}
        >
          {key === 'Other' ? tp('level.other', 'Other') : key}
        </span>
        <span className="logx-col-service truncate font-mono text-xs text-foreground" title={line.service ?? ''}>
          {line.service ?? ''}
        </span>
        <span
          className="logx-col-category truncate font-mono text-xs text-muted-foreground"
          title={line.category ?? ''}
        >
          {line.category ?? ''}
        </span>
        <span className="logx-col-message truncate text-sm text-foreground" title={firstLine}>
          {firstLine}
        </span>
        <span className={`logx-chevron ${open ? 'logx-chevron-open' : ''}`.trim()}>
          <LucideIcon name="chevron-right" size={14} className="logx-chevron-icon text-muted-foreground" />
        </span>
        <span className="sr-only">
          {open ? tp('row.details_hide', 'Hide details') : tp('row.details_show', 'Show details')}
        </span>
      </button>

      {open ? (
        <div
          className="logx-details mb-2 mt-1 rounded-md border bg-background p-2"
          data-testid="log-explorer-line-details"
        >
          <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">{line.message}</pre>
          <dl className="logx-dl mt-1 text-xs">
            <dt>{tp('details.time', 'Time')}</dt>
            <dd className="font-mono tabular-nums text-foreground">{timeTitle}</dd>
            {line.service ? (
              <>
                <dt>{tp('details.service', 'Service')}</dt>
                <dd className="break-all font-mono text-foreground">{line.service}</dd>
              </>
            ) : null}
            {line.level ? (
              <>
                <dt>{tp('details.level', 'Level')}</dt>
                <dd className={`font-mono ${rowLevelTextClass(key)}`}>{String(line.level).toUpperCase()}</dd>
              </>
            ) : null}
            {line.category ? (
              <>
                <dt>{tp('details.category', 'Category')}</dt>
                <dd className="break-all font-mono text-foreground">{line.category}</dd>
              </>
            ) : null}
            {logger ? (
              <>
                <dt>{tp('details.logger', 'Logger')}</dt>
                <dd className="break-all font-mono text-foreground">{logger}</dd>
              </>
            ) : null}
            {line.requestId ? (
              <>
                <dt>{tp('field.request_id', 'Request ID')}</dt>
                <dd>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto px-0 font-mono"
                    data-testid="log-explorer-pivot-request"
                    aria-label={tp('pivot.request', 'Show all lines for request {{id}}', { id: line.requestId })}
                    onClick={() => onPivot('request_id', line.requestId)}
                  >
                    {line.requestId}
                  </Button>
                </dd>
              </>
            ) : null}
            {line.taskId ? (
              <>
                <dt>{tp('field.task_id', 'Task ID')}</dt>
                <dd>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto px-0 font-mono"
                    data-testid="log-explorer-pivot-task"
                    aria-label={tp('pivot.task', 'Show all lines for task {{id}}', { id: line.taskId })}
                    onClick={() => onPivot('task_id', line.taskId)}
                  >
                    {line.taskId}
                  </Button>
                </dd>
              </>
            ) : null}
            {fields.map(([name, value]) => (
              <Fragment key={name}>
                <dt className="font-mono">{name}</dt>
                <dd className="break-all font-mono text-foreground">{String(value)}</dd>
              </Fragment>
            ))}
          </dl>
        </div>
      ) : null}
    </li>
  )
}

function MarkerRow({ entry, tp }) {
  const isGap = entry.markerKind === 'gap'
  const text = isGap
    ? tp('marker.gap', 'Lines between {{start}} and {{end}} may be missing.', {
        start: entry.start,
        end: entry.end,
      })
    : tp(
        'marker.evicted',
        '{{count}} older lines were removed from view to keep live tail fast.',
        { count: entry.count },
      )
  return (
    <li
      className="mx-2 my-2 flex items-center gap-2 rounded-md border border-dashed px-2 py-2 text-sm text-muted-foreground"
      role="note"
      data-testid={isGap ? 'log-explorer-gap' : 'log-explorer-evicted'}
    >
      <LucideIcon name="scissors-line-dashed" size={14} />
      <span>{text}</span>
    </li>
  )
}

function VolumeStrip({ histogram, formatTime, tp, onBucketClick }) {
  const [focusIndex, setFocusIndex] = useState(0)
  const [tooltipIndex, setTooltipIndex] = useState(null)
  const bucketRefs = useRef([])

  const buckets = useMemo(
    () => (histogram.state === 'ready' ? histogram.buckets : NO_BUCKETS),
    [histogram],
  )
  const perBucket = useMemo(() => buckets.map((bucket) => aggregateCounts(bucket.counts)), [buckets])
  const maxTotal = useMemo(() => perBucket.reduce((max, bucket) => Math.max(max, bucket.total), 0), [perBucket])
  const totals = useMemo(() => {
    const result = { CRITICAL: 0, ERROR: 0, WARNING: 0, INFO: 0, DEBUG: 0, Other: 0 }
    for (const bucket of perBucket) {
      for (const level of STACK_ORDER) {
        result[barKeyOf(level)] += bucket.counts[barKeyOf(level)] ?? 0
      }
    }
    return result
  }, [perBucket])
  const legendLevels = STACK_ORDER.filter(
    (level) => ALWAYS_LEGEND.includes(level) || (totals[barKeyOf(level)] ?? 0) > 0,
  )

  const moveFocus = (next) => {
    const clamped = Math.max(0, Math.min(buckets.length - 1, next))
    setFocusIndex(clamped)
    bucketRefs.current[clamped]?.focus()
  }

  return (
    <section aria-labelledby="logx-volume-heading" data-testid="log-explorer-histogram">
      <div className="mb-2 flex flex-wrap items-center gap-4">
        <h2 id="logx-volume-heading" className="text-base font-semibold text-foreground">
          {tp('volume.heading', 'Log volume')}
        </h2>
        <ul className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          {legendLevels.map((level) => (
            <li key={level} className="flex items-center gap-1">
              <span className={`logx-legend-swatch logx-seg-${barKeyOf(level).toLowerCase()}`} />
              <span>{level === 'Other' ? tp('level.other', 'Other') : level}</span>
              <span className="tabular-nums">{new Intl.NumberFormat().format(totals[barKeyOf(level)] ?? 0)}</span>
            </li>
          ))}
        </ul>
      </div>

      {histogram.state === 'loading' || histogram.state === 'idle' ? (
        <div className="logx-strip-loading" aria-busy="true" />
      ) : histogram.state === 'error' ? (
        <p className="text-xs text-muted-foreground">{tp('volume.error', 'Log volume could not be loaded.')}</p>
      ) : (
        <>
          <div className="logx-histogram">
            {buckets.map((bucket, index) => {
              const counts = perBucket[index]?.counts ?? EMPTY_COUNTS
              const total = perBucket[index]?.total ?? 0
              // top -> bottom is the reverse of the bottom-to-top stack order.
              const segments = [...STACK_ORDER].reverse()
              const perLevel = STACK_ORDER.map((level) => `${level} ${counts[barKeyOf(level)] ?? 0}`).join(', ')
              const ariaLabel = `${tp('bucket.action', 'Search {{start}} to {{end}}: {{count}} lines', {
                start: formatTime(bucket.start),
                end: formatTime(bucket.end),
                count: total,
              })}. ${perLevel}`
              return (
                <button
                  key={bucket.start}
                  type="button"
                  ref={(node) => {
                    bucketRefs.current[index] = node
                  }}
                  className="logx-bucket"
                  data-testid={`log-explorer-bucket-${index}`}
                  tabIndex={index === focusIndex ? 0 : -1}
                  aria-label={ariaLabel}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowRight') {
                      event.preventDefault()
                      moveFocus(index + 1)
                    } else if (event.key === 'ArrowLeft') {
                      event.preventDefault()
                      moveFocus(index - 1)
                    }
                  }}
                  onFocus={() => setTooltipIndex(index)}
                  onBlur={() => setTooltipIndex(null)}
                  onMouseEnter={() => setTooltipIndex(index)}
                  onMouseLeave={() => setTooltipIndex(null)}
                  onClick={() => onBucketClick(bucket)}
                >
                  {total > 0 && maxTotal > 0 ? (
                    segments.map((level) => {
                      const count = counts[barKeyOf(level)] ?? 0
                      if (count <= 0) return null
                      const height = Math.max(1, Math.round((count / maxTotal) * 96))
                      return (
                        <span
                          key={level}
                          className={`logx-seg logx-seg-${barKeyOf(level).toLowerCase()}`}
                          style={{ height: `${height}px` }}
                        />
                      )
                    })
                  ) : (
                    <span className="logx-zero-tick" />
                  )}
                  {tooltipIndex === index ? (
                    <span
                      className={[
                        'logx-tooltip',
                        index >= buckets.length - 2 ? 'logx-tooltip-right' : '',
                        index === 0 ? 'logx-tooltip-left' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-hidden="true"
                    >
                      <span className="block text-foreground">
                        {formatTime(bucket.start)} – {formatTime(bucket.end)}
                      </span>
                      {STACK_ORDER.map((level) => (
                        <span key={level} className="block">
                          {level === 'Other' ? tp('level.other', 'Other') : level}{' '}
                          <span className="tabular-nums">{counts[barKeyOf(level)] ?? 0}</span>
                        </span>
                      ))}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
          <div className="logx-axis">
            {axisLabels(buckets).map((bucket) => (
              <span key={bucket.start} className="logx-axis-label">
                {formatTime(bucket.start)}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

export default function ExplorerPage() {
  const allowed = useCan('system-logs', 'read')
  const { t: tp } = usePluginTranslation(PLUGIN_NAME)
  const formatDate = useFormatDate()
  const formatDateTime = useFormatDateTime()
  const formatTime = useFormatTime()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  const appliedKey = searchParams.toString()
  const applied = useMemo(() => parseUrlState(searchParams), [searchParams])
  const appliedRef = useRef(applied)
  useEffect(() => {
    appliedRef.current = applied
  }, [applied])

  const [statusState, setStatusState] = useState('loading')
  const [grafanaAvailable, setGrafanaAvailable] = useState(false)
  const [grafanaUrl, setGrafanaUrl] = useState(null)
  const [draft, setDraft] = useState(() => draftFromApplied(applied))
  const [results, setResults] = useState({
    state: 'idle',
    lines: [],
    limited: false,
    olderCursor: null,
    newestCursor: null,
    clamped: null,
    rejected: false,
    reason: '',
  })
  const [histogram, setHistogram] = useState({ state: 'idle', buckets: [] })
  const [discovery, setDiscovery] = useState({ state: 'loading', services: [], levels: [], categories: [] })
  const [openRows, setOpenRows] = useState(() => new Set())
  const [liveOn, setLiveOn] = useState(false)
  const [liveState, setLiveState] = useState(null)
  const [newCount, setNewCount] = useState(0)
  const [atEnd, setAtEnd] = useState(true)
  const [announcement, setAnnouncement] = useState('')
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [menus, setMenus] = useState({ service: false, level: false, category: false })
  const [searchGen, setSearchGen] = useState(0)

  const scrollRef = useRef(null)
  const resultsRef = useRef(results)
  const liveRef = useRef(null)
  const requestSeq = useRef(0)
  const atEndRef = useRef(true)
  const seenCountRef = useRef(0)
  const anchorRef = useRef(null)
  const lastHistogramAt = useRef(0)
  const routerLive = useRef(location.state?.liveTail === true)

  useEffect(() => {
    resultsRef.current = results
  }, [results])

  // The one scoped stylesheet for this plugin page (released on unmount).
  useEffect(() => {
    const handle = injectPluginStyles(PLUGIN_NAME, STYLE_ID, EXPLORER_CSS)
    return () => handle.release()
  }, [])

  // ----- status (D-14) -----
  // The quiet probe: it never touches state, so the retry loop can call it
  // without repainting the page. `refreshStatus` is the only path that shows
  // the loading state (mount and "Try again").
  const probeStatus = useCallback(async () => {
    try {
      const { data } = await api.get(`${ROUTE}/status`)
      return { state: data?.state ?? 'unreachable', grafana: Boolean(data?.grafana) }
    } catch {
      return { state: 'unreachable', grafana: false }
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    setStatusState('loading')
    const { state, grafana } = await probeStatus()
    setGrafanaAvailable(grafana)
    setStatusState(state)
  }, [probeStatus])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  // D-07: while the log store is unreachable, re-probe on the bounded schedule
  // (2s/4s/8s/16s, then every 30s) and leave the state as soon as it answers
  // anything else. One controller per unreachable episode; a hidden document
  // sends no probe and the visible tab probes at once.
  useEffect(() => {
    if (statusState !== 'unreachable') return undefined
    let cancelled = false
    const controller = createStatusRetryController({
      check: async () => {
        const { state, grafana } = await probeStatus()
        if (cancelled) return true
        if (state === 'unreachable') return false
        setGrafanaAvailable(grafana)
        setStatusState(state)
        return true
      },
      isVisible: () => (typeof document === 'undefined' ? true : document.visibilityState !== 'hidden'),
    })
    controller.start()
    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      controller.kick()
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility)
    }
    return () => {
      cancelled = true
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility)
      }
      controller.stop()
    }
  }, [statusState, probeStatus])

  // ----- the search (D-12): the URL is the applied state -----
  const runSearch = useCallback(
    async (state) => {
      const seq = requestSeq.current + 1
      requestSeq.current = seq
      setResults((previous) => ({
        ...previous,
        state: previous.lines.length > 0 ? 'reloading' : 'loading',
        rejected: false,
        reason: '',
      }))
      try {
        const { data } = await api.get(`${ROUTE}/query`, {
          params: buildQueryParams(state, { limit: PAGE_SIZE }),
          paramsSerializer: serializeRepeatedParams,
        })
        if (requestSeq.current !== seq) return
        const lines = dedupeById(data?.lines ?? [])
        setResults({
          state: 'ready',
          lines,
          limited: Boolean(data?.limited),
          olderCursor: data?.olderCursor ?? null,
          newestCursor: data?.newestCursor ?? null,
          clamped: data?.clamped ?? null,
          rejected: false,
          reason: '',
        })
        setOpenRows(new Set())
        setSearchGen((value) => value + 1)
        setAnnouncement(tp('results.summary', '{{count}} matching lines', { count: lines.length }))
      } catch (error) {
        if (requestSeq.current !== seq) return
        const code = error?.response?.status
        if (code && code >= 400 && code < 500) {
          setResults((previous) => ({
            ...previous,
            state: previous.lines.length > 0 ? 'ready' : 'rejected',
            rejected: true,
            reason: extractErrorMessage(error),
          }))
        } else {
          setResults((previous) => ({ ...previous, state: 'error', rejected: false, reason: '' }))
        }
      }
    },
    [tp],
  )

  // Normalize an URL-less first open into concrete ISO times (shareable link).
  useEffect(() => {
    if (appliedKey === '' && statusState === 'ok') {
      setSearchParams(buildUrlState(appliedRef.current), { replace: true })
    }
  }, [appliedKey, statusState, setSearchParams])

  // A new applied search stops the manual live tail (the range changed).
  useEffect(() => {
    setLiveOn(false)
  }, [appliedKey])

  // A running-task entry (D-11) starts live tail once, then clears the state.
  useEffect(() => {
    if (!routerLive.current || !applied.task_id) return
    routerLive.current = false
    setLiveOn(true)
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
  }, [applied.task_id, appliedKey, location.pathname, location.search, navigate])

  // Run the applied search whenever the URL or the reachability changes.
  useEffect(() => {
    if (statusState !== 'ok') return
    void runSearch(appliedRef.current)
  }, [appliedKey, statusState, runSearch])

  // The draft re-syncs whenever a new search is applied.
  useEffect(() => {
    setDraft(draftFromApplied(appliedRef.current))
  }, [appliedKey])

  // ----- histogram (D-15) -----
  const loadHistogram = useCallback(async (state) => {
    setHistogram((previous) => ({
      state: previous.buckets.length > 0 ? 'refreshing' : 'loading',
      buckets: previous.buckets,
    }))
    try {
      const { data } = await api.get(`${ROUTE}/histogram`, {
        params: buildQueryParams(state, {}),
        paramsSerializer: serializeRepeatedParams,
      })
      lastHistogramAt.current = Date.now()
      setHistogram({ state: 'ready', buckets: data?.buckets ?? [] })
    } catch {
      setHistogram((previous) => ({
        state: previous.buckets.length > 0 ? 'ready' : 'error',
        buckets: previous.buckets,
      }))
    }
  }, [])

  useEffect(() => {
    if (statusState !== 'ok') return
    void loadHistogram(appliedRef.current)
  }, [appliedKey, statusState, loadHistogram])

  // ----- discovery -----
  useEffect(() => {
    if (statusState !== 'ok') return undefined
    let cancelled = false
    setDiscovery((previous) => ({ ...previous, state: 'loading' }))
    const state = appliedRef.current
    api
      .get(`${ROUTE}/services`, {
        params: buildQueryParams(state, {}),
        paramsSerializer: serializeRepeatedParams,
      })
      .then(({ data }) => {
        if (cancelled) return
        setDiscovery({
          state: 'ready',
          services: data?.services ?? [],
          levels: data?.levels ?? [],
          categories: data?.categories ?? [],
        })
      })
      .catch(() => {
        if (!cancelled) setDiscovery((previous) => ({ ...previous, state: 'error' }))
      })
    return () => {
      cancelled = true
    }
  }, [appliedKey, statusState])

  // ----- Grafana link (D-13) -----
  useEffect(() => {
    if (statusState !== 'ok' || !grafanaAvailable) {
      setGrafanaUrl(null)
      return undefined
    }
    let cancelled = false
    api
      .get(`${ROUTE}/grafana-link`, {
        params: buildQueryParams(appliedRef.current, {}),
        paramsSerializer: serializeRepeatedParams,
      })
      .then(({ data }) => {
        if (!cancelled) setGrafanaUrl(data?.url ?? null)
      })
      .catch(() => {
        if (!cancelled) setGrafanaUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [appliedKey, statusState, grafanaAvailable])

  // ----- live tail (D-05/D-06/D-08) -----
  const pollLive = useCallback(
    async ({ cursor }) => {
      const state = appliedRef.current
      const { data } = await api.get(`${ROUTE}/query`, {
        params: buildQueryParams(state, { after: cursor, limit: PAGE_SIZE }),
        paramsSerializer: serializeRepeatedParams,
      })
      if (Date.now() - lastHistogramAt.current >= HISTOGRAM_MIN_REFRESH_MS) {
        void loadHistogram(state)
      }
      return {
        lines: data?.lines ?? [],
        newestCursor: data?.newestCursor ?? null,
        limited: Boolean(data?.limited),
        gap: data?.gap ?? null,
      }
    },
    [loadHistogram],
  )

  const stopLive = useCallback(() => {
    liveRef.current?.stop()
    liveRef.current = null
    setLiveState(null)
  }, [])

  useEffect(() => {
    if (!liveOn) {
      stopLive()
      return undefined
    }
    const controller = createLiveTailController({
      poll: pollLive,
      interval: LIVE_POLL_MS,
      backoff: LIVE_BACKOFF_MS,
      maxBackoff: LIVE_MAX_BACKOFF_MS,
      cap: LIVE_BUFFER_CAP,
    })
    liveRef.current = controller
    const unsubscribe = controller.subscribe(setLiveState)
    const seed = resultsRef.current
    controller.start({ cursor: seed.newestCursor, lines: seed.lines })
    return () => {
      unsubscribe()
      controller.stop()
      if (liveRef.current === controller) liveRef.current = null
      setLiveState(null)
    }
  }, [liveOn, pollLive, stopLive])

  const endMs = Date.parse(applied.end)
  const nearNow = Number.isFinite(endMs) && Date.now() - endMs <= LIVE_WINDOW_MS
  const liveSnapshot = liveOn ? liveState : null
  const displayLines = liveSnapshot ? liveSnapshot.lines : results.lines
  const displayLen = displayLines.length
  const displayLenRef = useRef(displayLen)
  useEffect(() => {
    displayLenRef.current = displayLen
  }, [displayLen])

  // Pinned-to-the-bottom behaviour: while at the end new lines keep the view at
  // the bottom; scrolled up the view never moves on its own (D-06).
  useEffect(() => {
    if (!liveSnapshot) return
    if (atEndRef.current) {
      seenCountRef.current = liveSnapshot.lines.length
      setNewCount(0)
      const element = scrollRef.current
      if (element) element.scrollTop = element.scrollHeight
      return
    }
    const pending = Math.max(0, liveSnapshot.lines.length - seenCountRef.current)
    setNewCount(pending)
    if (pending > 0) {
      setAnnouncement(tp('live.new_lines', '{{count}} new lines', { count: pending }))
    }
  }, [liveSnapshot, tp])

  // Scroll to the end after a fresh search.
  useEffect(() => {
    const element = scrollRef.current
    if (element) element.scrollTop = element.scrollHeight
    atEndRef.current = true
    setAtEnd(true)
  }, [searchGen])

  // Keep the first previously visible row in place while older lines prepend.
  useLayoutEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    anchorRef.current = null
    const element = scrollRef.current
    if (!element) return
    const node = element.querySelector(`[data-line-id="${anchor.id}"]`)
    if (!node) return
    element.scrollTop = node.offsetTop - anchor.delta
  }, [displayLen])

  const handleScroll = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    const nowAtEnd = element.scrollHeight - element.scrollTop - element.clientHeight <= NEAR_BOTTOM_PX
    atEndRef.current = nowAtEnd
    setAtEnd(nowAtEnd)
    if (nowAtEnd) {
      seenCountRef.current = displayLenRef.current
      setNewCount(0)
    }
  }, [])

  const jumpToEnd = useCallback(() => {
    const element = scrollRef.current
    if (element) element.scrollTop = element.scrollHeight
    atEndRef.current = true
    setAtEnd(true)
    seenCountRef.current = displayLenRef.current
    setNewCount(0)
  }, [])

  // ----- direct actions (D-09/D-15: bewusste Aktionen suchen direkt) -----
  const applyDirect = useCallback(
    (next) => {
      setSearchParams(buildUrlState(next))
    },
    [setSearchParams],
  )

  const pivot = useCallback(
    (field, value) => {
      const current = appliedRef.current
      applyDirect({
        ...current,
        service: [],
        level: [],
        category: [],
        text: '',
        request_id: field === 'request_id' ? value : '',
        task_id: field === 'task_id' ? value : '',
      })
    },
    [applyDirect],
  )

  const handleRowToggle = useCallback((id) => {
    setOpenRows((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const removeFilters = useCallback(() => {
    const current = appliedRef.current
    applyDirect({
      ...current,
      service: [],
      level: [],
      category: [],
      text: '',
      request_id: '',
      task_id: '',
    })
  }, [applyDirect])

  const handleBucketClick = useCallback(
    (bucket) => {
      applyDirect({ ...appliedRef.current, start: bucket.start, end: bucket.end })
    },
    [applyDirect],
  )

  const loadOlder = useCallback(async () => {
    const element = scrollRef.current
    const currentLines = liveRef.current?.getSnapshot().lines ?? resultsRef.current.lines
    if (currentLines.length === 0) return
    const before = currentLines[0]?.tsNs
    if (!before) return
    if (element) {
      let anchor = null
      for (const node of element.querySelectorAll('[data-line-id]')) {
        if (node.offsetTop + node.offsetHeight > element.scrollTop + 1) {
          anchor = { id: node.getAttribute('data-line-id'), delta: node.offsetTop - element.scrollTop }
          break
        }
      }
      anchorRef.current = anchor
    }
    setLoadingOlder(true)
    try {
      const { data } = await api.get(`${ROUTE}/query`, {
        params: buildQueryParams(appliedRef.current, { before, limit: PAGE_SIZE }),
        paramsSerializer: serializeRepeatedParams,
      })
      const older = dedupeById(data?.lines ?? [])
      const merged = dedupeById([...older, ...currentLines])
      const controller = liveRef.current
      if (controller) {
        const cursor = controller.getSnapshot().cursor
        controller.stop()
        controller.start({ cursor, lines: merged })
      }
      setResults((previous) => ({
        ...previous,
        lines: controller ? previous.lines : merged,
        olderCursor: data?.olderCursor ?? null,
        limited: Boolean(data?.limited),
      }))
    } catch {
      anchorRef.current = null
    } finally {
      setLoadingOlder(false)
    }
  }, [])

  // ----- draft / filters -----
  const appliedPreset = presetForRange(applied.start, applied.end)
  const draftDirty =
    draft.preset !== appliedPreset ||
    draft.text !== applied.text ||
    draft.request_id !== applied.request_id ||
    draft.task_id !== applied.task_id ||
    !listEquals(draft.service, applied.service) ||
    !listEquals(draft.level, applied.level) ||
    !listEquals(draft.category, applied.category) ||
    (draft.preset === 'custom' &&
      (draft.from !== toLocalInput(applied.start) || draft.to !== toLocalInput(applied.end)))

  const submitSearch = useCallback(
    (event) => {
      event.preventDefault()
      applyDirect(appliedFromDraft(draft, appliedRef.current, Date.now()))
    },
    [applyDirect, draft],
  )

  const menuLabel = (kind) => {
    const values = draft[kind]
    const copy = {
      service: {
        all: ['filter.services_all', 'Services: All'],
        one: ['filter.services_one', 'Services: {{value}}'],
        many: ['filter.services_selected', 'Services: {{count}} selected'],
      },
      level: {
        all: ['filter.levels_all', 'Levels: All'],
        one: ['filter.levels_one', 'Levels: {{value}}'],
        many: ['filter.levels_selected', 'Levels: {{count}} selected'],
      },
      category: {
        all: ['filter.categories_all', 'Categories: All'],
        one: ['filter.categories_one', 'Categories: {{value}}'],
        many: ['filter.categories_selected', 'Categories: {{count}} selected'],
      },
    }
    if (values.length === 0) return tp(copy[kind].all[0], copy[kind].all[1])
    if (values.length === 1) return tp(copy[kind].one[0], copy[kind].one[1], { value: values[0] })
    return tp(copy[kind].many[0], copy[kind].many[1], { count: values.length })
  }

  const renderMenu = (kind, testId) => {
    const values = draft[kind]
    const options = discovery[{ service: 'services', level: 'levels', category: 'categories' }[kind]] ?? []
    const loading = discovery.state === 'loading'
    return (
      <DropdownMenu
        key={kind}
        open={menus[kind]}
        onOpenChange={(open) => setMenus((previous) => ({ ...previous, [kind]: open }))}
        trigger={
          <Button
            type="button"
            variant="outline"
            size="md"
            className="h-auto min-h-9 w-full justify-start whitespace-normal"
            data-testid={testId}
            aria-label={menuLabel(kind)}
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <LucideIcon name="loader-circle" size={14} className="text-muted-foreground" />
                {menuLabel(kind)}
              </span>
            ) : (
              menuLabel(kind)
            )}
          </Button>
        }
      >
        <div className="max-h-64 min-w-56 overflow-y-auto p-2">
          <DropdownMenuItem
            type="button"
            onClick={() => setDraft((previous) => ({ ...previous, [kind]: [] }))}
          >
            {tp('filter.all', 'All')}
          </DropdownMenuItem>
          {options.map((option) => (
            <div key={option} className="px-2 py-1">
              <CheckboxField
                id={`logx-filter-${kind}-${option}`}
                label={option}
                checked={values.includes(option)}
                onChange={() =>
                  setDraft((previous) => ({ ...previous, [kind]: toggleValue(previous[kind], option) }))
                }
              />
            </div>
          ))}
          {values
            .filter((value) => !options.includes(value))
            .map((value) => (
              <div key={value} className="px-2 py-1">
                <CheckboxField
                  id={`logx-filter-${kind}-stale-${value}`}
                  label={<span className="text-muted-foreground">{value}</span>}
                  checked
                  onChange={() =>
                    setDraft((previous) => ({ ...previous, [kind]: toggleValue(previous[kind], value) }))
                  }
                />
              </div>
            ))}
        </div>
      </DropdownMenu>
    )
  }

  // ----- entries: markers and day dividers -----
  const markers = useMemo(() => {
    const list = []
    if (liveSnapshot) {
      if (liveSnapshot.evicted > 0) {
        list.push({ id: 'evicted', kind: 'evicted', at: 0, count: liveSnapshot.evicted })
      }
      for (const gap of liveSnapshot.markers ?? []) {
        const endMsGap = Date.parse(gap.end)
        let at = displayLines.length
        if (Number.isFinite(endMsGap)) {
          const index = displayLines.findIndex((line) => Number(line.tsNs) >= endMsGap)
          at = index === -1 ? displayLines.length : index
        }
        list.push({ ...gap, at })
      }
    }
    return list
  }, [liveSnapshot, displayLines])

  const multiDay = useMemo(
    () => new Date(applied.start).toDateString() !== new Date(applied.end).toDateString(),
    [applied.start, applied.end],
  )

  const dayFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    [],
  )

  const entries = useMemo(() => {
    const base = insertMarkers(displayLines, markers)
    if (!multiDay) return base
    const out = []
    let day = null
    for (const entry of base) {
      if (entry.markerKind) {
        out.push(entry)
        continue
      }
      const nextDay = new Date(entry.ts).toDateString()
      if (nextDay !== day) {
        day = nextDay
        out.push({ id: `day:${nextDay}`, dayDivider: dayFormatter.format(new Date(entry.ts)) })
      }
      out.push(entry)
    }
    return out
  }, [displayLines, markers, multiDay, dayFormatter])

  const histogramTotal = useMemo(() => {
    if (histogram.state !== 'ready') return null
    return histogram.buckets.reduce((sum, bucket) => {
      for (const value of Object.values(bucket.counts ?? {})) sum += Number(value) || 0
      return sum
    }, 0)
  }, [histogram])

  if (!allowed) return null

  const showPanel =
    statusState === 'not_configured' ||
    statusState === 'external_only' ||
    (statusState === 'unreachable' && results.lines.length === 0)
  const showConnectionStrip =
    liveSnapshot?.interrupted === true || (statusState === 'unreachable' && results.lines.length > 0)
  const clampedNotice = results.clamped
    ? formatDuration(Date.parse(results.clamped.end) - Date.parse(results.clamped.start))
    : ''
  const taskNotice = applied.task_id ? taskWindowNotice(tp, applied) : null
  const limitedSummary =
    histogramTotal !== null
      ? tp('results.summary_limited', 'Newest {{shown}} of {{total}} matching lines', {
          shown: results.lines.length,
          total: histogramTotal,
        })
      : tp('results.summary', '{{count}} matching lines', { count: results.lines.length })
  const summaryText = results.limited ? limitedSummary : tp('results.summary', '{{count}} matching lines', { count: results.lines.length })
  const listLoading = results.state === 'idle' || results.state === 'loading'

  const renderEntry = (entry) => {
    if (entry.dayDivider) {
      return (
        <li key={entry.id} className="px-4 py-1 text-xs text-muted-foreground">
          {entry.dayDivider}
        </li>
      )
    }
    if (entry.markerKind) {
      return <MarkerRow key={entry.id} entry={entry} tp={tp} />
    }
    return (
      <LogRow
        key={entry.id}
        line={entry}
        open={openRows.has(entry.id)}
        onToggleRow={handleRowToggle}
        onPivot={pivot}
        formatTime={formatTime}
        formatDateTime={formatDateTime}
        tp={tp}
      />
    )
  }

  return (
    <div className="logx-explorer space-y-6" data-testid="log-explorer">
      <PageHeader
        title={tp('page.title', 'System logs')}
        description={tp(
          'page.description',
          'Search and follow log lines from every service of this installation.',
        )}
        icon="scroll-text"
      >
        {grafanaUrl ? (
          <Button asChild variant="outline" size="md" className="h-auto min-h-9 whitespace-normal">
            <a
              href={grafanaUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="log-explorer-grafana"
              title={tp('grafana.hint', 'Opens in a new tab. Grafana uses its own sign-in.')}
            >
              <LucideIcon name="external-link" size={16} />
              {tp('grafana.link', 'Open in Grafana Explore')}
            </a>
          </Button>
        ) : null}
      </PageHeader>

      {showPanel ? (
        statusState === 'not_configured' ? (
          <StatePanel
            testId="log-explorer-state-not-configured"
            icon="settings-2"
            title={tp('state.not_configured.title', 'Log search is not set up')}
            body={tp(
              'state.not_configured.body',
              'This installation has no log store connected for searching. Ask an administrator to configure the Loki connection of the log-explorer plugin.',
            )}
          />
        ) : statusState === 'external_only' ? (
          <StatePanel
            testId="log-explorer-state-external"
            icon="cloud-off"
            title={tp('state.external.title', 'Logs go to an external system')}
            body={tp(
              'state.external.body',
              'This installation sends its logs only to an external log platform, so they cannot be searched here. Use your organization\u2019s log tool to view them.',
            )}
          />
        ) : (
          <StatePanel
            testId="log-explorer-state-unreachable"
            icon="unplug"
            title={tp('state.unreachable.title', 'Log store not reachable')}
            body={tp(
              'state.unreachable.body',
              'The log store did not respond, so no lines can be shown. Try again in a moment. If it keeps failing, ask an administrator to check the Loki service.',
            )}
            actionLabel={tp('state.unreachable.action', 'Try again')}
            onAction={() => {
              void refreshStatus()
            }}
          />
        )
      ) : (
        <>
          <form
            role="search"
            data-testid="log-explorer-filter"
            className="space-y-4 rounded-lg border bg-card p-4"
            onSubmit={submitSearch}
          >
            <div className="flex flex-wrap items-end gap-2">
              <FormField id="logx-range" label={tp('field.range', 'Time range')}>
                <SelectInput
                  id="logx-range"
                  data-testid="log-explorer-range"
                  value={draft.preset}
                  onChange={(event) => setDraft((previous) => ({ ...previous, preset: event.target.value }))}
                  options={RANGE_PRESETS.map((preset) => ({
                    value: preset.value,
                    label: tp(preset.key, preset.fallback),
                  }))}
                />
              </FormField>
              {draft.preset === 'custom' ? (
                <>
                  <FormField id="logx-from" label={tp('field.from', 'From')}>
                    <TextInput
                      id="logx-from"
                      type="datetime-local"
                      step="1"
                      value={draft.from}
                      onChange={(event) => setDraft((previous) => ({ ...previous, from: event.target.value }))}
                    />
                  </FormField>
                  <FormField id="logx-to" label={tp('field.to', 'To')}>
                    <TextInput
                      id="logx-to"
                      type="datetime-local"
                      step="1"
                      value={draft.to}
                      onChange={(event) => setDraft((previous) => ({ ...previous, to: event.target.value }))}
                    />
                  </FormField>
                </>
              ) : null}
              <div className="min-w-56 flex-1">
                <FormField id="logx-text" label={tp('field.text_label', 'Message contains')}>
                  <TextInput
                    id="logx-text"
                    data-testid="log-explorer-text"
                    value={draft.text}
                    placeholder={tp('field.text_placeholder', 'Exact text, not case-sensitive')}
                    onChange={(event) => setDraft((previous) => ({ ...previous, text: event.target.value }))}
                  />
                </FormField>
              </div>
              <Button type="submit" variant="primary" size="md" leftIcon="search" data-testid="log-explorer-search">
                {tp('action.search', 'Search')}
              </Button>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              {renderMenu('service', 'log-explorer-service-menu')}
              {renderMenu('level', 'log-explorer-level-menu')}
              {renderMenu('category', 'log-explorer-category-menu')}
              <FormField id="logx-request-id" label={tp('field.request_id', 'Request ID')}>
                <TextInput
                  id="logx-request-id"
                  data-testid="log-explorer-request-id"
                  className="w-40 font-mono"
                  value={draft.request_id}
                  onChange={(event) => setDraft((previous) => ({ ...previous, request_id: event.target.value }))}
                />
              </FormField>
              <FormField id="logx-task-id" label={tp('field.task_id', 'Task ID')}>
                <TextInput
                  id="logx-task-id"
                  data-testid="log-explorer-task-id"
                  className="w-40 font-mono"
                  value={draft.task_id}
                  onChange={(event) => setDraft((previous) => ({ ...previous, task_id: event.target.value }))}
                />
              </FormField>
            </div>

            {draftDirty ? (
              <p className="text-xs text-muted-foreground">{tp('draft.hint', 'Changes apply when you search.')}</p>
            ) : null}

            {results.rejected ? (
              <p role="alert" className="text-sm text-red-700">
                {tp(
                  'error.search_rejected',
                  'The search could not be run: {{reason}} Fix the filter and search again.',
                  { reason: results.reason },
                )}
              </p>
            ) : null}

            {clampedNotice || taskNotice ? (
              <div className="space-y-1" role="status">
                {clampedNotice ? (
                  <p className="text-xs text-muted-foreground">
                    {tp(
                      'notice.range_shortened',
                      'The time range was shortened to {{duration}}, the maximum for one search.',
                      { duration: clampedNotice },
                    )}
                  </p>
                ) : null}
                {taskNotice ? <p className="text-xs text-muted-foreground">{taskNotice}</p> : null}
              </div>
            ) : null}
          </form>

          <VolumeStrip histogram={histogram} formatTime={formatTime} tp={tp} onBucketClick={handleBucketClick} />

          <section className="rounded-lg border" aria-labelledby="logx-lines-heading">
            <h2 id="logx-lines-heading" className="sr-only">
              {tp('results.heading', 'Log lines')}
            </h2>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
              <p className="text-sm text-foreground" data-testid="log-explorer-summary">
                {summaryText}
              </p>
              <div className="flex flex-col items-end">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  aria-pressed={liveOn}
                  disabled={!nearNow}
                  aria-describedby={nearNow ? undefined : 'logx-live-hint'}
                  data-testid="log-explorer-live"
                  className="h-auto min-h-9 whitespace-normal"
                  onClick={() => setLiveOn((value) => !value)}
                >
                  <span
                    className={`logx-live-dot ${liveOn && !liveSnapshot?.interrupted ? 'logx-live-dot-on' : ''}`.trim()}
                  />
                  {tp('live.toggle', 'Follow live')}
                </Button>
                {!nearNow ? (
                  <p id="logx-live-hint" className="mt-1 max-w-72 text-xs text-muted-foreground">
                    {tp(
                      'live.unavailable',
                      'Live tail needs a time range that ends now. Choose a "Last …" range and search.',
                    )}
                  </p>
                ) : null}
              </div>
            </div>

            {showConnectionStrip ? (
              <div
                role="status"
                data-testid="log-explorer-connection"
                className="flex items-center gap-2 border-b border-amber-500 px-4 py-2 text-xs text-amber-700"
              >
                <LucideIcon name="circle-alert" size={14} />
                <span>
                  {tp(
                    'connection.interrupted',
                    'Connection interrupted. Loaded lines stay visible; retrying automatically.',
                  )}
                </span>
              </div>
            ) : null}

            <div className="relative">
              <div
                ref={scrollRef}
                tabIndex={0}
                role="region"
                aria-label={tp('results.heading', 'Log lines')}
                aria-busy={listLoading ? 'true' : undefined}
                data-testid="log-explorer-scroll"
                className="logx-scroll bg-muted/20"
                onScroll={handleScroll}
              >
                {listLoading ? (
                  <ul>
                    <SkeletonRows />
                  </ul>
                ) : results.state === 'error' ? (
                  <div className="px-4 py-8 text-center">
                    <p role="alert" className="text-sm text-foreground">
                      {tp('error.list_load_failed', 'Log lines could not be loaded. Try again.')}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2 h-auto min-h-8 whitespace-normal"
                      onClick={() => {
                        void runSearch(appliedRef.current)
                      }}
                    >
                      {tp('state.unreachable.action', 'Try again')}
                    </Button>
                  </div>
                ) : results.lines.length === 0 && results.state === 'ready' ? (
                  <div className="p-4">
                    <EmptyState
                      variant="no-results"
                      data-testid="log-explorer-empty"
                      title={tp('empty.title', 'No matching log lines')}
                      description={tp(
                        'empty.body',
                        'Nothing was logged for these filters between {{start}} and {{end}}. Widen the time range or remove filters.',
                        { start: formatDate(applied.start), end: formatDate(applied.end) },
                      )}
                      buttonLabel={tp('empty.action', 'Remove filters')}
                      onButtonClick={removeFilters}
                    />
                  </div>
                ) : results.state === 'reloading' ? (
                  <>
                    <ul>
                      <SkeletonRows />
                    </ul>
                    <ul className="opacity-60">{entries.map((entry) => renderEntry(entry))}</ul>
                  </>
                ) : (
                  <ul>{entries.map((entry) => renderEntry(entry))}</ul>
                )}
                {results.limited && results.olderCursor && results.lines.length > 0 ? (
                  <div className="px-2 py-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      loading={loadingOlder}
                      data-testid="log-explorer-load-older"
                      className="h-auto min-h-8 whitespace-normal"
                      onClick={() => {
                        void loadOlder()
                      }}
                    >
                      {tp('action.load_older', 'Load older lines')}
                    </Button>
                  </div>
                ) : null}
              </div>

              {!atEnd && newCount > 0 ? (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  leftIcon="arrow-down-to-line"
                  data-testid="log-explorer-new-lines"
                  className="absolute bottom-4 right-4 h-auto min-h-8 whitespace-normal shadow-lg"
                  onClick={jumpToEnd}
                >
                  {tp('live.new_lines', '{{count}} new lines', { count: newCount })}
                </Button>
              ) : null}
            </div>
          </section>

          <p className="sr-only" aria-live="polite">
            {announcement}
          </p>
          {listLoading ? null : null}
        </>
      )}
    </div>
  )
}

// The task-window notice (D-10) or its creation-anchored fallback.
function taskWindowNotice(tp, applied) {
  const taskId = applied.task_id
  if (!taskId) return null
  const startMs = Date.parse(applied.start)
  const endMs = Date.parse(applied.end)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null
  const span = endMs - startMs
  if (span === TASK_WINDOW_FALLBACK_MS) {
    return tp(
      'notice.task_window_fallback',
      'This task has no recorded run times. Showing the period after its creation.',
    )
  }
  return tp('notice.task_window', 'Showing the run of task {{id}} with {{margin}} before and after.', {
    id: taskId,
    margin: formatDuration(TASK_WINDOW_MARGIN_MS),
  })
}