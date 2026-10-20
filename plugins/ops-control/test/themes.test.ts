import { test, expect } from 'claude-code/testing'
import { parseJsonc, resolveTheme, PRESETS, MAX_THEME_BYTES, COLOR_KEYS, ROLE_LABELS } from '../hooks/themes.ts'
import { DEFAULT_THEME } from '../hooks/presets.ts'

test('parseJsonc strips line and block comments but not // inside strings', async () => {
  const v = parseJsonc('{\n // c\n "url": "https://x.dev", /* b */ "n": 1 }') as { url: string; n: number }
  expect(v.url).toBe('https://x.dev')
  expect(v.n).toBe(1)
})

test('parseJsonc counts UTF-8 bytes, not UTF-16 units', async () => {
  // 30000 x U+00E9 is 30000 UTF-16 units but 60000 bytes; pad past the limit in bytes only.
  const ok = '"' + 'é'.repeat(30000) + '"'
  expect(parseJsonc(ok)).toBe('é'.repeat(30000))
  const big = '"' + 'é'.repeat(33000) + '"'
  expect(big.length).toBeLessThan(MAX_THEME_BYTES)
  expect(() => parseJsonc(big)).toThrow()
})

test('classic resolves with every color set', async () => {
  const { theme, error } = resolveTheme('classic', {})
  expect(error).toBeUndefined()
  for (const v of Object.values(theme.colors)) expect(v).toMatch(/^#[0-9a-f]{6}$/i)
})

test('a user theme extends a preset and overrides one color', async () => {
  const { theme } = resolveTheme('mine', { mine: { name: 'mine', extends: 'cyberpunk', colors: { accent: '#123456' } } })
  expect(theme.colors.accent).toBe('#123456')
  expect(theme.colors.read).toBe(resolveTheme('cyberpunk', {}).theme.colors.read)
})

test('bad theme falls back to classic with a reason', async () => {
  const cases: [string, unknown, string][] = [
    ['bad-color', { name: 'x', colors: { accent: 'red' } }, '#rrggbb'],
    ['bad-extends', { name: 'x', extends: 'nope' }, 'no theme named "nope"'],
    ['cycle', { name: 'cycle', extends: 'cycle' }, 'loops'],
    ['not-object', 42, 'JSON object'],
    ['hearts-one', { name: 'x', band: { hearts: ['a'] } }, 'band.hearts'],
    ['hearts-three', { name: 'x', band: { hearts: ['a', 'b', 'c'] } }, 'band.hearts'],
    ['hearts-not-array', { name: 'x', band: { hearts: 'ab' } }, 'band.hearts'],
    ['hearts-long', { name: 'x', band: { hearts: ['ab', 'c'] } }, 'band.hearts'],
    ['hearts-wide', { name: 'x', band: { hearts: ['a', '漢'] } }, 'band.hearts'],
    ['glyph-wide-cjk', { name: 'x', glyphs: { read: '漢' } }, 'width-1'],
    ['glyph-hangul', { name: 'x', glyphs: { read: '한' } }, 'width-1'],
    ['glyph-fullwidth', { name: 'x', glyphs: { read: 'Ａ' } }, 'width-1'],
    ['glyph-hangul-jamo', { name: 'x', glyphs: { read: 'ᄀ' } }, 'width-1'],
    ['glyph-astral', { name: 'x', glyphs: { read: '😀' } }, 'width-1'],
    ['glyph-two', { name: 'x', glyphs: { read: 'ab' } }, 'width-1'],
    ['glyph-empty', { name: 'x', glyphs: { read: '' } }, 'width-1'],
  ]
  for (const [name, file, text] of cases) {
    const { theme, error } = resolveTheme(name, { [name]: file })
    expect(theme.name).toBe('classic')
    expect(theme.colors.accent).toBe('#d77757')
    expect(error).toContain(text)
  }
})

test('wide ranges and their boundaries', async () => {
  const glyph = (ch: string) => resolveTheme('g', { g: { name: 'g', glyphs: { read: ch } } }).error
  for (const ch of ['豈', '﫿', '︰', '﹏', '￠', '￦', 'ᅟ']) expect(glyph(ch)).toContain('width-1')
  // the band measures with layout's cellWidth: a zero-width combining mark is no glyph either
  expect(glyph('́')).toContain('width-1')
  expect(glyph('ᅠ')).toBeUndefined()
  expect(glyph('︯')).toBeUndefined()
  expect(glyph('￧')).toBeUndefined()
})

test('glyphs reject control, zero-width and surrogate characters', async () => {
  const glyph = (ch: string) => resolveTheme('g', { g: { name: 'g', glyphs: { read: ch } } }).error
  for (const ch of ['\x00', '\x1b', '\x1f', '\x7f', '\x85', '\x9f', '​', '‏', ' ', '‮', '⁠', '⁯', '﻿', '\ud800', '\udfff']) expect(glyph(ch)).toContain('width-1')
  const hearts = resolveTheme('h', { h: { name: 'h', band: { hearts: ['a', '\x1b'] } } }).error
  expect(hearts).toContain('band.hearts')
})

test('spinner words reject the same unsafe characters as glyphs, but allow wide ones', async () => {
  const words = (w: string[]) => resolveTheme('s', { s: { name: 's', spinner: { words: w } } }).error
  for (const w of ['\u001b[2J', 'a‮b', 'zero​width', 'lone\ud800', 'c1\x85']) expect(words([w])).toContain('spinner.words')
  expect(words(['漢字', 'Thinking'])).toBeUndefined()
})

test('error messages strip control characters and cap echoed names', async () => {
  const key = '\u001b[2J' + 'k'.repeat(100)
  const note = resolveTheme('x', { x: { name: 'x', colors: { [key]: '#000000' } } }).notices[0]!
  expect(note).not.toContain('\u001b')
  expect(note).toContain('[2J' + 'k'.repeat(37) + '"')
  const ext = resolveTheme('y', { y: { name: 'y', extends: 'evil‮' + 'e'.repeat(80) } }).error!
  expect(ext).not.toContain('‮')
  expect(ext.length).toBeLessThan(100)
  expect(resolveTheme('\u001bghost', {}).error).toBe('theme "ghost": no theme named "ghost"')
})

test('glyphs must be an object with known keys', async () => {
  for (const glyphs of [[], 'abc', 5, null]) {
    expect(resolveTheme('g', { g: { name: 'g', glyphs } }).error).toContain('"glyphs" must be an object')
  }
})

test('an unknown color role or glyph is skipped with one notice naming it; the rest loads', async () => {
  const r = resolveTheme('mine', { mine: { name: 'mine', colors: { accent: '#123456', glow: '#ffffff' }, glyphs: { read: '»', bogus: 'a' } } })
  expect(r.error).toBeUndefined()
  expect(r.theme.colors.accent).toBe('#123456')
  expect(r.theme.glyphs.read).toBe('»')
  expect(r.theme.colors).not.toHaveProperty('glow')
  expect(r.theme.glyphs).not.toHaveProperty('bogus')
  expect(r.notices).toEqual(['theme "mine": unknown key "colors.glow" skipped', 'theme "mine": unknown key "glyphs.bogus" skipped'])
  expect(resolveTheme('classic', {}).notices).toEqual([])
})

test('a known color with a bad value still fails beside an unknown one', async () => {
  expect(resolveTheme('m', { m: { name: 'm', colors: { glow: '#ffffff', accent: 'red' } } }).error).toContain('#rrggbb')
})

test('names inherited from Object.prototype are not themes', async () => {
  expect(resolveTheme('constructor', {}).error).toContain('no theme named "constructor"')
  expect(resolveTheme('toString', {}).error).toContain('no theme named "toString"')
  expect(resolveTheme('x', { x: { name: 'x', extends: '__proto__' } }).error).toContain('no theme named "__proto__"')
})

test('block comments become a space and must be terminated', async () => {
  expect(() => parseJsonc('{"a": 1 /* oops')).toThrow('unterminated')
  // "1/*c*/3" must not glue into 13.
  expect(() => parseJsonc('1/*c*/3')).toThrow('not valid JSON')
})

test('valid hearts and narrow glyphs are accepted', async () => {
  const { theme, error } = resolveTheme('ok', { ok: { name: 'ok', glyphs: { read: '»' }, band: { hearts: ['*', '+'] } } })
  expect(error).toBeUndefined()
  expect(theme.glyphs.read).toBe('»')
  expect(theme.hearts).toEqual(['*', '+'])
})

test('unknown theme name falls back to the default', async () => {
  const { theme, error } = resolveTheme('ghost', {})
  expect(error).toContain('ghost')
  expect(theme.name).toBe(DEFAULT_THEME)
})

test('the default theme is classic and resolves', async () => {
  expect(DEFAULT_THEME).toBe('classic')
  const { theme, error } = resolveTheme(DEFAULT_THEME, {})
  expect(error).toBeUndefined()
  expect(theme.name).toBe('classic')
})

test('new presets resolve with all 14 colors set', async () => {
  const accents = { 'ops-control': '#ffc857', aurora: '#5ef1c6', dusk: '#b69cff' }
  for (const [name, accent] of Object.entries(accents)) {
    const { theme, error } = resolveTheme(name, {})
    expect(error).toBeUndefined()
    expect(theme.colors.accent).toBe(accent)
    expect(Object.keys(PRESETS[name]!.colors!)).toHaveLength(14)
    for (const v of Object.values(theme.colors)) expect(v).toMatch(/^#[0-9a-f]{6}$/i)
  }
})

test('presets include the built-ins', async () => {
  expect(Object.keys(PRESETS).sort()).toEqual(['aurora', 'catppuccin-frappe', 'catppuccin-latte', 'catppuccin-macchiato', 'catppuccin-mocha', 'classic', 'clean', 'cyberpunk', 'dusk', 'high-contrast', 'ops-control', 'tokyo-night', 'vaporwave'])
  expect(MAX_THEME_BYTES).toBe(65536)
})

test('every color role has a plain label', () => {
  for (const k of COLOR_KEYS) expect(ROLE_LABELS[k].length).toBeGreaterThan(3)
})
