// Phase 305 (LOGX-04, D-10/D-11): the task-detail action.
//
// The host renders this inside the status-card action row with the "Provided by
// plugin" caption. The D-10 entry window comes exclusively from the pure
// `taskEntryState(task, now)` helper (no inline margin math): the task's
// `task_id` plus `[started_at - 2min, (completed_at or now) + 2min]`, or the
// creation-anchored fallback `[created_at, created_at + 15min]` when the run
// times are missing. Only a PENDING/RUNNING task starts following live (D-11);
// the flag travels as router state, never in the URL, so a shared link never
// auto-starts the live tail. A task lookup failure still opens the explorer with
// the `task_id` and the default range (UI-SPEC E7).
import { Button, usePluginTranslation, useTask } from '@indramesh/plugin-api'
import { useNavigate } from 'react-router-dom'
import { DEFAULT_RANGE_MS, buildUrlState, taskEntryState } from './explorer-state.js'

const PLUGIN_NAME = 'log-explorer'
const EXPLORER_ROUTE = '/plugins/log-explorer/explorer'

export default function TaskLogAction({ task }) {
  const { t: tp } = usePluginTranslation(PLUGIN_NAME)
  const navigate = useNavigate()
  const taskId = task?.id ?? null
  const { data, isLoading } = useTask(taskId)

  const open = () => {
    const now = Date.now()
    // E7: a failed task lookup still opens the explorer with `task_id` and the
    // default range; only a resolved row drives the D-10 window.
    const entry = data ? taskEntryState(data, now) : null
    const applied = {
      service: [],
      level: [],
      category: [],
      text: '',
      request_id: '',
      task_id: entry?.taskId ?? taskId ?? '',
      start: entry?.start ?? new Date(now - DEFAULT_RANGE_MS).toISOString(),
      end: entry?.end ?? new Date(now).toISOString(),
    }
    const query = buildUrlState(applied).toString()
    navigate(`${EXPLORER_ROUTE}?${query}`, { state: entry?.liveTail ? { liveTail: true } : null })
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="md"
      leftIcon="scroll-text"
      loading={isLoading}
      disabled={isLoading}
      className="h-auto min-h-9 whitespace-normal"
      data-testid="log-explorer-task-action"
      onClick={open}
    >
      {tp('task.action', 'Open system logs')}
    </Button>
  )
}