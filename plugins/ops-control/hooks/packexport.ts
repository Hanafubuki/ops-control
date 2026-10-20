// JSX-free: installer/gen/packs.ts runs it under plain node to write the installer's packs.json.
import { resolveLook, SPINNER_IDS, type Border, type RowStyle, type SpinnerId } from './packs.ts'
import { PACKS } from './packpresets.ts'
import { PRESETS, resolveTheme, type Colors } from './themes.ts'
import { SPINNERS, spinnerCells, type Cell } from './motion.ts'
import { BUILTIN_SHEETS, animFor, composeFrame, halfBlock, petPalette, type PetSpan } from './pets.ts'

export type PackExport = {
  name: string
  description: string
  bg: string
  rows: RowStyle
  border: Border
  borderColor: string
  gradient: [string, string] | null
  colors: Colors
  // color is null when the pack leaves the spinner on the theme's accent, so a theme pick recolors it
  spinner: { id: SpinnerId; word: string; color: string | null }
}

export type ThemeExport = { name: string; word: string; colors: Colors }

// Frames are drawn in white on black: a gray cell is a brightness level the installer remaps onto the
// spinner color and background it previews with. A cell that is not gray (Clawd's own orange) keeps its color.
// text is true when the spinner draws in the theme's text color instead of the spinner color (the eyes).
export type SpinnerExport = { id: SpinnerId; name: string; ms: number; text: boolean; frames: Cell[][][] }

export type PetExport = { cols: number; frames: { ms: number; rows: PetSpan[][] }[] }

export type Export = { packs: PackExport[]; themes: ThemeExport[]; spinners: SpinnerExport[]; pets: Record<string, PetExport> }

const FRAME_MS: Record<string, number> = { stock: 120, clawd: 220 }
const FRAMES: Record<string, number> = { stock: 6, clawd: 4, scanline: 29, ring: 16, signal: 67 }
// Spinners whose motion repeats on its own period get their frames spread over exactly that period,
// so the preview wraps without a jump. scanline: bar 10 + gap 1 + the default 12-letter word + pause 6
// cells at 45 ms. ring: one turn. signal: 10 base cycles of 160*2pi ms, the first time its 2.7x
// harmonic lines up again; 67 frames land on a whole 150 ms, so ms * frames stays within 3 ms of it.
const PERIOD_MS: Record<string, number> = { scanline: 29 * 45, ring: 2000, signal: 3200 * Math.PI }
const MONO = { color: '#ffffff', bg: '#000000', fg: '#ffffff' }

export function packExport(): PackExport[] {
  return Object.keys(PACKS).map(name => {
    const { look } = resolveLook({ colors: name, motion: name }, {}, {})
    const c = look.theme.colors
    // The same motion under two palettes with different accents: the color matches only if the pack sets it.
    const a = resolveLook({ colors: 'classic', motion: name }, {}, {}).look.motion.color
    const b = resolveLook({ colors: 'arcade', motion: name }, {}, {}).look.motion.color
    return {
      name,
      description: PACKS[name]!.description ?? '',
      bg: look.bg,
      rows: look.rows,
      border: look.border,
      borderColor: look.borderColor,
      gradient: look.gradient ?? null,
      colors: { ...c },
      spinner: { id: look.motion.spinner, word: look.theme.spinnerWords[0] ?? 'Thinking', color: a === b ? a : null },
    }
  })
}

export const themeExport = (): ThemeExport[] => Object.keys(PRESETS).map(name => {
  const t = resolveTheme(name, {}).theme
  return { name, word: t.spinnerWords[0] ?? 'Thinking', colors: { ...t.colors } }
})

export const spinnerExport = (): SpinnerExport[] => SPINNER_IDS.map(id => {
  const n = FRAMES[id] ?? 12, period = PERIOD_MS[id]
  const step = period === undefined ? FRAME_MS[id] ?? 150 : period / n
  const s = SPINNERS[id]
  return { id, name: s.name, ms: Math.round(step), text: 'useFg' in s && s.useFg === true, frames: Array.from({ length: n }, (_, i) => spinnerCells(id, i * step, MONO)) }
})

// The idle animation as the band draws it: no outfit, not mirrored. The egg is its uncracked stage,
// since the crack stage lives in the session's store and the installer has no session.
export const petExport = (): Record<string, PetExport> => Object.fromEntries(Object.entries(BUILTIN_SHEETS).map(([id, sheet]) => {
  const palette = petPalette(sheet, id)
  return [id, { cols: sheet.w, frames: animFor(sheet, 'idle').frames.map(f => ({ ms: f.ms, rows: halfBlock(composeFrame(sheet, f, [], false), palette) })) }]
}))

export const exportAll = (): Export => ({ packs: packExport(), themes: themeExport(), spinners: spinnerExport(), pets: petExport() })

export const packsJson = (): string => JSON.stringify(exportAll(), null, 2) + '\n'
