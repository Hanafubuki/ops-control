import { PRESETS, DEFAULT_THEME } from './presets.ts'
import { cellWidth } from './cells.ts'
export { PRESETS }

export const MAX_THEME_BYTES = 65536
export const COLOR_KEYS = ['accent', 'text', 'dim', 'faint', 'read', 'edit', 'shell', 'agent', 'pass', 'fail', 'panel', 'addBg', 'delBg', 'sel'] as const
export const GLYPH_KEYS = ['read', 'search', 'edit', 'shell', 'agent', 'plan'] as const
// What each role paints, in words: the config pane, the studio and /ops color list show these.
export const ROLE_LABELS: Record<(typeof COLOR_KEYS)[number], string> = {
  accent: 'plan item, progress pips, plan glyphs',
  text: 'main text',
  dim: 'secondary text, separators, empty hearts',
  faint: 'empty bar parts, box and section borders',
  read: 'read & search rows, running subagent work',
  edit: 'edit rows, context warnings',
  shell: 'shell rows',
  agent: 'subagent rows',
  pass: 'passing tests, finished subagents, added lines',
  fail: 'failures, full hearts, removed lines',
  panel: 'the background fades blend toward',
  addBg: 'background of added lines in the Diff tab',
  delBg: 'background of removed lines in the Diff tab',
  sel: 'not drawn yet',
}

export type Colors = Record<(typeof COLOR_KEYS)[number], string>
export type Theme = { name: string; colors: Colors; spinnerWords: string[]; glyphs: Record<(typeof GLYPH_KEYS)[number], string>; hearts: [string, string] }
export type ThemeFile = { name: string; extends?: string; colors?: Partial<Colors>; spinner?: { words?: string[] }; glyphs?: Partial<Theme['glyphs']>; band?: { hearts?: [string, string] } }

export function parseJsonc(text: string): unknown {
  if (new TextEncoder().encode(text).length > MAX_THEME_BYTES) throw new Error(`file is over ${MAX_THEME_BYTES} bytes`)
  let out = '', i = 0, inStr = false
  while (i < text.length) {
    const c = text[i]!, n = text[i + 1]
    if (inStr) { out += c; if (c === '\\') { out += n ?? ''; i += 2; continue } if (c === '"') inStr = false; i++; continue }
    if (c === '"') { inStr = true; out += c; i++; continue }
    if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; continue }
    if (c === '/' && n === '*') {
      const end = text.indexOf('*/', i + 2)
      if (end < 0) throw new Error('unterminated /* comment')
      out += ' '; i = end + 2; continue
    }
    out += c; i++
  }
  // the runtime's message can quote source bytes, ESC included
  try { return JSON.parse(out) } catch (err) { throw new Error('not valid JSON: ' + shown((err as Error).message)) }
}

// Downloaded themes reach the terminal, so anything that moves the cursor, hides text or
// is not a scalar value is out: C0/C1 controls, zero-width and bidi marks, surrogates.
const UNSAFE: [number, number][] = [[0x00, 0x1f], [0x7f, 0x9f], [0x061c, 0x061c], [0x200b, 0x200f], [0x2028, 0x202f], [0x2060, 0x206f], [0xfeff, 0xfeff], [0xd800, 0xdfff]]
export const isUnsafe = (cp: number) => UNSAFE.some(([lo, hi]) => cp >= lo && cp <= hi)

// Below U+FFFF and width 1: the engine refuses glyph cells of any other width.
export function isGlyph(s: unknown): boolean {
  if (typeof s !== 'string' || [...s].length !== 1) return false
  const cp = s.codePointAt(0)!
  return cp <= 0xffff && cellWidth(cp) === 1 && !isUnsafe(cp)
}
const isWord = (w: unknown) => typeof w === 'string' && w.length <= 24 && [...w].every(c => !isUnsafe(c.codePointAt(0)!))

// Keys and theme names come from downloaded files and end up in toasts and
// command output, so they are echoed without control characters and capped.
export const shown = (s: string) => [...s].filter(c => !isUnsafe(c.codePointAt(0)!)).join('').slice(0, 40)

export const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// A file may use a key or value a later 1.x added: it is skipped and reported, never fatal.
export const NOTICE_TAIL = ' skipped'
export const skippedKey = (parent: string, key: string) => `unknown key "${parent ? parent + '.' : ''}${shown(key)}"${NOTICE_TAIL}`

// The theme as this build reads it: unknown color roles and glyphs left out and named in `notes`.
function validate(file: unknown, notes: string[]): ThemeFile {
  if (typeof file !== 'object' || file === null || Array.isArray(file)) throw new Error('a theme must be a JSON object')
  const f = file as Record<string, unknown>
  if (f.extends !== undefined && typeof f.extends !== 'string') throw new Error('"extends" must be a theme name')
  const colors: Record<string, string> = {}
  for (const [k, v] of Object.entries((f.colors ?? {}) as Record<string, unknown>)) {
    if (!(COLOR_KEYS as readonly string[]).includes(k)) { notes.push(skippedKey('colors', k)); continue }
    if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) throw new Error(`color "${k}" must be #rrggbb`)
    colors[k] = v
  }
  const glyphs = checkGlyphs(f.glyphs, 'glyphs', notes)
  checkHearts((f.band as { hearts?: unknown } | undefined)?.hearts, 'band.hearts')
  checkWords((f.spinner as { words?: unknown } | undefined)?.words, 'spinner.words')
  return { ...f, colors, ...(glyphs && { glyphs }) } as ThemeFile
}

// `where` names the field in the message, so a theme file and a pack each report their own key.
export function checkGlyphs(v: unknown, where: string, notes: string[] = []): Partial<Theme['glyphs']> | undefined {
  if (v === undefined) return undefined
  if (!isPlain(v)) throw new Error(`"${where}" must be an object`)
  const out: Record<string, string> = {}
  for (const [k, g] of Object.entries(v)) {
    if (!(GLYPH_KEYS as readonly string[]).includes(k)) { notes.push(skippedKey(where, k)); continue }
    if (!isGlyph(g)) throw new Error(`glyph "${k}" must be one width-1 character`)
    out[k] = g as string
  }
  return out
}

export function checkHearts(v: unknown, where: string): void {
  if (v !== undefined && (!Array.isArray(v) || v.length !== 2 || !v.every(isGlyph))) throw new Error(`${where} must be two width-1 characters`)
}

export function checkWords(v: unknown, where: string): void {
  if (v !== undefined && (!Array.isArray(v) || !v.every(isWord))) throw new Error(`${where} must be short strings of printable characters`)
}

function chain(name: string, user: Record<string, unknown>, notices: string[], seen: string[] = []): ThemeFile[] {
  if (seen.includes(name)) throw new Error(`"extends" loops: ${[...seen, name].map(shown).join(' -> ')}`)
  const raw = Object.hasOwn(user, name) ? user[name] : Object.hasOwn(PRESETS, name) ? PRESETS[name] : undefined
  if (raw === undefined) throw new Error(`no theme named "${shown(name)}"`)
  if (raw instanceof Error) throw raw
  const notes: string[] = []
  const file = validate(raw, notes)
  notices.push(...notes.map(n => `theme "${shown(name)}": ${n}`))
  return file.extends ? [...chain(file.extends, user, notices, [...seen, name]), file] : [file]
}

function merge(files: ThemeFile[], name: string): Theme {
  const base = PRESETS.classic!
  const t: Theme = { name, colors: { ...base.colors } as Colors, spinnerWords: [...base.spinner!.words!], glyphs: { ...base.glyphs } as Theme['glyphs'], hearts: [...base.band!.hearts!] as [string, string] }
  for (const f of files) {
    Object.assign(t.colors, f.colors)
    Object.assign(t.glyphs, f.glyphs)
    if (f.spinner?.words?.length) t.spinnerWords = [...f.spinner.words]
    if (f.band?.hearts) t.hearts = [...f.band.hearts]
  }
  return t
}

export function resolveTheme(name: string, user: Record<string, unknown>): { theme: Theme; error?: string; notices: string[] } {
  const notices: string[] = []
  try { return { theme: merge(chain(name, user, notices), name), notices } }
  catch (err) { return { theme: merge([PRESETS[DEFAULT_THEME]!], DEFAULT_THEME), error: `theme "${shown(name)}": ${(err as Error).message}`, notices: [] } }
}
