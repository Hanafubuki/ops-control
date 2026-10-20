import { expect, mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { runOpsControl, fakeFs, test, anyLine } from './kit.ts'
import { BUILTIN_LINES } from '../hooks/lines.ts'

const ENGINE_ROW = { type: 'Text', props: {}, children: ['engine row'] } as RenderElement
const scroll = { offset: 0, bodyRows: 20 }
const PANE = { title: 'ops-control', isFocused: false, bodyColumns: 60, placement: 'dock', scroll, view: {} } as never
const walk = (n: any, out: any[] = []): any[] => { if (typeof n === 'string') out.push(n); else if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }
const text = (tree: any) => walk(tree).filter(n => typeof n === 'string').join(' ')
const FAIL_SAY = anyLine(BUILTIN_LINES.clawd, 'fail', { n: '3' })

type Model = (req: any) => Promise<any>
const answer = (t: string) => ({ isAnswered: true, text: t, usage: {} })

function rig(on: any, model: Model, opts: { interactive?: boolean } = {}) {
  const prompts: any[] = []
  // a test sets hold.panes to freeze say() at its panes check, and hold.tool to freeze a HANG tool call
  const hold: { panes?: Promise<void>; tool?: Promise<void> } = {}
  fakeFs(on, {})
  mock.store(on)
  on('ui.render', async () => ENGINE_ROW)
  on('ui.panes', async () => { await hold.panes; return { value: [{ id: 'ops-control', isShown: true, isPlaced: true }] } })
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async () => ({ value: undefined }) as never)
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$: unknown, e: any) => ({ turnId: e.turnId }))
  on('tool.call', async (_$: unknown, e: any) => { if (String(e.command).includes('HANG')) await hold.tool; return { result: {}, text: 'Tests: 3 failed, 9 passed' } as never })
  on('ui.log', async () => ({ value: undefined }) as never)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  on('model.complete', async (_$: unknown, e: any) => { prompts.push(e); return { value: await model(e) } as never })
  return { prompts, hold, start: ($: any) => $.session.start({ cwd: '/secret/project', surface: 'terminal', isInteractive: opts.interactive ?? true }) }
}
const failTurn = async ($: any, id: string, prompt = 'hi') => {
  await $.turn.start({ text: prompt, turnId: id })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b' + id, command: 'npm test' } as never)
}
const body = async ($: any) => {
  const pane = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'Pane', requestId: 'ops-control', props: PANE })
  const t = text(await pane.drawn())
  await pane.unmount()
  return t
}
const flush = async (clock: any) => { await clock.advance(1) }

test('haiku mode swaps the model line into the bubble', async ($, on) => {
  const r = rig(on, async () => answer('  "tests are sulking"\n')); const clock = mock.clock(on)
  await r.start($); await runOpsControl($, 'bubbles haiku')
  await failTurn($, 't1'); await flush(clock)
  expect(r.prompts).toHaveLength(1)
  expect(r.prompts[0].model).toBe('haiku')
  expect(await body($)).toContain('tests are sulking')
})

test('a Haiku line over the limit or cut by the token cap is never shown', async ($, on) => {
  const replies = [
    async () => answer('this line runs well past what the bubble can hold at all'),
    async (e: any) => ({ isAnswered: true, text: 'a sentence that stops mid', usage: { output_tokens: e.maxTokens } }),
    async () => answer('whole and short'),
  ]
  let n = 0
  const r = rig(on, e => replies[n++]!(e)); const clock = mock.clock(on)
  await r.start($); await runOpsControl($, 'bubbles haiku')
  for (const [i, bad] of ['runs well past', 'stops mid'].entries()) {
    await failTurn($, 't' + i); await flush(clock)
    const t = await body($)
    expect(t).not.toContain(bad)
    expect(FAIL_SAY.some(l => t.includes(l))).toBe(true)
    await clock.advance(91_000)
  }
  expect(r.prompts[0].maxTokens).toBeGreaterThanOrEqual(40)
  await failTurn($, 't9'); await flush(clock)
  expect(await body($)).toContain('whole and short')
})

test('the template shows first and a late line is dropped once the bubble is gone', async ($, on) => {
  let release!: () => void
  const gate = new Promise<void>(r => { release = r })
  const r = rig(on, async () => { await gate; return answer('too late') }); const clock = mock.clock(on)
  await r.start($); await runOpsControl($, 'bubbles haiku')
  await failTurn($, 't1'); await flush(clock)
  const shown = await body($)
  expect(FAIL_SAY.some(l => shown.includes(l))).toBe(true)
  await clock.advance(3200)
  release(); await flush(clock)
  expect(await body($)).not.toContain('too late')
})

test('one call per turn, 90 s apart, across many events', async ($, on) => {
  const r = rig(on, async () => answer('hmm')); const clock = mock.clock(on)
  await r.start($); await runOpsControl($, 'bubbles haiku')
  await failTurn($, 't1')
  for (let i = 0; i < 5; i++) { await $.tool.call({ tool: 'Bash', tool_use_id: 'x' + i, command: 'npm test' } as never); await clock.advance(5000) }
  expect(r.prompts).toHaveLength(1)
  await failTurn($, 't2'); await clock.advance(5000)
  expect(r.prompts).toHaveLength(1)
  await clock.advance(90_000)
  await failTurn($, 't3'); await flush(clock)
  expect(r.prompts).toHaveLength(2)
  await failTurn($, 't4')
  expect(r.prompts).toHaveLength(2)
})

test('an error or an empty line leaves the template and does not retry', async ($, on) => {
  let n = 0
  const r = rig(on, async () => { n++; return n === 1 ? { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: {} } : answer('"" 🎉') }); const clock = mock.clock(on)
  await r.start($); await runOpsControl($, 'bubbles haiku')
  await failTurn($, 't1'); await flush(clock)
  const t1 = await body($)
  expect(FAIL_SAY.some(l => t1.includes(l))).toBe(true)
  expect(r.prompts).toHaveLength(1)
  await clock.advance(91_000)
  await failTurn($, 't2'); await flush(clock)
  expect(r.prompts).toHaveLength(2)
  const t2 = await body($)
  expect(FAIL_SAY.some(l => t2.includes(l))).toBe(true)
})

test('a call that never settles is cut at 4 s and frees the slot after the cooldown', async ($, on) => {
  const r = rig(on, () => new Promise(() => {})); const clock = mock.clock(on)
  await r.start($); await runOpsControl($, 'bubbles haiku')
  await failTurn($, 't1')
  await clock.advance(3999); await failTurn($, 't2')
  expect(r.prompts).toHaveLength(1)
  await clock.advance(1)
  const t = await body($)
  expect(t.length).toBeGreaterThan(0)
  await clock.advance(91_000)
  await failTurn($, 't3'); await flush(clock)
  expect(r.prompts).toHaveLength(2)
})

test('bubbles on and off never reach the model', async ($, on) => {
  const r = rig(on, async () => answer('nope')); const clock = mock.clock(on)
  await r.start($)
  for (const mode of ['on', 'off']) {
    await runOpsControl($, `bubbles ${mode}`)
    await failTurn($, 'a' + mode); await clock.advance(100_000)
  }
  expect(r.prompts).toHaveLength(0)
})

test('-p, pet off and reduced motion use templates only', async ($, on) => {
  const p = rig(on, async () => answer('nope'), { interactive: false }); const clock = mock.clock(on)
  await p.start($); await runOpsControl($, 'bubbles haiku')
  await failTurn($, 't1'); await clock.advance(100_000)
  expect(p.prompts).toHaveLength(0)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  for (const cmd of ['pet off', 'motion reduced']) {
    await runOpsControl($, cmd)
    await failTurn($, cmd); await clock.advance(100_000)
    await runOpsControl($, cmd === 'pet off' ? 'pet clawd' : 'motion full')
  }
  expect(p.prompts).toHaveLength(0)
})

test('a line that lands before the bubble clears shows for the full 3 s from then', async ($, on) => {
  let release!: () => void
  const gate = new Promise<void>(r => { release = r })
  const r = rig(on, async () => { await gate; return answer('late but paid for') }); const clock = mock.clock(on)
  await r.start($); await runOpsControl($, 'bubbles haiku')
  await failTurn($, 't1'); await flush(clock)
  await clock.advance(2500)
  release(); await flush(clock)
  expect(await body($)).toContain('late but paid for')
  await clock.advance(2500)
  expect(await body($)).toContain('late but paid for')
  await clock.advance(700)
  expect(await body($)).not.toContain('late but paid for')
})

test('a bubble that is already cleared stays cleared when its line lands', async ($, on) => {
  let release!: () => void
  const gate = new Promise<void>(r => { release = r })
  const r = rig(on, async () => { await gate; return answer('too late') }); const clock = mock.clock(on)
  await r.start($); await runOpsControl($, 'bubbles haiku')
  await failTurn($, 't1'); await flush(clock)
  await clock.advance(3500)
  release(); await flush(clock); await clock.advance(1000)
  expect(await body($)).not.toContain('too late')
})

test('a tool start racing the call cannot change the prompt, and no prompt holds a command or pattern', async ($, on) => {
  const r = rig(on, async () => answer('ok')); const clock = mock.clock(on)
  let freeze!: () => void, thaw!: () => void
  r.hold.panes = new Promise<void>(res => { freeze = res })
  r.hold.tool = new Promise<void>(res => { thaw = res })
  await r.start($); await runOpsControl($, 'bubbles haiku')
  await failTurn($, 't1')
  const racing = $.tool.call({ tool: 'Bash', tool_use_id: 'z', command: 'grep SECRETPATTERN src HANG' } as never)
  await flush(clock)
  freeze(); await flush(clock)
  expect(r.prompts).toHaveLength(1)
  const sent = `${r.prompts[0].system}\n${r.prompts[0].prompt}`
  for (const bad of ['SECRETPATTERN', 'HANG', 'grep', 'npm', 'src']) expect(sent).not.toContain(bad)
  // the snapshot is the moment of the failure, not the grep that began after it
  expect(r.prompts[0].prompt).toMatch(/^mood: fail\npose: think\ntests: failed 3\n/)
  thaw(); await racing
})

test('a needs-you prompt names no command', async ($, on) => {
  const r = rig(on, async () => answer('ok')); const clock = mock.clock(on)
  on('classic.PermissionRequest', async () => ({}) as never)
  await r.start($); await runOpsControl($, 'bubbles haiku')
  await $.turn.start({ text: 'hi', turnId: 'n1' })
  let thaw!: () => void
  r.hold.tool = new Promise<void>(res => { thaw = res })
  const call = $.tool.call({ tool: 'Bash', tool_use_id: 'w', command: 'rm -rf SECRETDIR HANG' } as never)
  await flush(clock)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -rf SECRETDIR HANG' }, permission_mode: 'default' } as never)
  await flush(clock)
  expect(r.prompts).toHaveLength(1)
  expect(r.prompts[0].prompt).toContain('mood: needs-you')
  expect(`${r.prompts[0].prompt}`).not.toContain('SECRETDIR')
  expect(`${r.prompts[0].prompt}`).not.toContain('rm')
  thaw(); await call
})

test('the cooldown survives a hot reload: the last call time lives in $.state', async ($, on) => {
  const r = rig(on, async () => answer('hmm')); const clock = mock.clock(on)
  // a call "just made" by the copy this one replaced, whatever the mock clock reads
  const mem = new Map<string, unknown>([['ops-control/haiku', { lastAt: Number.MAX_SAFE_INTEGER }]])
  on('state.get', async (_$: unknown, e: any) => ({ value: { value: mem.get(`${e.plugin}/${e.key}`), version: 1 } }) as never)
  on('state.set', async (_$: unknown, e: any) => { mem.set(`${e.plugin}/${e.key}`, e.value); return { value: { isSet: true, version: 1 } } as never })
  await r.start($); await runOpsControl($, 'bubbles haiku')
  await failTurn($, 't1'); await flush(clock)
  expect(r.prompts).toHaveLength(0)
  mem.set('ops-control/haiku', { lastAt: -1e12 })
  await failTurn($, 't2'); await flush(clock)
  expect(r.prompts).toHaveLength(1)
  expect((mem.get('ops-control/haiku') as { lastAt: number }).lastAt).toBeGreaterThan(-1e12)
})

test('the prompt holds ops-control state only: no prompt text, cwd or file contents', async ($, on) => {
  const r = rig(on, async () => answer('ok')); const clock = mock.clock(on)
  await r.start($); await runOpsControl($, 'bubbles haiku')
  await failTurn($, 't1', 'SECRET-PROMPT api_key=hunter2 in /home/me/.ssh/id_rsa')
  await flush(clock)
  expect(r.prompts).toHaveLength(1)
  const sent = `${r.prompts[0].system}\n${r.prompts[0].prompt}`
  for (const bad of ['SECRET-PROMPT', 'hunter2', '.ssh', '/secret/project']) expect(sent).not.toContain(bad)
  expect(r.prompts[0].prompt).toMatch(/^mood: fail\npose: /)
  expect(r.prompts[0].prompt).toContain('tests: failed 3')
  expect(r.prompts[0].prompt).toMatch(/time: (morning|afternoon|evening|night)$/)
})

test('a hello never spends the turn\'s Haiku call', async ($, on) => {
  const r = rig(on, async () => answer('a fresh line')); const clock = mock.clock(on)
  await r.start($); await runOpsControl($, 'bubbles haiku')
  const pane = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'Pane', requestId: 'ops-control', props: PANE })
  await pane.drawn(); await clock.advance(20)
  const shown = text(await pane.drawn())
  expect(anyLine(BUILTIN_LINES.clawd, 'hello').some(l => shown.includes(l))).toBe(true)
  expect(r.prompts).toHaveLength(0)
  await pane.unmount()
})
