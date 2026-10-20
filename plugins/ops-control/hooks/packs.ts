// JSX-free: the docs site imports it.
import { resolveTheme, PRESETS, COLOR_KEYS, GLYPH_KEYS, shown, isPlain, isUnsafe, checkGlyphs, checkHearts, checkWords, NOTICE_TAIL, skippedKey, type Colors, type Theme } from './themes.ts'
import { PACKS } from './packpresets.ts'
import type { PetTint } from './pets.ts'

export const SPINNER_IDS = ['stock', 'comet', 'eyes', 'orb-states', 'clawd', 'shimmer', 'scanline', 'ring', 'glitch', 'signal'] as const
export type SpinnerId = (typeof SPINNER_IDS)[number]
export const ROW_STYLES = ['classic', 'cards', 'minimal', 'retro', 'slab'] as const
export type RowStyle = (typeof ROW_STYLES)[number]
export const BORDERS = ['round', 'single', 'double', 'bold', 'classic'] as const
export type Border = (typeof BORDERS)[number]
export const METER_STYLES = ['default', 'dither'] as const
export type MeterStyle = (typeof METER_STYLES)[number]
export const FIELD_IDS = ['none', 'warp', 'simplex'] as const
export type FieldId = (typeof FIELD_IDS)[number]
export const DITHERS = ['2x2', '4x4', '8x8'] as const
// motion.field as an object: the shape and its knobs, each held to [min, max]. The knobs follow
// Paper's dithering shader (shaders.paper.design/dithering), with size counted in braille dots.
export const FIELD_KNOBS = { speed: [0, 4], scale: [0.05, 4], rotation: [0, 360], offsetX: [-1, 1], offsetY: [-1, 1], density: [0.2, 2], warp: [0, 8], size: [1, 4], fps: [1, 12] } as const
export const FIELD_KEYS = ['shape', ...Object.keys(FIELD_KNOBS), 'dither', 'color']
// color is the dither's one ink colour; without it the field uses the palette's faint.
export type Field = { shape: FieldId; dither: (typeof DITHERS)[number]; color?: string } & Record<keyof typeof FIELD_KNOBS, number>
export const FIELD_DEFAULTS: Omit<Field, 'shape'> = { speed: 1, scale: 1, rotation: 0, offsetX: 0, offsetY: 0, density: 1, warp: 4, size: 1, fps: 10, dither: '8x8' }
export type RowFlags = { labels: boolean; markers: boolean; xp: boolean }
export type ColorsLayer = { theme?: string; palette?: Partial<Colors>; bg?: string; rows?: RowStyle; border?: Border; borderColor?: string; gradient?: [string, string]; extras?: { hp?: boolean; combo?: boolean }; rowFlags?: Partial<RowFlags>; meters?: MeterStyle; dividers?: boolean; glyphs?: Partial<Theme['glyphs']>; hearts?: [string, string]; words?: string[]; pet?: PetTint }
// spinner is any well-formed id: a pack made for a later ops-control may name one this build lacks
export type MotionLayer = { spinner?: string; shimmer?: 0 | 1 | 2; color?: string; field?: FieldId | ({ shape: FieldId } & Partial<Omit<Field, 'shape'>>) }
export type PackFile = { format: 1; name: string; extends?: string; description?: string; colors?: ColorsLayer | string; motion?: MotionLayer | string }
// overrides sit on top of whatever pack and theme resolve, so a pack switch keeps them
export type Mix = { colors: string; motion: string; theme?: string; spinner?: string; overrides?: Partial<Colors> }
export type Look = {
  colorsFrom: string; motionFrom: string; theme: Theme; bg: string; rows: RowStyle; border: Border; borderColor: string
  gradient?: [string, string]; extras: { hp: boolean; combo: boolean }; rowFlags: RowFlags; meters: MeterStyle; dividers: boolean; pet: PetTint
  motion: { spinner: SpinnerId; shimmer: 0 | 1 | 2; color: string; field: Field }
}
export const DEFAULT_MIX: Mix = { colors: 'classic', motion: 'classic' }
export const MAX_DEPTH = 8
const FORMAT = 1
// sound and voice are reserved for later versions: accepted, never read
export const PACK_KEYS = ['format', 'name', 'extends', 'description', 'colors', 'motion', 'sound', 'voice']
export const COLORS_KEYS = ['theme', 'palette', 'bg', 'rows', 'border', 'borderColor', 'gradient', 'extras', 'rowFlags', 'meters', 'dividers', 'glyphs', 'hearts', 'words', 'pet']
export const PET_TINT_KEYS = ['body', 'light', 'shade']
export const MOTION_KEYS = ['spinner', 'shimmer', 'color', 'field']
export const EXTRAS_KEYS = ['hp', 'combo']
export const ROW_FLAG_KEYS = ['labels', 'markers', 'xp']
export const isNewerSpinner = (e: string) => /^spinner ".*" needs a newer ops-control/.test(e)

export const SAFE_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/

export function packNameProblem(name: string): string | undefined {
  if (!SAFE_NAME.test(name)) return 'A pack needs a "name" of lowercase letters, digits and dashes.'
  if (Object.hasOwn(PACKS, name)) return `"${name}" is a built-in pack name; pick another.`
  return undefined
}

// A look exported from a built-in keeps a name /ops pack accepts.
export const exportName = (name: string) => (Object.hasOwn(PACKS, name) ? `my-${name}` : name)
const HEX = /^#[0-9a-fA-F]{6}$/
const SHORT_HEX = /^#[0-9a-fA-F]{3}$/

// #rgb becomes #rrggbb; anything else that is not #rrggbb is undefined.
export function normalizeHex(s: string): string | undefined {
  if (SHORT_HEX.test(s)) return '#' + [...s.slice(1)].map(c => c + c).join('').toLowerCase()
  return HEX.test(s) ? s.toLowerCase() : undefined
}

// Stored overrides are read back from disk: keep only known roles with valid colors.
export function cleanOverrides(raw: unknown): Partial<Colors> | undefined {
  if (!isPlain(raw)) return undefined
  const out: Partial<Colors> = {}
  for (const k of COLOR_KEYS) {
    const v = typeof raw[k] === 'string' ? normalizeHex(raw[k]) : undefined
    if (v) out[k] = v
  }
  return Object.keys(out).length ? out : undefined
}

const SPINNER_SHAPE = /^[a-z][a-z0-9-]{0,23}$/

type Layer = Record<string, unknown>

const safeText = (v: unknown, max = 40): v is string => typeof v === 'string' && v.length <= max && [...v].every(c => !isUnsafe(c.codePointAt(0)!))
const oneOf = (list: readonly unknown[], v: unknown) => list.includes(v)

// The checks below return a copy without what this build does not know. A key or enum value a later 1.x added
// is named in `notes` and left out; a known key with the wrong type, or a `format` this build cannot read, throws.
const unknownValue = (path: string, v: unknown) => `unknown value "${shown(String(v))}" for ${path}${NOTICE_TAIL}`

function known(v: Record<string, unknown>, keys: readonly string[], at: string, notes: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, x] of Object.entries(v)) {
    if (keys.includes(k)) out[k] = x
    else notes.push(skippedKey(at, k))
  }
  return out
}

// A value outside `list` of the right type may be a later 1.x's: it is dropped from `v`. Any other type is a mistake.
function dropUnknown(v: Record<string, unknown>, k: string, list: readonly unknown[], at: string, notes: string[], bad: string): void {
  const x = v[k]
  if (x === undefined || list.includes(x)) return
  if (typeof x !== (typeof list[0])) throw new Error(bad)
  notes.push(unknownValue(`${at}.${k}`, x))
  delete v[k]
}

function checkTop(raw: unknown, notes: string[]): Record<string, unknown> {
  if (!isPlain(raw)) throw new Error('a pack must be a JSON object')
  const file = known(raw, PACK_KEYS, '', notes)
  for (const k of ['sound', 'voice']) {
    if (file[k] !== undefined && !isPlain(file[k])) { notes.push(`"${k}" must be an object;${NOTICE_TAIL}`); delete file[k] }
  }
  const fmt = file.format
  if (fmt === undefined || (typeof fmt === 'number' && fmt < 1)) throw new Error('"format": 1 is missing')
  if (typeof fmt !== 'number' || !Number.isInteger(fmt)) throw new Error('"format" must be a whole number')
  if (fmt > FORMAT) throw new Error(`made for a newer ops-control (format ${fmt})`)
  if (!safeText(file.name) || file.name === '') throw new Error('"name" must be short printable text')
  if (file.extends !== undefined && !safeText(file.extends)) throw new Error('"extends" must be a pack name')
  if (file.description !== undefined && !safeText(file.description, 80)) throw new Error('"description" must be printable text of at most 80 characters')
  return file
}

function checkColors(raw: unknown, notes: string[]): unknown {
  if (raw === undefined) return undefined
  if (typeof raw === 'string') { if (!safeText(raw)) throw new Error('"colors" must be a pack name or an object'); return raw }
  if (!isPlain(raw)) throw new Error('"colors" must be a pack name or an object')
  const v = known(raw, COLORS_KEYS, 'colors', notes)
  if (v.theme !== undefined && !safeText(v.theme)) throw new Error('colors.theme must be a theme name')
  if (v.palette !== undefined) {
    if (!isPlain(v.palette)) throw new Error('colors.palette must be an object')
    v.palette = known(v.palette, COLOR_KEYS, 'colors.palette', notes)
    for (const [k, c] of Object.entries(v.palette as Record<string, unknown>)) if (typeof c !== 'string' || !HEX.test(c)) throw new Error(`color "${k}" must be #rrggbb`)
  }
  for (const k of ['bg', 'borderColor']) if (v[k] !== undefined && (typeof v[k] !== 'string' || !HEX.test(v[k]))) throw new Error(`colors.${k} must be #rrggbb`)
  dropUnknown(v, 'rows', ROW_STYLES, 'colors', notes, `colors.rows must be one of ${ROW_STYLES.join(', ')}`)
  dropUnknown(v, 'border', BORDERS, 'colors', notes, `colors.border must be one of ${BORDERS.join(', ')}`)
  const g = v.gradient
  if (g !== undefined && (!Array.isArray(g) || g.length !== 2 || !g.every(c => typeof c === 'string' && HEX.test(c)))) throw new Error('colors.gradient must be two #rrggbb colors')
  if (v.extras !== undefined) {
    if (!isPlain(v.extras)) throw new Error('colors.extras must be an object of hp and combo booleans')
    v.extras = known(v.extras, EXTRAS_KEYS, 'colors.extras', notes)
    if (!Object.values(v.extras as object).every(b => typeof b === 'boolean')) throw new Error('colors.extras takes only hp and combo, as true or false')
  }
  if (v.rowFlags !== undefined) {
    if (!isPlain(v.rowFlags)) throw new Error('colors.rowFlags must be an object of labels, markers and xp booleans')
    v.rowFlags = known(v.rowFlags, ROW_FLAG_KEYS, 'colors.rowFlags', notes)
    if (!Object.values(v.rowFlags as object).every(b => typeof b === 'boolean')) throw new Error('colors.rowFlags takes only labels, markers and xp, as true or false')
  }
  dropUnknown(v, 'meters', METER_STYLES, 'colors', notes, `colors.meters must be one of ${METER_STYLES.join(', ')}`)
  if (v.dividers !== undefined && typeof v.dividers !== 'boolean') throw new Error('colors.dividers must be true or false')
  if (v.glyphs !== undefined) v.glyphs = checkGlyphs(v.glyphs, 'colors.glyphs', notes)
  checkHearts(v.hearts, 'colors.hearts')
  checkWords(v.words, 'colors.words')
  if (v.pet !== undefined) {
    if (!isPlain(v.pet)) throw new Error('colors.pet must be an object of body, light and shade colors')
    v.pet = known(v.pet, PET_TINT_KEYS, 'colors.pet', notes)
    for (const [k, c] of Object.entries(v.pet as Record<string, unknown>)) if (typeof c !== 'string' || !HEX.test(c)) throw new Error(`colors.pet.${k} must be #rrggbb`)
  }
  return v
}

function checkMotion(raw: unknown, notes: string[]): unknown {
  if (raw === undefined) return undefined
  if (typeof raw === 'string') { if (!safeText(raw)) throw new Error('"motion" must be a pack name or an object'); return raw }
  if (!isPlain(raw)) throw new Error('"motion" must be a pack name or an object')
  const v = known(raw, MOTION_KEYS, 'motion', notes)
  if (v.spinner !== undefined && !(typeof v.spinner === 'string' && SPINNER_SHAPE.test(v.spinner))) throw new Error('motion.spinner must be a lowercase id such as "comet"')
  dropUnknown(v, 'shimmer', [0, 1, 2], 'motion', notes, 'motion.shimmer must be 0, 1 or 2')
  if (v.color !== undefined && (typeof v.color !== 'string' || !HEX.test(v.color))) throw new Error('motion.color must be #rrggbb')
  const f = v.field
  if (f === undefined || oneOf(FIELD_IDS, f)) return v
  if (typeof f === 'string') { notes.push(unknownValue('motion.field', f)); delete v.field; return v }
  if (!isPlain(f)) throw new Error(`motion.field must be one of ${FIELD_IDS.join(', ')}, or an object with a shape`)
  const field = known(f, FIELD_KEYS, 'motion.field', notes)
  if (typeof field.shape === 'string' && !oneOf(FIELD_IDS, field.shape)) { notes.push(unknownValue('motion.field.shape', field.shape)); delete v.field; return v }
  if (!oneOf(FIELD_IDS, field.shape)) throw new Error(`motion.field.shape must be one of ${FIELD_IDS.join(', ')}`)
  for (const [k, [lo, hi]] of Object.entries(FIELD_KNOBS)) {
    const n = field[k]
    if (n !== undefined && (typeof n !== 'number' || !(n >= lo && n <= hi))) throw new Error(`motion.field.${k} must be a number from ${lo} to ${hi}`)
  }
  if (field.size !== undefined && !Number.isInteger(field.size)) throw new Error('motion.field.size must be a whole number of dots')
  dropUnknown(field, 'dither', DITHERS, 'motion.field', notes, `motion.field.dither must be one of ${DITHERS.join(', ')}`)
  if (field.color !== undefined && (typeof field.color !== 'string' || !HEX.test(field.color))) throw new Error('motion.field.color must be #rrggbb')
  v.field = field
  return v
}

const fieldOf = (f: MotionLayer['field']): Field => typeof f === 'object' ? { ...FIELD_DEFAULTS, ...f } : { shape: f ?? 'none', ...FIELD_DEFAULTS }

// Throws for what no 1.x reads; keys and values only a later 1.x knows pass here and are reported by resolveLook.
export function validatePack(file: unknown): asserts file is PackFile {
  const notes: string[] = []
  const top = checkTop(file, notes)
  checkColors(top.colors, notes)
  checkMotion(top.motion, notes)
}

const merge = (a: Layer, b: Layer): Layer => {
  const out: Layer = { ...a, ...b }
  for (const k of ['palette', 'extras', 'rowFlags', 'glyphs', 'pet']) if (a[k] || b[k]) out[k] = { ...(a[k] as object), ...(b[k] as object) }
  return out
}

// Layers are validated one at a time so a bad colors layer leaves the motion layer usable.
function collect(name: string, kind: 'colors' | 'motion', user: Record<string, unknown>, seen: string[], notices: Set<string>): Layer {
  if (seen.includes(name)) throw new Error(`"extends" loops: ${[...seen, name].map(shown).join(' -> ')}`)
  if (seen.length >= MAX_DEPTH) throw new Error(`chain is deeper than ${MAX_DEPTH}: ${[...seen, name].map(shown).join(' -> ')}`)
  // Built-ins first: a stray user classic.json must not change crt, cozy or arcade.
  const found = Object.hasOwn(PACKS, name) ? PACKS[name] : Object.hasOwn(user, name) ? user[name] : undefined
  if (found === undefined) throw new Error(`no pack named "${shown(name)}"`)
  if (found instanceof Error) throw found
  const notes: string[] = []
  const raw = checkTop(found, notes)
  const own = (kind === 'colors' ? checkColors : checkMotion)(raw[kind], notes)
  for (const n of notes) notices.add(`pack "${shown(name)}": ${n}`)
  const next = [...seen, name]
  let acc: Layer = typeof raw.extends === 'string' ? collect(raw.extends, kind, user, next, notices) : {}
  if (typeof own === 'string') acc = merge(acc, collect(own, kind, user, next, notices))
  else if (own) acc = merge(acc, own as Layer)
  return acc
}

type ColorsOut = Pick<Look, 'theme' | 'bg' | 'rows' | 'border' | 'borderColor' | 'gradient' | 'extras' | 'rowFlags' | 'meters' | 'dividers' | 'pet'>

function colorsOf(layer: ColorsLayer, override: string | undefined, userThemes: Record<string, unknown>, overrides: Partial<Colors> | undefined, notices: Set<string>): ColorsOut {
  const { theme: base, error, notices: themeNotes } = resolveTheme(override ?? layer.theme ?? 'classic', userThemes)
  if (error) throw new Error(error)
  themeNotes.forEach(n => notices.add(n))
  const colors = { ...(override ? base.colors : { ...base.colors, ...layer.palette }), ...cleanOverrides(overrides) }
  // a theme override brings its own glyphs, hearts and words, as it does its own palette
  const own = override ? {} : {
    glyphs: { ...base.glyphs, ...layer.glyphs },
    hearts: layer.hearts ?? base.hearts,
    spinnerWords: layer.words?.length ? layer.words : base.spinnerWords,
  }
  return {
    theme: { ...base, ...own, colors },
    bg: (!override && layer.bg) || colors.panel,
    borderColor: (!override && layer.borderColor) || colors.faint,
    rows: layer.rows ?? 'classic',
    border: layer.border ?? 'round',
    gradient: layer.gradient ? (override ? [colors.accent, colors.read] : layer.gradient) : undefined,
    extras: { hp: layer.extras?.hp ?? false, combo: layer.extras?.combo ?? false },
    rowFlags: { labels: layer.rowFlags?.labels ?? true, markers: layer.rowFlags?.markers ?? false, xp: layer.rowFlags?.xp ?? false },
    meters: layer.meters ?? 'default',
    dividers: layer.dividers ?? false,
    pet: { ...layer.pet },
  }
}

// `errors` are what stopped something from loading (a layer falls back to classic, a spinner to stock);
// `notices` name what was skipped while the file still loaded.
export function resolveLook(mix: Mix, userPacks: Record<string, unknown>, userThemes: Record<string, unknown>): { look: Look; errors: string[]; notices: string[] } {
  const errors: string[] = []
  const reason = (name: string, kind: string, err: unknown) => `pack "${shown(name)}" ${kind}: ${err instanceof Error ? err.message : String(err)}`

  // A layer's notices are kept only once the layer has produced its part of the look; one that falls back to classic is reported by its error alone.
  const notices = new Set<string>()
  const layer = (kind: 'colors' | 'motion', name: string): { out: Layer; found: Set<string> } => {
    const found = new Set<string>()
    return { out: collect(name, kind, userPacks, [], found), found }
  }

  let colorsFrom = mix.colors
  let c: ColorsOut
  try {
    const { out, found } = layer('colors', mix.colors)
    const colors = out as ColorsLayer
    try { c = colorsOf(colors, mix.theme, userThemes, mix.overrides, notices) } catch (err) {
      if (mix.theme === undefined) throw err
      errors.push((err as Error).message)
      c = colorsOf(colors, undefined, userThemes, mix.overrides, notices)
    }
    found.forEach(n => notices.add(n))
  } catch (err) {
    errors.push(reason(mix.colors, 'colors', err))
    colorsFrom = 'classic'
    c = colorsOf(collect('classic', 'colors', {}, [], new Set()) as ColorsLayer, undefined, {}, mix.overrides, notices)
  }

  let motionFrom = mix.motion
  let m: MotionLayer
  try {
    const { out, found } = layer('motion', mix.motion)
    m = out as MotionLayer
    found.forEach(n => notices.add(n))
  } catch (err) {
    errors.push(reason(mix.motion, 'motion', err))
    motionFrom = 'classic'
    m = collect('classic', 'motion', {}, [], new Set()) as MotionLayer
  }
  const want = mix.spinner ?? m.spinner ?? 'stock'
  let spinner: SpinnerId = 'stock'
  if (oneOf(SPINNER_IDS, want)) spinner = want as SpinnerId
  else errors.push(`spinner "${shown(want)}" needs a newer ops-control; using stock`)

  return { look: { colorsFrom, motionFrom, ...c, motion: { spinner, shimmer: m.shimmer ?? 1, color: m.color ?? c.theme.colors.accent, field: fieldOf(m.field) } }, errors, notices: [...notices] }
}

// A mix based on a user theme exports no theme name; its glyphs, hearts and words are written as differences from classic.
export function exportMix(look: Look, name: string): PackFile {
  const colors: ColorsLayer = {
    palette: { ...look.theme.colors }, bg: look.bg, rows: look.rows, border: look.border, borderColor: look.borderColor, extras: { ...look.extras }, rowFlags: { ...look.rowFlags },
    meters: look.meters, dividers: look.dividers,
  }
  if (Object.hasOwn(PRESETS, look.theme.name)) colors.theme = look.theme.name
  if (look.gradient) colors.gradient = [...look.gradient]
  const base = resolveTheme(Object.hasOwn(PRESETS, look.theme.name) ? look.theme.name : 'classic', {}).theme
  const glyphs = Object.fromEntries(GLYPH_KEYS.filter(k => look.theme.glyphs[k] !== base.glyphs[k]).map(k => [k, look.theme.glyphs[k]]))
  if (Object.keys(glyphs).length) colors.glyphs = glyphs
  if (Object.keys(look.pet).length) colors.pet = { ...look.pet }
  if (look.theme.hearts.join() !== base.hearts.join()) colors.hearts = [...look.theme.hearts]
  if (look.theme.spinnerWords.join('\n') !== base.spinnerWords.join('\n')) colors.words = [...look.theme.spinnerWords]
  // validatePack counts UTF-16 units, so cut there and drop a split surrogate pair.
  const description = `${shown(look.colorsFrom)} colors, ${shown(look.motionFrom)} motion`.slice(0, 80).replace(/[\ud800-\udbff]$/, '')
  return { format: 1, name, description, colors, motion: { ...look.motion } }
}

export const stockMotion = (look: Look): Look => ({ ...look, motion: { ...look.motion, spinner: 'stock', shimmer: 0 } })
