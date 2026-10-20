import type { Host } from './host.ts'
import { petPalette, type PetSheet, type PetTint } from './pets.ts'

// The character the arcade-restyled Sidequest dashboard (~/.claude/sidequest-arcade) draws in place of Clawd as its
// logo, tab icon and notification icon: the shown pet's first idle frame, trimmed to its pixels. The dashboard reads
// the file through a link in its dist and falls back to Clawd while there is none.
export const BOARD_DIR = (configDir: string) => `${configDir}/ops-control/board`
export const BOARD_PET_FILE = (configDir: string) => `${BOARD_DIR(configDir)}/character.json`

export type BoardPet = { format: 1; name: string; w: number; h: number; palette: Record<string, string>; px: string[] }

export function boardPet(name: string, sheet: PetSheet, tint: PetTint = {}): BoardPet | undefined {
  const frame = sheet.animations.idle?.frames[0]?.px ?? []
  const colors = petPalette(sheet, name, tint)
  const painted = (k: string) => k !== '.' && Object.hasOwn(colors, k)
  let top = Infinity, bottom = -1, left = Infinity, right = -1
  frame.forEach((row, y) => [...row].forEach((k, x) => {
    if (!painted(k)) return
    top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x)
  }))
  if (bottom < 0) return undefined
  const px = frame.slice(top, bottom + 1).map(row => [...row.padEnd(right + 1, '.')].slice(left, right + 1).map(k => painted(k) ? k : '.').join(''))
  const used = new Set(px.join(''))
  const palette = Object.fromEntries(Object.entries(colors).filter(([k]) => used.has(k)))
  return { format: 1, name, w: right - left + 1, h: bottom - top + 1, palette, px }
}

// Writes the file when its text changed since `last`; returns the text now on disk, or `last` when the write failed.
export async function writeBoardPet(host: Host, pet: BoardPet | undefined, last: string): Promise<string> {
  if (!pet) return last
  const text = `${JSON.stringify(pet)}\n`
  if (text === last) return last
  const file = BOARD_PET_FILE(host.configDir)
  try {
    await host.writeFile(file, text)
    return text
  } catch {
    // the folder is missing on a first run
  }
  try {
    await host.run(['mkdir', '-p', BOARD_DIR(host.configDir)])
    await host.writeFile(file, text)
    return text
  } catch {
    return last
  }
}
