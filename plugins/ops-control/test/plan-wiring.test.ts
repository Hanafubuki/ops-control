import { test, expect, mock } from 'claude-code/testing'
import { fakeFs } from './kit.ts'

const task = (id: string, subject: string, status: string) => JSON.stringify({ id, subject, status, description: '', blocks: [], blockedBy: [] })
const PANE = { plugin: 'ops-control', surface: 'terminal', component: 'Pane', requestId: 'ops-control', props: { title: 'ops-control', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } } as const

function boot(on: Parameters<typeof fakeFs>[0]) {
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.panes', async () => ({ value: [] }))
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('tool.call', async () => ({ result: {}, text: 'ok' }) as never)
}

test('the plan loads the saved task list at start and reads it again after TaskUpdate', { timeoutMs: 20000 }, async ($, on) => {
  const dir = '/fake/.claude/tasks/fake-proj'
  const { files } = fakeFs(on, { [`${dir}/1.json`]: task('1', 'Saved from before', 'pending'), [`${dir}/2.json`]: '{oops' })
  const clock = mock.clock(on)
  mock.store(on)
  boot(on)
  await $.session.start({ cwd: '/fake/proj', surface: 'terminal', isInteractive: false })
  await clock.advance(10)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-plan' })
  expect(await ui.find({ text: /Saved from before/ })).toBeDefined()
  files[`${dir}/1.json`] = task('1', 'Renamed on disk', 'in_progress')
  await $.tool.call({ tool: 'TaskUpdate', tool_use_id: 'u1', taskId: '1', status: 'in_progress' } as never)
  await clock.advance(400)
  await ui.redraw()
  expect(await ui.find({ text: /Renamed on disk/ })).toBeDefined()
  await ui.unmount()
})

test('a finished plan folds at the next prompt and opens when the list changes', { timeoutMs: 20000 }, async ($, on) => {
  const dir = '/fake/.claude/tasks/fake-proj'
  const { files } = fakeFs(on, { [`${dir}/1.json`]: task('1', 'Alpha', 'completed'), [`${dir}/2.json`]: task('2', 'Beta', 'completed') })
  const clock = mock.clock(on)
  mock.store(on)
  boot(on)
  await $.session.start({ cwd: '/fake/proj', surface: 'terminal', isInteractive: false })
  await clock.advance(10)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-plan' })
  expect(await ui.find({ text: /Alpha/ })).toBeDefined()
  await $.turn.start({ text: 'next', turnId: 't2' })
  await ui.redraw()
  expect(await ui.find({ text: /Alpha/ })).toBeUndefined()
  expect(await ui.find({ text: '✓ plan done · 2 tasks' })).toBeDefined()
  files[`${dir}/3.json`] = task('3', 'Gamma', 'pending')
  await $.tool.call({ tool: 'TaskCreate', tool_use_id: 'u3', subject: 'Gamma' } as never)
  await clock.advance(400)
  await ui.redraw()
  expect(await ui.find({ text: /plan done/ })).toBeUndefined()
  expect(await ui.find({ text: /Gamma/ })).toBeDefined()
  await ui.unmount()
})

test('the engine\'s scroll moves the tab\'s own window and leaves the pet drawn', { timeoutMs: 20000 }, async ($, on) => {
  const dir = '/fake/.claude/tasks/fake-proj'
  const many = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`${dir}/${i + 1}.json`, task(String(i + 1), `step ${i + 1}`, 'pending')]))
  fakeFs(on, many)
  const clock = mock.clock(on)
  mock.store(on)
  boot(on)
  await $.session.start({ cwd: '/fake/proj', surface: 'terminal', isInteractive: false })
  await clock.advance(10)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, scroll: { offset: 0, bodyRows: 24 } } })
  await ui.press({ key: 'tab-plan' })
  const shows = async (n: number) => (await ui.find({ type: 'Text', text: new RegExp(`^step ${n}$`) })) !== undefined
  const scroll = async (by: number, origin: object = { kind: 'person' }) => {
    const r = await $.ui.scroll({ component: 'Pane', requestId: 'ops-control', offset: by, by, bodyRows: 24, contentRows: 24, origin } as never)
    await ui.redraw()
    return r
  }
  expect(await shows(1)).toBe(true)
  expect(await scroll(3)).toEqual({})
  expect([await shows(1), await shows(3), await shows(4)]).toEqual([false, false, true])
  expect(await ui.find({ key: 'ops-control-pet' })).toBeDefined()
  const plugin = { kind: 'plugin', name: 'other' }
  await scroll(1000, plugin)
  expect(await shows(60)).toBe(true)
  expect(await ui.find({ type: 'Text', text: /^↓ \d+ more$/ })).toBeUndefined()
  await scroll(-1)
  expect([await shows(59), await shows(60)]).toEqual([true, false])
  await scroll(-1000, plugin)
  expect(await shows(1)).toBe(true)
  expect(await ui.find({ type: 'Text', text: /^↑ \d+ more$/ })).toBeUndefined()
  // a key's page-sized move (← and → are bound to it in the pane) steps the tab instead of paging
  await scroll(24)
  expect(await ui.find({ type: 'Text', text: /^step 1$/ })).toBeUndefined()
  await scroll(-24)
  expect(await shows(1)).toBe(true)
  // the wheel, which says where it is, still scrolls
  const r = await $.ui.scroll({ component: 'Pane', requestId: 'ops-control', offset: 3, by: 3, bodyRows: 24, contentRows: 24, origin: { kind: 'person' }, pointer: { column: 1, row: 1 } } as never)
  await ui.redraw()
  expect(r).toEqual({})
  expect(await shows(4)).toBe(true)
  await ui.unmount()
})

test('CLAUDE_CODE_TASK_LIST_ID picks the list, and a subagent TaskUpdate does not reload', { timeoutMs: 20000 }, async ($, on) => {
  const dir = '/fake/.claude/tasks/mine'
  const { files } = fakeFs(on, { [`${dir}/1.json`]: task('1', 'From the named list', 'pending') }, undefined, { CLAUDE_CODE_TASK_LIST_ID: 'mine' })
  const clock = mock.clock(on)
  mock.store(on)
  boot(on)
  await $.session.start({ cwd: '/elsewhere', surface: 'terminal', isInteractive: false })
  await clock.advance(10)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-plan' })
  expect(await ui.find({ text: /From the named list/ })).toBeDefined()
  files[`${dir}/1.json`] = task('1', 'Changed by a subagent', 'pending')
  await $.tool.call({ tool: 'TaskUpdate', tool_use_id: 'u2', agentId: 'sub', taskId: '1', status: 'pending' } as never)
  await clock.advance(400)
  await ui.redraw()
  expect(await ui.find({ text: /Changed by a subagent/ })).toBeUndefined()
  await ui.unmount()
})
