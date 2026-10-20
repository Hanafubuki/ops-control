import { expect, mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { runOpsControl, fakeFs, test } from './kit.ts'

const ENGINE_ROW = { type: 'Text', props: {}, children: ['engine row'] } as RenderElement
const base = (on: any, render: (e: any) => void = () => {}) => {
  fakeFs(on)
  mock.store(on)
  on('ui.render', async (_$: unknown, e: any) => { render(e); return ENGINE_ROW })
  on('ui.panes', async () => ({ value: [] }))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async () => ({ value: undefined }) as never)
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$: unknown, e: any) => ({ turnId: e.turnId }))
}
const walk = (n: any, out: any[] = []): any[] => { if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }
const USER = { text: 'fix it', origin: { kind: 'composer' }, isExpanded: false }
const TOOL = { tool_use_id: 'u1', tool: 'Read', input: { file_path: '/r/a.ts' }, isRunning: false, isErrored: false, isInterrupted: false }

test('a markers pack marks prompt rows on the terminal and nowhere else', { timeoutMs: 20000 }, async ($, on) => {
  base(on)
  await runOpsControl($, 'pack arcade')
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'ops-control', surface, component: 'UserMessage', requestId: 'm1', props: USER as never })
    const marker = await ui.find({ text: /▶/ })
    expect(marker !== undefined).toBe(surface === 'terminal')
    expect(await ui.find({ text: /engine row/ })).toBeDefined()
    await ui.unmount()
  }
})

test('switching packs restyles mounted rows; tool events do not', async ($, on) => {
  let rows = 0
  base(on, e => { if (e.component === 'ToolUse') rows++ })
  const clock = mock.clock(on)
  const ui = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'ToolUse', requestId: 'u1', props: TOOL as never })
  const before = rows
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await clock.advance(3000)
  expect(rows).toBe(before)
  await runOpsControl($, 'pack crt')
  await clock.advance(200)
  expect(rows).toBeGreaterThan(before)
  expect(await ui.find({ text: /\[ OK \]/ })).toBeDefined()
  await ui.unmount()
})

const SPIN_PROPS = { word: 'Thinking', message: null, suffix: '…', mode: 'thinking' } as never
const clientOf = (nodes: any[], module: string) => nodes.find(n => n?.type === 'Client' && String(n.props?.module).endsWith(module))

test('a pack spinner is a Client on terminal and desktop; a state message keeps the engine line', async ($, on) => {
  base(on)
  mock.clock(on)
  await runOpsControl($, 'pack arcade')
  await $.turn.start({ text: 'hi', turnId: 't1' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const spin = await $.ui.mount({ plugin: 'ops-control', surface, component: 'Spinner', requestId: 'main', props: SPIN_PROPS })
    const c = clientOf(walk(await spin.drawn()), 'client/spinner.tsx')
    expect(c).toBeDefined()
    expect(JSON.stringify(c.props.props).length).toBeLessThan(100_000)
    await spin.unmount()
  }
  const busy = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'Spinner', requestId: 'main', props: { ...(SPIN_PROPS as object), message: 'Compacting' } as never })
  expect(await busy.find({ text: /engine row/ })).toBeDefined()
  await busy.unmount()
})

// The engine drops a throwing state.get hook and checks stored values against the
// contract, and Date is read-only here, so no throw can be planted inside the
// hook's try; this covers the reachable half: a failing read never blanks the line.
test('a failing state read still leaves a drawn spinner', async ($, on) => {
  base(on)
  mock.clock(on)
  on('state.get', async () => { throw new Error('boom') })
  await runOpsControl($, 'pack arcade')
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const spin = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'Spinner', requestId: 'main', props: SPIN_PROPS })
  const tree = walk(await spin.drawn())
  expect(clientOf(tree, 'client/spinner.tsx') !== undefined || tree.some(n => JSON.stringify(n).includes('engine row'))).toBe(true)
  await spin.unmount()
})

test('reduced motion: stock spinner, no Client anywhere', async ($, on) => {
  base(on)
  mock.clock(on)
  await runOpsControl($, 'pack arcade')
  await runOpsControl($, 'motion reduced')
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const spin = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'Spinner', requestId: 'main', props: SPIN_PROPS })
  expect(await spin.find({ text: /engine row/ })).toBeDefined()
  expect(walk(await spin.drawn()).some(n => n?.type === 'Client')).toBe(false)
  await spin.unmount()
})
