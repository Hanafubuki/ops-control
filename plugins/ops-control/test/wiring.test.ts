import { expect, mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { runOpsControl, fakeFs, test } from './kit.ts'

declare function setTimeout(fn: (value: unknown) => void, ms: number): unknown
const scroll = { offset: 0, bodyRows: 10 }

test('band is empty when idle, on terminal and desktop', { timeoutMs: 20000 }, async ($, on) => {
  fakeFs(on)
  mock.store(on)
  // the harness has no engine under the hooks: answer what the band asks of it
  on('ui.panes', async () => ({ value: [] }))
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine'] }) as RenderElement)
  await runOpsControl($, 'setup bar band')
  for (const surface of ['terminal', 'desktop'] as const) {
    const idle = await $.ui.mount({ plugin: 'ops-control', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll, view: {} } })
    expect(await idle.find({ text: /♥/ })).toBeUndefined()
    await idle.unmount()
  }
})

const BAND = { hasSurvey: false, isWorking: true, maxRows: 6, bodyColumns: 100, scroll, view: {} }

test('the band shows during a turn and folds after the linger', async ($, on) => {
  fakeFs(on)
  mock.store(on)
  const clock = mock.clock(on)
  on('ui.panes', async () => ({ value: [] }))
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine'] }) as RenderElement)
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: '' }))
  await runOpsControl($, 'setup bar band')
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ text: /♥/ })).toBeDefined()
  await $.turn.complete({ reason: 'answer', answer: 'done', durationMs: 10, isAborted: false, turnId: 't1' })
  // the linger is measured on Date.now (wall time), which mock.clock does not move
  await new Promise(r => setTimeout(r, 1550))
  await clock.advance(1700)
  await ui.unmount()
  const after = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, isWorking: false } })
  expect(await after.find({ text: /♥/ })).toBeUndefined()
  await after.unmount()
})

test('/clear starts the model over under the new session id', async ($, on) => {
  fakeFs(on)
  mock.store(on)
  let id = 's1'
  on('ui.panes', async () => ({ value: [] }))
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine'] }) as RenderElement)
  on('session.id', async () => ({ value: id }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  mock.clock(on)
  on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
  await runOpsControl($, 'setup bar band')
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const working = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await working.find({ text: /♥/ })).toBeDefined()
  await working.unmount()
  id = 's2'
  await $.session.end({ reason: 'clear', sessionId: 's1' } as never)
  const cleared = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await cleared.find({ text: /♥/ })).toBeUndefined()
  await cleared.unmount()
})

test('the work bar is over the prompt idle or working: the headline, then the context meter', async ($, on) => {
  fakeFs(on)
  on('ui.panes', async () => ({ value: [] }))
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine'] }) as RenderElement)
  on('session.id', async () => ({ value: 's1' }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  mock.clock(on)
  const idle = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, isWorking: false } })
  expect(await idle.find({ text: /Ready/ })).toBeDefined()
  expect(await idle.find({ text: /CONTEXT/ })).toBeDefined()
  // the engine's own row stays under it
  expect(await idle.find({ text: 'engine' })).toBeDefined()
  await idle.unmount()
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const working = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await working.find({ text: /Thinking/ })).toBeDefined()
  expect(await working.find({ text: /♥/ })).toBeUndefined()
  await working.unmount()
})

test('pane draws its tab buttons and opens on Plan', async ($, on) => {
  fakeFs(on)
  const ui = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'Pane', requestId: 'ops-control', props: { title: 'ops-control', isFocused: false, bodyColumns: 54, placement: 'dock', scroll, view: {} } })
  for (const label of ['Plan', 'Context', 'Agents', 'Diff', 'Music']) expect(await ui.find({ text: label })).toBeDefined()
  expect(await ui.find({ text: /PLAN/ })).toBeDefined()
  await ui.press({ key: 'tab-agents' })
  expect(await ui.find({ text: /AGENTS/ })).toBeDefined()
  await ui.unmount()
})

const AGENT_CALL = { tool: 'Agent', tool_use_id: 'a1', description: 'scout', prompt: 'look', subagent_type: 'Explore' }
const END = { answer: '', durationMs: 10, isAborted: false, turnId: 't1' }

test('the status entry shows only while Claude or a subagent works', async ($, on) => {
  fakeFs(on)
  const clock = mock.clock(on)
  const statuses: (string | undefined)[] = []
  on('ui.status', async (_$, e) => { statuses.push(e.text); return { value: undefined } as never })
  on('ui.panes', async () => ({ value: [] }))
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine'] }) as RenderElement)
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: '' }))
  on('tool.call', async () => ({ result: { status: 'async_launched' }, text: 'Async agent launched' }) as never)
  on('agent.spawn', async () => ({ model: 'm', agentId: 'ag-1' }))

  await $.turn.start({ text: 'hi', turnId: 't1' })
  expect(statuses.at(-1)).toContain('thinking')
  await $.tool.call(AGENT_CALL as never)
  await $.agent.spawn({ tool_use_id: 'a1', prompt: 'look', description: 'scout', subagentType: 'Explore', background: true } as never)
  await $.turn.complete({ ...END, reason: 'answer' })
  // the main turn is over; the background subagent is not
  expect(statuses.at(-1)).toBe('◆ delegating · ctx 10%')
  const band = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, isWorking: false } })
  expect(await band.find({ text: /1 subagent/ })).toBeDefined()
  await band.unmount()
  const ticks = statuses.length
  await clock.advance(3000)
  expect(statuses.length).toBeGreaterThanOrEqual(ticks + 3)

  await $.turn.complete({ ...END, turnId: 'sub', agentId: 'ag-1', reason: 'answer' })
  expect(statuses.at(-1)).toBeUndefined()
  const idle = statuses.length
  await clock.advance(3000)
  expect(statuses.length).toBe(idle)
})

test('a named teammate that goes idle stops counting as running', async ($, on) => {
  fakeFs(on)
  const clock = mock.clock(on)
  const statuses: (string | undefined)[] = []
  let status = 'running'
  on('ui.status', async (_$, e) => { statuses.push(e.text); return { value: undefined } as never })
  on('ui.panes', async () => ({ value: [] }))
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: '' }))
  on('tool.call', async () => ({ result: { status: 'teammate_spawned' }, text: 'Spawned' }) as never)
  on('agent.spawn', async () => ({ model: 'm', agentId: 'sleeper@s1' }))
  on('agent.list', async () => ({ value: [{ id: 'sleeper@s1', description: 'nap', type: 'general-purpose', status, name: 'sleeper' }] }) as never)

  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ ...AGENT_CALL, name: 'sleeper' } as never)
  await $.agent.spawn({ tool_use_id: 'a1', prompt: 'look', description: 'nap', subagentType: 'general-purpose', background: true, name: 'sleeper' } as never)
  await $.turn.complete({ ...END, reason: 'answer' })
  await clock.advance(2000)
  expect(statuses.at(-1)).toBe('◆ delegating · ctx 10%')
  // a teammate's loop raises no turn.complete; agent.list is where it shows as idle
  status = 'idle'
  await clock.advance(2000)
  expect(statuses.at(-1)).toBeUndefined()
})

test('the takeover keeps the status entry cleared', async ($, on) => {
  fakeFs(on)
  mock.clock(on)
  mock.store(on, { 'statusline-backup': '__none__' })
  const statuses: (string | undefined)[] = []
  on('ui.status', async (_$, e) => { statuses.push(e.text); return { value: undefined } as never })
  on('ui.panes', async () => ({ value: [] }))
  on('session.id', async () => ({ value: 's1' }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  await runOpsControl($, 'statusline nothing')
  await $.turn.start({ text: 'hi', turnId: 't1' })
  expect(statuses.length).toBeGreaterThan(0)
  expect(statuses.every(s => s === undefined)).toBe(true)
})

test('the status file uses the stored fields; the entry without a takeover is plain', async ($, on) => {
  const { files } = fakeFs(on, {}, undefined, { COLORTERM: 'truecolor' })
  const clock = mock.clock(on)
  mock.store(on, { 'statusline-backup': '__none__', statusline: ['ctx', 'nope'] })
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.panes', async () => ({ value: [] }))
  on('session.id', async () => ({ value: 's1' }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 }, rateLimits: [] } as never }))
  on('tool.call', async () => ({ result: {}, text: '' }) as never)
  on('turn.complete', async () => ({ text: '' }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('command.register', async () => ({ value: undefined }) as never)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Read', tool_use_id: 'u1', input: { file_path: '/x' } } as never)
  await $.turn.complete({ reason: 'answer', answer: 'done', durationMs: 10, isAborted: false, turnId: 't1' })
  await clock.advance(10)
  const line = files['/fake/.claude/ops-control/status/s1']!
  expect(line).toContain('ctx ')
  expect(line).toContain('\x1b[38;2;')
  expect(line).not.toContain('◆')
})

test('a / in the stored fields puts the takeover file on two lines', async ($, on) => {
  const { files } = fakeFs(on, {}, undefined, { COLORTERM: 'truecolor' })
  const clock = mock.clock(on)
  mock.store(on, { 'statusline-backup': '__none__', statusline: ['activity', '/', 'ctx'] })
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.panes', async () => ({ value: [] }))
  on('session.id', async () => ({ value: 's1' }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 }, rateLimits: [] } as never }))
  on('turn.complete', async () => ({ text: '' }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('command.register', async () => ({ value: undefined }) as never)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.turn.complete({ reason: 'answer', answer: 'done', durationMs: 10, isAborted: false, turnId: 't1' })
  await clock.advance(10)
  const rows = files['/fake/.claude/ops-control/status/s1']!.split('\n')
  expect(rows.length).toBe(2)
  expect(rows.at(-1)).toContain('ctx ')
})

test('without a takeover the entry under the prompt uses the fields and has no escapes', async ($, on) => {
  fakeFs(on, {}, undefined, { COLORTERM: 'truecolor' })
  mock.clock(on)
  mock.store(on, { statusline: ['activity', 'ctx'] })
  const statuses: (string | undefined)[] = []
  on('ui.status', async (_$, e) => { statuses.push(e.text); return { value: undefined } as never })
  on('ui.panes', async () => ({ value: [] }))
  on('session.id', async () => ({ value: 's1' }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('command.register', async () => ({ value: undefined }) as never)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const shown = statuses.filter((s): s is string => s !== undefined)
  expect(shown.length).toBeGreaterThan(0)
  expect(shown.every(s => !s.includes('\x1b'))).toBe(true)
})

test('without a takeover a / in the fields joins both halves on one line in the entry', async ($, on) => {
  fakeFs(on)
  const clock = mock.clock(on)
  mock.store(on, { statusline: ['activity', '/', 'ctx'] })
  const statuses: (string | undefined)[] = []
  on('ui.status', async (_$, e) => { statuses.push(e.text); return { value: undefined } as never })
  on('ui.panes', async () => ({ value: [] }))
  on('session.id', async () => ({ value: 's1' }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 }, rateLimits: [] } as never }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('command.register', async () => ({ value: undefined }) as never)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await clock.advance(10)
  const joined = statuses.filter((s): s is string => s !== undefined && s.includes(' · '))
  expect(joined.length).toBeGreaterThan(0)
  expect(joined.every(s => !s.includes('\n'))).toBe(true)
})

test('session.measure puts usage limits in the status file', async ($, on) => {
  const { files } = fakeFs(on)
  const clock = mock.clock(on)
  mock.store(on, { 'statusline-backup': '__none__', statusline: ['5h'] })
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.panes', async () => ({ value: [] }))
  on('session.id', async () => ({ value: 's1' }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.session.measure({ context: { window: 1000, percent: 10 }, rateLimits: [{ kind: 'five_hour', percentUsed: 42 }], changed: ['rateLimits'] } as never)
  await clock.advance(10)
  expect(files['/fake/.claude/ops-control/status/s1']).toContain('42%')
})

test('usage limits survive /clear; the status file keeps showing them', async ($, on) => {
  const { files } = fakeFs(on)
  const clock = mock.clock(on)
  mock.store(on, { 'statusline-backup': '__none__', statusline: ['5h'] })
  let id = 's1'
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.panes', async () => ({ value: [] }))
  on('session.id', async () => ({ value: id }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.session.measure({ context: { window: 1000, percent: 10 }, rateLimits: [{ kind: 'five_hour', percentUsed: 42 }], changed: ['rateLimits'] } as never)
  id = 's2'
  await $.session.end({ reason: 'clear', sessionId: 's1' } as never)
  await $.turn.start({ text: 'again', turnId: 't2' })
  await clock.advance(10)
  expect(files['/fake/.claude/ops-control/status/s2']).toContain('42%')
})

test('the heartbeat adopts the new session id after /clear, before any prompt', async ($, on) => {
  const { files } = fakeFs(on)
  const clock = mock.clock(on)
  mock.store(on, { 'statusline-backup': '__none__', statusline: ['5h'] })
  let id = 's1'
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.panes', async () => ({ value: [] }))
  on('session.id', async () => ({ value: id }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  await $.session.measure({ context: { window: 1000, percent: 10 }, rateLimits: [{ kind: 'five_hour', percentUsed: 42 }], changed: ['rateLimits'] } as never)
  // session.end still sees the ending id; the new one shows up later
  await $.session.end({ reason: 'clear', sessionId: 's1' } as never)
  id = 's2'
  await clock.advance(60_000)
  expect(files['/fake/.claude/ops-control/status/s2']).toContain('42%')
})

test('a heartbeat that races turn.start on the new id does not reset the live session', async ($, on) => {
  // holds the heartbeat inside recheckGuard: its first write registers the copy under s2
  let hold = false
  let release = () => {}
  const held = new Promise<void>(r => { release = r })
  const { files } = fakeFs(on, {}, undefined, {}, async path => {
    if (hold && path.includes('/ops-control/instances/s2.')) { hold = false; await held }
  })
  const clock = mock.clock(on)
  mock.store(on, { 'statusline-backup': '__none__', statusline: ['activity', '5h'] })
  let id = 's1'
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.panes', async () => ({ value: [] }))
  on('session.id', async () => ({ value: id }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  await $.session.measure({ context: { window: 1000, percent: 10 }, rateLimits: [{ kind: 'five_hour', percentUsed: 42 }], changed: ['rateLimits'] } as never)
  await $.session.end({ reason: 'clear', sessionId: 's1' } as never)
  id = 's2'
  hold = true
  const beat = clock.advance(60_000)
  await new Promise(r => setTimeout(r, 50))
  await $.turn.start({ text: 'hi', turnId: 't1' })
  release()
  await beat
  await clock.advance(60_000)
  const line = files['/fake/.claude/ops-control/status/s2']!
  expect(line).toContain('thinking')
  expect(line).toContain('42%')
})

test('session.start fills ctx and limits from usage, so a restarted module does not write a bare line', async ($, on) => {
  const { files } = fakeFs(on)
  const clock = mock.clock(on)
  mock.store(on, { 'statusline-backup': '__none__', statusline: ['ctx', '5h'] })
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.panes', async () => ({ value: [] }))
  on('session.id', async () => ({ value: 's1' }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 }, rateLimits: [{ kind: 'five_hour', percentUsed: 42 }] } as never }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  await clock.advance(60_000)
  const line = files['/fake/.claude/ops-control/status/s1']!
  expect(line).toContain('ctx ')
  expect(line).toContain('42%')
})

test('an entry whose fields render nothing is not pinned as an empty notice', async ($, on) => {
  fakeFs(on, {}, argv => { if (argv.includes('symbolic-ref')) return { exitCode: 128, stdout: '' } })
  mock.clock(on)
  mock.store(on, { statusline: ['branch'] })
  const statuses: (string | undefined)[] = []
  on('ui.status', async (_$, e) => { statuses.push(e.text); return { value: undefined } as never })
  on('ui.panes', async () => ({ value: [] }))
  on('session.id', async () => ({ value: 's1' }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('command.register', async () => ({ value: undefined }) as never)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  expect(statuses.length).toBeGreaterThan(0)
  expect(statuses).not.toContain('')
})

function branchRun(on: Parameters<typeof fakeFs>[0], picked: string[]) {
  const ran: string[] = []
  fakeFs(on, {}, argv => { ran.push(argv.join(' ')); if (argv.includes('symbolic-ref')) return { exitCode: 0, stdout: 'main\n' } })
  mock.clock(on)
  mock.store(on, { statusline: picked })
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.panes', async () => ({ value: [] }))
  on('session.id', async () => ({ value: 's1' }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('command.register', async () => ({ value: undefined }) as never)
  return ran
}

test('the branch is read only when the branch field is picked', async ($, on) => {
  const ran = branchRun(on, ['activity'])
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  expect(ran.some(r => r.includes('symbolic-ref'))).toBe(false)
})

test('the branch is read at session start when the branch field is picked', async ($, on) => {
  const ran = branchRun(on, ['branch'])
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  expect(ran.some(r => r.includes('symbolic-ref'))).toBe(true)
})

test('the Context tab reads the breakdown once, not on every redraw', async ($, on) => {
  fakeFs(on)
  const clock = mock.clock(on)
  let usageCalls = 0
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.panes', async () => ({ value: [] }))
  on('session.id', async () => ({ value: 's1' }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('session.usage', async () => {
    usageCalls++
    return { value: { context: { window: 1000, percent: 10, breakdown: { categories: [{ name: 'Messages', tokens: 400, kind: 'used' }], maxTokens: 1000 } } } as never }
  })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'Pane', requestId: 'ops-control', props: { title: 'ops-control', isFocused: false, bodyColumns: 54, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } })
  await ui.press({ key: 'tab-context' })
  await clock.advance(10)
  expect(await ui.find({ text: /messages/ })).toBeDefined()
  const after = usageCalls
  await clock.advance(3000)
  for (let i = 0; i < 3; i++) await ui.redraw()
  expect(await ui.find({ text: /messages/ })).toBeDefined()
  expect(usageCalls).toBe(after)
  await ui.unmount()
})

const TOOL = { tool_use_id: 'u1', tool: 'Write', input: {}, isRunning: false, isErrored: false, isInterrupted: false }

test('ToolUse rows get a glyph only when finished and of a known kind', async ($, on) => {
  fakeFs(on)
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine row'] }) as RenderElement)
  const draw = async (props: typeof TOOL) => {
    const ui = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'ToolUse', requestId: 'u1', props })
    const out = { row: await ui.find({ text: /engine row/ }), glyph: await ui.find({ text: /✎|▸/ }) }
    await ui.unmount()
    return out
  }
  const done = await draw(TOOL)
  expect(done.row).toBeDefined()
  expect(done.glyph).toBeDefined()
  for (const props of [{ ...TOOL, isRunning: true }, { ...TOOL, tool: 'mcp__x__y' }]) {
    const r = await draw(props)
    expect(r.row).toBeDefined()
    expect(r.glyph).toBeUndefined()
  }
})

test('tool events and ticks do not re-render a ToolUse row', async ($, on) => {
  fakeFs(on)
  const clock = mock.clock(on)
  mock.store(on)
  let toolRows = 0
  on('ui.render', async (_$, e) => { if (e.component === 'ToolUse') toolRows++; return { type: 'Text', props: {}, children: ['engine'] } as RenderElement })
  on('ui.panes', async () => ({ value: [] }))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('tool.call', async () => ({ result: {}, text: 'ok' }) as never)
  const row = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'ToolUse', requestId: 'u1', props: TOOL })
  const before = toolRows
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Read', tool_use_id: 'r1', file_path: '/a' } as never)
  await clock.advance(3000)
  expect(toolRows).toBe(before)
  await row.unmount()
})

// the harness has no engine under session.start: answer what the hook sets up
function bootable(on: Parameters<typeof fakeFs>[0]) {
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
}

test('the first interactive launch asks once and writes only under the config dir', async ($, on) => {
  const { files, writes } = fakeFs(on, { '/fake/.claude/settings.json': '{"model":"opus"}' })
  const clock = mock.clock(on)
  mock.store(on)
  bootable(on)
  const asked: string[] = []
  // $.ui.ask runs as an AskUserQuestion tool call; answer it with the Yes label.
  on('tool.call', async (_$, e) => {
    if (e.tool !== 'AskUserQuestion') return { result: {}, text: '' } as never
    const q = (e as unknown as { questions: { question: string }[] }).questions[0]!.question
    asked.push(q)
    return { result: { questions: [], answers: { [q]: 'Yes' } }, text: 'Yes' } as never
  })
  let toasted!: () => void
  const toast = new Promise<void>(r => { toasted = r })
  on('ui.toast', async () => { toasted(); return { value: undefined } as never })
  on('session.id', async () => ({ value: 's1' }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(1600)
  await toast
  expect(asked).toHaveLength(1)
  expect(JSON.parse(files['/fake/.claude/settings.json']!).statusLine.command).toContain('/fake/.claude/ops-control/statusline.sh')
  expect(writes.length).toBeGreaterThan(0)
  expect(writes.every(p => p.startsWith('/fake/'))).toBe(true)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(1600)
  expect(asked).toHaveLength(1)
})

test('two launches inside the delay open one dialog', async ($, on) => {
  fakeFs(on, { '/fake/.claude/settings.json': '{}' })
  const clock = mock.clock(on)
  mock.store(on)
  bootable(on)
  let asked = 0
  let release!: () => void
  const gate = new Promise<void>(r => { release = r })
  on('tool.call', async (_$, e) => {
    if (e.tool !== 'AskUserQuestion') return { result: {}, text: '' } as never
    asked++
    await gate
    return { result: { questions: [], answers: {} }, text: 'No' } as never
  })
  on('ui.toast', async () => ({ value: undefined }) as never)
  on('session.id', async () => ({ value: 's1' }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(1600)
  expect(asked).toBe(1)
  release()
})

test('-p runs never ask', async ($, on) => {
  fakeFs(on, { '/fake/.claude/settings.json': '{}' })
  const clock = mock.clock(on)
  mock.store(on)
  bootable(on)
  let asked = 0
  on('tool.call', async (_$, e) => { if (e.tool === 'AskUserQuestion') asked++; return { result: {}, text: '' } as never })
  on('session.id', async () => ({ value: 's1' }))
  await $.session.start({ cwd: '/r', surface: null, isInteractive: false })
  await clock.advance(5000)
  expect(asked).toBe(0)
})

test('a download that never answers times out after 10 s', async ($, on) => {
  fakeFs(on)
  const clock = mock.clock(on)
  mock.store(on)
  bootable(on)
  on('http.fetch', async () => new Promise(() => {}))
  on('ui.toast', async () => ({ value: undefined }) as never)
  on('session.id', async () => ({ value: 's1' }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  const out = runOpsControl($, 'theme add https://x.dev/slow.json')
  await clock.advance(10_000)
  expect(String((await out as { text?: string }).text)).toContain('timed out')
})

test('a download over 64 KB is refused before parsing', async ($, on) => {
  fakeFs(on)
  mock.clock(on)
  mock.store(on)
  bootable(on)
  on('http.fetch', async () => ({ value: { ok: true, status: 200, headers: {}, text: '{"name":"big","x":"' + 'a'.repeat(70_000) + '"}' } }) as never)
  on('session.id', async () => ({ value: 's1' }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  const out = await runOpsControl($, 'theme add https://x.dev/big.json') as { text?: string }
  expect(String(out.text)).toMatch(/64 KB|65536 bytes/)
})

test('the stored mix loads at session start; a bad layer toasts once', async ($, on) => {
  fakeFs(on, { '/fake/.claude/ops-control/packs/half.json': '{"format":1,"name":"half","colors":{"rows":5},"motion":"arcade"}' })
  mock.clock(on)
  mock.store(on, { mix: { colors: 'half', motion: 'half' } })
  bootable(on)
  const toasts: string[] = []
  on('ui.toast', async (_$, e) => { toasts.push(e.text); return { value: undefined } as never })
  on('session.id', async () => ({ value: 's1' }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  expect(toasts.filter(t => t.includes('rows'))).toHaveLength(1)
  expect((await runOpsControl($, 'pack list')).text).toContain('custom mix: colors half, motion half')
})

test('a stored pack with a skipped key loads without a toast: the notice is for the command that applied it', async ($, on) => {
  fakeFs(on, { '/fake/.claude/ops-control/packs/later.json': '{"format":1,"name":"later","colors":{"hologram":1}}' })
  mock.clock(on)
  mock.store(on, { mix: { colors: 'later', motion: 'later' } })
  bootable(on)
  const toasts: string[] = []
  on('ui.toast', async (_$, e) => { toasts.push(e.text); return { value: undefined } as never })
  on('session.id', async () => ({ value: 's1' }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  expect(toasts.filter(t => t.includes('hologram'))).toEqual([])
})

test('a stored setup from a later ops-control loads with a toast and never breaks session start', async ($, on) => {
  fakeFs(on)
  mock.clock(on)
  mock.store(on, { setup: { format: 2, band: ['plan', 'weather'] } })
  bootable(on)
  const toasts: string[] = []
  on('ui.toast', async (_$, e) => { toasts.push(e.text); return { value: undefined } as never })
  on('session.id', async () => ({ value: 's1' }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  expect(toasts.filter(t => t.includes('weather'))).toHaveLength(1)
  expect((await runOpsControl($, 'setup')).text).toContain('band           plan\n')
})

test('userConfig seeds the look',{ options: { pack: 'crt', theme: 'dusk', pet: 'off', bubbles: 'off' } }, async ($, on) => {
  fakeFs(on)
  mock.clock(on)
  mock.store(on, {})
  bootable(on)
  on('session.id', async () => ({ value: 's1' }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  expect((await runOpsControl($, 'pack list')).text).toContain('custom mix: colors crt, motion crt, theme dusk')
  expect((await runOpsControl($, 'pet list')).text).toContain('● off')
})

for (const [spinner, custom] of [['eyes', true], ['pack', false], ['nope', false]] as const) {
  test(`userConfig spinner "${spinner}" ${custom ? 'seeds the mix' : 'leaves the pack\'s own'}`, { options: { pack: 'crt', spinner } }, async ($, on) => {
    fakeFs(on)
    mock.clock(on)
    mock.store(on, {})
    bootable(on)
    on('session.id', async () => ({ value: 's1' }))
    await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
    const text = (await runOpsControl($, 'pack list')).text as string
    if (custom) expect(text).toContain('custom mix: colors crt, motion crt, spinner eyes')
    else expect(text).not.toContain('spinner')
  })
}

test('a stored spinner wins over userConfig spinner', { options: { pack: 'crt', spinner: 'eyes' } }, async ($, on) => {
  fakeFs(on)
  mock.clock(on)
  mock.store(on, { mix: { colors: 'crt', motion: 'crt', spinner: 'comet' } })
  bootable(on)
  on('session.id', async () => ({ value: 's1' }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  expect((await runOpsControl($, 'pack list')).text).toContain('spinner comet')
})

test('a stored mix and pet win over userConfig', { options: { pack: 'crt', pet: 'off' } }, async ($, on) => {
  fakeFs(on)
  mock.clock(on)
  mock.store(on, { mix: { colors: 'cozy', motion: 'cozy' }, pet: 'clawd' })
  bootable(on)
  on('session.id', async () => ({ value: 's1' }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  expect((await runOpsControl($, 'pack list')).text).toContain('● cozy')
  expect((await runOpsControl($, 'pet list')).text).toContain('● clawd\n')
})

test('the 100th passing test run unlocks the shiny pet', async ($, on) => {
  fakeFs(on)
  mock.clock(on)
  mock.store(on, { eggs: { passRuns: 99 } })
  const toasts: string[] = []
  on('ui.toast', async (_$, e) => { toasts.push(e.text); return { value: undefined } as never })
  on('ui.status', async () => ({ value: undefined }) as never)
  on('session.id', async () => ({ value: 's1' }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('tool.call', async () => ({ result: {}, text: 'Tests: 12 passed' }) as never)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'npm test' } as never)
  expect(toasts.some(t => t.includes('Clawd went shiny'))).toBe(true)
  // the command reads the stored shinyAt, so this proves the write landed
  expect((await runOpsControl($, 'pet clawd-shiny')).text).toBe('Pet: clawd-shiny')
})

test('a subagent test run does not count toward the shiny pet', async ($, on) => {
  fakeFs(on)
  mock.clock(on)
  mock.store(on, { eggs: { passRuns: 99 } })
  on('ui.toast', async () => ({ value: undefined }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
  on('session.id', async () => ({ value: 's1' }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('tool.call', async () => ({ result: {}, text: 'Tests: 12 passed' }) as never)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'npm test', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b2', command: 'npm test' } as never)
  // the subagent run did not count, so only this one is the 100th
  expect((await runOpsControl($, 'pet clawd-shiny')).text).toBe('Pet: clawd-shiny')
})

test('shiny from userConfig or the store applies only once earned', { options: { pet: 'clawd-shiny' } }, async ($, on) => {
  fakeFs(on)
  mock.clock(on)
  mock.store(on, {})
  bootable(on)
  on('session.id', async () => ({ value: 's1' }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  expect((await runOpsControl($, 'pet list')).text).toContain('● clawd\n')
})

test('a main-loop step sets the effort field; a subagent step leaves it; a numeric effort shows as given; a step without one clears it', async ($, on) => {
  fakeFs(on)
  mock.clock(on)
  const statuses: (string | undefined)[] = []
  on('ui.status', async (_$, e) => { statuses.push(e.text); return { value: undefined } as never })
  on('ui.panes', async () => ({ value: [] }))
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* (_$, e) { return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as never })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  expect(statuses.at(-1)).not.toContain('◐')
  // a stream does nothing until read
  const step = async (index: number, extra: object) => {
    for await (const _ of $.turn.step({ turnId: 't1', index, model: 'claude-opus-5-5', messageCount: index + 1, ...extra } as never)) void _
  }
  await step(0, { effort: 'high' })
  expect(statuses.at(-1)).toContain('◐ high')
  await step(1, { effort: 'low', agentId: 'a1' })
  expect(statuses.at(-1)).toContain('◐ high')
  await step(2, { effort: 8000 })
  expect(statuses.at(-1)).toContain('◐ 8000')
  await step(3, {})
  expect(statuses.at(-1)).not.toContain('◐')
})
