import { test, expect } from 'claude-code/testing'
import { orbStateOf, usesOwnSpinner, spinnerLine, spinnerProps, checkedSpinnerProps, elapsed } from '../hooks/spinner.ts'
import SpinnerClient from '../hooks/client/spinner.tsx'
import { SPINNERS, SCAN_BAR } from '../hooks/motion.ts'
import { SPINNER_IDS, resolveLook, stockMotion } from '../hooks/packs.ts'
import { initialModel, applyEvent } from '../hooks/model.ts'

const look = (n: string) => resolveLook({ colors: n, motion: n }, {}, {}).look
const IN = { word: 'Thinking', turnAt: 0, detail: 'Editing src/auth.ts', state: 'work' as const }

test('motion.ts and packs.ts name the same six spinners', async () => {
  expect(Object.keys(SPINNERS).sort()).toEqual([...SPINNER_IDS].sort())
})

test('a malformed look yields no props, so the caller keeps the engine line', async () => {
  const good = look('arcade')
  expect(checkedSpinnerProps(good, IN, false, 1000)).toBeDefined()
  const bad = { ...good, motion: { ...good.motion, spinner: 'nope' } } as never
  expect(checkedSpinnerProps(bad, IN, false, 1000)).toBeUndefined()
  expect(checkedSpinnerProps({ ...good, theme: undefined } as never, IN, false, 1000)).toBeUndefined()
})

test('stock, reduced motion and engine messages keep the engine line', async () => {
  expect(usesOwnSpinner(look('classic'), false, null)).toBe(false)
  expect(usesOwnSpinner(look('arcade'), true, null)).toBe(false)
  expect(usesOwnSpinner(look('arcade'), false, 'Compacting conversation')).toBe(false)
  expect(usesOwnSpinner(look('arcade'), false, null)).toBe(true)
  expect(usesOwnSpinner(stockMotion(look('arcade')), false, null)).toBe(false)
})

test('the line: badge sized to the spinner, shimmering word, elapsed and esc', async () => {
  const l = look('arcade')
  const a = spinnerLine(l, IN, 12_300)
  expect(a.badge).toHaveLength(SPINNERS['orb-states'].rows)
  expect(a.word.map(s => s.text).join('')).toBe('Thinking…')
  expect(a.tail).toBe('(12s · esc to interrupt)')
  expect(a.detail).toBe('Editing src/auth.ts')
  const b = spinnerLine(l, IN, 12_500)
  expect(b.word.map(s => s.color).join()).not.toBe(a.word.map(s => s.color).join())
  expect(spinnerLine(look('crt'), IN, 12_300).word.map(s => s.color).join()).toBe(spinnerLine(look('crt'), IN, 12_500).word.map(s => s.color).join())
})

test('one-row spinners have no detail row', async () => {
  expect(spinnerLine({ ...look('arcade'), motion: { ...look('arcade').motion, spinner: 'shimmer' } }, IN, 0).detail).toBeUndefined()
})

test('the shimmer spinner pulses bold even with shimmer off', async () => {
  const l = look('crt')
  const s = { ...l, motion: { ...l.motion, spinner: 'shimmer' as const, shimmer: 0 as const } }
  const a = spinnerLine(s, IN, 0), b = spinnerLine(s, IN, 300)
  expect(a.word.map(x => x.color).join()).not.toBe(b.word.map(x => x.color).join())
  expect(a.word.some(x => x.bold)).toBe(true)
})

test('elapsed formats seconds and minutes', async () => {
  expect([elapsed(400), elapsed(12_300), elapsed(64_000)]).toEqual(['0s', '12s', '1m 4s'])
})

test('orbStateOf maps activity', async () => {
  let m = applyEvent(initialModel(), { type: 'turn-start', at: 0 })
  expect(orbStateOf(m)).toBe('think')
  m = applyEvent(m, { type: 'tool-start', at: 1, tool: 'Grep', toolUseId: 'g', input: { pattern: 'x' } })
  expect(orbStateOf(m)).toBe('search')
  m = applyEvent(m, { type: 'tool-start', at: 2, tool: 'Edit', toolUseId: 'e', input: { file_path: '/a' } })
  expect(orbStateOf(m)).toBe('work')
  m = applyEvent(m, { type: 'tool-start', at: 3, tool: 'Bash', toolUseId: 'b', input: { command: 'ls' } })
  expect(orbStateOf(m)).toBe('run')
  m = applyEvent(m, { type: 'tool-start', at: 4, tool: 'Agent', toolUseId: 'a', input: { description: 'scout' } })
  expect(orbStateOf(m)).toBe('agents')
})

const surface = (state?: number) => {
  const timers: number[] = []
  return { timers, s: { elements: { Box: 'Box', Text: 'Text' }, state, setState: () => {}, every: (ms: number) => { timers.push(ms); return () => {} }, columns: 40, rows: 2 } as any }
}

test('the client starts one 33 ms clock, none under reduced motion', async () => {
  const on = surface(); SpinnerClient(spinnerProps(look('arcade'), IN, false) as any, on.s)
  expect(on.timers).toEqual([33])
  const off = surface(); SpinnerClient(spinnerProps(look('arcade'), IN, true) as any, off.s)
  expect(off.timers).toEqual([])
  const again = surface(5); SpinnerClient(spinnerProps(look('arcade'), IN, false) as any, again.s)
  expect(again.timers).toEqual([])
})

test('negative elapsed clamps to 0s', async () => {
  expect(elapsed(-5000)).toBe('0s')
})

test('an empty detail draws no child', async () => {
  const p = spinnerProps(look('arcade'), { ...IN, detail: '' }, true)
  const out = JSON.stringify(SpinnerClient(p as any, surface().s))
  expect(out).not.toContain('""')
})

test('the outer box, which holds the badge rows too, has 2 columns of left padding', async () => {
  const tree = SpinnerClient(spinnerProps(look('arcade'), IN, true) as any, surface().s) as any
  expect(tree.props.paddingLeft).toBe(2)
})

test('client props carry only what the line reads', async () => {
  const p = spinnerProps(look('arcade'), IN, false)
  expect(JSON.stringify(p).length).toBeLessThan(1000)
  expect(spinnerLine(p.look, p.input, 777)).toEqual(spinnerLine(look('arcade'), IN, 777))
})

test('spinnerLine hands the word effect the same clock as the badge', async () => {
  const l = look('classic')
  const scan = { ...l, motion: { ...l.motion, spinner: 'scanline' as const } }
  const props = spinnerProps(scan, { word: 'Thinking', turnAt: 1000, detail: '', state: 'think' }, false)
  const line = spinnerLine(props.look, props.input, 1000 + (SCAN_BAR + 1) * 45)
  expect(line.word[0]!.bg).toBe(props.look.theme.colors.accent)
  expect(line.badge[0]!.some(s => s.text.includes('█'))).toBe(false)
})
