import { test, expect } from 'claude-code/testing'
import { PRESETS } from '../hooks/themes.ts'
import { SPINNER_IDS } from '../hooks/packs.ts'
import { CLAWD_SHEET, BUILTIN_SHEETS } from '../hooks/pets.ts'
import { spinnerCells, type Cell } from '../hooks/motion.ts'
import { packExport, packsJson, exportAll, themeExport, spinnerExport, petExport } from '../hooks/packexport.ts'

test('exports the four built-in packs in preset order', async () => {
  expect(packExport().map(p => p.name)).toEqual(['classic', 'crt', 'cozy', 'arcade'])
})

test('arcade carries its resolved colors and spinner', async () => {
  const a = packExport().find(p => p.name === 'arcade')!
  expect([a.bg, a.border, a.borderColor, a.rows]).toEqual(['#1a0b33', 'bold', '#ff3ec8', 'cards'])
  expect(a.colors.accent).toBe('#ff3ec8')
  expect(a.gradient).toEqual(['#ff3ec8', '#38e8ff'])
  expect([a.spinner.id, a.spinner.color]).toEqual(['orb-states', '#38e8ff'])
})

test('classic falls back to the classic theme panel and stock spinner', async () => {
  const c = packExport().find(p => p.name === 'classic')!
  expect(c.bg).toBe(c.colors.panel)
  expect(c.gradient).toBe(null)
  expect(c.spinner.id).toBe('stock')
  expect(c.spinner.color).toBe(null)
})

test('every color in the export is #rrggbb', async () => {
  const hex = /^#[0-9a-f]{6}$/i
  for (const p of packExport()) {
    for (const v of [p.bg, p.borderColor, p.spinner.color ?? p.colors.accent, ...Object.values(p.colors)]) expect(hex.test(v)).toBe(true)
  }
  for (const t of themeExport()) for (const v of Object.values(t.colors)) expect(hex.test(v)).toBe(true)
})

test('packsJson ends with one newline and round-trips', async () => {
  const s = packsJson()
  expect(s.endsWith('}\n}\n')).toBe(true)
  expect(JSON.parse(s)).toEqual(exportAll())
})

test('every built-in theme is exported with its resolved colors', async () => {
  const themes = themeExport()
  expect(themes.map(t => t.name)).toEqual(Object.keys(PRESETS))
  expect(themes.find(t => t.name === 'dusk')!.colors.accent).toBe('#b69cff')
  expect(themes.find(t => t.name === 'ops-control')!.word).toBe('Glowing')
})

test('every spinner is exported with frames in white on black', async () => {
  const sp = spinnerExport()
  expect(sp.map(s => s.id)).toEqual([...SPINNER_IDS])
  for (const s of sp) {
    expect(s.frames.length).toBeGreaterThan(0)
    for (const f of s.frames) expect(f.length).toBeGreaterThan(0)
  }
  expect(sp.filter(s => s.text).map(s => s.id)).toEqual(['eyes'])
  expect(sp.find(s => s.id === 'stock')!.frames.map(f => f[0]![0]!.ch).join('')).toBe('·✢✳✶✻✽')
  // Clawd's spinner keeps his own orange
  expect(sp.find(s => s.id === 'clawd')!.frames[0]![0]![0]!.fg).toBe('#d77757')
})

// The cycle the preview loops is the spinner's real period: moving a whole cycle on changes at
// most a few cells (rounding ms to an integer and float edges cost a cell or two). The scanline's
// background checker flips every 400 ms regardless, so only its sweep head is compared.
test('the looping spinners export one whole period, so the preview wraps without a jump', async () => {
  const mono = { color: '#ffffff', bg: '#000000', fg: '#ffffff' }
  const head = (f: Cell[][]) => f[0]!.findIndex(c => c.ch === '█')
  const diff = (a: Cell[][], b: Cell[][]) => a.flat().filter((c, i) => c.ch !== b.flat()[i]!.ch).length
  for (const s of spinnerExport().filter(s => ['scanline', 'ring', 'signal'].includes(s.id))) {
    const cycle = s.ms * s.frames.length
    const ts = Array.from({ length: 40 }, (_, i) => i * 97)
    const off = ts.map(t => s.id === 'scanline'
      ? Math.abs(head(spinnerCells('scanline', t, mono)) - head(spinnerCells('scanline', t + cycle, mono)))
      : diff(spinnerCells(s.id, t, mono), spinnerCells(s.id, t + cycle, mono)))
    expect([s.id, off.reduce((a, b) => a + b, 0) / ts.length < 1.5]).toEqual([s.id, true])
  }
})

test('every built-in pet is exported as its whole idle animation in its own palette', async () => {
  const pets = petExport()
  expect(Object.keys(pets)).toEqual(Object.keys(BUILTIN_SHEETS))
  for (const [id, p] of Object.entries(pets)) {
    const sheet = BUILTIN_SHEETS[id]!
    expect([id, p.cols]).toEqual([id, sheet.w])
    expect(p.frames.map(f => f.ms)).toEqual(sheet.animations.idle!.frames.map(f => f.ms))
    for (const f of p.frames) {
      expect(f.rows.length).toBe(sheet.h / 2)
      for (const r of f.rows) expect(r.reduce((n, s) => n + [...s.text].length, 0)).toBe(sheet.w)
    }
  }
  const spans = (id: string) => pets[id]!.frames[0]!.rows.flat()
  expect(spans('clawd').some(s => s.color === CLAWD_SHEET.palette.B)).toBe(true)
  expect(spans('clawd-shiny').some(s => s.color === CLAWD_SHEET.shiny!.B)).toBe(true)
  expect(new Set(pets.robot!.frames.map(f => JSON.stringify(f.rows))).size).toBeGreaterThan(1)
})
