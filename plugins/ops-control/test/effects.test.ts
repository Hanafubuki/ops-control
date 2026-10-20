import { test, expect } from 'claude-code/testing'
import { fieldFrame, ditherMeters, turnDivider } from '../hooks/effects.ts'
import { validatePack, resolveLook, FIELD_DEFAULTS, type Field } from '../hooks/packs.ts'
import { resolveTheme } from '../hooks/themes.ts'

const C = resolveTheme('classic', {}).theme.colors
const cells = (row: { text: string }[]) => row.reduce((n, s) => n + [...s.text].length, 0)
const text = (frame: { text: string }[][]) => frame.map(r => r.map(s => s.text).join('')).join('\n')
const SIMPLEX: Field = { ...FIELD_DEFAULTS, shape: 'simplex', speed: 0.28, scale: 0.32, rotation: 96, offsetX: -0.22, offsetY: 0.12, size: 3, dither: '4x4' }

test('every shape and dither size fills each row to exactly the asked width with braille or blanks', async () => {
  for (const f of [SIMPLEX, { ...SIMPLEX, size: 1, dither: '8x8' }, { ...FIELD_DEFAULTS, shape: 'warp' }, { ...SIMPLEX, size: 4, dither: '2x2' }] as Field[]) {
    const frame = fieldFrame(58, 12, C, 1.5, f)
    expect(frame.length).toBe(12)
    for (const r of frame) {
      expect(cells(r)).toBe(58)
      for (const s of r) expect(/^[⠀-⣿ ]+$/.test(s.text)).toBe(true)
    }
  }
})

test('the field is a function of time: the same moment draws the same frame, a later one moves', async () => {
  expect(text(fieldFrame(40, 8, C, 2, SIMPLEX))).toBe(text(fieldFrame(40, 8, C, 2, SIMPLEX)))
  expect(text(fieldFrame(40, 8, C, 4, SIMPLEX))).not.toBe(text(fieldFrame(40, 8, C, 2, SIMPLEX)))
  // speed 0 holds still, whatever the clock says
  const still = { ...SIMPLEX, speed: 0 }
  expect(text(fieldFrame(40, 8, C, 9, still))).toBe(text(fieldFrame(40, 8, C, 0, still)))
})

test('size makes dither pixels of size x size dots: at 4, a whole braille cell is on or off', async () => {
  const glyphs = [...text(fieldFrame(16, 4, C, 1, { ...SIMPLEX, size: 4, dither: '2x2' })).replace(/\n/g, '')]
  expect(glyphs.every(g => g === '⣿' || g === ' ')).toBe(true)
  expect(glyphs.some(g => g === '⣿')).toBe(true)
})

test('dither meters: one bar per window that fits the width and shows what is left', async () => {
  const rows = ditherMeters(50, [{ label: '5h', usedPercent: 14, reset: '↻3h0m' }, { label: 'wk', usedPercent: 26, reset: '↻Thu' }], 5, C)
  expect(rows.length).toBe(2)
  for (const r of rows) expect(cells(r)).toBe(50)
  const first = rows[0]!.map(s => s.text).join('')
  expect(first.startsWith('5h ')).toBe(true)
  expect(first).toContain(' 86%')
  expect(first).toContain('▓▒░')
  expect(first.endsWith('↻3h0m')).toBe(true)
  const ctx = ditherMeters(40, [], 30, C)
  expect(ctx.length).toBe(1)
  expect(ctx[0]!.map(s => s.text).join('')).toContain(' 70%')
})

test('turn divider: the number in accent between dithered ends, one fill cell', async () => {
  const d = turnDivider(3, C)
  expect(d.left.map(s => s.text).join('')).toBe('░▒▓━━ 03 ')
  expect(d.left[1]).toEqual({ text: '03', color: C.accent, bold: true })
  expect(d.fill.text).toBe('━')
  expect(d.right.map(s => s.text).join('')).toBe('▓▒░')
})

test('packs pick the effects: motion.field, colors.meters and colors.dividers, off by default', async () => {
  const file = { format: 1, name: 'fx', colors: { meters: 'dither', dividers: true }, motion: { field: 'warp' } }
  validatePack(file)
  const { look, errors } = resolveLook({ colors: 'fx', motion: 'fx' }, { fx: file }, {})
  expect(errors).toEqual([])
  expect([look.meters, look.dividers, look.motion.field]).toEqual(['dither', true, { shape: 'warp', ...FIELD_DEFAULTS }])
  const base = resolveLook({ colors: 'classic', motion: 'classic' }, {}, {}).look
  expect([base.meters, base.dividers, base.motion.field.shape]).toEqual(['default', false, 'none'])
})

test('motion.field as an object sets the knobs it names and leaves the rest at their defaults', async () => {
  const file = { format: 1, name: 'fx', motion: { field: { shape: 'simplex', speed: 0.28, scale: 0.32, rotation: 96, offsetX: -0.22, offsetY: 0.12, size: 3, dither: '4x4' } } }
  validatePack(file)
  const { look } = resolveLook({ colors: 'classic', motion: 'fx' }, { fx: file }, {})
  expect(look.motion.field).toEqual({ ...SIMPLEX })
})

test('a bad effect value is refused with the allowed values', async () => {
  const bad = (colors: object, motion: object = {}) => () => validatePack({ format: 1, name: 'x', colors, motion })
  expect(bad({ meters: 5 })).toThrow('colors.meters must be one of default, dither')
  expect(bad({ dividers: 'yes' })).toThrow('colors.dividers must be true or false')
  expect(bad({}, { field: 5 })).toThrow('motion.field must be one of none, warp, simplex, or an object with a shape')
  expect(bad({}, { field: { speed: 1 } })).toThrow('motion.field.shape must be one of none, warp, simplex')
  expect(bad({}, { field: { shape: 'simplex', speed: 9 } })).toThrow('motion.field.speed must be a number from 0 to 4')
  expect(bad({}, { field: { shape: 'simplex', size: 2.5 } })).toThrow('motion.field.size must be a whole number of dots')
  expect(bad({}, { field: { shape: 'simplex', dither: 3 } })).toThrow('motion.field.dither must be one of 2x2, 4x4, 8x8')
  expect(bad({}, { field: { shape: 'simplex', fps: 30 } })).toThrow('motion.field.fps must be a number from 1 to 12')
  expect(bad({}, { field: { shape: 'simplex', color: 'red' } })).toThrow('motion.field.color must be #rrggbb')
})

test('an unknown field shape, dither or knob is skipped with a notice, not refused', async () => {
  const run = (motion: object) => resolveLook({ colors: 'classic', motion: 'x' }, { x: { format: 1, name: 'x', motion } }, {})
  expect(run({ field: 'plasma' }).notices).toEqual(['pack "x": unknown value "plasma" for motion.field skipped'])
  const r = run({ field: { shape: 'simplex', dither: '3x3', hue: 1, speed: 2 } })
  expect(r.notices).toEqual(['pack "x": unknown key "motion.field.hue" skipped', 'pack "x": unknown value "3x3" for motion.field.dither skipped'])
  expect(r.look.motion.field).toMatchObject({ shape: 'simplex', speed: 2, dither: FIELD_DEFAULTS.dither })
})

test('the field is one colour, one segment a row: field.color, else the palette faint', async () => {
  for (const r of fieldFrame(40, 6, C, 1, SIMPLEX)) expect(r.map(s => s.color)).toEqual([C.faint])
  for (const r of fieldFrame(40, 6, C, 1, { ...SIMPLEX, color: '#e0703a' })) expect(r.map(s => s.color)).toEqual(['#e0703a'])
})
