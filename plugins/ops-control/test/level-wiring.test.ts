import { expect, mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { runOpsControl, fakeFs, test, anyLine } from './kit.ts'
import { BUILTIN_LINES } from '../hooks/lines.ts'

const ENGINE_ROW = { type: 'Text', props: {}, children: ['engine row'] } as RenderElement
const scroll = { offset: 0, bodyRows: 20 }
const PANE = { title: 'ops-control', isFocused: false, bodyColumns: 80, placement: 'dock', scroll, view: {} } as never
const walk = (n: any, out: any[] = []): any[] => { if (typeof n === 'string') out.push(n); else if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }
const text = (tree: any) => walk(tree).filter(n => typeof n === 'string').join(' ')

// eggs unlocked: the daily egg hint would otherwise replace the first done line
function base(on: any, store: Record<string, unknown>, opts: { toolText?: () => string; sessionId?: () => string } = {}) {
  store.eggs ??= { passRuns: 1, eggAt: 1, eggRuns: 0 }
  fakeFs(on, {})
  on('store.get', async (_$: unknown, e: any) => ({ value: store[e.key] }) as never)
  on('store.set', async (_$: unknown, e: any) => {
    store[e.key] = e.value
    return { value: undefined } as never
  })
  on('store.delete', async (_$: unknown, e: any) => { delete store[e.key]; return { value: undefined } as never })
  on('store.keys', async () => ({ value: Object.keys(store) }) as never)
  on('ui.render', async () => ENGINE_ROW)
  on('ui.panes', async () => ({ value: [{ id: 'ops-control', isShown: true, isPlaced: true }] }))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async () => ({ value: undefined }) as never)
  on('session.id', async () => ({ value: opts.sessionId?.() ?? 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$: unknown, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: '' }) as never)
  on('tool.call', async () => ({ result: {}, text: opts.toolText?.() ?? 'ok' }) as never)
  return mock.clock(on)
}

const paneText = async ($: any) => {
  const pane = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'Pane', requestId: 'ops-control', props: PANE })
  const body = text(await pane.drawn())
  await pane.unmount()
  return body
}

let n = 0
const bash = ($: any, command: string, extra: object = {}) => $.tool.call({ tool: 'Bash', tool_use_id: `b${++n}`, command, ...extra } as never)
const answer = async ($: any, clock: { advance(ms: number): Promise<void> }, id: string) => {
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 10, isAborted: false, turnId: id })
  await clock.advance(1)
}
const xpOf = (store: Record<string, unknown>) => (store.level as { xp: number } | undefined)?.xp

test('an answered turn at combo 4 earns 9 and the level field shows Lv 1', async ($, on) => {
  const store: Record<string, unknown> = {}
  const clock = base(on, store)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  for (let i = 0; i < 4; i++) await bash($, 'echo hi')
  await answer($, clock, 't1')
  expect(store.level).toEqual({ format: 1, xp: 9 })
  expect(await paneText($)).toContain('Lv 1')
})

test('a subagent earns nothing; a main-loop commit earns 10, and four in a turn earn 30', async ($, on) => {
  const store: Record<string, unknown> = {}
  let out = 'Tests: 3 failed, 9 passed'
  const clock = base(on, store, { toolText: () => out })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await bash($, 'git commit -m x', { agentId: 'a1' })
  await bash($, 'npm test', { agentId: 'a1' })
  out = 'Tests: 12 passed'
  await bash($, 'npm test', { agentId: 'a1' })
  await $.turn.complete({ reason: 'error', answer: '', durationMs: 10, isAborted: false, turnId: 't1' })
  await clock.advance(1)
  expect(xpOf(store)).toBe(0)
  await $.turn.start({ text: 'hi', turnId: 't2' })
  await bash($, 'git commit -m x')
  await $.turn.complete({ reason: 'error', answer: '', durationMs: 10, isAborted: false, turnId: 't2' })
  expect(xpOf(store)).toBe(10)
  out = 'ok'
  await $.turn.start({ text: 'hi', turnId: 't3' })
  for (let i = 0; i < 4; i++) await bash($, 'git commit -m x')
  await $.turn.complete({ reason: 'error', answer: '', durationMs: 10, isAborted: false, turnId: 't3' })
  expect(xpOf(store)).toBe(40)
})

test('two commits chained in one Bash call earn 20', async ($, on) => {
  const store: Record<string, unknown> = {}
  base(on, store, { toolText: () => 'ok' })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await bash($, 'git commit -m one && git commit -m two')
  await $.turn.complete({ reason: 'error', answer: '', durationMs: 10, isAborted: false, turnId: 't1' })
  expect(xpOf(store)).toBe(20)
})

test('a green run after a red one earns 15 even with the green mood off', async ($, on) => {
  const store: Record<string, unknown> = {}
  let out = 'Tests: 3 failed, 9 passed'
  const clock = base(on, store, { toolText: () => out })
  await runOpsControl($, 'setup bubbles.moods done')
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await bash($, 'npm test')
  out = 'Tests: 12 passed'
  await bash($, 'npm test')
  await $.turn.complete({ reason: 'error', answer: '', durationMs: 10, isAborted: false, turnId: 't1' })
  await clock.advance(1)
  expect(xpOf(store)).toBe(15)
})

const LEVEL_SAY_OUTFIT = anyLine(BUILTIN_LINES.clawd, 'level-up', { unlock: 'a new outfit' }).filter(l => !l.includes('…'))
const DONE_SAY = anyLine(BUILTIN_LINES.clawd, 'done')

test('crossing into a lines level shows a level-up bubble that names the unlock, in place of done', async ($, on) => {
  const store: Record<string, unknown> = { level: { format: 1, xp: 95 } }
  const clock = base(on, store)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await answer($, clock, 't1')
  expect(xpOf(store)).toBeGreaterThanOrEqual(100)
  const body = await paneText($)
  expect(body).toContain('new lines')
  expect(DONE_SAY.some(l => body.includes(l))).toBe(false)
})

test('a level crossed on an aborted turn is still announced', async ($, on) => {
  const store: Record<string, unknown> = { level: { format: 1, xp: 95 } }
  const clock = base(on, store)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await bash($, 'git commit -m x')
  await $.turn.complete({ reason: 'aborted', answer: '', durationMs: 10, isAborted: true, turnId: 't1' })
  await clock.advance(1)
  expect(xpOf(store)).toBe(105)
  expect(await paneText($)).toContain('new lines')
})

test('crossing into an outfit level shows a level-up line that names the outfit', async ($, on) => {
  const store: Record<string, unknown> = { level: { format: 1, xp: 295 } }
  const clock = base(on, store)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await answer($, clock, 't1')
  const body = await paneText($)
  expect(body).toContain('Lv 3')
  expect(LEVEL_SAY_OUTFIT.some(l => body.includes(l))).toBe(true)
  expect(DONE_SAY.some(l => body.includes(l))).toBe(false)
})

test('with level-up off, the level-crossing turn says done', async ($, on) => {
  const store: Record<string, unknown> = { level: { format: 1, xp: 95 } }
  const clock = base(on, store)
  await runOpsControl($, 'setup bubbles.moods done')
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await answer($, clock, 't1')
  const body = await paneText($)
  expect(body).not.toContain('new lines')
  expect(DONE_SAY.some(l => body.includes(l))).toBe(true)
})

test('/clear keeps the level field showing', async ($, on) => {
  const store: Record<string, unknown> = { level: { format: 1, xp: 180 } }
  let id = 's1'
  const clock = base(on, store, { sessionId: () => id })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await answer($, clock, 't1')
  expect(await paneText($)).toContain('Lv 2')
  id = 's2'
  await $.turn.start({ text: 'again', turnId: 't2' })
  expect(await paneText($)).toContain('Lv 2')
})

test('a level record from a newer ops-control is left alone, and no outfit is worn over it', async ($, on) => {
  const newer = { format: 2, xp: 5000, extra: 'kept' }
  const store: Record<string, unknown> = { level: newer, outfit: { format: 1, name: 'off' } }
  const clock = base(on, store)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await bash($, 'git commit -m x')
  await answer($, clock, 't1')
  expect(store.level).toEqual(newer)
  expect(store.outfit).toEqual({ format: 1, name: 'off' })
})

test('an outfit record from a newer ops-control is not replaced when a level unlocks an outfit', async ($, on) => {
  const record = { format: 2, name: 'cap', hue: 'red' }
  const store: Record<string, unknown> = { level: { format: 1, xp: 295 }, outfit: record }
  const clock = base(on, store)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await answer($, clock, 't1')
  expect(xpOf(store)).toBeGreaterThanOrEqual(300)
  expect(store.outfit).toEqual(record)
})

test('a junk level store reads as 0 without throwing', async ($, on) => {
  const store: Record<string, unknown> = { level: 'junk' }
  const clock = base(on, store)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await answer($, clock, 't1')
  expect(store.level).toEqual({ format: 1, xp: 5 })
})
