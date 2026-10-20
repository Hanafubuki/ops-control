// JSX-free: the studio imports it.
import { isPlain, isUnsafe, shown, skippedKey } from './themes.ts'
import { SAFE_NAME } from './packs.ts'
import type { PetSheet } from './pets.ts'
import { MOMENTS, FLAVOURS, MOMENT_SLOTS, type Moment, type PetLines } from './lines.ts'
import { BUBBLE_MAX } from './bubbles.ts'

// The sprite spec's rows, top to bottom, and the only animation names a pet file may use.
// A sheet has 12 rows, or 14 with the idle variants as the last two.
export const PET_ANIMS = ['idle', 'walk', 'working', 'hop', 'alert', 'done', 'sleep', 'fail', 'juggle', 'pant', 'pant-walk', 'scrunch', 'idle2', 'idle3'] as const
export type PetAnimName = (typeof PET_ANIMS)[number]
// The largest frame, and the cell size of a PNG sheet. Clawd is 24 × 12; the robot uses it all.
export const FRAME_W = 32, FRAME_H = 16
export const MAX_COLORS = 60, MAX_FRAMES = 32
export const MAX_LINES = 12, MAX_VOICE = 120
// The pets page promises no frame changes faster than every 80 ms.
export const MIN_MS = 80, MAX_MS = 10_000
// One frame time per row, at Clawd's pace; the studio's speed slider scales it.
export const ANIM_MS: Record<PetAnimName, number> = { idle: 400, walk: 110, working: 120, hop: 120, alert: 180, done: 120, sleep: 450, fail: 250, juggle: 110, pant: 290, 'pant-walk': 140, scrunch: 150, idle2: 400, idle3: 400 }
export const ONCE: readonly PetAnimName[] = ['hop', 'fail', 'scrunch']
export const WALKS: readonly PetAnimName[] = ['walk', 'pant-walk']
// Every place that lists the built-ins derives from this; BUILTIN_SHEETS in pets.ts must have the same keys (a test checks).
export const BUILTIN_PET_NAMES = ['clawd', 'clawd-shiny', 'robot', 'ghost', 'egg']
// The name packs' main characters (namepacks.ts): built-in sheets that a pack puts on, never listed or cycled
// as pets of their own. With BUILTIN_PET_NAMES they are every key of BUILTIN_SHEETS (a test checks).
export const PACK_PET_NAMES = ['lelouch', 'shikamaru', 'gojo', 'levi']
export const builtinPets = (shiny: boolean, egg: boolean) => BUILTIN_PET_NAMES.filter(n => (shiny || n !== 'clawd-shiny') && (egg || n !== 'egg'))
const COMMANDS = ['off', 'list', 'add']

export type PetFileFrame = { px: string[]; ms: number; dx?: number; exit?: boolean }
export type PetFile = { format: 1 | 2; name: string; description?: string; palette: Record<string, string>; animations: Partial<Record<PetAnimName, PetFileFrame[]>>; lines?: PetLines; voice?: string }

const FILE_KEYS = ['format', 'name', 'description', 'palette', 'animations', 'lines', 'voice']
const FRAME_KEYS = ['px', 'ms', 'dx', 'exit']
const HEX = /^#[0-9a-fA-F]{6}$/
const printable = (s: string) => [...s].every(c => !isUnsafe(c.codePointAt(0)!))
const whole = (n: unknown, lo: number, hi: number) => typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi

export function petNameProblem(name: string): string | undefined {
  if (!SAFE_NAME.test(name)) return 'A pet needs a "name" of lowercase letters, digits and dashes.'
  if (BUILTIN_PET_NAMES.includes(name) || PACK_PET_NAMES.includes(name)) return `"${name}" is a built-in pet name; pick another.`
  if (COMMANDS.includes(name)) return `"${name}" is a pet command; pick another name.`
  return undefined
}

export function validatePetFile(file: unknown): asserts file is PetFile {
  readPetFile(file, [])
}

// The pet as this build reads it. Keys, animations, moments and flavours only a later 1.x knows are left out
// and named in `notes`; a known one with the wrong shape, or a `format` above 2, throws.
export function readPetFile(raw: unknown, notes: string[]): PetFile {
  if (!isPlain(raw)) throw new Error('a pet must be a JSON object')
  const file: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (FILE_KEYS.includes(k)) file[k] = v
    else notes.push(skippedKey('', k))
  }
  const fmt = file.format
  if (fmt === undefined || (typeof fmt === 'number' && fmt < 1)) throw new Error('"format": 1 is missing')
  if (typeof fmt !== 'number' || !Number.isInteger(fmt)) throw new Error('"format" must be a whole number')
  if (fmt > 2) throw new Error(`made for a newer ops-control (format ${fmt})`)
  const name = typeof file.name === 'string' ? file.name : ''
  const problem = petNameProblem(name)
  if (problem) throw new Error(problem)
  const d = file.description
  if (d !== undefined && !(typeof d === 'string' && d.length <= 80 && printable(d))) throw new Error('"description" must be printable text of at most 80 characters')
  if ((file.lines !== undefined || file.voice !== undefined) && fmt < 2) throw new Error('"lines" and "voice" need "format": 2')
  const v = file.voice
  if (v !== undefined && !(typeof v === 'string' && [...v].length <= MAX_VOICE && printable(v))) throw new Error(`"voice" must be printable text of at most ${MAX_VOICE} characters`)
  if (file.lines !== undefined) file.lines = cleanLines(file.lines, notes)

  const pal = file.palette
  if (!isPlain(pal)) throw new Error('"palette" must be an object of single-character keys and #rrggbb colors')
  const keys = Object.keys(pal)
  if (!keys.length) throw new Error('the palette needs at least one color')
  if (keys.length > MAX_COLORS) throw new Error(`the palette has ${keys.length} colors; at most ${MAX_COLORS} colors are allowed`)
  for (const k of keys) {
    if (k === '.') throw new Error('palette key "." is reserved for transparent pixels')
    if ([...k].length !== 1 || !printable(k) || k.trim() !== k) throw new Error('palette keys are single characters')
    if (k.codePointAt(0)! > 0xffff) throw new Error(`palette key "${shown(k)}" is above U+FFFF; use a letter, digit or symbol from the basic plane`)
    if (typeof pal[k] !== 'string' || !HEX.test(pal[k] as string)) throw new Error(`palette color "${shown(k)}" must be #rrggbb`)
  }

  const anims = file.animations
  if (!isPlain(anims)) throw new Error('"animations" must be an object')
  for (const n of Object.keys(anims)) if (!(PET_ANIMS as readonly string[]).includes(n)) notes.push(skippedKey('animations', n))
  if (anims.idle === undefined) throw new Error('a pet needs an idle animation')
  let size: [number, number] | undefined
  const kept: Record<string, unknown> = {}
  for (const n of PET_ANIMS) {
    const frames = anims[n]
    if (frames === undefined) continue
    if (!Array.isArray(frames) || !frames.length) throw new Error(`${n} needs at least one frame`)
    if (frames.length > MAX_FRAMES) throw new Error(`${n} has ${frames.length} frames; at most ${MAX_FRAMES}`)
    kept[n] = frames.map((raw: unknown, i) => {
      const at = `${n}[${i}]`
      if (!isPlain(raw)) throw new Error(`${at}: a frame must be an object with px and ms`)
      const f: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(raw)) {
        if (FRAME_KEYS.includes(k)) f[k] = v
        else notes.push(skippedKey(`animations.${at}`, k))
      }
      if (!whole(f.ms, MIN_MS, MAX_MS)) throw new Error(`${at}: ms must be a whole number from ${MIN_MS} to ${MAX_MS}`)
      if (f.dx !== undefined && !whole(f.dx, -4, 4)) throw new Error(`${at}: dx must be a whole number from -4 to 4`)
      if (f.exit !== undefined && typeof f.exit !== 'boolean') throw new Error(`${at}: exit must be true or false`)
      const px = f.px
      if (!Array.isArray(px) || !px.length || !px.every(r => typeof r === 'string')) throw new Error(`${at}: px must be a list of pixel rows`)
      if (px.length > FRAME_H) throw new Error(`${at}: ${px.length} pixel rows; at most ${FRAME_H}`)
      const w = [...(px[0] as string)].length
      if (w < 1 || w > FRAME_W) throw new Error(`${at}: ${w} wide; at most ${FRAME_W}`)
      size ??= [w, px.length]
      if (px.length !== size[1]) throw new Error(`${at}: ${px.length} pixel rows, want ${size[1]}`)
      for (const r of px as string[]) {
        if ([...r].length !== size[0]) throw new Error(`${at}: a row is ${[...r].length} wide, want ${size[0]}`)
        for (const c of r) if (c !== '.' && !(c in pal)) throw new Error(`${at}: unknown palette key "${shown(c)}"`)
      }
      return f
    })
  }
  return { ...file, animations: kept } as PetFile
}

// Entries whose moment or flavour this build lacks are dropped; every kept entry is checked in full.
function cleanLines(lines: unknown, notes: string[]): Record<string, string[]> {
  if (!isPlain(lines)) throw new Error('"lines" must be an object of moment keys and lists of lines')
  const out: Record<string, string[]> = {}
  for (const [key, list] of Object.entries(lines)) {
    const parts = key.split('@')
    // "@lvN" comes last; "done@lv4@night" is an unknown flavour "lv4".
    const lv = parts.length > 1 ? /^lv([1-9]\d?)$/.exec(parts.at(-1)!) : null
    if (lv) parts.pop()
    if (lv && Number(lv[1]) < 2) throw new Error(`lines: level must be 2 to 99 in "${shown(key)}"`)
    const [moment, flavour, more] = parts
    if (!(MOMENTS as readonly string[]).includes(moment!) || more !== undefined || (flavour !== undefined && !(FLAVOURS as readonly string[]).includes(flavour))) {
      notes.push(skippedKey('lines', key))
      continue
    }
    const at = `lines.${shown(key)}`
    if (!Array.isArray(list) || list.length < 1 || list.length > MAX_LINES) throw new Error(`${at}: 1 to ${MAX_LINES} lines`)
    list.forEach((l: unknown, i) => {
      if (typeof l !== 'string' || !l.trim()) throw new Error(`${at}[${i}]: a line must be text`)
      if (!printable(l)) throw new Error(`${at}[${i}]: printable text only`)
      if ([...l].length > BUBBLE_MAX) throw new Error(`${at}[${i}]: at most ${BUBBLE_MAX} characters`)
      for (const [, slot] of l.matchAll(/\{(\w+)\}/g)) {
        if (!(MOMENT_SLOTS[moment as Moment] as readonly string[]).includes(slot!)) throw new Error(`${at}[${i}]: ${moment} lines cannot use {${shown(slot!)}}`)
      }
    })
    out[key] = list
  }
  return out
}

export function petSheet(file: PetFile): PetSheet {
  const first = file.animations.idle![0]!
  const animations: PetSheet['animations'] = {}
  for (const n of PET_ANIMS) {
    const frames = file.animations[n]
    if (frames) animations[n] = { loop: !ONCE.includes(n), frames: frames.map(f => ({ ...f, px: [...f.px] })) }
  }
  return { w: [...first.px[0]!].length, h: first.px.length, palette: { ...file.palette }, animations, ...(file.lines && { lines: structuredClone(file.lines) }), ...(file.voice !== undefined && { voice: file.voice }) }
}
