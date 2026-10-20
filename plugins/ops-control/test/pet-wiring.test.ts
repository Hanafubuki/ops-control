import { expect, mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { runOpsControl, fakeFs, test, anyLine } from './kit.ts'
import { BUILTIN_LINES } from '../hooks/lines.ts'
import { EGG_HINTS } from '../hooks/eggs.ts'

const ENGINE_ROW = { type: 'Text', props: {}, children: ['engine row'] } as RenderElement
const scroll = { offset: 0, bodyRows: 20 }
const PANE = { title: 'ops-control', isFocused: false, bodyColumns: 60, placement: 'dock', scroll, view: {} } as never
const BAND = { hasSurvey: false, isWorking: true, maxRows: 6, bodyColumns: 100, scroll, view: {} } as never
const walk = (n: any, out: any[] = []): any[] => { if (typeof n === 'string') out.push(n); else if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }
const petClient = (tree: any) => walk(tree).find(n => n?.type === 'Client' && String(n.props?.module).endsWith('client/pet.tsx'))
const text = (tree: any) => walk(tree).filter(n => typeof n === 'string').join(' ')
function base(on: any, render: (e: any) => void = () => {}, opts: { shown?: boolean; toolText?: string | (() => string); run?: (argv: string[]) => { exitCode: number; stdout: string } | void; files?: Record<string, string>; toasts?: string[]; store?: Record<string, unknown> } = {}) {
  fakeFs(on, opts.files ?? {}, opts.run)
  // a store the test passes in is the live one, so it can read back what the plugin wrote
  const live = opts.store
  if (!live) mock.store(on)
  else {
    on('store.get', async (_$: unknown, e: any) => ({ value: live[e.key] }) as never)
    on('store.set', async (_$: unknown, e: any) => { live[e.key] = e.value; return { value: undefined } as never })
    on('store.delete', async (_$: unknown, e: any) => { delete live[e.key]; return { value: undefined } as never })
    on('store.keys', async () => ({ value: Object.keys(live) }) as never)
  }
  on('ui.render', async (_$: unknown, e: any) => { render(e); return ENGINE_ROW })
  on('ui.panes', async () => ({ value: [{ id: 'ops-control', isShown: opts.shown ?? true, isPlaced: true }] }))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async (_$: unknown, e: any) => { opts.toasts?.push(e.text); return { value: undefined } as never })
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$: unknown, e: any) => ({ turnId: e.turnId }))
  on('tool.call', async () => ({ result: {}, text: (typeof opts.toolText === 'function' ? opts.toolText() : opts.toolText) ?? 'Tests: 3 failed, 9 passed' }) as never)
}
const mountPane = ($: any) => $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'Pane', requestId: 'ops-control', props: PANE })

test('the pane hosts the pet Client with raw inputs; the band never does', { timeoutMs: 20000 }, async ($, on) => {
  base(on); mock.clock(on)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const pane = await mountPane($)
  const c = petClient(await pane.drawn())
  expect(c).toBeDefined()
  expect(c.props.props.input.working).toBe(true)
  expect(c.props.props.width).toBe(46)
  expect('pose' in c.props.props).toBe(false)
  const band = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(petClient(await band.drawn())).toBeUndefined()
  await pane.unmount(); await band.unmount()
})

test('/clear scrunches the pet like a compaction; a resume does not', { timeoutMs: 20000 }, async ($, on) => {
  base(on); const clock = mock.clock(on)
  on('session.end', async (_$: unknown, e: any) => ({ sessionId: e.sessionId }))
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const pane = await mountPane($)
  expect(petClient(await pane.drawn()).props.props.input.compactAt).toBeUndefined()
  await $.session.end({ reason: 'resume', sessionId: 's1' } as never)
  await clock.advance(10)
  expect(petClient(await pane.drawn()).props.props.input.compactAt).toBeUndefined()
  await $.session.end({ reason: 'clear', sessionId: 's1' } as never)
  await clock.advance(10)
  const at = petClient(await pane.drawn()).props.props.input.compactAt
  expect(typeof at).toBe('number')
  expect(Math.abs(Date.now() - at)).toBeLessThan(5000)
  await pane.unmount()
})

test('the pet region is sized to the strip so he has room to walk; the compact row stays unsized', { timeoutMs: 20000 }, async ($, on) => {
  base(on); mock.clock(on)
  const pane = await mountPane($)
  expect(petClient(await pane.drawn()).props.width).toBe(46)
  await pane.unmount()
  const inline = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'Pane', requestId: 'ops-control', props: { ...(PANE as object), placement: 'inline', bodyColumns: 60 } as never })
  expect(petClient(await inline.drawn()).props.width).toBeUndefined()
  await inline.unmount()
})

test('the stored tab setup shapes the tab strip while the pet is on', { timeoutMs: 20000 }, async ($, on) => {
  base(on); mock.clock(on)
  await runOpsControl($, 'setup tabs plan,diff')
  const pane = await mountPane($)
  const tree = await pane.drawn()
  expect(petClient(tree)).toBeDefined()
  const labels = walk(tree).filter(n => n?.type === 'Button' && /^\d$/.test(n.props?.hotkey ?? '')).map(n => n.props.label)
  expect(labels).toEqual(['Plan', 'Diff'])
  await pane.unmount()
})

test('pet off, or reduced motion: no pet Client in the pane',async ($, on) => {
  base(on); mock.clock(on)
  for (const cmd of ['pet off', 'motion reduced']) {
    await runOpsControl($, cmd)
    const pane = await mountPane($)
    expect(petClient(await pane.drawn())).toBeUndefined()
    await pane.unmount()
    await runOpsControl($, cmd === 'pet off' ? 'pet clawd' : 'motion full')
  }
})

test('a failing test run shows a fail bubble in the pane for 3 s', async ($, on) => {
  base(on); const clock = mock.clock(on)
  await runOpsControl($, 'bubbles on')
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'npm test' } as never)
  const said = anyLine(BUILTIN_LINES.clawd, 'fail', { n: '3' })
  let pane = await mountPane($)
  let body = text(await pane.drawn())
  expect(said.some(l => body.includes(l))).toBe(true)
  await pane.unmount()
  await clock.advance(3100)
  pane = await mountPane($)
  body = text(await pane.drawn())
  expect(said.some(l => body.includes(l))).toBe(false)
  await pane.unmount()
})

test('pet changes do not redraw the band', async ($, on) => {
  let bandDraws = 0
  base(on, e => { if (e.component === 'AbovePrompt') bandDraws++ })
  const clock = mock.clock(on)
  const band = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  const before = bandDraws
  await runOpsControl($, 'bubbles on')
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b2', command: 'npm test' } as never)
  await clock.advance(3200)
  expect(bandDraws - before).toBeLessThanOrEqual(2)
  await band.unmount()
})

const FAIL_SAY = anyLine(BUILTIN_LINES.clawd, 'fail', { n: '3' })

test('no bubble while the pane is hidden', async ($, on) => {
  base(on, undefined, { shown: false }); mock.clock(on)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'npm test' } as never)
  const pane = await mountPane($)
  const body = text(await pane.drawn())
  expect(FAIL_SAY.some(l => body.includes(l))).toBe(false)
  await pane.unmount()
})

test('a friday deploy puts the sign in the pane', async ($, on) => {
  base(on)
  // local time is clock + offset, and the offset is this machine's own zone
  mock.clock(on, { now: Date.UTC(2026, 9, 9, 18) + new Date().getTimezoneOffset() * 60_000 })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'git push origin main' } as never)
  const pane = await mountPane($)
  expect(text(await pane.drawn())).toContain("it's friday")
  await pane.unmount()
})

const overlaysNow = async ($: any) => {
  const pane = await mountPane($)
  const c = petClient(await pane.drawn())
  await pane.unmount()
  return c.props.props.overlays as string[]
}

test('a failed test run gives Clawd the sweat until the next prompt, with no friday sign', async ($, on) => {
  base(on); mock.clock(on, { now: Date.UTC(2026, 6, 1, 12) + new Date().getTimezoneOffset() * 60_000 })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  expect(await overlaysNow($)).not.toContain('sweat')
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'npm test' } as never)
  const ov = await overlaysNow($)
  expect(ov.filter(o => o === 'sweat')).toHaveLength(1)
  expect(ov).not.toContain('friday')
  await $.turn.start({ text: 'again', turnId: 't2' })
  expect(await overlaysNow($)).not.toContain('sweat')
})

test('a passing test run does not give the sweat', async ($, on) => {
  base(on, undefined, { toolText: 'Tests: 12 passed' }); mock.clock(on, { now: Date.UTC(2026, 6, 1, 12) + new Date().getTimezoneOffset() * 60_000 })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'npm test' } as never)
  expect(await overlaysNow($)).not.toContain('sweat')
})

test('date +%z runs only where the process offset is 0', async ($, on) => {
  const ran: string[] = []
  base(on, undefined, { run: argv => { ran.push(argv.join(' ')) } }); mock.clock(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  expect(ran.includes('date +%z')).toBe(new Date().getTimezoneOffset() === 0)
})

const PETS = '/fake/.claude/ops-control/pets'
const petJson = (name: string) => JSON.stringify({ format: 1, name, palette: { A: '#abcdef' }, animations: { idle: [{ ms: 400, px: Array(12).fill('A'.repeat(24)) }] } })

test('pet robot reaches the Client by id; a user pet carries its sheet', async ($, on) => {
  base(on, undefined, { files: { [`${PETS}/mochi.json`]: petJson('mochi') } }); mock.clock(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  // the pet directory is under the config dir, which session.start reads
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  await runOpsControl($, 'pet robot')
  let pane = await mountPane($)
  let c = petClient(await pane.drawn())
  expect(c.props.props.pet).toBe('robot')
  expect('sheet' in c.props.props).toBe(false)
  await pane.unmount()
  await runOpsControl($, 'pet mochi')
  pane = await mountPane($)
  c = petClient(await pane.drawn())
  expect(c.props.props.pet).toBe('mochi')
  expect(c.props.props.sheet.palette).toEqual({ A: '#abcdef' })
  await pane.unmount()
})

async function brokenStoredPet($: any, on: any, isInteractive: boolean) {
  const files: Record<string, string> = { [`${PETS}/mochi.json`]: petJson('mochi') }
  const toasts: string[] = []
  base(on, undefined, { files, toasts }); mock.clock(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive })
  await runOpsControl($, 'pet mochi')
  files[`${PETS}/mochi.json`] = '{"format":1,"name":"mochi"'
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive })
  return toasts
}

test('a stored user pet that no longer loads falls back to Clawd with one toast', async ($, on) => {
  const toasts = await brokenStoredPet($, on, true)
  const pane = await mountPane($)
  const c = petClient(await pane.drawn())
  expect(c.props.props.pet).toBe('clawd')
  expect('sheet' in c.props.props).toBe(false)
  const mine = toasts.filter(t => t.includes('mochi'))
  expect(mine).toHaveLength(1)
  expect(mine[0]!.match(/mochi/g)!.length).toBeLessThanOrEqual(2)
  expect(mine[0]).toMatch(/\. Showing Clawd\.$/)
  expect(mine[0]).not.toContain('ops-control pet "')
  await pane.unmount()
})

test('a non-interactive run shows no fallback toast', async ($, on) => {
  const toasts = await brokenStoredPet($, on, false)
  expect(toasts.filter(t => t.includes('Showing Clawd'))).toEqual([])
})

test('a stored egg while the egg is locked shows Clawd', async ($, on) => {
  base(on, undefined, { store: { pet: 'egg' } }); mock.clock(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  const pane = await mountPane($)
  expect(petClient(await pane.drawn()).props.props.pet).toBe('clawd')
  await pane.unmount()
})

test('the robot gets an 8-row strip; Clawd keeps 6', async ($, on) => {
  base(on); mock.clock(on)
  const strip = async () => {
    const pane = await mountPane($)
    const tree = await pane.drawn()
    const box = walk(tree).find(n => n?.type === 'Box' && n.props?.height && walk(n).includes(petClient(tree)))
    await pane.unmount()
    return box.props.height
  }
  await runOpsControl($, 'pet clawd')
  const clawd = await strip()
  await runOpsControl($, 'pet robot')
  const robot = await strip()
  // The nightcap (23:00 to 04:59 local, read from the real Date.now() that mock.clock leaves alone) pads Clawd by two rows; the robot has no hat.
  const hour = new Date().getHours()
  expect([clawd, robot]).toEqual([hour >= 23 || hour <= 4 ? 8 : 6, 8])
})

test('the pack look reaches the band and the pane, pet on or off', async ($, on) => {
  base(on); mock.clock(on)
  await runOpsControl($, 'pack arcade')
  await runOpsControl($, 'setup bar band')
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const band = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(text(await band.drawn())).toContain('HP')
  await band.unmount()
  for (const cmd of ['', 'pet off']) {
    if (cmd) await runOpsControl($, cmd)
    const pane = await mountPane($)
    expect(text(await pane.drawn())).toContain('HP')
    await pane.unmount()
  }
})

test('the Konami post unlocks the egg once, with one toast and a juggle', async ($, on) => {
  const toasts: string[] = []
  const stored: Record<string, unknown> = {}
  base(on, undefined, { toasts, store: stored }); mock.clock(on)
  const pane = await mountPane($)
  await pane.post({ konami: true }, { in: 'ops-control-pet' })
  await pane.post({ konami: true }, { in: 'ops-control-pet' })
  expect(toasts.filter(t => t === 'An egg! Press Esc, then /ops pet egg')).toHaveLength(1)
  expect((stored.eggs as { eggAt?: number } | undefined)?.eggAt).toBeGreaterThan(0)
  expect((await runOpsControl($, 'pet list')).text).toContain('○ egg')
  expect(petClient(await pane.drawn()).props.props.input.juggleAt).toBeGreaterThan(0)
  await pane.unmount()
})

const DAY = 86_400_000
const DONE_SAY = anyLine(BUILTIN_LINES.clawd, 'done')
async function finishTurn($: any, clock: { advance(ms: number): Promise<void> }, id: string) {
  await $.turn.start({ text: 'hi', turnId: id })
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 10, isAborted: false, turnId: id })
  // the hook does not await say(): the bubble lands after the turn resolves
  await clock.advance(1)
  const pane = await mountPane($)
  const body = text(await pane.drawn())
  await pane.unmount()
  return body
}
const hintShown = (body: string) => EGG_HINTS.some(l => body.includes(l))
const doneShown = (body: string) => DONE_SAY.some(l => body.includes(l))

test('the first finished turn while the egg is locked says a hint instead of the done line, then the day passes quietly', async ($, on) => {
  const stored: Record<string, unknown> = {}
  base(on, undefined, { store: stored }); const clock = mock.clock(on)
  on('turn.complete', async () => ({ text: '' }) as never)
  const first = await finishTurn($, clock, 't1')
  expect(hintShown(first)).toBe(true)
  expect(doneShown(first)).toBe(false)
  const at = (stored.eggs as { hintAt?: number } | undefined)?.hintAt
  expect(typeof at).toBe('number')
  await clock.advance(5000)
  const second = await finishTurn($, clock, 't2')
  expect(hintShown(second)).toBe(false)
  expect(doneShown(second)).toBe(true)
  expect((stored.eggs as { hintAt?: number }).hintAt).toBe(at)
  await clock.advance(DAY)
  const third = await finishTurn($, clock, 't3')
  expect(hintShown(third)).toBe(true)
  expect((stored.eggs as { hintAt?: number }).hintAt).toBeGreaterThan(at!)
})

test('the hint lines take turns day by day', async ($, on) => {
  const stored: Record<string, unknown> = {}
  base(on, undefined, { store: stored }); const clock = mock.clock(on)
  on('turn.complete', async () => ({ text: '' }) as never)
  const said: string[] = []
  for (const id of ['t1', 't2', 't3']) {
    const body = await finishTurn($, clock, id)
    said.push(EGG_HINTS.find(l => body.includes(l)) ?? '')
    await clock.advance(DAY)
  }
  expect(said).toEqual([EGG_HINTS[0], EGG_HINTS[1], EGG_HINTS[0]])
})

test('no hint with the egg unlocked, bubbles off, or the pane hidden', async ($, on) => {
  const stored: Record<string, unknown> = { eggs: { passRuns: 1, eggAt: 1, eggRuns: 0 } }
  base(on, undefined, { store: stored }); const clock = mock.clock(on)
  on('turn.complete', async () => ({ text: '' }) as never)
  expect(hintShown(await finishTurn($, clock, 't1'))).toBe(false)
  expect((stored.eggs as { hintAt?: number }).hintAt).toBeUndefined()
  stored.eggs = { passRuns: 1 }
  await runOpsControl($, 'bubbles off')
  expect(hintShown(await finishTurn($, clock, 't2'))).toBe(false)
  expect((stored.eggs as { hintAt?: number }).hintAt).toBeUndefined()
})

test('no hint while the ops-control pane is hidden', async ($, on) => {
  const stored: Record<string, unknown> = {}
  base(on, undefined, { store: stored, shown: false }); const clock = mock.clock(on)
  on('turn.complete', async () => ({ text: '' }) as never)
  expect(hintShown(await finishTurn($, clock, 't1'))).toBe(false)
  expect((stored.eggs as { hintAt?: number } | undefined)?.hintAt).toBeUndefined()
})

test('in haiku mode the hint is fixed text and Haiku is asked only for the line after it', async ($, on) => {
  const stored: Record<string, unknown> = {}
  base(on, undefined, { store: stored }); const clock = mock.clock(on)
  on('turn.complete', async () => ({ text: '' }) as never)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  const asked: unknown[] = []
  on('model.complete', async (_$: unknown, e: any) => { asked.push(e); return { value: { isAnswered: true, text: 'tests are sulking', usage: {} } } as never })
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await runOpsControl($, 'bubbles haiku')
  const first = await finishTurn($, clock, 't1')
  expect(hintShown(first)).toBe(true)
  expect(first).not.toContain('tests are sulking')
  expect(asked).toHaveLength(0)
  await clock.advance(100_000)
  const second = await finishTurn($, clock, 't2')
  expect(asked).toHaveLength(1)
  expect(second).toContain('tests are sulking')
})

test('the first click says the pet has the keyboard, once per session', async ($, on) => {
  const toasts: string[] = []
  base(on, undefined, { toasts }); mock.clock(on)
  const pane = await mountPane($)
  await pane.post({ click: true }, { in: 'ops-control-pet' })
  await pane.post({ click: true }, { in: 'ops-control-pet' })
  expect(toasts.filter(t => t === 'The pet has the keyboard now. Esc gives it back.')).toHaveLength(1)
  await pane.unmount()
})

test('a user pet named egg gets one notice that the built-in took the name', async ($, on) => {
  const toasts: string[] = []
  base(on, undefined, { toasts, store: { pet: 'egg' }, files: { [`${PETS}/egg.json`]: petJson('egg') } }); mock.clock(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  const notice = 'A pet file named egg.json is now the built-in egg\'s name; rename the file and its "name" to keep your pet.'
  expect(toasts.filter(t => t === notice)).toHaveLength(1)
  const pane = await mountPane($)
  expect(petClient(await pane.drawn()).props.props.pet).toBe('clawd')
  await pane.unmount()
})

test('passing runs move the shown egg to its next crack sheet', async ($, on) => {
  base(on, undefined, { toolText: 'Tests: 12 passed', store: { eggs: { passRuns: 9, eggAt: 1, eggRuns: 0 } } }); mock.clock(on)
  await runOpsControl($, 'pet egg')
  const pane = await mountPane($)
  const before = JSON.stringify(petClient(await pane.drawn()).props.props.sheet)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'npm test' } as never)
  const after = JSON.stringify(petClient(await pane.drawn()).props.props.sheet)
  expect(after).not.toBe(before)
  await pane.unmount()
})

test('a pass after a failed run in an earlier turn says a green line', async ($, on) => {
  let text0 = 'Tests: 3 failed, 9 passed'
  base(on, undefined, { toolText: () => text0 }); const clock = mock.clock(on)
  await runOpsControl($, 'bubbles on')
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'npm test' } as never)
  await clock.advance(3100)
  text0 = 'Tests: 12 passed'
  await $.turn.start({ text: 'again', turnId: 't2' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b2', command: 'npm test' } as never)
  const pane = await mountPane($)
  const body = text(await pane.drawn())
  expect(anyLine(BUILTIN_LINES.clawd, 'green').some(l => body.includes(l))).toBe(true)
  await pane.unmount()
})

test('the robot says its own fail lines', async ($, on) => {
  base(on); mock.clock(on)
  await runOpsControl($, 'pet robot'); await runOpsControl($, 'bubbles on')
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'npm test' } as never)
  const pane = await mountPane($)
  const body = text(await pane.drawn())
  expect(anyLine(BUILTIN_LINES.robot, 'fail', { n: '3' }).some(l => body.includes(l))).toBe(true)
  expect(FAIL_SAY.some(l => body.includes(l))).toBe(false)
  await pane.unmount()
})

test('a fresh session says hello at the first pane draw, once, and not over another bubble', async ($, on) => {
  base(on); const clock = mock.clock(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
  await runOpsControl($, 'bubbles on')
  let pane = await mountPane($)
  await pane.drawn(); await clock.advance(10)
  let body = text(await pane.drawn())
  expect(anyLine(BUILTIN_LINES.clawd, 'hello').some(l => body.includes(l))).toBe(true)
  await pane.unmount(); await clock.advance(3100)
  pane = await mountPane($)
  body = text(await pane.drawn())
  expect(anyLine(BUILTIN_LINES.clawd, 'hello').some(l => body.includes(l))).toBe(false)
  await pane.unmount()
})

test('a second session.start for the same session, as a hot reload runs, does not greet again', async ($, on) => {
  base(on); const clock = mock.clock(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  const isHello = (body: string) => anyLine(BUILTIN_LINES.clawd, 'hello').some(l => body.includes(l))
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
  await runOpsControl($, 'bubbles on')
  let pane = await mountPane($)
  await pane.drawn(); await clock.advance(10)
  expect(isHello(text(await pane.drawn()))).toBe(true)
  await pane.unmount(); await clock.advance(3100)
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
  pane = await mountPane($)
  await pane.drawn(); await clock.advance(10)
  expect(isHello(text(await pane.drawn()))).toBe(false)
  await pane.unmount()
})

test('a hello whose first draw comes before the pane is reported shown speaks on a later draw', async ($, on) => {
  const opts = { shown: false }
  base(on, undefined, opts); const clock = mock.clock(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
  await runOpsControl($, 'bubbles on')
  const pane = await mountPane($)
  await pane.drawn(); await clock.advance(10)
  opts.shown = true
  await pane.redraw(); await clock.advance(10)
  const body = text(await pane.drawn())
  expect(anyLine(BUILTIN_LINES.clawd, 'hello').some(l => body.includes(l))).toBe(true)
  await pane.unmount()
})

test('a bubble that spoke before the first pane draw keeps its place: no hello', async ($, on) => {
  base(on); const clock = mock.clock(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true } as never)
  await runOpsControl($, 'bubbles on')
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'npm test' } as never)
  const pane = await mountPane($)
  await pane.drawn(); await clock.advance(10)
  const body = text(await pane.drawn())
  expect(FAIL_SAY.some(l => body.includes(l))).toBe(true)
  await pane.unmount()
})
