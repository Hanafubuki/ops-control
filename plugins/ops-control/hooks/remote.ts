import type { Host } from './host.ts'
import { SAFE_NAME, SPINNER_IDS, type Look, type Mix } from './packs.ts'
import { BUBBLE_SETTINGS } from './bubbles.ts'
import { BREAK, FIELD_IDS } from './fields.ts'
import { BAND_ITEMS, TAB_IDS, SETUP_MOODS } from './setup.ts'
import { builtinPets } from './petfile.ts'
import type { ConfigState } from './configrows.ts'
import type { ConfigNote } from './configpane.tsx'

export const FRESH_MS = 10_000
// before the TUI's first heartbeat: long enough to paste a printed command by hand
export const START_MS = 600_000
export const PRUNE_MS = 86_400_000

export const REMOTE_DIR = (configDir: string) => `${configDir}/ops-control/remote`

export type RemoteLine = { seq: number; cmds: string[] } | { seq: number; undo: true }

// What the config TUI may run. A Write steered into commands.jsonl can change the look and
// nothing else: no URLs or files to install, no settings.json rewrite, no windows.
export function allowed(cmd: string): boolean {
  const w = cmd.trim().split(/\s+/)
  switch (w[0]) {
    case 'pack': return w.length === 2 && SAFE_NAME.test(w[1]!)
    case 'spinner': case 'motion': case 'bubbles': return w.length === 2
    case 'pet': return w.length === 2 && SAFE_NAME.test(w[1]!) && w[1] !== 'add' && w[1] !== 'list'
    case 'color': return w.length === 3
    case 'setup': return w.length >= 3 && w[1] !== 'reset'
    case 'statusline': return w[1] === 'fields' && w.length >= 3
    default: return false
  }
}

function parseLine(s: string): RemoteLine | undefined {
  try {
    const v = JSON.parse(s) as Record<string, unknown>
    if (typeof v.seq !== 'number' || !Number.isInteger(v.seq)) return undefined
    if (v.undo === true) return { seq: v.seq, undo: true }
    if (Array.isArray(v.cmds) && v.cmds.length > 0 && v.cmds.every(c => typeof c === 'string')) return { seq: v.seq, cmds: v.cmds as string[] }
  } catch {}
  return undefined
}

// A line the TUI is still writing has no newline yet, so it is left for the next poll.
export function newLines(text: string, consumed: number): { lines: (RemoteLine | undefined)[]; consumed: number } {
  const done = text.slice(0, text.lastIndexOf('\n') + 1).split('\n').slice(0, -1)
  return { lines: done.slice(consumed).map(parseLine), consumed: Math.max(consumed, done.length) }
}

// theme is here because a stored theme still decides the look when no mix is stored
export const UNDO_KEYS = ['mix', 'theme', 'pet', 'bubbles', 'reducedMotion', 'setup', 'statusline'] as const
export type Undo = Record<(typeof UNDO_KEYS)[number], unknown>
export type Cursor = { seq: number; lines: number }

// Raw keys, not the session's in-memory values: those include defaults that were never stored.
export async function saveUndo(host: Host): Promise<Undo> {
  const out = {} as Undo
  for (const k of UNDO_KEYS) out[k] = (await host.storeGet(k)) ?? null
  return out
}

// undo.json sits beside commands.jsonl, so any local process can write it: a partial one would delete settings.
export const isUndo = (v: unknown): v is Undo =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && UNDO_KEYS.every(k => k in v)

export async function restoreUndo(host: Host, undo: Undo) {
  for (const k of UNDO_KEYS) {
    const v = undo[k]
    if (v === null || v === undefined) await host.storeDelete(k)
    else await host.storeSet(k, v)
  }
}

export async function createRun(host: Host, owner: string, id: string): Promise<string> {
  const dir = `${REMOTE_DIR(host.configDir)}/${id}`
  const undo = JSON.stringify(await saveUndo(host))
  // owner first: a folder with no times looks abandoned to another session's prune
  await host.writeFile(`${dir}/owner`, owner)
  await host.writeFile(`${dir}/undo.json`, undo)
  return dir
}

export function isLive(open: number | undefined, owner: number | undefined, now: number): boolean {
  return open !== undefined ? now - open < FRESH_MS : owner !== undefined && now - owner < START_MS
}

export async function runTimes(host: Host, dir: string): Promise<{ open?: number; owner?: number }> {
  return { open: (await host.stat(`${dir}/open`))?.mtimeMs, owner: (await host.stat(`${dir}/owner`))?.mtimeMs }
}

export async function scanRuns(host: Host, owner: string, now: number): Promise<{ live: string[]; stale: string[] }> {
  const root = REMOTE_DIR(host.configDir)
  if (!(await host.exists(root))) return { live: [], stale: [] }
  const live: string[] = [], stale: string[] = []
  for (const id of await host.listDir(root)) {
    const dir = `${root}/${id}`
    const t = await runTimes(host, dir)
    // createRun is mid-write, or the folder is not a run; neither is ours to delete
    if (t.open === undefined && t.owner === undefined) continue
    if (now - Math.max(t.open ?? 0, t.owner ?? 0) > PRUNE_MS) stale.push(dir)
    else if (isLive(t.open, t.owner, now) && (await host.readFile(`${dir}/owner`).catch(() => '')) === owner) live.push(dir)
  }
  return { live, stale }
}

export type Snapshot = {
  format: 1; seq: number; lines: number; version: string; cwd: string; note?: ConfigNote
  state: { mix: Mix; colors: ConfigState['colors']; pet: string; bubbles: string; reduced: boolean; setup: ConfigState['setup']; fields: readonly string[] }
  look: { name: string; bg: string; border: string; borderColor: string; spinner: string; spinColor: string; word: string }
  options: { packs: readonly string[]; spinners: readonly string[]; pets: readonly string[]; fields: readonly string[]; band: readonly string[]; tabs: readonly string[]; moods: readonly string[]; bubbles: readonly string[] }
}

export function snapshotOf(s: ConfigState, look: Look, o: { cursor: Cursor; version: string; cwd: string; note?: ConfigNote }): Snapshot {
  return {
    format: 1, seq: o.cursor.seq, lines: o.cursor.lines, version: o.version, cwd: o.cwd, ...(o.note && { note: o.note }),
    state: { mix: s.mix, colors: s.colors, pet: s.pet, bubbles: s.bubbles, reduced: s.reduced, setup: s.setup, fields: s.fields },
    look: { name: look.colorsFrom, bg: look.bg, border: look.border, borderColor: look.borderColor, spinner: look.motion.spinner, spinColor: look.motion.color, word: look.theme.spinnerWords[0] ?? 'Working' },
    options: { packs: s.packs, spinners: SPINNER_IDS, pets: [...builtinPets(s.shiny, s.egg), ...s.userPets, 'off'], fields: [...FIELD_IDS, BREAK], band: BAND_ITEMS, tabs: TAB_IDS, moods: SETUP_MOODS, bubbles: BUBBLE_SETTINGS },
  }
}
