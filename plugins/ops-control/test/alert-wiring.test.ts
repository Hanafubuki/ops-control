import { expect, mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { fakeFs, test } from './kit.ts'

const ENGINE_ROW = { type: 'Text', props: {}, children: ['engine row'] } as RenderElement
const scroll = { offset: 0, bodyRows: 20 }
const paneProps = (view: object = {}) => ({ title: 'ops-control', isFocused: false, bodyColumns: 60, placement: 'dock', scroll, view }) as never
const walk = (n: any, out: any[] = []): any[] => { if (typeof n === 'string') out.push(n); else if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }
const petInput = async ($: any, view: object = {}) => {
  const pane = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'Pane', requestId: 'ops-control', props: paneProps(view) })
  const c = walk(await pane.drawn()).find(n => n?.type === 'Client' && String(n.props?.module).endsWith('client/pet.tsx'))
  await pane.unmount()
  return c.props.props.input as { working: boolean; kind?: string; needsYou: boolean }
}

// A tool call held open, as one is while its permission question waits for the person.
// One tool.call handler per test: a second registration would not replace the first.
let armed: { release: () => void; inside: Promise<void>; enter: () => void; gate: Promise<void> }
function arm() {
  let release = () => {}, enter = () => {}
  const gate = new Promise<void>(r => { release = r })
  const inside = new Promise<void>(r => { enter = r })
  armed = { release, inside, enter, gate }
  return armed
}

function base(on: any, permissionAnswer: object = {}) {
  fakeFs(on); mock.store(on); mock.clock(on)
  on('ui.render', async () => ENGINE_ROW)
  on('ui.panes', async () => ({ value: [{ id: 'ops-control', isShown: true, isPlaced: true }] }))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async () => ({ value: undefined }) as never)
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$: unknown, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: '' }))
  on('classic.PermissionRequest', async () => permissionAnswer as never)
  on('tool.check', async () => ({ decision: 'ask' }) as never)
}
const holdCalls = (on: any) => on('tool.call', async () => { armed.enter(); await armed.gate; return { result: {}, text: 'ok' } as never })

const BASH = { tool: 'Bash', tool_use_id: 'b1', command: 'rm -rf build' }
const ASK = { tool_name: 'Bash', tool_input: { command: 'rm -rf build' } }

async function needsYouWhen($: any, fire: () => Promise<unknown>, extra: object = {}) {
  const h = arm()
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const call = $.tool.call({ ...BASH, ...extra } as never)
  await h.inside
  await fire()
  const input = await petInput($)
  h.release(); await call
  return input.needsYou
}

test('a permission dialog that opens in a prompting mode raises the alert', async ($, on) => {
  base(on); holdCalls(on)
  for (const mode of ['default', 'acceptEdits', 'plan']) {
    expect(await needsYouWhen($, () => $.classic.PermissionRequest({ ...ASK, permission_mode: mode } as never)), mode).toBe(true)
  }
})

test('a lower hook that decides the request means no dialog opens, so no alert', async ($, on) => {
  base(on, { decision: { behavior: 'allow' } }); holdCalls(on)
  expect(await needsYouWhen($, () => $.classic.PermissionRequest({ ...ASK, permission_mode: 'default' } as never))).toBe(false)
})

test('the mode decider answering an ask is not a person being asked', async ($, on) => {
  base(on); holdCalls(on)
  // tool.check says ask for every call a mode decides, the auto classifier's among them
  expect(await needsYouWhen($, () => $.tool.check({ tool: 'Bash', input: { command: 'rm -rf build' }, tool_use_id: 'b1' } as never))).toBe(false)
})

test('no dialog, no alert: auto, bypass, dontAsk and an unknown mode stay quiet', async ($, on) => {
  base(on); holdCalls(on)
  for (const mode of ['auto', 'bypassPermissions', 'dontAsk', undefined]) {
    expect(await needsYouWhen($, () => $.classic.PermissionRequest({ ...ASK, permission_mode: mode } as never)), String(mode)).toBe(false)
  }
})

test('a subagent call decided in auto mode stays quiet, and one that opens a dialog alerts', async ($, on) => {
  base(on); holdCalls(on)
  expect(await needsYouWhen($, () => $.classic.PermissionRequest({ ...ASK, permission_mode: 'auto', agent_id: 'ag-1' } as never), { agentId: 'ag-1' })).toBe(false)
  expect(await needsYouWhen($, () => $.classic.PermissionRequest({ ...ASK, permission_mode: 'default', agent_id: 'ag-1' } as never), { agentId: 'ag-1' })).toBe(true)
})

test('a dialog for a call ops-control never saw raises nothing', async ($, on) => {
  base(on); holdCalls(on)
  expect(await needsYouWhen($, () => $.classic.PermissionRequest({ tool_name: 'Edit', tool_input: { file_path: '/a' }, permission_mode: 'default' } as never))).toBe(false)
})

test('the alert ends with the call it was raised for', async ($, on) => {
  base(on); holdCalls(on)
  const h = arm()
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const call = $.tool.call(BASH as never)
  await h.inside
  await $.classic.PermissionRequest({ ...ASK, permission_mode: 'default' } as never)
  expect((await petInput($)).needsYou).toBe(true)
  h.release(); await call
  expect((await petInput($)).needsYou).toBe(false)
})

test('Clawd keeps working while a background subagent runs after the main turn ends', async ($, on) => {
  base(on)
  on('tool.call', async () => ({ result: { status: 'async_launched' }, text: 'launched' }) as never)
  on('agent.spawn', async () => ({ model: 'm', agentId: 'ag-1' }))
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', description: 'scout', prompt: 'look', subagent_type: 'Explore' } as never)
  await $.agent.spawn({ tool_use_id: 'a1', prompt: 'look', description: 'scout', subagentType: 'Explore', background: true } as never)
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 10, isAborted: false, turnId: 't1' })
  for (const view of [{}, { agentId: 'ag-1' }]) {
    const input = await petInput($, view)
    expect(input.working).toBe(true)
    expect(input.kind).toBe('agent')
  }
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 10, isAborted: false, turnId: 'sub', agentId: 'ag-1' } as never)
  expect((await petInput($)).working).toBe(false)
})
