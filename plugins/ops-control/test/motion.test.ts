import { test, expect } from 'claude-code/testing'
import { mix, gradient, wave } from '../hooks/color.ts'
import { SPINNERS, spinnerCells, scanPos, cellsToSpans, spinnerWordSpans, SCAN_BAR, type SpinnerId, type WordLook } from '../hooks/motion.ts'
import { cellWidth } from '../hooks/cells.ts'

const O = { color: '#38e8ff', bg: '#1a0b33', fg: '#f0e6ff' }
const ids = Object.keys(SPINNERS) as SpinnerId[]

test('mix blends #rrggbb and clamps t', async () => {
  expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
  expect(mix('#102030', '#405060', 0)).toBe('#102030')
  expect(mix('#102030', '#405060', 2)).toBe('#405060')
})

test('gradient gives one span per code point and ends on both colors', async () => {
  const g = gradient('héllo', '#ff0000', '#0000ff')
  expect(g.map(s => s.text).join('')).toBe('héllo')
  expect(g[0]!.color).toBe('#ff0000')
  expect(g.at(-1)!.color).toBe('#0000ff')
  expect(gradient('x', '#ff0000', '#0000ff')[0]!.color).toBe('#ff0000')
})

test('wave moves with time', async () => {
  const at = (t: number) => wave('Thinking', '#000000', '#ffffff', t, 1).map(s => s.color).join()
  expect(at(0)).not.toBe(at(400))
})

test('the library is exactly these ten', async () => {
  expect(ids.sort()).toEqual(['clawd', 'comet', 'eyes', 'glitch', 'orb-states', 'ring', 'scanline', 'shimmer', 'signal', 'stock'])
})

test('every frame has its declared size and only width-1 BMP cells', async () => {
  for (const id of ids) for (const t of [0, 33, 517, 2999, 61_000]) {
    const rows = spinnerCells(id, t, O)
    expect(rows.length).toBe(SPINNERS[id].rows)
    for (const r of rows) {
      expect(r.length).toBe(SPINNERS[id].cols)
      for (const c of r) {
        const cp = c.ch.codePointAt(0)!
        expect([...c.ch].length).toBe(1)
        expect(cp >= 0x20 && cp <= 0xffff && cellWidth(cp) === 1).toBe(true)
        expect(c.fg).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  }
})

test('frames are deterministic and move over time', async () => {
  for (const id of ['comet', 'eyes', 'orb-states', 'clawd', 'scanline', 'ring', 'signal'] as const) {
    const at = (t: number) => JSON.stringify(spinnerCells(id, t, O))
    expect(at(1000)).toBe(at(1000))
    expect(new Set([0, 250, 1000, 3450].map(at)).size).toBeGreaterThan(1)
  }
})

test('every new spinner keeps its size in every state and is never blank', async () => {
  for (const id of ['scanline', 'ring', 'glitch', 'signal'] as const) for (const st of ['think', 'search', 'work', 'run', 'agents'] as const) for (const t of [0, 1000, 10_000]) {
    const rows = spinnerCells(id, t, O, st)
    expect(rows.length).toBe(SPINNERS[id].rows)
    for (const r of rows) expect(r.length).toBe(SPINNERS[id].cols)
    expect(rows.flat().some(c => c.ch !== ' ')).toBe(true)
  }
})

test('scanline: the scan cell is a full block that crosses the bar left to right', async () => {
  const at = (t: number) => spinnerCells('scanline', t, { ...O, wordLen: 10 }).flat().findIndex(c => c.ch === '█')
  expect(at(0)).toBe(0)
  expect(at(45 * 4)).toBe(4)
  expect(at(45 * 12)).toBe(-1) // past the bar, scanning the word
})

test('scanline: run and agents scan faster than think', async () => {
  expect(scanPos(450, 10, 'run')).toBeGreaterThan(scanPos(450, 10, 'think'))
  expect(scanPos(450, 10, 'agents')).toBe(scanPos(450, 10, 'run'))
})

test('scanline: the scan cell reads on a light pack', async () => {
  const light = { color: '#0000f2', bg: '#f2f2f2', fg: '#000091' }
  const hi = spinnerCells('scanline', 0, light).flat()[0]!
  expect(hi.ch).toBe('█')
  expect(hi.fg).toBe('#000091')
})

test('ring and signal react to the activity state', async () => {
  for (const id of ['ring', 'signal'] as const) {
    const frames = (['think', 'run', 'agents'] as const).map(st => JSON.stringify(spinnerCells(id, 1000, O, st)))
    expect(new Set(frames).size).toBe(3)
  }
})

test('glitch draws one diamond in the spinner color', async () => {
  expect(spinnerCells('glitch', 500, O)).toEqual([[{ ch: '◆', fg: O.color }]])
})

test('orb states draw differently', async () => {
  const frames = (['think', 'search', 'work', 'run', 'agents'] as const).map(st => JSON.stringify(spinnerCells('orb-states', 1000, O, st)))
  expect(new Set(frames).size).toBe(5)
})

test('negative or NaN time draws the first frame', async () => {
  for (const id of ids) for (const t of [-50, NaN]) {
    expect(spinnerCells(id, t, O)).toEqual(spinnerCells(id, 0, O))
    for (const c of spinnerCells(id, t, O).flat()) expect(c.ch).toBeDefined()
  }
})

test('every orb state keeps the declared size and width-1 glyphs', async () => {
  for (const st of ['think', 'search', 'work', 'run', 'agents'] as const) {
    const rows = spinnerCells('orb-states', 1000, O, st)
    expect(rows.length).toBe(SPINNERS['orb-states'].rows)
    for (const r of rows) {
      expect(r.length).toBe(SPINNERS['orb-states'].cols)
      for (const c of r) { const cp = c.ch.codePointAt(0)!; expect(cp >= 0x20 && cp <= 0xffff && cellWidth(cp) === 1).toBe(true) }
    }
  }
})

test('a frame uses few colors', async () => {
  for (const id of ids) expect(new Set(spinnerCells(id, 1234, O).flat().map(c => c.fg + (c.bg ?? ''))).size).toBeLessThanOrEqual(64)
})

test('clawd keeps his own color', async () => {
  expect(spinnerCells('clawd', 0, { ...O, color: '#00ff00' }).flat().every(c => c.fg === '#d77757')).toBe(true)
})

test('cellsToSpans merges runs of one color', async () => {
  const spans = cellsToSpans([[{ ch: 'a', fg: '#111111' }, { ch: 'b', fg: '#111111' }, { ch: 'c', fg: '#222222', bg: '#000000' }]])
  expect(spans[0]).toEqual([{ text: 'ab', color: '#111111' }, { text: 'c', color: '#222222', bg: '#000000' }])
})

const WL = (spinner: SpinnerId): WordLook => ({
  bg: '#0d0d24', motion: { spinner, shimmer: 1, color: '#8080ff' },
  theme: { colors: { text: '#e5e5ee', accent: '#8080ff', read: '#00f2f2', agent: '#af66f7' } },
})
const joined = (s: { text: string }[]) => s.map(x => x.text).join('')

test('scanline word: every character comes back in order, the two under the scan lit', async () => {
  const word = 'Ünïcode…'
  for (const t of [0, 500, 1000, 1700]) expect(joined(spinnerWordSpans(WL('scanline'), word, 0, { t, st: 'think' }))).toBe(word)
  // the scan reaches the word's first letter after the bar and the one-cell gap
  const lit = spinnerWordSpans(WL('scanline'), word, 0, { t: (SCAN_BAR + 1) * 45, st: 'think' })
  expect(lit[0]).toMatchObject({ color: '#0d0d24', bg: '#8080ff' })
  expect(spinnerWordSpans(WL('scanline'), word, 0, { t: 0, st: 'think' }).every(s => !s.bg)).toBe(true)
})

test('glitch word: never changes the line length and keeps letters in place', async () => {
  const word = 'Thinking…', n = [...word].length
  let tore = 0, swapped = 0
  for (let f = 0; f < 400; f++) {
    const spans = spinnerWordSpans(WL('glitch'), word, 0, { t: f * 70, st: 'run' })
    const chars = [...joined(spans)]
    expect(chars.length).toBe(n + 1)
    const torn = chars.at(-1) !== ' '
    if (torn) tore++
    const body = torn ? chars.slice(1) : chars.slice(0, n)
    body.forEach((ch, i) => { if (ch !== [...word][i]) { expect('▓▒░█▚').toContain(ch); swapped++ } })
  }
  expect(tore).toBeGreaterThan(0)
  expect(swapped).toBeGreaterThan(0)
})

test('glitch word: the line keeps its cell width with wide and zero-width letters', async () => {
  const width = (spans: { text: string }[]) => [...joined(spans)].reduce((s, ch) => s + cellWidth(ch.codePointAt(0)!), 0)
  for (const word of ['Thé漢字ing…', '漢字Thinking']) {
    const widths = new Set<number>()
    for (let f = 0; f < 400; f++) widths.add(width(spinnerWordSpans(WL('glitch'), word, 0, { t: f * 70, st: 'run' })))
    expect([word, [...widths]]).toEqual([word, [width([{ text: word + ' ' }])]])
  }
})

test('glitch word: a frame is the same on every redraw within its 70 ms', async () => {
  const at = (t: number) => JSON.stringify(spinnerWordSpans(WL('glitch'), 'Thinking…', 0, { t, st: 'think' }))
  expect(at(140)).toBe(at(209))
})

test('word effects fall back to accent and text without read and agent colors', async () => {
  const bare: WordLook = { ...WL('glitch'), theme: { colors: { text: '#e5e5ee', accent: '#8080ff' } } }
  for (let f = 0; f < 50; f++) for (const s of spinnerWordSpans(bare, 'Thinking…', 0, { t: f * 70, st: 'run' })) {
    expect(['#e5e5ee', '#8080ff', '#0d0d24']).toContain(s.color)
  }
})
