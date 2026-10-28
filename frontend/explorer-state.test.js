// Phase 305 (LOGX-02, D-01/D-05..D-12): unit tests for the pure explorer state
// helpers (no DOM, no React, no network).
//
// Run with: node --test explorer-state.test.js
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_RANGE_MS,
  STATUS_RETRY_BACKOFF_MS,
  STATUS_RETRY_MAX_MS,
  advanceCursor,
  applyLiveBatch,
  buildQueryParams,
  buildUrlState,
  createLiveTailController,
  createStatusRetryController,
  dedupeById,
  insertMarkers,
  parseUrlState,
  taskEntryState,
} from './explorer-state.js'

// A deterministic scheduler: records what the controller wanted to schedule and
// lets the test run one pending callback at a time.
function createFakeScheduler() {
  const entries = []
  const schedule = (fn, delay) => {
    const entry = { fn, delay, cancelled: false, ran: false }
    entries.push(entry)
    return () => {
      entry.cancelled = true
    }
  }
  return {
    schedule,
    entries,
    last: () => entries[entries.length - 1],
    pending: () => entries.filter((entry) => !entry.cancelled && !entry.ran),
    runPending() {
      const entry = this.pending()[0]
      if (!entry) throw new Error('no pending scheduled work')
      entry.ran = true
      entry.fn()
    },
  }
}

// Flush an arbitrary chain of settled promises without relying on real timers.
async function flush() {
  for (let i = 0; i < 50; i += 1) await Promise.resolve()
}

describe('parseUrlState / buildUrlState', () => {
  it('drops unknown and invalid params and applies the default window', () => {
    const now = Date.parse('2026-10-09T12:00:00Z')
    const params = new URLSearchParams(
      'service=backend&service=&bogus=1&start=not-a-date&level=ERROR&level=&preset=last_hour',
    )

    const state = parseUrlState(params, now)

    assert.deepEqual(state.service, ['backend'])
    assert.deepEqual(state.level, ['ERROR'])
    assert.deepEqual(state.category, [])
    assert.equal(state.text, '')
    assert.equal(state.request_id, '')
    assert.equal(state.task_id, '')
    assert.equal(Date.parse(state.end) - Date.parse(state.start), DEFAULT_RANGE_MS)
    assert.equal(state.start, '2026-10-09T11:45:00.000Z')
    assert.equal(state.end, '2026-10-09T12:00:00.000Z')
  })

  it('reads concrete ISO start/end, repeated filters, text and both ids', () => {
    const params = new URLSearchParams(
      'start=2026-10-09T10:00:00.000Z&end=2026-10-09T11:00:00.000Z&text=timeout' +
        '&request_id=req-1&task_id=task-1&category=plugin.jira&level=ERROR&level=WARNING&service=backend',
    )

    const state = parseUrlState(params, Date.parse('2026-10-09T12:00:00Z'))

    assert.equal(state.start, '2026-10-09T10:00:00.000Z')
    assert.equal(state.end, '2026-10-09T11:00:00.000Z')
    assert.equal(state.text, 'timeout')
    assert.equal(state.request_id, 'req-1')
    assert.equal(state.task_id, 'task-1')
    assert.deepEqual(state.category, ['plugin.jira'])
    assert.deepEqual(state.level, ['ERROR', 'WARNING'])
    assert.deepEqual(state.service, ['backend'])
  })

  it('round-trips through buildUrlState without writing a relative preset', () => {
    const applied = {
      service: ['backend', 'worker'],
      level: ['ERROR'],
      category: [],
      text: 'timeout',
      request_id: '',
      task_id: 'task-1',
      start: '2026-10-09T10:00:00.000Z',
      end: '2026-10-09T11:00:00.000Z',
    }

    const params = buildUrlState(applied)

    assert.equal(params.get('preset'), null)
    assert.equal(params.get('range'), null)
    assert.equal(params.get('service'), 'backend')
    assert.deepEqual(params.getAll('service'), ['backend', 'worker'])
    assert.equal(params.get('start'), applied.start)
    assert.equal(params.get('end'), applied.end)

    const parsed = parseUrlState(params, 0)
    assert.deepEqual(parsed.service, ['backend', 'worker'])
    assert.deepEqual(parsed.level, ['ERROR'])
    assert.deepEqual(parsed.category, [])
    assert.equal(parsed.text, 'timeout')
    assert.equal(parsed.request_id, '')
    assert.equal(parsed.task_id, 'task-1')
    assert.equal(parsed.start, applied.start)
    assert.equal(parsed.end, applied.end)
  })
})

describe('buildQueryParams', () => {
  it('sends only the whitelisted keys and omits empty filters', () => {
    const applied = {
      service: [],
      level: [],
      category: [],
      text: '',
      request_id: '',
      task_id: '',
      start: '2026-10-09T10:00:00.000Z',
      end: '2026-10-09T11:00:00.000Z',
    }

    const bare = buildQueryParams(applied, { limit: 500 })
    assert.deepEqual(Object.keys(bare), ['start', 'end', 'limit'])
    assert.equal(bare.limit, 500)

    const full = buildQueryParams(
      { ...applied, service: ['a'], level: ['b'], category: ['c'], text: 't', request_id: 'r', task_id: 'k' },
      {},
    )
    assert.deepEqual(Object.keys(full), [
      'start',
      'end',
      'service',
      'level',
      'category',
      'text',
      'request_id',
      'task_id',
    ])
    assert.deepEqual(full.service, ['a'])
    assert.equal(full.request_id, 'r')
  })

  it('carries cursors only as decimal strings', () => {
    const applied = {
      service: [],
      level: [],
      category: [],
      text: '',
      request_id: '',
      task_id: '',
      start: 's',
      end: 'e',
    }

    const ok = buildQueryParams(applied, { before: '1760000000123456789' })
    assert.equal(ok.before, '1760000000123456789')

    const rejected = buildQueryParams(applied, { before: 12345, after: 'not-a-cursor' })
    assert.equal(rejected.before, undefined)
    assert.equal(rejected.after, undefined)
  })
})

describe('dedupeById', () => {
  it('collapses repeated stable ids to one occurrence, keeping order', () => {
    const lines = [
      { id: 'a', tsNs: '1' },
      { id: 'b', tsNs: '2' },
      { id: 'a', tsNs: '1' },
    ]

    assert.deepEqual(dedupeById(lines).map((line) => line.id), ['a', 'b'])
  })
})

describe('applyLiveBatch', () => {
  it('appends new lines at the bottom and dedupes repeats', () => {
    const state = { lines: [{ id: 'a', tsNs: '1' }, { id: 'b', tsNs: '2' }] }
    const batch = [{ id: 'b', tsNs: '2' }, { id: 'c', tsNs: '3' }]

    const { lines, evicted } = applyLiveBatch(state, batch, 10)

    assert.deepEqual(lines.map((line) => line.id), ['a', 'b', 'c'])
    assert.equal(evicted, 0)
  })

  it('respects the buffer cap and reports the evicted oldest count', () => {
    const state = { lines: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }
    const batch = [{ id: 'd' }, { id: 'e' }]

    const { lines, evicted } = applyLiveBatch(state, batch, 4)

    assert.deepEqual(lines.map((line) => line.id), ['b', 'c', 'd', 'e'])
    assert.equal(evicted, 1)
  })
})

describe('insertMarkers', () => {
  it('interleaves marker rows at their positions, preserving order', () => {
    const lines = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const markers = [
      { id: 'm1', kind: 'limit', at: 0 },
      { id: 'm2', kind: 'gap', at: 2, start: 's', end: 'e' },
    ]

    const out = insertMarkers(lines, markers)

    assert.deepEqual(
      out.map((entry) => entry.markerKind ?? entry.id),
      ['limit', 'a', 'b', 'gap', 'c'],
    )
    assert.equal(out[0].kind, 'limit')
    assert.equal(out[3].kind, 'gap')
    assert.equal(out[3].start, 's')
    assert.equal(out[3].end, 'e')
  })

  it('clamps out-of-range positions to the list bounds', () => {
    const lines = [{ id: 'a' }]
    const out = insertMarkers(lines, [
      { id: 'm1', kind: 'evicted', at: -5, count: 3 },
      { id: 'm2', kind: 'limit', at: 99 },
    ])

    assert.deepEqual(
      out.map((entry) => entry.markerKind ?? entry.id),
      ['evicted', 'a', 'limit'],
    )
    assert.equal(out[0].count, 3)
  })
})

describe('advanceCursor', () => {
  it('keeps decimal-string cursors monotonic at a precision beyond Number', () => {
    const forward = advanceCursor('1760000000123456789', {
      lines: [],
      newestCursor: '1760000000123456790',
    })
    assert.equal(forward.cursor, '1760000000123456790')

    const backwards = advanceCursor('1760000000123456790', {
      lines: [],
      newestCursor: '1760000000123456789',
    })
    assert.equal(backwards.cursor, '1760000000123456790')
  })

  it('takes the maximum cursor from the batch lines themselves', () => {
    const { cursor } = advanceCursor('5', {
      lines: [{ tsNs: '7' }, { tsNs: '6' }],
      newestCursor: null,
    })
    assert.equal(cursor, '7')
  })

  it('turns a response gap into a marker instead of silent truncation', () => {
    const { cursor, markers } = advanceCursor('5', {
      lines: [],
      newestCursor: '6',
      gap: { start: '2026-10-09T10:00:00.000Z', end: '2026-10-09T10:05:00.000Z' },
    })

    assert.equal(cursor, '6')
    assert.equal(markers.length, 1)
    assert.equal(markers[0].kind, 'gap')
    assert.equal(markers[0].start, '2026-10-09T10:00:00.000Z')
    assert.equal(markers[0].end, '2026-10-09T10:05:00.000Z')
  })
})

describe('createLiveTailController', () => {
  it('backs off 3s/6s/12s/30s, resumes from the last cursor and clears on recovery', async () => {
    const scheduler = createFakeScheduler()
    const calls = []
    let mode = 'fail'
    const poll = async (request) => {
      calls.push(request)
      if (mode === 'fail') throw new Error('store down')
      return { lines: [{ id: 'n1', tsNs: '10' }], newestCursor: '10', limited: false, gap: null }
    }

    const controller = createLiveTailController({
      poll,
      schedule: scheduler.schedule,
      interval: 3000,
      backoff: [3000, 6000, 12000],
      maxBackoff: 30000,
      cap: 10,
    })

    controller.start({ cursor: '5' })
    await flush()

    assert.equal(controller.getSnapshot().interrupted, true)
    assert.equal(scheduler.last().delay, 3000)

    scheduler.runPending()
    await flush()
    assert.equal(scheduler.last().delay, 6000)

    scheduler.runPending()
    await flush()
    assert.equal(scheduler.last().delay, 12000)

    scheduler.runPending()
    await flush()
    assert.equal(scheduler.last().delay, 30000)

    scheduler.runPending()
    await flush()
    assert.equal(scheduler.last().delay, 30000)

    mode = 'ok'
    scheduler.runPending()
    await flush()

    // Recovery resumed from the last cursor — the failures never moved it.
    assert.equal(calls[calls.length - 1].cursor, '5')

    const snapshot = controller.getSnapshot()
    assert.equal(snapshot.interrupted, false)
    assert.equal(snapshot.cursor, '10')
    assert.deepEqual(snapshot.lines.map((line) => line.id), ['n1'])
    assert.equal(scheduler.last().delay, 3000)
  })

  it('polls again with no wait while a limited poll still makes progress', async () => {
    const scheduler = createFakeScheduler()
    let step = 0
    const poll = async () => {
      step += 1
      if (step === 1) {
        return { lines: [{ id: 'a', tsNs: '2' }], newestCursor: '2', limited: true }
      }
      return { lines: [], newestCursor: '2', limited: false }
    }

    const controller = createLiveTailController({
      poll,
      schedule: scheduler.schedule,
      interval: 3000,
    })

    controller.start({ cursor: '1' })
    await flush()
    // start() polls immediately; the limited response that advanced the cursor
    // schedules the next poll with no wait (catch-up).
    assert.equal(scheduler.last().delay, 0)

    scheduler.runPending()
    await flush()
    // caught up -> back to the interval
    assert.equal(scheduler.last().delay, 3000)
    assert.equal(controller.getSnapshot().cursor, '2')
  })

  it('never loops without progress when limited reports the same cursor', async () => {
    const scheduler = createFakeScheduler()
    const calls = []
    const poll = async (request) => {
      calls.push(request)
      return { lines: [], newestCursor: '7', limited: true }
    }

    const controller = createLiveTailController({
      poll,
      schedule: scheduler.schedule,
      interval: 3000,
    })

    controller.start({ cursor: '7' })
    await flush()
    assert.equal(scheduler.last().delay, 3000)

    scheduler.runPending()
    await flush()
    assert.equal(scheduler.last().delay, 3000)
    assert.equal(scheduler.pending().length, 1)
    assert.ok(calls.length <= 2)
  })

  it('stop() cancels the pending poll and keeps the collected lines', async () => {
    const scheduler = createFakeScheduler()
    const poll = async () => ({ lines: [{ id: 'a', tsNs: '2' }], newestCursor: '2', limited: false })

    const controller = createLiveTailController({
      poll,
      schedule: scheduler.schedule,
      interval: 3000,
    })

    controller.start({ cursor: '1' })
    await flush()
    await flush()

    controller.stop()

    const snapshot = controller.getSnapshot()
    assert.equal(snapshot.active, false)
    assert.deepEqual(snapshot.lines.map((line) => line.id), ['a'])
    assert.equal(scheduler.pending().length, 0)
  })
})

describe('createStatusRetryController', () => {
  it('waits 2s, 4s, 8s, 16s and then every 30s between failed probes', async () => {
    assert.deepEqual(STATUS_RETRY_BACKOFF_MS, [2000, 4000, 8000, 16000])
    assert.equal(STATUS_RETRY_MAX_MS, 30000)

    const scheduler = createFakeScheduler()
    let checks = 0
    const controller = createStatusRetryController({
      check: async () => {
        checks += 1
        return false
      },
      schedule: scheduler.schedule,
    })

    controller.start()
    assert.equal(scheduler.last().delay, 2000)
    assert.equal(scheduler.pending().length, 1)

    for (const delay of [4000, 8000, 16000, 30000, 30000]) {
      scheduler.runPending()
      await flush()
      assert.equal(scheduler.last().delay, delay)
      assert.equal(scheduler.pending().length, 1)
    }

    assert.equal(checks, 5)
  })

  it('leaves no pending entry and schedules nothing once the probe answers ok', async () => {
    const scheduler = createFakeScheduler()
    let checks = 0
    const controller = createStatusRetryController({
      check: async () => {
        checks += 1
        return true
      },
      schedule: scheduler.schedule,
    })

    controller.start()
    scheduler.runPending()
    await flush()

    assert.equal(checks, 1)
    assert.equal(scheduler.pending().length, 0)
    assert.equal(scheduler.entries.length, 1)
  })

  it('skips the probe entirely while the document is hidden and waits the ceiling', async () => {
    const scheduler = createFakeScheduler()
    let checks = 0
    const controller = createStatusRetryController({
      check: async () => {
        checks += 1
        return false
      },
      schedule: scheduler.schedule,
      isVisible: () => false,
    })

    controller.start()
    scheduler.runPending()
    await flush()

    assert.equal(checks, 0)
    assert.equal(scheduler.last().delay, 30000)
    assert.equal(scheduler.pending().length, 1)
  })

  it('probes immediately on kick and continues at the second backoff step', async () => {
    const scheduler = createFakeScheduler()
    let checks = 0
    const controller = createStatusRetryController({
      check: async () => {
        checks += 1
        return false
      },
      schedule: scheduler.schedule,
    })

    controller.start()
    const first = scheduler.last()
    assert.equal(checks, 0)

    controller.kick()
    await flush()

    assert.equal(first.cancelled, true)
    assert.equal(checks, 1)
    assert.equal(scheduler.last().delay, 4000)
    assert.equal(scheduler.pending().length, 1)
  })

  it('keeps exactly one pending entry across repeated start() and kick() calls', async () => {
    const scheduler = createFakeScheduler()
    const controller = createStatusRetryController({
      check: async () => false,
      schedule: scheduler.schedule,
    })

    controller.start()
    controller.start()
    assert.equal(scheduler.pending().length, 1)

    controller.kick()
    controller.kick()
    await flush()
    assert.equal(scheduler.pending().length, 1)
  })

  it('stop() clears the pending entry and a later callback neither probes nor schedules', async () => {
    const scheduler = createFakeScheduler()
    let checks = 0
    const controller = createStatusRetryController({
      check: async () => {
        checks += 1
        return false
      },
      schedule: scheduler.schedule,
    })

    controller.start()
    const captured = scheduler.last()
    controller.stop()

    assert.equal(scheduler.pending().length, 0)
    const scheduledBefore = scheduler.entries.length

    captured.fn()
    await flush()

    assert.equal(checks, 0)
    assert.equal(scheduler.entries.length, scheduledBefore)
  })
})

describe('taskEntryState', () => {
  it('returns the D-10 window and liveTail for a running task without completed_at', () => {
    const now = Date.parse('2026-10-09T10:30:00.000Z')
    const state = taskEntryState(
      { id: 't1', current_status: 'RUNNING', started_at: '2026-10-09T10:00:00', completed_at: null },
      now,
    )

    assert.equal(state.taskId, 't1')
    assert.equal(state.start, '2026-10-09T09:58:00.000Z')
    assert.equal(state.end, '2026-10-09T10:32:00.000Z')
    assert.equal(state.liveTail, true)
    assert.equal(state.creationAnchored, false)
  })

  it('closes the window at completed_at and disables liveTail for a finished task', () => {
    const state = taskEntryState(
      {
        id: 't2',
        current_status: 'SUCCESS',
        started_at: '2026-10-09T10:00:00Z',
        completed_at: '2026-10-09T10:05:00Z',
      },
      0,
    )

    assert.equal(state.start, '2026-10-09T09:58:00.000Z')
    assert.equal(state.end, '2026-10-09T10:07:00.000Z')
    assert.equal(state.liveTail, false)
  })

  it('falls back to the creation-anchored window when run times are missing', () => {
    const state = taskEntryState(
      {
        id: 't3',
        current_status: 'PENDING',
        started_at: null,
        completed_at: null,
        created_at: '2026-10-09T09:00:00',
      },
      0,
    )

    assert.equal(state.taskId, 't3')
    assert.equal(state.start, '2026-10-09T09:00:00.000Z')
    assert.equal(state.end, '2026-10-09T09:15:00.000Z')
    assert.equal(state.creationAnchored, true)
    assert.equal(state.liveTail, true)
  })

  it('reads a naive started_at as UTC, independent of the host timezone', () => {
    const state = taskEntryState(
      {
        id: 't4',
        current_status: 'FAILED',
        started_at: '2026-10-09T10:00:00',
        completed_at: '2026-10-09T10:01:00',
      },
      0,
    )

    assert.equal(state.start, '2026-10-09T09:58:00.000Z')
    assert.equal(state.end, '2026-10-09T10:03:00.000Z')
  })
})