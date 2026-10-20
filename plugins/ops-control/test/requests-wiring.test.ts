import { expect, mock } from 'claude-code/testing'
import { fakeFs, test } from './kit.ts'

const PANE = { plugin: 'ops-control', surface: 'terminal', component: 'Pane', requestId: 'ops-control', props: { title: 'ops-control', isFocused: false, bodyColumns: 72, placement: 'dock', scroll: { offset: 0, bodyRows: 120 }, view: {} } } as const
const FILE = '/fake/.claude/ops-control/requests/s1.json'

function boot(on: Parameters<typeof fakeFs>[0], files: Record<string, string> = {}) {
  const fs = fakeFs(on, files)
  mock.store(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.panes', async () => ({ value: [] }))
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: '' }) as never)
  // a command naming fail fails, as a non-zero exit does
  on('tool.call', async (_$, e) => (String((e as { command?: unknown }).command).includes('fail') ? { result: {}, text: 'Exit code 1\nboom', isError: true } : { result: {}, text: 'ok' }) as never)
  on('prompt.submit', async (_$, e) => { contexts.push(e.context); return { text: e.text } as never })
  on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
  return fs
}
// what each prompt carried beside its text, as the engine got it
const contexts: (readonly string[] | undefined)[] = []
const say = ($: any, text: string, origin: object = { kind: 'composer' }) => $.prompt.submit({ text, origin, wait: false })
const start = async ($: any, on: any, files: Record<string, string> = {}) => {
  const fs = boot(on, files)
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/fake/proj', surface: 'terminal', isInteractive: true })
  await clock.advance(10)
  return { ...fs, clock }
}
const shows = async (ui: any, text: RegExp) => (await ui.find({ text })) !== undefined

test('each prompt is a row in PLAN; pressing it opens the request in full, with its milestones, answer and follow-ups', async ($, on) => {
  const { clock, files } = await start($, on)
  await say($, 'fix the login bug')
  await $.turn.start({ text: 'fix the login bug', turnId: 't1' })
  await $.tool.call({ tool: 'mcp__project-sentinel__milestones', tool_use_id: 'm1', objective: 'Fix the login', milestones: [{ title: 'Find the bug', status: 'completed', evidence: 'repro in a test' }, { title: 'Patch it', status: 'in_progress', doing: 'Editing auth.ts' }, { title: 'Ship it', status: 'blocked', blocker: 'needs your deploy key' }] } as never)
  await $.tool.call({ tool: 'Edit', tool_use_id: 'e1', file_path: '/fake/proj/src/auth.ts', old_string: 'a', new_string: 'b\nc' } as never)
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'npm test' } as never)
  await clock.advance(1100)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-plan' })
  // the row: the prompt, the milestones done of all, and a Button over it
  const row = await ui.find({ type: 'Button', text: /#1 fix the login bug/ })
  expect(row).toBeDefined()
  expect(await shows(ui, /1\/3 · /)).toBe(true)
  await $.turn.complete({ reason: 'answer', answer: 'Fixed the token refresh in `auth.ts`.\n\nShould I also add a regression test?', durationMs: 4000, isAborted: false, turnId: 't1' })
  await clock.advance(1100)
  await ui.redraw()
  await ui.press({ key: row!.key! })
  expect(await shows(ui, /REQUEST #1/)).toBe(true)
  for (const words of [/Status/, /Objective/, /Fix the login/, /milestone 2 of 3/, /Editing auth\.ts/, /Milestones · 1\/3 done/, /What was done/, /Fixed the token refresh in auth\.ts\./, /For you/, /Should I also add a regression test\?/, /Action items/, /needs your deploy key/, /src\/auth\.ts/])
    expect(await shows(ui, words), String(words)).toBe(true)
  // the commands are counted, not listed
  expect(await shows(ui, /\$ 1 command/)).toBe(true)
  expect(await shows(ui, /\$ npm test/)).toBe(false)
  // the tab's own button, or Back, is the list again
  await ui.press({ key: 'req-back' })
  expect(await shows(ui, /REQUEST #1/)).toBe(false)
  expect(await shows(ui, /PLAN/)).toBe(true)
  // the list is on disk for a resume
  await clock.advance(1100)
  const kept = JSON.parse(files[FILE]!)
  expect(kept.list[0]).toMatchObject({ n: 1, text: 'fix the login bug', status: 'completed', objective: 'Fix the login', followUps: { questions: ['Should I also add a regression test?'] } })
  await ui.unmount()
})

test('only what the person sends is a request; a later prompt is the newest row on top', async ($, on) => {
  const { clock } = await start($, on)
  await say($, 'from a notification', { kind: 'task-notification' })
  await say($, 'from a schedule', { kind: 'scheduled-trigger' })
  await say($, 'first ask')
  await $.turn.start({ text: 'first ask', turnId: 't1' })
  await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 10, isAborted: false, turnId: 't1' })
  await say($, 'second ask')
  await $.turn.start({ text: 'second ask', turnId: 't2' })
  await clock.advance(1100)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-plan' })
  // each row is its mark, its number and its prompt
  const rows = await ui.findAll({ type: 'Button', text: /^. #\d/ })
  expect(rows.map(r => /#\d [a-z ]+/.exec(String(r.text))?.[0].trim())).toEqual(['#2 second ask', '#1 first ask'])
  expect(String(rows[0]!.text)).toMatch(/^◉ #2/)
  expect(String(rows[1]!.text)).toMatch(/^✓ #1/)
  expect(await shows(ui, /notification|schedule/)).toBe(false)
  expect(await shows(ui, /1\/2/)).toBe(true)
  await ui.unmount()
})

test('the session\'s end writes its requests at once, not a second later', async ($, on) => {
  const { files } = await start($, on)
  await say($, 'quick one')
  await $.turn.start({ text: 'quick one', turnId: 't1' })
  await $.turn.complete({ reason: 'answer', answer: 'Done.', durationMs: 10, isAborted: false, turnId: 't1' })
  expect(files[FILE]).toBeUndefined()
  await $.session.end({ reason: 'exit', sessionId: 's1' } as never)
  expect(JSON.parse(files[FILE]!).list[0]).toMatchObject({ text: 'quick one', status: 'completed' })
})

test('a prompt no turn came of is dropped after a beat', async ($, on) => {
  const { clock } = await start($, on)
  await say($, 'swallowed')
  await clock.advance(2100)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-plan' })
  expect(await shows(ui, /swallowed/)).toBe(false)
  expect(await shows(ui, /No requests yet\./)).toBe(true)
  await ui.unmount()
})

test('a resumed session reads its requests back; one left running was cut off', async ($, on) => {
  const saved = { format: 1, seq: 2, list: [
    { id: 'r1-0', n: 1, text: 'old finished', status: 'completed', at: 0, turnIds: ['t'], turns: [{ answer: 'All done.', reason: 'answer', durationMs: 65000, endedAt: 1 }], files: [], commands: [], commandCount: 0, commits: 0, agents: [], tasks: [], tools: 3, milestones: [], asked: [] },
    { id: 'r2-1', n: 2, text: 'old running', status: 'in_progress', at: 1, turnIds: ['t2'], turns: [], files: [], commands: [], commandCount: 0, commits: 0, agents: [], tasks: [], tools: 0, milestones: [], asked: [] },
  ] }
  await start($, on, { [FILE]: JSON.stringify(saved) })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-plan' })
  expect(await shows(ui, /#1 old finished/)).toBe(true)
  expect(await shows(ui, /1m 05s/)).toBe(true)
  const running = await ui.find({ type: 'Button', text: /#2 old running/ })
  await ui.press({ key: running!.key! })
  expect(await shows(ui, /interrupted/)).toBe(true)
  await ui.unmount()
})

test('the Context tab holds the context box; the Plan tab holds none of it', async ($, on) => {
  await start($, on)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-plan' })
  expect(await shows(ui, /CONTEXT/)).toBe(false)
  expect(await ui.find({ type: 'Button', key: 'tab-context' })).toMatchObject({ props: { label: 'Context', hotkey: '2' } })
  expect(await ui.find({ type: 'Button', key: 'tab-plan' })).toMatchObject({ props: { label: 'Plan', hotkey: '1' } })
  await ui.press({ key: 'tab-context' })
  expect(await shows(ui, /CONTEXT/)).toBe(true)
  expect(await shows(ui, /PLAN/)).toBe(false)
  await ui.unmount()
})

test('a prompt the running turn took in shows that turn\'s milestones and objective, named as the other request\'s', async ($, on) => {
  const base = { turns: [{ answer: 'Both done.', reason: 'answer', durationMs: 1000, endedAt: 2 }], files: [], commands: [], commandCount: 0, commits: 0, agents: [], tasks: [], tools: 0, asked: [] }
  const saved = { format: 1, seq: 2, list: [
    { ...base, id: 'r1-0', n: 1, text: 'build the report', status: 'completed', at: 0, turnIds: ['t1'], objective: 'Build the weekly report', milestonesFrom: 'milestones', milestones: [{ title: 'Gather the numbers', status: 'completed' }, { title: 'Write it up', status: 'completed' }] },
    { ...base, id: 'r2-1', n: 2, text: 'and add a chart', status: 'completed', at: 1, turnIds: ['t1'], queuedIn: 't1', foldedInto: 'r1-0', milestones: [] },
  ] }
  await start($, on, { [FILE]: JSON.stringify(saved) })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-plan' })
  // the row counts the other request's milestones too
  const row = await ui.find({ type: 'Button', text: /#2 and add a chart/ })
  expect(String(row!.text)).toMatch(/2\/2 · /)
  await ui.press({ key: row!.key! })
  for (const words of [/Sent while #1 ran/, /Build the weekly report/, /Milestones \(from #1\) · 2\/2 done/, /Write it up/])
    expect(await shows(ui, words), String(words)).toBe(true)
  expect(await shows(ui, /None were reported/)).toBe(false)
  await ui.unmount()
})

test('a session ops-control did not see from its start reads its earlier requests back from the transcript, once', async ($, on) => {
  const at = (s: number) => new Date(Date.UTC(2026, 9, 20, 9, 0, s)).toISOString()
  const transcript = [
    { type: 'user', timestamp: at(0), origin: { kind: 'human' }, message: { content: 'set up the repo' } },
    { type: 'assistant', timestamp: at(5), message: { content: [{ type: 'text', text: 'The repo is set up.' }] } },
    { type: 'system', subtype: 'turn_duration', timestamp: at(5), durationMs: 65_000 },
    { type: 'user', timestamp: at(9), origin: { kind: 'human' }, message: { content: '<command-name>/reload-plugins</command-name>' } },
  ].map(o => JSON.stringify(o)).join('\n')
  const TRANSCRIPT = '/fake/.claude/projects/-fake-proj/s1.jsonl'
  const { clock, files } = await start($, on, { [TRANSCRIPT]: transcript })
  await clock.advance(1100)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-plan' })
  const row = await ui.find({ type: 'Button', text: /#1 set up the repo/ })
  expect(String(row!.text)).toMatch(/1m 05s/)
  expect(await shows(ui, /reload-plugins/)).toBe(false)
  // the next prompt numbers after it, and the list on disk says the transcript was read
  await say($, 'now add tests')
  await $.turn.start({ text: 'now add tests', turnId: 't1' })
  await clock.advance(1100)
  await ui.redraw()
  expect(await shows(ui, /#2 now add tests/)).toBe(true)
  expect(JSON.parse(files[FILE]!)).toMatchObject({ filled: true, list: [{ n: 1, text: 'set up the repo' }, { n: 2, text: 'now add tests' }] })
  await ui.unmount()
})

test('ops-control offers its milestones tool when no other plugin does; a call answers, files under the request and draws the bar', async ($, on) => {
  const registered: string[] = []
  on('tool.list', async () => ({ value: [] }) as never)
  on('tool.register', async (_$, e) => { registered.push((e as { name: string }).name); return { value: { tool: `mcp__ops-control__${(e as { name: string }).name}` } } as never })
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine'] }) as never)
  contexts.length = 0
  const { clock } = await start($, on)
  expect(registered).toContain('milestones')
  await say($, 'build the report')
  await $.turn.start({ text: 'build the report', turnId: 't1' })
  const r = await $.tool.call({ tool: 'mcp__ops-control__milestones', tool_use_id: 'm1', objective: 'Build the report', milestones: [{ title: 'Gather', status: 'completed' }, { title: 'Write', status: 'in_progress', doing: 'Writing the summary' }] } as never)
  expect((r as { result?: unknown }).result).toBe('Recorded: 1 of 2 milestones done, now: Write.')
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'make report' } as never)
  await clock.advance(1100)
  const bar = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: true, maxRows: 6, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} } })
  for (const words of [/Writing the summary/, /step 2 of 2/, /WORK/, /1\/2/, /CONTEXT/]) expect(await shows(bar, words), String(words)).toBe(true)
  await bar.unmount()
  // the policy rides on the first prompt only, while the tool is offered
  await say($, 'and the chart')
  expect(String(contexts[0])).toContain('`mcp__ops-control__milestones`')
  expect(contexts[1]).toBeUndefined()
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-plan' })
  const row = await ui.find({ type: 'Button', text: /#1 build the report/ })
  await ui.press({ key: row!.key! })
  expect(await shows(ui, /Milestones · 1\/2 done/)).toBe(true)
  expect(await shows(ui, /None: no call failed or was refused\./)).toBe(true)
  await ui.unmount()
})

test('a request\'s summary lists its open issues and the ones fixed later', async ($, on) => {
  const { clock } = await start($, on)
  await say($, 'deploy it')
  await $.turn.start({ text: 'deploy it', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'make fail' } as never)
  await clock.advance(1100)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-plan' })
  const row = await ui.find({ type: 'Button', text: /#1 deploy it/ })
  expect(String(row!.text)).toMatch(/▲1/)
  await ui.press({ key: row!.key! })
  for (const words of [/▲ 1 issue/, /Issues · 1 open/, /Failed: Running make fail/, /Exit code 1/]) expect(await shows(ui, words), String(words)).toBe(true)
  await ui.unmount()
})

test('a subagent is told about the milestones tool; its context, milestones and work bar are its own', async ($, on) => {
  on('tool.list', async () => ({ value: [] }) as never)
  on('tool.register', async (_$, e) => ({ value: { tool: `mcp__ops-control__${(e as { name: string }).name}` } }) as never)
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine'] }) as never)
  const spawned: string[] = []
  on('agent.spawn', async (_$, e) => { spawned.push(e.prompt); return { model: 'm', agentId: 'ag-1' } as never })
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use', usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 50, cache_creation_input_tokens: 50, model: 'm' } } as never
  })
  const { clock } = await start($, on)
  await say($, 'scout it')
  await $.turn.start({ text: 'scout it', turnId: 't1' })
  await $.agent.spawn({ tool_use_id: 'a1', prompt: 'look', description: 'scout', subagentType: 'Explore', background: true } as never)
  expect(spawned[0]).toMatch(/^look\n\n## Work progress\n/)
  for await (const _ of $.turn.step({ turnId: 's1', index: 0, model: 'm', messageCount: 1, agentId: 'ag-1' } as never)) { /* drained */ }
  await $.tool.call({ tool: 'mcp__ops-control__milestones', tool_use_id: 'm1', agentId: 'ag-1', objective: 'Scout', milestones: [{ title: 'Look', status: 'in_progress', doing: 'Looking around' }] } as never)
  await clock.advance(1100)
  const props = { hasSurvey: false, isWorking: true, maxRows: 6, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 } }
  const sub = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'AbovePrompt', props: { ...props, view: { agentId: 'ag-1' } } })
  for (const words of [/Looking around/, /step 1 of 1/, /WORK/, /CONTEXT/, /─{20}/]) expect(await shows(sub, words), String(words)).toBe(true)
  await sub.unmount()
  // the main session's bar keeps the main session's work
  const main = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'AbovePrompt', props: { ...props, view: {} } })
  expect(await shows(main, /Looking around/)).toBe(false)
  expect(await shows(main, /─{20}/)).toBe(true)
  await main.unmount()
  // the Agents tab's detail view for the subagent
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-agents' })
  const row = await ui.find({ type: 'Button', text: /scout|Explore/ })
  await ui.press({ key: row!.key! })
  for (const words of [/Milestones · 0\/1 done/, /Context/]) expect(await shows(ui, words), String(words)).toBe(true)
  await ui.unmount()
})
