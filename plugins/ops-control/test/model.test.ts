import { test, expect } from 'claude-code/testing'
import { forkTask, isForkId, initialModel, applyEvent, normalizeModel, bandVisible, isBusy, mergeCounts, planFold, type Ev, type Model } from '../hooks/model.ts'

const run = (evs: Ev[]) => evs.reduce(applyEvent, initialModel())

test('the action keeps the tool kind', async () => {
  const m = run([{ type: 'turn-start', at: 0 }, { type: 'tool-start', at: 1, tool: 'Edit', toolUseId: 'e1', input: { file_path: '/r/a.ts' } }])
  expect(m.act.kind).toBe('edit')
})

test('main-loop tools set the action; results update it', async () => {
  const m = run([
    { type: 'turn-start', at: 0 },
    { type: 'tool-start', at: 1, tool: 'Bash', toolUseId: 't1', input: { command: 'npm test' } },
    { type: 'tool-end', at: 2, tool: 'Bash', toolUseId: 't1', input: { command: 'npm test' }, isError: true, text: '2 failed, 12 passed' },
  ])
  expect(m.working).toBe(true)
  expect(m.act).toEqual({ glyph: '✗', label: '2 tests failed', tone: 'fail' })
})

test('a passing test run reports the count from Task 3', async () => {
  const m = run([
    { type: 'tool-start', at: 1, tool: 'Bash', toolUseId: 't1', input: { command: 'pnpm test' } },
    { type: 'tool-end', at: 2, tool: 'Bash', toolUseId: 't1', input: { command: 'pnpm test' }, isError: false, text: 'Tests  14 passed (14)' },
  ])
  expect(m.act).toEqual({ glyph: '✓', label: '14/14 tests passing', tone: 'pass' })
})

test('a non-test shell error gets no test reaction', async () => {
  const m = run([
    { type: 'tool-start', at: 1, tool: 'Bash', toolUseId: 't1', input: { command: 'ls nope' } },
    { type: 'tool-end', at: 2, tool: 'Bash', toolUseId: 't1', input: { command: 'ls nope' }, isError: true, text: 'No such file' },
  ])
  expect(m.act.label).toBe('Running ls nope')
})

test('subagent tool calls update that agent, never the main action', async () => {
  const m = run([
    { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a1', input: { description: 'Find tests', prompt: '' } },
    { type: 'agent-bind', toolUseId: 'a1', agentId: 'ag-9' },
    { type: 'tool-start', at: 2, tool: 'Read', toolUseId: 'r1', input: { file_path: '/r/src/nav.tsx' } },
    { type: 'tool-start', at: 3, tool: 'Grep', toolUseId: 'g1', agentId: 'ag-9', input: { pattern: 'redirect(' } },
  ])
  expect(m.act.label).toBe('Reading src/nav.tsx')
  expect(m.agents).toHaveLength(1)
  expect(m.agents[0]).toMatchObject({ key: 'a1', agentId: 'ag-9', name: 'Find tests', state: 'running', now: '⌕ Searching "redirect("' })
})

test('agent name prefers name, then subagent_type, then description; task stays the description', async () => {
  const m = run([
    { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a1', input: { name: 'scout', subagent_type: 'Explore', description: 'Find tests' } },
    { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a2', input: { subagent_type: 'Explore', description: 'Find docs' } },
    { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a3', input: { description: 'Find specs' } },
    { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a4', input: {} },
  ])
  expect(m.agents.map(a => [a.name, a.task])).toEqual([['scout', 'Find tests'], ['Explore', 'Find docs'], ['Find specs', 'Find specs'], ['agent', '']])
})

test('parallel agents keep their own lines whatever order they bind in', async () => {
  const m = run([
    { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a1', input: { description: 'one' } },
    { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a2', input: { description: 'two' } },
    { type: 'agent-bind', toolUseId: 'a2', agentId: 'ag-2' },
    { type: 'agent-bind', toolUseId: 'a1', agentId: 'ag-1' },
    { type: 'tool-start', at: 2, tool: 'Read', toolUseId: 'r2', agentId: 'ag-2', input: { file_path: '/r/two.ts' } },
    { type: 'tool-start', at: 3, tool: 'Read', toolUseId: 'r1', agentId: 'ag-1', input: { file_path: '/r/one.ts' } },
    { type: 'tool-start', at: 4, tool: 'Read', toolUseId: 'r3', agentId: 'ag-unknown', input: { file_path: '/r/x.ts' } },
  ])
  expect(m.agents.map(a => [a.name, a.agentId, a.now])).toEqual([['one', 'ag-1', '▸ Reading r/one.ts'], ['two', 'ag-2', '▸ Reading r/two.ts']])
  expect(m.act.label).toBe('Started subagent: two')
})

test('an agent is done when its own turn completes; the Agent call only brings tokens', async () => {
  // background: the Agent call returns at once and the agent keeps running
  let bg = run([
    { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a1', input: { description: 'Find tests', prompt: '' } },
    { type: 'agent-bind', toolUseId: 'a1', agentId: 'ag-1' },
    { type: 'tool-end', at: 2, tool: 'Agent', toolUseId: 'a1', input: {}, isError: false, text: 'Async agent launched' },
  ])
  expect(bg.agents[0]).toMatchObject({ state: 'running' })
  bg = applyEvent(bg, { type: 'agent-done', at: 9001, agentId: 'ag-1', tokens: 2500 })
  expect(bg.agents[0]).toMatchObject({ state: 'done', endedAt: 9001, tokens: 2500 })
  // foreground: the agent's turn completes, then the Agent call ends with its tokens
  const fg = run([
    { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a1', input: { description: 'Find tests', prompt: '' } },
    { type: 'agent-bind', toolUseId: 'a1', agentId: 'ag-1' },
    { type: 'agent-done', at: 9001, agentId: 'ag-1' },
    { type: 'tool-end', at: 9002, tool: 'Agent', toolUseId: 'a1', input: {}, isError: false, text: '', agentTokens: 4100 },
  ])
  expect(fg.agents[0]).toMatchObject({ state: 'done', endedAt: 9001, tokens: 4100 })
})

test('edits accumulate per file; reads are not recorded; newest first', async () => {
  const m = run([
    { type: 'tool-end', at: 1, tool: 'Read', toolUseId: 'r', input: { file_path: '/r/t.ts' }, isError: false, text: '' },
    { type: 'tool-end', at: 2, tool: 'Edit', toolUseId: 'e1', input: { file_path: '/r/a.ts', old_string: 'x', new_string: 'y\nz' }, isError: false, text: '' },
    { type: 'tool-end', at: 3, tool: 'Edit', toolUseId: 'e2', input: { file_path: '/r/a.ts', old_string: 'q', new_string: 'w' }, isError: false, text: '' },
    { type: 'tool-end', at: 4, tool: 'Write', toolUseId: 'w', input: { file_path: '/r/new.ts', content: 'a\nb' }, isError: false, text: '', writeType: 'create' },
    { type: 'tool-end', at: 5, tool: 'Write', toolUseId: 'w2', input: { file_path: '/r/old.ts', content: 'c' }, isError: false, text: '', writeType: 'update' },
  ])
  expect(m.files.map(f => [f.path, f.how, f.add, f.del])).toEqual([['/r/old.ts', 'edit', 1, 0], ['/r/new.ts', 'new', 2, 0], ['/r/a.ts', 'edit', 3, 2]])
})

test('a file read and then edited is an edit', async () => {
  const m = run([
    { type: 'tool-end', at: 1, tool: 'Read', toolUseId: 'r', input: { file_path: '/r/t.ts' }, isError: false, text: '' },
    { type: 'tool-end', at: 2, tool: 'Edit', toolUseId: 'e', input: { file_path: '/r/t.ts', old_string: 'x', new_string: 'y' }, isError: false, text: '' },
  ])
  expect(m.files.map(f => [f.path, f.how])).toEqual([['/r/t.ts', 'edit']])
})

test('a notebook edit is an edit with no line counts', async () => {
  const m = run([
    { type: 'tool-end', at: 1, tool: 'NotebookEdit', toolUseId: 'n1', input: { notebook_path: '/r/a.ipynb', new_source: 'x' }, isError: false, text: '' },
  ])
  expect(m.files.map(f => [f.path, f.how, f.add, f.del])).toEqual([['/r/a.ipynb', 'edit', 0, 0]])
})

test('mergeCounts keeps files added after the git snapshot and adds files only git saw', async () => {
  const snap = run([{ type: 'tool-end', at: 1, tool: 'Edit', toolUseId: 'e1', input: { file_path: '/r/a.ts', old_string: 'x', new_string: 'y' }, isError: false, text: '' }])
  const refreshed = snap.files.map(f => ({ ...f, add: 5, del: 2 }))
  const later = applyEvent(snap, { type: 'tool-end', at: 2, tool: 'Write', toolUseId: 'w1', input: { file_path: '/r/b.ts', content: 'q' }, isError: false, text: '', writeType: 'create' })
  const m = mergeCounts(later, [...refreshed, { path: '/r/sed.ts', add: 9, del: 9, how: 'edit', at: 3 }])
  expect(m.files.map(f => [f.path, f.how, f.add, f.del])).toEqual([['/r/sed.ts', 'edit', 9, 9], ['/r/b.ts', 'new', 1, 0], ['/r/a.ts', 'edit', 5, 2]])
  // a refresh that finds new counts touches the file at the refresh time
  expect(mergeCounts(m, [{ path: '/r/sed.ts', add: 10, del: 9, how: 'edit', at: 7 }]).files[0]).toMatchObject({ path: '/r/sed.ts', add: 10, at: 7 })
  // a refresh that started before a later edit does not move that edit back
  expect(mergeCounts(m, [{ path: '/r/b.ts', add: 2, del: 0, how: 'new', at: 1 }]).files.map(f => [f.path, f.at])).toEqual([['/r/sed.ts', 3], ['/r/b.ts', 2], ['/r/a.ts', 1]])
})

test('mergeCounts drops a file the refresh was given and did not return, but not one added meanwhile', async () => {
  const edit = (at: number, file: string): Ev => ({ type: 'tool-end', at, tool: 'Edit', toolUseId: 'e' + at, input: { file_path: file, old_string: 'x', new_string: 'y' }, isError: false, text: '' })
  const m = run([edit(1, '/r/a.ts'), edit(2, '/r/b.ts'), edit(3, '/r/late.ts')])
  const out = mergeCounts(m, [{ path: '/r/b.ts', add: 1, del: 1, how: 'edit', at: 2 }], ['/r/a.ts', '/r/b.ts'])
  expect(out.files.map(f => f.path)).toEqual(['/r/late.ts', '/r/b.ts'])
})

test('editing an older file again puts it first', async () => {
  const edit = (at: number, file: string): Ev => ({ type: 'tool-end', at, tool: 'Edit', toolUseId: 'e' + at, input: { file_path: file, old_string: 'x', new_string: 'y' }, isError: false, text: '' })
  const m = run([edit(1, '/r/a.ts'), edit(2, '/r/b.ts'), edit(3, '/r/a.ts')])
  expect(m.files.map(f => f.path)).toEqual(['/r/a.ts', '/r/b.ts'])
})

test('failed edits do not count', async () => {
  const m = run([{ type: 'tool-end', at: 2, tool: 'Edit', toolUseId: 'e1', input: { file_path: '/r/a.ts', old_string: 'x', new_string: 'y' }, isError: true, text: 'not found' }])
  expect(m.files).toEqual([])
})

test('needs-you holds until that call ends, then the action comes back', async () => {
  let m = run([
    { type: 'turn-start', at: 0 },
    { type: 'tool-start', at: 1, tool: 'Bash', toolUseId: 'b1', input: { command: 'git push --force' } },
    { type: 'needs-you', at: 2, toolUseId: 'b1', what: 'approve git push --force' },
  ])
  expect(m.act).toEqual({ glyph: '!', label: 'Needs you: approve git push --force', tone: 'fail' })
  // a parallel call starting does not hide the question
  m = applyEvent(m, { type: 'tool-start', at: 3, tool: 'Read', toolUseId: 'r1', input: { file_path: '/r/a.ts' } })
  expect(m.act.label).toBe('Needs you: approve git push --force')
  m = applyEvent(m, { type: 'tool-end', at: 4, tool: 'Bash', toolUseId: 'b1', input: { command: 'git push --force' }, isError: false, text: '' })
  expect(m.needsYou).toBeUndefined()
  expect(m.act.label).toBe('Reading r/a.ts')
})

test('turn-done and band linger', async () => {
  let m = run([{ type: 'turn-start', at: 0 }])
  m = applyEvent(m, { type: 'turn-done', at: 100, reason: 'answer' })
  expect(m.working).toBe(false)
  expect(m.act).toEqual({ glyph: '✓', label: 'Done', tone: 'pass' })
  expect(bandVisible(m, 1500)).toBe(true)
  expect(bandVisible(m, 1601)).toBe(false)
})

test('an interrupted or failed turn is not reported as done', async () => {
  const end = (reason: 'aborted' | 'error' | 'refusal') => applyEvent(run([{ type: 'turn-start', at: 0 }]), { type: 'turn-done', at: 1, reason }).act
  expect(end('aborted')).toEqual({ glyph: '■', label: 'Interrupted', tone: 'dim' })
  expect(end('error')).toEqual({ glyph: '✗', label: 'Stopped', tone: 'fail' })
  expect(end('refusal')).toEqual({ glyph: '✗', label: 'Stopped', tone: 'fail' })
})

test('a running subagent keeps the model busy after the main turn ends', async () => {
  let m = run([
    { type: 'turn-start', at: 0 },
    { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a1', input: { description: 'scout' } },
    { type: 'agent-bind', toolUseId: 'a1', agentId: 'ag-1' },
    { type: 'turn-done', at: 2, reason: 'answer' },
  ])
  expect(isBusy(m)).toBe(true)
  expect(bandVisible(m, 1_000_000)).toBe(true)
  m = applyEvent(m, { type: 'agent-done', at: 3, agentId: 'ag-1' })
  expect(isBusy(m)).toBe(false)
})

test('plan follows TaskCreate and uses the result id', async () => {
  const m = run([
    { type: 'tool-end', at: 1, tool: 'TaskCreate', toolUseId: 'c1', input: { subject: 'Patch it', description: '' }, isError: false, text: '', resultTaskId: '7' },
    { type: 'tool-end', at: 2, tool: 'TaskUpdate', toolUseId: 'u1', input: { taskId: '7', status: 'in_progress' }, isError: false, text: '' },
  ])
  expect(m.plan).toEqual([{ id: '7', title: 'Patch it', status: 'in_progress' }])
})

const item = (id: string, status: 'pending' | 'in_progress' | 'completed') => ({ id, title: 'task ' + id, status })

test('a finished plan folds at the next prompt, not before', async () => {
  const done = [item('1', 'completed'), item('2', 'completed')]
  let m = applyEvent(initialModel(), { type: 'plan-load', plan: done })
  expect(planFold(m)).toBeUndefined()
  m = applyEvent(m, { type: 'turn-start', at: 1 })
  expect(planFold(m)).toBe(2)
  expect(planFold(applyEvent(applyEvent(initialModel(), { type: 'plan-load', plan: [item('1', 'completed'), item('2', 'pending')] }), { type: 'turn-start', at: 1 }))).toBeUndefined()
  expect(planFold(applyEvent(initialModel(), { type: 'turn-start', at: 1 }))).toBeUndefined()
})

test('a folded plan opens again on a pending task or a new id, and stays open until the next prompt', async () => {
  const folded = applyEvent(applyEvent(initialModel(), { type: 'plan-load', plan: [item('1', 'completed')] }), { type: 'turn-start', at: 1 })
  expect(planFold(folded)).toBe(1)
  const reopened = applyEvent(folded, { type: 'plan-load', plan: [item('1', 'pending')] })
  expect(planFold(reopened)).toBeUndefined()
  expect(planFold(applyEvent(reopened, { type: 'plan-load', plan: [item('1', 'completed')] }))).toBeUndefined()
  const grown = applyEvent(folded, { type: 'plan-load', plan: [item('1', 'completed'), item('2', 'completed')] })
  expect(planFold(grown)).toBeUndefined()
  expect(planFold(applyEvent(grown, { type: 'turn-start', at: 2 }))).toBe(2)
  const created = applyEvent(folded, { type: 'tool-end', at: 2, tool: 'TaskCreate', toolUseId: 'c', input: { subject: 'more', description: '' }, isError: false, text: '', resultTaskId: '2' })
  expect(planFold(created)).toBeUndefined()
})

test('a subagent todo list leaves the main plan alone', async () => {
  const m = run([
    { type: 'tool-end', at: 1, tool: 'TodoWrite', toolUseId: 'p1', input: { todos: [{ content: 'Main', status: 'pending' }] }, isError: false, text: '' },
    { type: 'tool-end', at: 2, tool: 'TodoWrite', toolUseId: 'p2', agentId: 'ag-1', input: { todos: [{ content: 'Sub', status: 'pending' }] }, isError: false, text: '' },
  ])
  expect(m.plan).toEqual([{ id: '0', title: 'Main', status: 'pending' }])
})

test('a file only read joins the changes once git shows it changed', async () => {
  const snap = run([
    { type: 'tool-end', at: 1, tool: 'Read', toolUseId: 'r1', input: { file_path: '/r/a.ts' }, isError: false, text: '' },
  ])
  const m = mergeCounts(snap, [{ path: '/r/a.ts', add: 3, del: 1, how: 'edit', at: 5 }])
  expect(m.files.map(f => [f.path, f.how, f.add, f.del])).toEqual([['/r/a.ts', 'edit', 3, 1]])
})

test('mergeCounts keeps a new file new', async () => {
  const snap = run([{ type: 'tool-end', at: 1, tool: 'Write', toolUseId: 'w', input: { file_path: '/r/n.ts', content: 'a' }, isError: false, text: '', writeType: 'create' }])
  expect(mergeCounts(snap, [{ path: '/r/n.ts', add: 4, del: 0, how: 'new', at: 0 }]).files[0]).toMatchObject({ how: 'new', add: 4 })
})

test('a failed Agent call ends that agent', async () => {
  const m = run([
    { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a1', input: { description: 'one' } },
    { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a2', input: { description: 'two' } },
    { type: 'tool-end', at: 5, tool: 'Agent', toolUseId: 'a1', input: {}, isError: true, text: 'denied' },
  ])
  expect(m.agents.map(a => [a.name, a.state, a.endedAt])).toEqual([['one', 'done', 5], ['two', 'running', undefined]])
})

test('turn-start stamps turnAt and actAt and clears combo and lastTest', async () => {
  let m: Model = { ...initialModel(), combo: 4, lastTest: { passed: true, at: 1 } }
  m = applyEvent(m, { type: 'turn-start', at: 500 })
  expect([m.turnAt, m.actAt, m.combo, m.lastTest]).toEqual([500, 500, 0, undefined])
})

const call = (id: string, tool: string, input: Record<string, unknown>, at: number) => ({ type: 'tool-start' as const, at, tool, toolUseId: id, input })
const end = (id: string, tool: string, input: Record<string, unknown>, at: number, isError = false, text = '') => ({ type: 'tool-end' as const, at, tool, toolUseId: id, input, isError, text })

test('combo counts successful main-agent calls and resets on an error or a failed test', async () => {
  let m = applyEvent(initialModel(), { type: 'turn-start', at: 0 })
  for (let i = 0; i < 3; i++) m = applyEvent(applyEvent(m, call('r' + i, 'Read', { file_path: '/a' }, i)), end('r' + i, 'Read', { file_path: '/a' }, i))
  expect(m.combo).toBe(3)
  m = applyEvent(m, { ...end('s', 'Read', {}, 9), agentId: 'ag' })
  expect(m.combo).toBe(3)
  m = applyEvent(m, end('e', 'Edit', { file_path: '/a' }, 10, true))
  expect(m.combo).toBe(0)
  m = applyEvent(m, end('t', 'Bash', { command: 'npm test' }, 11, false, 'Tests: 1 failed, 2 passed'))
  expect(m.combo).toBe(0)
})

test('a test run records lastTest and actAt', async () => {
  let m = applyEvent(initialModel(), { type: 'turn-start', at: 0 })
  m = applyEvent(m, end('t', 'Bash', { command: 'pnpm test' }, 42, false, 'Tests: 12 passed'))
  expect(m.lastTest).toEqual({ passed: true, at: 42 })
  expect(m.actAt).toBe(42)
})

test('a new action, a done turn and a question stamp actAt', async () => {
  let m = applyEvent(initialModel(), { type: 'turn-start', at: 0 })
  m = applyEvent(m, call('a', 'Read', { file_path: '/a' }, 5))
  expect(m.actAt).toBe(5)
  m = applyEvent(m, { type: 'needs-you', at: 7, toolUseId: 'q', what: 'Bash' })
  expect(m.actAt).toBe(7)
  m = applyEvent(m, call('b', 'Read', { file_path: '/b' }, 8))
  expect(m.actAt).toBe(7)
  m = applyEvent(m, { type: 'turn-done', at: 9, reason: 'answer' })
  expect(m.actAt).toBe(9)
})

test('usage, session info and branch events land in the model', () => {
  let m = initialModel()
  expect(m.limits).toEqual([])
  m = applyEvent(m, { type: 'usage', limits: [{ kind: 'five_hour', percentUsed: 23, resetsAt: '2026-10-04T20:00:00Z' }], costUsd: 1.5 })
  expect(m.limits[0]!.percentUsed).toBe(23)
  expect(m.costUsd).toBe(1.5)
  m = applyEvent(m, { type: 'session-info', modelName: 'opus', root: '/w/ops-control' })
  expect([m.modelName, m.root]).toEqual(['opus', '/w/ops-control'])
  m = applyEvent(m, { type: 'session-info', root: '/w/other' })
  expect([m.modelName, m.root]).toEqual(['opus', '/w/other'])
  m = applyEvent(m, { type: 'branch', branch: 'main' })
  expect(m.branch).toBe('main')
  m = applyEvent(m, { type: 'branch' })
  expect(m.branch).toBeUndefined()
})

test('the effort event sets the level and an empty one clears it', () => {
  const a = applyEvent(initialModel(), { type: 'effort', effort: 'max' })
  expect(a.effort).toBe('max')
  expect(applyEvent(a, { type: 'effort', effort: undefined }).effort).toBeUndefined()
})

test('the level event sets xp, and a model without a valid xp normalizes to undefined', () => {
  expect(initialModel().xp).toBeUndefined()
  expect(applyEvent(initialModel(), { type: 'level', xp: 2310 }).xp).toBe(2310)
  const old = { ...initialModel() }
  expect(normalizeModel(old).xp).toBeUndefined()
  for (const bad of [-1, 1.5, NaN, Infinity, '9']) expect(normalizeModel({ ...old, xp: bad }).xp).toBeUndefined()
  expect(normalizeModel({ ...old, xp: 0 }).xp).toBe(0)
  expect(normalizeModel({ ...old, xp: 120 }).xp).toBe(120)
})

test('a music event lands on the model; junk music from old state is dropped', () => {
  const m = applyEvent(initialModel(), { type: 'music', music: { status: 'closed' } })
  expect(m.music).toEqual({ status: 'closed' })
  expect(normalizeModel({ ...initialModel(), music: { status: 'nope' } }).music).toBeUndefined()
  expect(normalizeModel({ ...initialModel(), music: 'x' }).music).toBeUndefined()
  expect(normalizeModel({ ...initialModel(), music: { status: 'closed' } }).music).toEqual({ status: 'closed' })
})

test('a spawn no Agent call announced (a /subtask fork) joins the agents; an Agent call\'s spawn binds its row', async () => {
  const m = run([
    { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a1', input: { description: 'scout', subagent_type: 'Explore' } },
    { type: 'agent-bind', toolUseId: 'a1', agentId: 'ag-1', at: 2, name: 'Explore', task: 'scout' },
    { type: 'agent-bind', toolUseId: '', agentId: 'fork-1', at: 3, name: 'fork', task: 'create-a-command' },
    // the same spawn told twice is one agent
    { type: 'agent-bind', toolUseId: '', agentId: 'fork-1', at: 4, name: 'fork', task: 'create-a-command' },
  ])
  expect(m.agents.map(a => [a.agentId, a.name, a.task, a.state])).toEqual([['ag-1', 'Explore', 'scout', 'running'], ['fork-1', 'fork', 'create-a-command', 'running']])
  expect(run([{ type: 'agent-bind', toolUseId: '', agentId: 'x' }]).agents).toEqual([])
  const done = applyEvent(m, { type: 'agent-done', at: 9, agentId: 'fork-1' })
  expect(done.agents[1]).toMatchObject({ state: 'done', endedAt: 9 })
  // a workflow's agents share one call: each gets a row
  const wf = run([
    { type: 'agent-bind', toolUseId: 'w1', agentId: 'wa', at: 1, name: 'review', task: 'bugs' },
    { type: 'agent-bind', toolUseId: 'w1', agentId: 'wb', at: 1, name: 'review', task: 'perf' },
  ])
  expect(wf.agents.map(a => a.agentId)).toEqual(['wa', 'wb'])
})

test('a fork\'s task comes from its agent id', async () => {
  expect(forkTask('acount-the-files-d7b91f2d5eb71abb')).toBe('count the files')
  expect(forkTask('awill-this-command-e44357cc46348aad')).toBe('will this command')
  expect(isForkId('acount-the-files-d7b91f2d5eb71abb')).toBe(true)
  expect(isForkId('a0123456789abcdef')).toBe(false)
})

test('a new fork takes over the row of a fork that is done; one still running keeps its own', async () => {
  const bind = (agentId: string, at: number, task: string): Ev => ({ type: 'agent-bind', toolUseId: '', agentId, at, name: 'fork', task, fork: true })
  let m = applyEvent(initialModel(), bind('afirst-task-0000000000000001', 1, 'first task'))
  // an Agent call's subagent that is done is never taken over
  m = applyEvent(m, { type: 'tool-start', at: 2, tool: 'Agent', toolUseId: 'call-1', input: { description: 'scout', subagent_type: 'Explore' } })
  m = applyEvent(m, { type: 'agent-bind', toolUseId: 'call-1', agentId: 'ag-1' })
  m = applyEvent(m, { type: 'agent-done', at: 3, agentId: 'ag-1' })
  m = applyEvent(m, { type: 'agent-done', at: 4, agentId: 'afirst-task-0000000000000001' })
  m = applyEvent(m, bind('asecond-task-0000000000000002', 5, 'second task'))
  expect(m.agents.map(a => [a.key, a.agentId, a.task, a.state])).toEqual([
    ['spawn:afirst-task-0000000000000001', 'asecond-task-0000000000000002', 'second task', 'running'],
    ['call-1', 'ag-1', 'scout', 'done'],
  ])
  // the row starts afresh: no steps, end or tokens of the fork before it
  expect([m.agents[0]!.startedAt, m.agents[0]!.endedAt, m.agents[0]!.log]).toEqual([5, undefined, undefined])
  // while that one runs, the next fork gets a row of its own
  m = applyEvent(m, bind('athird-task-0000000000000003', 6, 'third task'))
  expect(m.agents.map(a => a.task)).toEqual(['second task', 'scout', 'third task'])
})
