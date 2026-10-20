import { test, expect } from 'claude-code/testing'
import { cleanFrames, cleanRows, cleanDivider, fieldTail, fitField, meterWindows, MAX_FRAMES, PROPS_BUDGET } from '../hooks/renderers.ts'
import { initialModel, type Model } from '../hooks/model.ts'

const TEXT = '#e8dcc4'

test('frames: segments keep text and a hex colour, fall back to the text colour, and lose control characters', async () => {
  const got = cleanFrames({ ms: 83, frames: [[[{ text: 'a\u001b[31mb', color: '#e0703a', bold: true }, { text: 'c', color: 'red' }]]] }, 4, TEXT)
  expect(got).toEqual({ ms: 83, frames: [[[{ text: 'a[31mb', color: '#e0703a', bold: true }, { text: 'c', color: TEXT }]]] })
})

test('frames: ms is held between 40 and 2000, frames are capped, rows beyond the asked height are dropped', async () => {
  const row = [{ text: 'x' }]
  const many = Array.from({ length: MAX_FRAMES + 10 }, () => [row, row, row])
  const got = cleanFrames({ ms: 1, frames: many }, 2, TEXT)!
  expect(got.ms).toBe(40)
  expect(got.frames.length).toBe(MAX_FRAMES)
  expect(got.frames[0]!.length).toBe(2)
  expect(cleanFrames({ ms: 99999, frames: [[row]] }, 2, TEXT)!.ms).toBe(2000)
})

test('frames: anything not shaped like frames is no answer', async () => {
  for (const v of [null, undefined, 'warp', { ms: 83 }, { ms: 83, frames: [] }, { ms: 83, frames: 'x' }, { frames: [[[{ text: 1 }]]] }]) {
    expect(cleanFrames(v, 4, TEXT)).toBeNull()
  }
})

test('meter rows: up to three rows of segments; an empty or malformed answer is none', async () => {
  expect(cleanRows([[{ text: '5h ', color: '#b0a184' }], [{ text: 'wk' }]], 3, TEXT)).toEqual([[{ text: '5h ', color: '#b0a184' }], [{ text: 'wk', color: TEXT }]])
  expect(cleanRows([[{ text: 'a' }], [{ text: 'b' }], [{ text: 'c' }], [{ text: 'd' }]], 3, TEXT)!.length).toBe(3)
  expect(cleanRows([], 3, TEXT)).toBeNull()
  expect(cleanRows('5h', 3, TEXT)).toBeNull()
})

test('divider: left, one fill cell and right; a fill wider than one cell is refused', async () => {
  expect(cleanDivider({ left: [{ text: '░▒▓━ 03 ', color: '#e0703a' }], fill: { text: '━', color: '#a3533a' }, right: [{ text: '▓▒░' }] }, TEXT))
    .toEqual({ left: [{ text: '░▒▓━ 03 ', color: '#e0703a' }], fill: { text: '━', color: '#a3533a' }, right: [{ text: '▓▒░', color: TEXT }] })
  expect(cleanDivider({ left: [], fill: { text: '━━' }, right: [] }, TEXT)).toBeNull()
  expect(cleanDivider({ left: [], right: [] }, TEXT)).toBeNull()
})

test('the field shows the bottom rows of each frame, so a short pane keeps the haze by the pet box', async () => {
  const f = [[{ text: 'top', color: TEXT }], [{ text: 'mid', color: TEXT }], [{ text: 'low', color: TEXT }]]
  expect(fieldTail(f, 2).map(r => r[0]!.text)).toEqual(['mid', 'low'])
  expect(fieldTail(f, 5).length).toBe(3)
  expect(fieldTail(f, 0)).toEqual([])
})

test('a field over the props budget loses every other frame and slows to match; one frame still too big is dropped', async () => {
  const wide = (n: number) => Array.from({ length: n }, (_, i) => ({ text: '⣿', color: i % 2 ? '#e0703a' : '#a3533a' }))
  const big = { ms: 100, frames: Array.from({ length: 32 }, () => Array.from({ length: 30 }, () => wide(58))) }
  const fit = fitField(big, 10)!
  expect(JSON.stringify(fit.frames).length).toBeLessThanOrEqual(PROPS_BUDGET)
  expect(fit.frames[0]!.length).toBe(10)
  expect(fit.frames.length).toBeLessThan(32)
  expect(fit.ms).toBe(100 * (32 / fit.frames.length))
  const huge = { ms: 100, frames: [Array.from({ length: 30 }, () => wide(400))] }
  expect(fitField(huge, 30)).toBeNull()
  expect(fitField({ ms: 100, frames: [[[{ text: 'x', color: TEXT }]]] }, 5)).toEqual({ ms: 100, frames: [[[{ text: 'x', color: TEXT }]]] })
})

test('meter windows: the live 5-hour and weekly readings with their reset, in that order', async () => {
  const now = Date.parse('2026-10-05T12:00:00Z')
  const m: Model = { ...initialModel(), limits: [
    { kind: 'seven_day', percentUsed: 26, resetsAt: '2026-10-08T12:00:00Z' },
    { kind: 'five_hour', percentUsed: 14, resetsAt: '2026-10-05T15:00:00Z' },
  ] }
  expect(meterWindows(m, now, 0)).toEqual([
    { label: '5h', usedPercent: 14, reset: '↻3h0m' },
    { label: 'wk', usedPercent: 26, reset: '↻Thu' },
  ])
  expect(meterWindows({ ...m, limits: [] }, now, 0)).toEqual([])
})
