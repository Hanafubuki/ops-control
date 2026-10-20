import { test, expect } from 'claude-code/testing'
import { resolveLook, validatePack, exportMix, exportName, packNameProblem, stockMotion, SPINNER_IDS, FIELD_DEFAULTS, type Mix } from '../hooks/packs.ts'
import { PACKS } from '../hooks/packpresets.ts'
import { resolveTheme } from '../hooks/themes.ts'

const pack = (name: string): Mix => ({ colors: name, motion: name })
const look = (m: Mix, user: Record<string, unknown> = {}) => resolveLook(m, user, {})

test('built-in packs resolve cleanly', async () => {
  for (const n of ['classic', 'crt', 'cozy', 'arcade']) expect(look(pack(n)).errors).toEqual([])
  expect(Object.keys(PACKS).sort()).toEqual(['arcade', 'classic', 'cozy', 'crt'])
})

test('classic is the 0.1 look', async () => {
  const l = look(pack('classic')).look
  expect(l.theme).toEqual(resolveTheme('classic', {}).theme)
  expect([l.rows, l.border, l.motion.spinner, l.extras.hp, l.extras.combo]).toEqual(['classic', 'round', 'stock', false, false])
})

test('arcade carries the mockup values', async () => {
  const l = look(pack('arcade')).look
  expect(l.theme.colors.accent).toBe('#ff3ec8')
  expect(l.theme.name).toBe('classic')
  expect([l.rows, l.border, l.bg, l.borderColor]).toEqual(['cards', 'bold', '#1a0b33', '#ff3ec8'])
  expect(l.gradient).toEqual(['#ff3ec8', '#38e8ff'])
  expect(l.extras).toEqual({ hp: true, combo: true })
  expect(l.rowFlags).toEqual({ labels: false, markers: true, xp: true })
  expect(l.motion).toEqual({ spinner: 'orb-states', shimmer: 2, color: '#38e8ff', field: { shape: 'none', ...FIELD_DEFAULTS } })
})

test('layers mix: crt colors with arcade motion', async () => {
  const l = look({ colors: 'crt', motion: 'arcade' }).look
  expect([l.colorsFrom, l.motionFrom, l.rows, l.motion.spinner]).toEqual(['crt', 'arcade', 'retro', 'orb-states'])
})

test('mix.theme replaces the palette and keeps rows and border', async () => {
  const l = look({ ...pack('arcade'), theme: 'dusk' }).look
  const dusk = resolveTheme('dusk', {}).theme
  expect(l.theme.colors).toEqual(dusk.colors)
  expect([l.rows, l.border, l.bg, l.borderColor]).toEqual(['cards', 'bold', dusk.colors.panel, dusk.colors.faint])
  expect(l.gradient).toEqual([dusk.colors.accent, dusk.colors.read])
})

test('mix.spinner overrides the motion layer; an unknown id falls back to stock with a reason', async () => {
  expect(look({ ...pack('crt'), spinner: 'eyes' }).look.motion.spinner).toBe('eyes')
  const r = look({ ...pack('crt'), spinner: 'orb' })
  expect(r.look.motion.spinner).toBe('stock')
  expect(r.errors.join()).toContain('"orb"')
})

test('extends and layer references', async () => {
  const user = { mine: { format: 1, name: 'mine', extends: 'cozy', colors: { rows: 'retro' }, motion: 'crt' } }
  const l = look(pack('mine'), user).look
  expect([l.rows, l.gradient?.[0], l.motion.spinner]).toEqual(['retro', '#f4a6b8', 'comet'])
})

test('row flags default to labels on, and a user pack can set them over an extends chain', async () => {
  expect(look(pack('classic')).look.rowFlags).toEqual({ labels: true, markers: false, xp: false })
  const user = { mine: { format: 1, name: 'mine', extends: 'arcade', colors: { rowFlags: { markers: false } } } }
  expect(look(pack('mine'), user).look.rowFlags).toEqual({ labels: false, markers: false, xp: true })
})

test('mix.overrides sit on top of the pack, a theme override, and the classic fallback', async () => {
  const overrides = { accent: '#010203', panel: '#040506' }
  const a = look({ ...pack('cozy'), overrides }).look
  expect([a.theme.colors.accent, a.theme.colors.text, a.motion.color]).toEqual(['#010203', '#f5e6d3', '#ffd9a0'])
  const t = look({ ...pack('classic'), theme: 'dusk', overrides }).look
  expect([t.theme.colors.accent, t.bg, t.theme.colors.read]).toEqual(['#010203', '#040506', resolveTheme('dusk', {}).theme.colors.read])
  const fallback = look({ ...pack('ghost'), overrides }).look
  expect(fallback.theme.colors.accent).toBe('#010203')
  expect(look({ ...pack('cozy'), overrides: { accent: 'nope', bogus: '#ffffff' } as never }).look.theme.colors.accent).toBe('#f4a6b8')
})

test('a bad layer falls back alone, with its reason', async () => {
  const user = { half: { format: 1, name: 'half', colors: { rows: 5 }, motion: { spinner: 'comet' } } }
  const r = look(pack('half'), user)
  expect([r.look.rows, r.look.colorsFrom, r.look.motion.spinner]).toEqual(['classic', 'classic', 'comet'])
  expect(r.errors[0]).toContain('rows')
})

test('unknown pack falls back to classic', async () => {
  expect(look(pack('ghost')).errors.join()).toContain('no pack named "ghost"')
})

test('cycles and chains deeper than 8 are refused', async () => {
  const loop = { a: { format: 1, name: 'a', extends: 'b' }, b: { format: 1, name: 'b', motion: 'a' } }
  expect(look(pack('a'), loop).errors.join()).toContain('loops')
  const deep: Record<string, unknown> = {}
  for (let i = 0; i < 9; i++) deep['p' + i] = { format: 1, name: 'p' + i, extends: i < 8 ? 'p' + (i + 1) : 'classic' }
  expect(look(pack('p0'), deep).errors.join()).toContain('deeper than 8')
  // seven user packs plus classic is eight levels: allowed
  delete deep.p8; delete deep.p7; (deep.p6 as { extends: string }).extends = 'classic'
  expect(look(pack('p0'), deep).errors).toEqual([])
})

test('validation refuses bad values', async () => {
  const bad: [unknown, string][] = [
    [{ format: 1, name: 'x', colors: { palette: { accent: 'red' } } }, '#rrggbb'],
    [{ format: 1, name: 'x', colors: { border: 5 } }, 'border'],
    [{ format: 1, name: 'x', colors: { gradient: ['#ffffff'] } }, 'gradient'],
    [{ format: 1, name: 'x', colors: { extras: { hp: 'yes' } } }, 'extras'],
    [{ format: 1, name: 'x', colors: { rowFlags: { labels: 'no' } } }, 'rowFlags'],
    [{ format: 1, name: 'x', motion: { spinner: 'Disco Ball' } }, 'spinner'],
    [{ format: 1, name: 'x', motion: { shimmer: '3' } }, 'shimmer'],
    [{ format: 1, name: 'x', motion: { field: 5 } }, 'motion.field'],
    [{ name: 'x' }, '"format"'],
    [{ format: 2, name: 'x' }, 'newer ops-control'],
    ['x', 'JSON object'],
  ]
  for (const [file, msg] of bad) expect(() => validatePack(file)).toThrow(msg)
})

test('sound and voice are reserved: objects pass silently, any other value is skipped with a notice', async () => {
  expect(look(pack('s'), { s: { format: 1, name: 's', sound: { anything: 1 }, voice: { on: true } } }).errors).toEqual([])
  const r = look(pack('s'), { s: { format: 1, name: 's', sound: 'on', voice: 5 } })
  expect(r.errors).toEqual([])
  expect(r.notices).toEqual(['pack "s": "sound" must be an object; skipped', 'pack "s": "voice" must be an object; skipped'])
})

test('a key or enum value this build does not know is skipped with one notice naming its path, and the pack loads', async () => {
  const file = {
    format: 1, name: 'later', wobble: true,
    colors: {
      theme: 'dusk', rows: 'hologram', border: 'bold', sparkle: 1, palette: { accent: '#010203', glow: '#ffffff' },
      extras: { hp: true, mood: true }, rowFlags: { labels: false, shine: true }, glyphs: { read: '»', orb: 'o' }, pet: { body: '#112233', fur: '#445566' },
    },
    motion: { shimmer: 3, color: '#abcdef', swirl: true, field: { shape: 'plasma', speed: 2 } },
  }
  const r = look(pack('later'), { later: file })
  expect(r.notices).toEqual([
    'pack "later": unknown key "wobble" skipped',
    'pack "later": unknown key "colors.sparkle" skipped',
    'pack "later": unknown key "colors.palette.glow" skipped',
    'pack "later": unknown value "hologram" for colors.rows skipped',
    'pack "later": unknown key "colors.extras.mood" skipped',
    'pack "later": unknown key "colors.rowFlags.shine" skipped',
    'pack "later": unknown key "colors.glyphs.orb" skipped',
    'pack "later": unknown key "colors.pet.fur" skipped',
    'pack "later": unknown key "motion.swirl" skipped',
    'pack "later": unknown value "3" for motion.shimmer skipped',
    'pack "later": unknown value "plasma" for motion.field.shape skipped',
  ])
  expect(r.errors).toEqual([])
  expect(r.look.colorsFrom).toBe('later')
  expect(r.look.theme.colors.accent).toBe('#010203')
  expect(r.look.rows).toBe('classic')
  expect(r.look.border).toBe('bold')
  expect(r.look.extras).toEqual({ hp: true, combo: false })
  expect(r.look.theme.glyphs.read).toBe('»')
  expect(r.look.motion.shimmer).toBe(1)
  expect(r.look.motion.field.shape).toBe('none')
  expect(() => validatePack(file)).not.toThrow()
})

test('a pack read for both colors and motion reports a top-level notice once', async () => {
  const r = look(pack('w'), { w: { format: 1, name: 'w', wobble: 1 } })
  expect(r.notices).toEqual(['pack "w": unknown key "wobble" skipped'])
  expect(r.errors).toEqual([])
})

test('a colors layer that falls back to classic reports its error, not the notices it collected', async () => {
  const r = look(pack('broken'), { broken: { format: 1, name: 'broken', colors: { glow: 1, palette: { accent: 'red' } } } })
  expect(r.errors).toHaveLength(1)
  expect(r.errors[0]).toContain('#rrggbb')
  expect(r.notices).toEqual([])
})

test('a theme override that fails keeps the pack layer notices once the pack colors still load', async () => {
  const r = resolveLook({ colors: 'w', motion: 'classic', theme: 'nope' }, { w: { format: 1, name: 'w', colors: { glow: 1 } } }, {})
  expect(r.errors).toHaveLength(1)
  expect(r.notices).toEqual(['pack "w": unknown key "colors.glow" skipped'])
})

test('a newer format is still refused outright', async () => {
  const r = look(pack('later'), { later: { format: 2, name: 'later', colors: { rows: 'hologram' } } })
  expect(r.errors.some(e => e.includes('made for a newer ops-control (format 2)'))).toBe(true)
  expect(r.notices).toEqual([])
})

test('fuzz: unsafe characters in any shown string are refused', async () => {
  const nasty = ['\u001b[2J', '\u0007', '​', '‮', '⁦', '﻿', '\u0085']
  for (const c of nasty) {
    expect(() => validatePack({ format: 1, name: 'x', description: `a${c}b` })).toThrow('description')
    expect(() => validatePack({ format: 1, name: 'x', extends: `a${c}b` })).toThrow()
    expect(look(pack(`a${c}b`)).errors.join()).not.toContain(c)
  }
})

test('exportMix is self-contained and resolves to the same look', async () => {
  const l = look({ colors: 'crt', motion: 'cozy' }).look
  const file = exportMix(l, 'mine')
  expect(file.format).toBe(1)
  expect(typeof file.colors).toBe('object')
  const again = look(pack('mine'), { mine: JSON.parse(JSON.stringify(file)) })
  expect(again.errors).toEqual([])
  const strip = ({ colorsFrom, motionFrom, ...rest }: typeof l) => rest
  expect(strip(again.look)).toEqual(strip(l))
})

test('built-in packs win over a stray user file of the same name', async () => {
  const r = look(pack('crt'), { classic: '{' })
  expect(r.errors).toEqual([])
  expect(r.look).toEqual(look(pack('crt')).look)
})

test('exportMix description is built from shown names and fits 80 characters', async () => {
  const l = look(pack('crt')).look
  const long = { ...l, colorsFrom: 'a'.repeat(40), motionFrom: 'b'.repeat(40) }
  const file = exportMix(long, 'mine')
  expect(file.description!.length).toBeLessThanOrEqual(80)
  expect(() => validatePack(file)).not.toThrow()
  const evil = exportMix({ ...l, colorsFrom: 'a\u001b[2Jb' }, 'mine')
  expect(evil.description).not.toContain('\u001b')
})

test('stockMotion freezes motion', async () => {
  expect(stockMotion(look(pack('arcade')).look).motion).toEqual({ spinner: 'stock', shimmer: 0, color: '#38e8ff', field: { shape: 'none', ...FIELD_DEFAULTS } })
  expect([...SPINNER_IDS]).toEqual(['stock', 'comet', 'eyes', 'orb-states', 'clawd', 'shimmer', 'scanline', 'ring', 'glitch', 'signal'])
})

test('exportName prefixes a built-in name and keeps any other', () => {
  expect(exportName('cozy')).toBe('my-cozy')
  expect(exportName('classic')).toBe('my-classic')
  expect(exportName('sunset')).toBe('sunset')
  expect(packNameProblem(exportName('arcade'))).toBeUndefined()
})

test('packNameProblem refuses unsafe and built-in names with the install wording', () => {
  expect(packNameProblem('sunset')).toBeUndefined()
  expect(packNameProblem('crt')).toBe('"crt" is a built-in pack name; pick another.')
  expect(packNameProblem('My Pack')).toBe('A pack needs a "name" of lowercase letters, digits and dashes.')
  expect(packNameProblem('')).toBe('A pack needs a "name" of lowercase letters, digits and dashes.')
  expect(packNameProblem('a'.repeat(41))).toBe('A pack needs a "name" of lowercase letters, digits and dashes.')
})

test('a pack can set glyphs, hearts and spinner words over its theme', () => {
  const pack = { format: 1, name: 'g', colors: { theme: 'classic', glyphs: { read: '»' }, hearts: ['●', '○'], words: ['Brewing'] } }
  const { look, errors } = resolveLook({ colors: 'g', motion: 'classic' }, { g: pack }, {})
  expect(errors).toEqual([])
  expect(look.theme.glyphs.read).toBe('»')
  expect(look.theme.glyphs.edit).toBe(resolveTheme('classic', {}).theme.glyphs.edit)
  expect(look.theme.hearts).toEqual(['●', '○'])
  expect(look.theme.spinnerWords).toEqual(['Brewing'])
})

test('pack glyphs, hearts and words are checked like theme files', () => {
  const bad = (colors: object) => () => validatePack({ format: 1, name: 'g', colors })
  expect(bad({ glyphs: { read: 'ab' } })).toThrow('glyph "read" must be one width-1 character')
  expect(bad({ glyphs: { nope: 'ab' } })).not.toThrow()
  expect(bad({ hearts: ['♥'] })).toThrow('colors.hearts must be two width-1 characters')
  expect(bad({ words: ['x'.repeat(25)] })).toThrow('colors.words must be short strings of printable characters')
})

test('exportMix leaves out glyphs, hearts and words that match the base theme', () => {
  const plain = exportMix(resolveLook({ colors: 'cozy', motion: 'cozy' }, {}, {}).look, 'x')
  expect('glyphs' in (plain.colors as object) || 'hearts' in (plain.colors as object) || 'words' in (plain.colors as object)).toBe(false)
  const pack = { format: 1, name: 'g', colors: { theme: 'classic', glyphs: { read: '»' } } }
  const out = exportMix(resolveLook({ colors: 'g', motion: 'classic' }, { g: pack }, {}).look, 'g')
  expect((out.colors as { glyphs?: object }).glyphs).toEqual({ read: '»' })
})

test('glyphs merge per key down an extends chain', () => {
  const parent = { format: 1, name: 'p', colors: { theme: 'classic', glyphs: { read: '»' } } }
  const child = { format: 1, name: 'c', extends: 'p', colors: { glyphs: { edit: '¤' } } }
  const { look, errors } = resolveLook({ colors: 'c', motion: 'classic' }, { p: parent, c: child }, {})
  expect(errors).toEqual([])
  expect(look.theme.glyphs.read).toBe('»')
  expect(look.theme.glyphs.edit).toBe('¤')
})

test("a pack's pet colors are checked, merge per key, and round-trip through exportMix", () => {
  const bad = (pet: object) => () => validatePack({ format: 1, name: 'p', colors: { pet } })
  expect(bad({ body: 'red' })).toThrow('colors.pet.body must be #rrggbb')
  expect(bad({ shade: '#12' })).toThrow('colors.pet.shade must be #rrggbb')
  expect(bad({ fur: '#112233' })).not.toThrow()
  const parent = { format: 1, name: 'p', colors: { theme: 'classic', pet: { body: '#112233', light: '#445566' } } }
  const child = { format: 1, name: 'c', extends: 'p', colors: { pet: { light: '#778899' } } }
  const { look, errors } = resolveLook({ colors: 'c', motion: 'classic' }, { p: parent, c: child }, {})
  expect(errors).toEqual([])
  expect(look.pet).toEqual({ body: '#112233', light: '#778899' })
  expect((exportMix(look, 'x').colors as { pet?: object }).pet).toEqual({ body: '#112233', light: '#778899' })
  const plain = resolveLook(pack('classic'), {}, {}).look
  expect(plain.pet).toEqual({})
  expect('pet' in (exportMix(plain, 'x').colors as object)).toBe(false)
})

test('a theme override ignores the pack glyphs, hearts and words', () => {
  const pack = { format: 1, name: 'g', colors: { theme: 'classic', glyphs: { read: '»' }, hearts: ['●', '○'], words: ['Brewing'] } }
  const dusk = resolveTheme('dusk', {}).theme
  const { look, errors } = resolveLook({ colors: 'g', motion: 'classic', theme: 'dusk' }, { g: pack }, {})
  expect(errors).toEqual([])
  expect(look.theme.glyphs).toEqual(dusk.glyphs)
  expect(look.theme.hearts).toEqual(dusk.hearts)
  expect(look.theme.spinnerWords).toEqual(dusk.spinnerWords)
  expect(look.theme.spinnerWords).not.toEqual(['Brewing'])
})
