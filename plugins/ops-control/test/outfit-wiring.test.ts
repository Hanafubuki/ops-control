import { expect, mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { runOpsControl, fakeFs, test, anyLine } from './kit.ts'
import { BUILTIN_LINES } from '../hooks/lines.ts'

const ENGINE_ROW = { type: 'Text', props: {}, children: ['engine row'] } as RenderElement
const scroll = { offset: 0, bodyRows: 20 }
const PANE = { title: 'ops-control', isFocused: false, bodyColumns: 80, placement: 'dock', scroll, view: {} } as never
const walk = (n: any, out: any[] = []): any[] => { if (typeof n === 'string') out.push(n); else if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }
const petClient = (tree: any) => walk(tree).find(n => n?.type === 'Client' && String(n.props?.module).endsWith('client/pet.tsx'))

function base(on: any, store: Record<string, unknown>, failOutfit = false) {
  store.eggs ??= { passRuns: 1, eggAt: 1, eggRuns: 0 }
  fakeFs(on, {})
  on('store.get', async (_$: unknown, e: any) => ({ value: store[e.key] }) as never)
  on('store.set', async (_$: unknown, e: any) => {
    if (failOutfit && e.key === 'outfit') throw new Error('disk full')
    store[e.key] = e.value
    return { value: undefined } as never
  })
  on('store.delete', async (_$: unknown, e: any) => { delete store[e.key]; return { value: undefined } as never })
  on('store.keys', async () => ({ value: Object.keys(store) }) as never)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  on('ui.render', async () => ENGINE_ROW)
  on('ui.panes', async () => ({ value: [{ id: 'ops-control', isShown: true, isPlaced: true }] }))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async () => ({ value: undefined }) as never)
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$: unknown, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: '' }) as never)
  on('tool.call', async () => ({ result: {}, text: 'ok' }) as never)
  return mock.clock(on)
}

const start = ($: any) => $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
const clientProps = async ($: any) => {
  const pane = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'Pane', requestId: 'ops-control', props: PANE })
  const c = petClient(await pane.drawn())
  await pane.unmount()
  return c.props.props
}
const answer = async ($: any, clock: { advance(ms: number): Promise<void> }, id: string) => {
  await $.turn.start({ text: 'hi', turnId: id })
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 10, isAborted: false, turnId: id })
  await clock.advance(1)
}

test('the Client gets the level and the newest unlocked outfit; /ops outfit changes it at once', async ($, on) => {
  const store: Record<string, unknown> = { level: { format: 1, xp: 1600 } }
  base(on, store)
  await start($)
  let p = await clientProps($)
  expect([p.level, p.outfit]).toEqual([6, 'wizard'])
  await runOpsControl($, 'outfit cap')
  expect((await clientProps($)).outfit).toBe('cap')
  await runOpsControl($, 'outfit off')
  expect('outfit' in (await clientProps($))).toBe(false)
  expect(store.outfit).toEqual({ format: 1, name: 'off' })
})

test('a stored choice the pet lacks falls back to its newest outfit, unless it was off', async ($, on) => {
  const store: Record<string, unknown> = { level: { format: 1, xp: 1600 }, outfit: { format: 1, name: 'cap' } }
  base(on, store)
  await start($)
  await runOpsControl($, 'pet robot')
  expect((await clientProps($)).outfit).toBe('tophat')
  await runOpsControl($, 'pet clawd')
  expect((await clientProps($)).outfit).toBe('cap')
  await runOpsControl($, 'outfit off')
  await runOpsControl($, 'pet robot')
  expect('outfit' in (await clientProps($))).toBe(false)
})

test('a level-up that unlocks an outfit wears the newest one and stores it', async ($, on) => {
  const store: Record<string, unknown> = { level: { format: 1, xp: 295 }, outfit: { format: 1, name: 'off' } }
  const clock = base(on, store)
  await start($)
  expect('outfit' in (await clientProps($))).toBe(false)
  await answer($, clock, 't1')
  expect(store.outfit).toEqual({ format: 1, name: 'cap' })
  expect((await clientProps($)).outfit).toBe('cap')
})

test('a level-up with no outfit in it leaves the choice alone', async ($, on) => {
  const store: Record<string, unknown> = { level: { format: 1, xp: 395 }, outfit: { format: 1, name: 'cap' } }
  const clock = base(on, store)
  await start($)
  await answer($, clock, 't1')
  expect(store.outfit).toEqual({ format: 1, name: 'cap' })
})

test('with no pet on, a level-up clears the stored choice', async ($, on) => {
  const store: Record<string, unknown> = { level: { format: 1, xp: 295 }, pet: 'off', outfit: { format: 1, name: 'off' } }
  const clock = base(on, store)
  await start($)
  await answer($, clock, 't1')
  expect(store.outfit).toBeUndefined()
  // the cleared choice shows the newest outfit when a built-in pet returns
  await runOpsControl($, 'pet clawd')
  expect((await clientProps($)).outfit).toBe('cap')
})

test('a failed outfit write still announces the level-up', async ($, on) => {
  const store: Record<string, unknown> = { level: { format: 1, xp: 295 } }
  const clock = base(on, store, true)
  await start($)
  await answer($, clock, 't1')
  expect(store.level).toEqual({ format: 1, xp: 300 })
  const pane = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'Pane', requestId: 'ops-control', props: PANE })
  const body = walk(await pane.drawn()).filter((n: any) => typeof n === 'string').join(' ')
  await pane.unmount()
  expect(body).toContain('Lv 3')
  expect(anyLine(BUILTIN_LINES.clawd, 'level-up', { unlock: 'a new outfit' }).some((l: string) => !l.includes('…') && body.includes(l))).toBe(true)
})
