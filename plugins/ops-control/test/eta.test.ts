import { test, expect } from 'claude-code/testing'
import { eta, historyEta, noteEta, savedDurations } from '../hooks/eta.ts'
import { tabParts } from '../hooks/pane.tsx'
import { instrumentRow, workOf, type WorkInput } from '../hooks/workbar.ts'
import { initialModel, applyEvent } from '../hooks/model.ts'
import { resolveTheme } from '../hooks/themes.ts'
import { DEFAULT_SETUP } from '../hooks/setup.ts'
import { endTurn, initialRequests, loadSaved, saved, stamped, startTurn, submit, toolEnd, type Milestone } from '../hooks/requests.ts'

const T = resolveTheme('classic', {}).theme
const text = (segs: { text: string }[]) => segs.map(s => s.text).join('')
const MIN = 60_000
const working = applyEvent(initialModel(), { type: 'turn-start', at: 0 })
const input = (steps: Milestone[], over: Partial<WorkInput> = {}): WorkInput => ({ model: working, steps, meter: DEFAULT_SETUP.meter, now: 10 * MIN, columns: 120, ...over })

test('a milestone is stamped when it starts and when it finishes, and keeps its times by title', () => {
  const first = stamped([], [{ title: 'Map', status: 'in_progress' }, { title: 'Build', status: 'pending' }], 1000)
  expect(first).toEqual([{ title: 'Map', status: 'in_progress', startedAt: 1000 }, { title: 'Build', status: 'pending' }])
  const next = stamped(first, [{ title: 'Map', status: 'completed' }, { title: 'Build', status: 'in_progress' }], 5000)
  expect(next).toEqual([{ title: 'Map', status: 'completed', startedAt: 1000, doneAt: 5000 }, { title: 'Build', status: 'in_progress', startedAt: 5000 }])
  // a list sent again changes nothing already stamped
  expect(stamped(next, [{ title: 'Map', status: 'completed' }, { title: 'Build', status: 'verifying' }], 9000)).toEqual([
    { title: 'Map', status: 'completed', startedAt: 1000, doneAt: 5000 }, { title: 'Build', status: 'verifying', startedAt: 5000 },
  ])
})

test('the milestones call stamps the request\'s list with the call\'s time; the times survive a save', () => {
  let rs = submit(initialRequests(), { text: 'do it', at: 0 }).rs
  rs = startTurn(rs, { turnId: 't1', text: 'do it', at: 0 })
  const call = (at: number, milestones: Milestone[]) => { rs = toolEnd(rs, { at, tool: 'mcp__ops-control__milestones', toolUseId: `u${at}`, input: { milestones }, isError: false, text: '' }) }
  call(1000, [{ title: 'Map', status: 'in_progress' }, { title: 'Build', status: 'pending' }])
  call(4000, [{ title: 'Map', status: 'completed' }, { title: 'Build', status: 'in_progress' }])
  expect(rs.list[0]!.milestones).toEqual([{ title: 'Map', status: 'completed', startedAt: 1000, doneAt: 4000 }, { title: 'Build', status: 'in_progress', startedAt: 4000 }])
  expect(loadSaved(JSON.parse(JSON.stringify(saved(rs)))).list[0]!.milestones).toEqual(rs.list[0]!.milestones)
})

test('the estimate: the pace per finished milestone times the ones left, the running one less what it has run', () => {
  const steps: Milestone[] = [
    { title: 'A', status: 'completed', startedAt: 0, doneAt: 2 * MIN }, { title: 'B', status: 'completed', startedAt: 2 * MIN, doneAt: 4 * MIN },
    { title: 'C', status: 'in_progress', startedAt: 4 * MIN }, { title: 'D', status: 'pending' },
  ]
  // pace 2m; C has run 1m of it, D needs all 2m
  expect(eta(steps, 5 * MIN)).toEqual({ kind: 'left', ms: 3 * MIN })
  // C ran past the pace: it still counts a fifth of it
  expect(eta(steps, 20 * MIN)).toEqual({ kind: 'left', ms: 2 * MIN + 0.2 * 2 * MIN })
})

test('no estimate before a milestone is done, while the work waits, or once all is done', () => {
  expect(eta([{ title: 'A', status: 'in_progress', startedAt: 0 }, { title: 'B', status: 'pending' }], MIN)).toEqual({ kind: 'unknown' })
  expect(eta([{ title: 'A', status: 'completed', startedAt: 0, doneAt: MIN }, { title: 'B', status: 'blocked', startedAt: MIN }], 2 * MIN)).toBeUndefined()
  expect(eta([{ title: 'A', status: 'completed', startedAt: 0, doneAt: MIN }], 2 * MIN)).toBeUndefined()
  expect(eta([], 0)).toBeUndefined()
})

test('the work bar shows the time left after the track while Claude works, -- until it can tell', () => {
  const steps: Milestone[] = [{ title: 'A', status: 'completed', startedAt: 0, doneAt: 4 * MIN }, { title: 'B', status: 'in_progress', startedAt: 4 * MIN }, { title: 'C', status: 'pending' }]
  expect(text(instrumentRow(T, input(steps, { now: 6 * MIN })))).toContain('1/3 · ETA ~6m')
  expect(text(instrumentRow(T, input([{ title: 'A', status: 'in_progress', startedAt: 0 }, { title: 'B', status: 'pending' }])))).toContain('0/2 · ETA --')
  // between turns, and in a narrow bar with no labels, there is no guess to show
  expect(text(instrumentRow(T, input(steps, { model: initialModel() })))).not.toContain('ETA')
  expect(text(instrumentRow(T, input([{ title: 'A', status: 'in_progress', startedAt: 0 }], { columns: 60 })))).not.toContain('--')
})

// A session whose finished requests each worked the given minutes, then one at work that started at `startedAt`.
function session(minutes: number[], startedAt: number) {
  let rs = initialRequests(), at = 0
  minutes.forEach((m, i) => {
    rs = submit(rs, { text: `job ${i}`, at }).rs
    rs = startTurn(rs, { turnId: `t${i}`, text: `job ${i}`, at })
    rs = endTurn(rs, { turnId: `t${i}`, answer: 'done', reason: 'answer', durationMs: m * MIN, at: at + m * MIN })
    at += m * MIN
  })
  rs = submit(rs, { text: 'now', at: startedAt }).rs
  return startTurn(rs, { turnId: 'now', text: 'now', at: startedAt })
}

test('work with no steps goes by the past requests that ran longer than this one has so far', () => {
  const rs = session([2, 4, 6, 10], 100 * MIN)
  // 3m in: of 4, 6 and 10 the middle is 6, so 3m left
  expect(historyEta(rs, 103 * MIN)).toEqual({ kind: 'left', ms: 3 * MIN, from: 'history' })
  // 7m in: only the 10m one ran longer
  expect(historyEta(rs, 107 * MIN)).toEqual({ kind: 'left', ms: 3 * MIN, from: 'history' })
  // longer than any of them, or too few to go by: no guess
  expect(historyEta(rs, 111 * MIN)).toEqual({ kind: 'unknown' })
  expect(historyEta(session([2, 4], 100 * MIN), 101 * MIN)).toEqual({ kind: 'unknown' })
  expect(historyEta(initialRequests(), 0)).toBeUndefined()
})

test('the bar falls back to past requests when its steps cannot tell, and shows an ETA with no steps at all', () => {
  const history = { kind: 'left' as const, ms: 4 * MIN, from: 'history' as const }
  expect(text(instrumentRow(T, input([], { history })))).toContain('ETA ~4m')
  expect(text(instrumentRow(T, input([{ title: 'A', status: 'in_progress', startedAt: 0 }], { history })))).toContain('0/1 · ETA ~4m')
  expect(text(instrumentRow(T, input([])))).toContain('ETA --')
  // the steps' own pace wins over the past; a step waiting shows no time at all
  const paced: Milestone[] = [{ title: 'A', status: 'completed', startedAt: 0, doneAt: 4 * MIN }, { title: 'B', status: 'in_progress', startedAt: 4 * MIN }]
  expect(text(instrumentRow(T, input(paced, { history, now: 5 * MIN })))).toContain('ETA ~3m')
  expect(text(instrumentRow(T, input([{ title: 'A', status: 'waiting', startedAt: 0 }], { history })))).not.toContain('ETA')
})

test('Claude\'s task list is marked as steps the caller stamps', () => {
  const plan = [{ id: '1', title: 'Task', status: 'in_progress' as const }, { id: '2', title: 'Next', status: 'pending' as const }]
  expect(workOf(initialRequests(), plan)).toMatchObject({ tasks: true })
  expect(stamped([], workOf(initialRequests(), plan).steps, 500)[0]).toEqual({ title: 'Task', status: 'in_progress', startedAt: 500 })
})

test('earlier sessions\' requests count too, so a new session has a guess from its first request', () => {
  const file = JSON.parse(JSON.stringify(saved(session([3, 5, 9], 0))))
  // the one at work in that file never finished, so three count
  expect(savedDurations(file)).toEqual([3 * MIN, 5 * MIN, 9 * MIN])
  expect(savedDurations('not a file')).toEqual([])
  const fresh = session([], 0)
  expect(historyEta(fresh, MIN)).toEqual({ kind: 'unknown' })
  expect(historyEta(fresh, MIN, savedDurations(file))).toEqual({ kind: 'left', ms: 4 * MIN, from: 'history' })
})

test('a request keeps the first guess from past requests, then once the first from its own milestones', () => {
  let rs = noteEta(session([2, 4, 6, 10], 100 * MIN), 100 * MIN)
  // at the start: of 2, 4, 6 and 10 the middle of the longer ones is 6
  expect(rs.list.at(-1)!.eta).toEqual({ ms: 6 * MIN, after: 0, from: 'history' })
  // a later guess from the past does not move it
  expect(noteEta(rs, 103 * MIN).list.at(-1)!.eta).toEqual({ ms: 6 * MIN, after: 0, from: 'history' })
  const call = (at: number, milestones: Milestone[]) => { rs = noteEta(toolEnd(rs, { at, tool: 'mcp__ops-control__milestones', toolUseId: `u${at}`, input: { milestones }, isError: false, text: '' }), at) }
  call(100 * MIN, [{ title: 'A', status: 'in_progress' }, { title: 'B', status: 'pending' }])
  call(102 * MIN, [{ title: 'A', status: 'completed' }, { title: 'B', status: 'in_progress' }])
  // 2m worked, pace 2m and B just started: 4m in all
  expect(rs.list.at(-1)!.eta).toEqual({ ms: 4 * MIN, after: 2 * MIN })
  call(103 * MIN, [{ title: 'A', status: 'completed' }, { title: 'B', status: 'completed' }, { title: 'C', status: 'in_progress' }])
  expect(rs.list.at(-1)!.eta).toEqual({ ms: 4 * MIN, after: 2 * MIN })
  // it survives a save, and the Plan tab sets it against how long the request worked
  rs = endTurn(rs, { turnId: 'now', answer: 'done', reason: 'answer', durationMs: 7 * MIN, at: 107 * MIN })
  const back = loadSaved(JSON.parse(JSON.stringify(saved(rs))))
  expect(back.list.at(-1)!.eta).toEqual({ ms: 4 * MIN, after: 2 * MIN })
  const r = back.list.at(-1)!
  const detail = text(tabParts(initialModel(), T, { tab: 'plan', request: r.id }, 90, false, 108 * MIN, 200, 'round', back).rows.flat())
  expect(detail).toContain('~4m guessed after 2m 00s · took 7m 00s · 3m 00s over')
  expect(text(tabParts(initialModel(), T, { tab: 'plan' }, 90, false, 108 * MIN, 200, 'round', back).rows.flat())).toContain('7m 00s / ~4m')
})

test('no guess is kept for a slash command, or while none can be made', () => {
  let rs = submit(initialRequests(), { text: '/compact', at: 0, command: true }).rs
  rs = startTurn(rs, { turnId: 't', text: 'compact', at: 0 })
  expect(noteEta(rs, MIN, [MIN, 2 * MIN, 3 * MIN]).list[0]!.eta).toBeUndefined()
  expect(noteEta(session([], 0), MIN).list[0]!.eta).toBeUndefined()
})
