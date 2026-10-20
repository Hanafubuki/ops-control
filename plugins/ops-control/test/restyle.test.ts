import { test, expect } from 'claude-code/testing'
import { spinnerWord, newTurnWord, toolGlyph } from '../hooks/restyle.ts'
import { resolveTheme } from '../hooks/themes.ts'

const classic = resolveTheme('classic', {}).theme
const cyber = resolveTheme('cyberpunk', {}).theme

test('classic keeps the engine word; other themes use their own', async () => {
  expect(spinnerWord(classic, 'Sauteing', false)).toBe('Sauteing')
  expect(cyber.spinnerWords).toContain(spinnerWord(cyber, 'Sauteing', false))
})

test('the word is stable within a turn and re-picked after newTurnWord', async () => {
  newTurnWord()
  const first = spinnerWord(cyber, 'x', false)
  for (let i = 0; i < 20; i++) expect(spinnerWord(cyber, 'x', false)).toBe(first)
  const seen = new Set<string>()
  for (let i = 0; i < 100; i++) { newTurnWord(); seen.add(spinnerWord(cyber, 'x', false)) }
  expect(seen.size).toBeGreaterThan(1)
})

test('reduced motion keeps the engine word', async () => {
  expect(spinnerWord(cyber, 'Sauteing', true)).toBe('Sauteing')
})

test('a theme without words falls back to the engine word', async () => {
  newTurnWord()
  expect(spinnerWord({ ...cyber, name: 'bare', spinnerWords: [] }, 'Sauteing', false)).toBe('Sauteing')
})

test('tool glyphs by kind', async () => {
  expect(toolGlyph(classic, 'Read')).toEqual({ glyph: classic.glyphs.read, color: classic.colors.read })
  expect(toolGlyph(classic, 'Edit')).toEqual({ glyph: classic.glyphs.edit, color: classic.colors.edit })
  expect(toolGlyph(classic, 'Grep')).toEqual({ glyph: classic.glyphs.search, color: classic.colors.read })
  expect(toolGlyph(classic, 'mcp__x__y')).toBeUndefined()
})
