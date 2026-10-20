import { test, expect } from 'claude-code/testing'
import SeekBarClient, { clock } from '../hooks/client/seekbar.tsx'
import { barRow, valueAt, mmss, type SeekBarProps } from '../hooks/music/seek.ts'
import { renderSegs } from '../hooks/layout.tsx'

const colors = { text: 't', accent: 'a', faint: 'f', dim: 'd' }
const prog = (over: Partial<Extract<SeekBarProps, { kind: 'progress' }>> = {}): SeekBarProps =>
  ({ kind: 'progress', cols: 30, progressMs: 60_000, readAt: 1000, durationMs: 180_000, playing: true, colors, ...over })
const vol = (level = 0.5): SeekBarProps => ({ kind: 'volume', cols: 24, level, colors })
const line = (segs: { text: string }[]) => segs.map(s => s.text).join('')
const ELS = { Box: 'Box', Text: 'Text' }

function fakeSurface(columns = 30) {
  const timers: { ms: number; fn: () => void }[] = []
  const posts: unknown[] = []
  const calls = { setState: 0 }
  const on: { key?: (e: { key: string }) => void; pointer?: (e: { type: string; x: number; y: number; button?: string; fine?: { x: number; y: number } }) => void } = {}
  const s: any = {
    state: undefined, columns, elements: ELS,
    setState(v: unknown) { calls.setState++; s.state = v },
    every(ms: number, fn: () => void) { timers.push({ ms, fn }); return () => {} },
    onKey(fn: typeof on.key) { on.key = fn; return () => {} },
    onPointer(fn: typeof on.pointer) { on.pointer = fn; return () => {} },
    post(d: unknown) { posts.push(d) },
  }
  return { s, timers, posts, on, calls }
}
const atTime = <T,>(t: number, run: () => T): T => { const real = clock.now; clock.now = () => t; try { return run() } finally { clock.now = real } }

test('barRow: time, filled and empty bar, duration, exactly cols wide', () => {
  const row = barRow(prog(), 30, 60_000)
  expect(line(row)).toMatch(/^▶ 1:00 ━{6}─{12} 3:00$/)
  expect(line(row)).toHaveLength(30)
  expect(line(barRow(prog({ playing: false }), 30, 60_000))).toMatch(/^‖ 1:00 /)
  // 'vol ' 4 + bar 15 + '  50%' 5; half of 15 rounds to 8 filled
  expect(line(barRow(vol(0.5), 24, 0.5))).toBe('vol ' + '━'.repeat(8) + '─'.repeat(7) + '  50%')
  expect(mmss(95_000)).toBe('1:35')
})

test('valueAt maps a column to a time or a level and clamps past the ends', () => {
  // '▶ 1:00 ' is 7 cells, ' 3:00' is 5, so the bar is 18 cells from column 7
  expect(valueAt(prog(), 30, 60_000, 7)).toBe(0)
  expect(valueAt(prog(), 30, 60_000, 25)).toBe(180_000)
  expect(valueAt(prog(), 30, 60_000, 16.5)).toBe(95_000)
  expect(valueAt(prog(), 30, 60_000, -3)).toBe(0)
  expect(valueAt(prog(), 30, 60_000, 99)).toBe(180_000)
  expect(valueAt(prog({ durationMs: 0 }), 30, 0, 16.5)).toBeUndefined()
  // 'vol ' is 4, '  50%' is 5: the bar is 15 cells from column 4
  expect(valueAt(vol(), 24, 0.5, 11.5)).toBe(0.5)
  expect(valueAt(vol(), 24, 0.5, 30)).toBe(1)
})

test('one 500 ms clock for progress and none for volume; keys only for volume', () => {
  const a = fakeSurface()
  atTime(1000, () => { SeekBarClient(prog(), a.s); SeekBarClient(prog(), a.s) })
  expect(a.timers.map(t => t.ms)).toEqual([500])
  expect(a.on.key).toBeUndefined()
  const b = fakeSurface(24)
  SeekBarClient(vol(), b.s)
  expect(b.timers).toEqual([])
  expect(b.on.key).toBeDefined()
})

test('the clock moves a playing bar on its own', () => {
  const a = fakeSurface()
  expect(atTime(1000, () => SeekBarClient(prog(), a.s))).toEqual(renderSegs(ELS, barRow(prog(), 30, 60_000), 'bar'))
  atTime(3000, () => a.timers[0]!.fn())
  expect(atTime(3000, () => SeekBarClient(prog(), a.s))).toEqual(renderSegs(ELS, barRow(prog(), 30, 62_000), 'bar'))
})

test('a click seeks: down then up posts the time and the bar holds it', () => {
  const a = fakeSurface()
  atTime(1000, () => SeekBarClient(prog(), a.s))
  atTime(1000, () => { a.on.pointer!({ type: 'down', x: 16, y: 0, button: 'left' }); a.on.pointer!({ type: 'up', x: 16, y: 0, button: 'left' }) })
  expect(a.posts).toEqual([{ kind: 'seek', ms: 95_000 }])
  expect(atTime(1000, () => SeekBarClient(prog(), a.s))).toEqual(renderSegs(ELS, barRow(prog(), 30, 95_000), 'bar'))
})

test('a new read ends the hold', () => {
  const a = fakeSurface()
  atTime(1000, () => SeekBarClient(prog(), a.s))
  atTime(1000, () => { a.on.pointer!({ type: 'down', x: 16, y: 0, button: 'left' }); a.on.pointer!({ type: 'up', x: 16, y: 0, button: 'left' }) })
  const fresh = prog({ progressMs: 96_000, readAt: 2000 })
  expect(atTime(2000, () => SeekBarClient(fresh, a.s))).toEqual(renderSegs(ELS, barRow(fresh, 30, 96_000), 'bar'))
})

test('a paused bar stops redrawing once its hold runs out', () => {
  const a = fakeSurface()
  const p = prog({ playing: false })
  atTime(1000, () => SeekBarClient(p, a.s))
  atTime(1000, () => { a.on.pointer!({ type: 'down', x: 16, y: 0, button: 'left' }); a.on.pointer!({ type: 'up', x: 16, y: 0, button: 'left' }) })
  const before = a.calls.setState
  // paused with a live hold: nothing to redraw; past HOLD_MS: one redraw drops the hold; then quiet
  for (const t of [2000, 4500, 5000, 5500]) atTime(t, () => a.timers[0]!.fn())
  expect(a.calls.setState - before).toBe(1)
  expect(a.s.state.held).toBeUndefined()
})

test('a drag past the left edge seeks to 0; a hover posts nothing', () => {
  const a = fakeSurface()
  atTime(1000, () => SeekBarClient(prog(), a.s))
  atTime(1000, () => a.on.pointer!({ type: 'move', x: 12, y: 0 }))
  expect(a.posts).toEqual([])
  atTime(1000, () => { a.on.pointer!({ type: 'down', x: 12, y: 0, button: 'left' }); a.on.pointer!({ type: 'move', x: -4, y: 0, button: 'left' }); a.on.pointer!({ type: 'up', x: -4, y: 0, button: 'left' }) })
  expect(a.posts).toEqual([{ kind: 'seek', ms: 0 }])
})

test('unknown length: a click posts nothing', () => {
  const a = fakeSurface()
  const p = prog({ durationMs: 0 })
  atTime(1000, () => SeekBarClient(p, a.s))
  atTime(1000, () => { a.on.pointer!({ type: 'down', x: 10, y: 0, button: 'left' }); a.on.pointer!({ type: 'up', x: 10, y: 0, button: 'left' }) })
  expect(a.posts).toEqual([])
})

test('before layout the props width stands in for surface.columns', () => {
  const a = fakeSurface(0)
  expect(atTime(1000, () => SeekBarClient(prog(), a.s))).toEqual(renderSegs(ELS, barRow(prog(), 30, 60_000), 'bar'))
})

test('volume: a click sets the level, arrows step 5% and stop at the ends', () => {
  const a = fakeSurface(24)
  SeekBarClient(vol(0.5), a.s)
  a.on.pointer!({ type: 'down', x: 19, y: 0, button: 'left' }); a.on.pointer!({ type: 'up', x: 19, y: 0, button: 'left' })
  a.on.key!({ key: 'right' })
  expect(a.posts).toEqual([{ kind: 'volume', level: 1 }, { kind: 'volume', level: 1 }])
  const b = fakeSurface(24)
  SeekBarClient(vol(0.02), b.s)
  b.on.key!({ key: 'left' }); b.on.key!({ key: 'up' })
  expect(b.posts).toEqual([{ kind: 'volume', level: 0 }])
})
