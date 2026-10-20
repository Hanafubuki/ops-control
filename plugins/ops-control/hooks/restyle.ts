import type { Theme } from './themes.ts'
import { describeTool } from './events.ts'

let turnWord: { theme: string; word: string } | undefined

// classic keeps Claude Code's own rotating words; other themes pick one of theirs per
// turn so the word doesn't change on every redraw. The engine lets a mod rewrite the
// word only, not the spinner frames. Reduced motion keeps the engine's word.
export function spinnerWord(t: Theme, engineWord: string, reduced: boolean): string {
  if (reduced || t.name === 'classic' || t.spinnerWords.length === 0) return engineWord
  if (turnWord?.theme !== t.name) turnWord = { theme: t.name, word: t.spinnerWords[Math.floor(Math.random() * t.spinnerWords.length)]! }
  return turnWord.word
}
export const newTurnWord = (): void => { turnWord = undefined }

export function toolGlyph(t: Theme, tool: string): { glyph: string; color: string } | undefined {
  const k = describeTool(tool, {}).kind
  if (k === 'other') return undefined
  const color = k === 'search' ? t.colors.read : k === 'plan' ? t.colors.accent : t.colors[k]
  return { glyph: t.glyphs[k], color }
}
