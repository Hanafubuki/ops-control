// JSX-free: the docs site imports it.
import type { Moment } from './lines.ts'
import { shown } from './themes.ts'

export const BAND_ITEMS = ['combo', 'agents', 'meter', 'plan'] as const
// What sits over the prompt: the two-row work bar (milestones, context, 5-hour limit), or the one-row band.
export const BARS = ['work', 'band'] as const
export type Bar = (typeof BARS)[number]
export type BandItem = (typeof BAND_ITEMS)[number]
export const TAB_IDS = ['plan', 'context', 'guardrails', 'agents', 'diff', 'music', 'settings'] as const
// tabs ops-control no longer has: Changes listed the files the Diff tab lists
const RETIRED_TABS: readonly string[] = ['changes']
export type TabId = (typeof TAB_IDS)[number]
export const SETUP_MOODS: readonly Moment[] = ['needs-you', 'fail', 'done', 'green', 'hello', 'long-done', 'compact', 'level-up']
export type Meter = { warn: number; danger: number }
export type Setup = { format: 4; bar: Bar; band: BandItem[]; tabs: TabId[]; meter: Meter; bubbles: { moods: Moment[]; ms: number }; pet: { sleepMs: number; dance: boolean } }

export const DEFAULT_SETUP: Setup = {
  format: 4,
  bar: 'work',
  band: ['combo', 'agents', 'meter', 'plan'],
  tabs: ['plan', 'context', 'guardrails', 'agents', 'diff', 'music', 'settings'],
  meter: { warn: 50, danger: 80 },
  bubbles: { moods: [...SETUP_MOODS], ms: 3000 },
  pet: { sleepMs: 60_000, dance: true },
}

export const SETUP_KEYS = ['bar', 'band', 'tabs', 'meter.warn', 'meter.danger', 'bubbles.moods', 'bubbles.ms', 'pet.sleepMs', 'pet.dance'] as const

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const whole = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi

// Ids this build does not know are dropped with a notice: a setup saved by a later ops-control still loads.
function ids<T extends string>(v: unknown, known: readonly T[], what: string, notices: string[]): T[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: T[] = []
  for (const x of v) {
    if (typeof x === 'string' && (known as readonly string[]).includes(x)) { if (!out.includes(x as T)) out.push(x as T) }
    else notices.push(`unknown ${what} "${shown(String(x))}"`)
  }
  return out
}

export const setupIsNewer = (stored: unknown): boolean => isObj(stored) && Number.isInteger(stored.format) && (stored.format as number) > 4
export const SETUP_NEWER = 'Your setup was saved by a newer ops-control, so this version leaves it as it is. Update ops-control to change it.'

const KNOWN_TOP = ['format', 'bar', 'band', 'tabs', 'meter', 'bubbles', 'pet']

// A later 1.x may add keys to a format 4 record, at the top or inside meter, bubbles and pet; rewriting it must not drop them.
export function setupRecord(stored: unknown, setup: Setup): Record<string, unknown> {
  if (!isObj(stored) || stored.format !== 4) return { ...setup }
  const out: Record<string, unknown> = Object.fromEntries(Object.entries(stored).filter(([k]) => !KNOWN_TOP.includes(k)))
  Object.assign(out, setup)
  for (const k of ['meter', 'bubbles', 'pet'] as const) if (isObj(stored[k])) out[k] = { ...stored[k], ...setup[k] }
  return out
}

const OLD_DEFAULT_TABS = 'changes,agents,plan'
// 0.11-0.12's default, stored by any setup save before music existed
const PRE_MUSIC_TABS = 'plan,agents,diff,changes'
// the default while the Plan tab held the context too, stored by any setup save since
const PRE_CONTEXT_TABS = 'plan,agents,diff,changes,music'
// the default while the Changes tab was there, and the one after it, before Guardrails
const CHANGES_TABS = 'plan,context,agents,diff,changes,music'
const PRE_GUARDRAILS_TABS = 'plan,context,agents,diff,music'
// the default before Settings
const PRE_SETTINGS_TABS = 'plan,context,guardrails,agents,diff,music'
// Every moment a setup format knew. Saving any setup field stored the moods too, so a list holding all of them
// is that format's default, not a choice, and reads as today's default.
const MOODS_KNOWN: Record<number, readonly Moment[]> = {
  1: ['needs-you', 'fail', 'done'],
  2: ['needs-you', 'fail', 'done', 'green', 'hello', 'long-done', 'compact'],
  3: SETUP_MOODS,
  4: SETUP_MOODS,
}
const holdsAll = (got: readonly Moment[], known: readonly Moment[] | undefined) =>
  known !== undefined && got.length === known.length && known.every(m => got.includes(m))

export function parseSetup(raw: unknown): { setup: Setup; notices: string[] } {
  const d = DEFAULT_SETUP, notices: string[] = []
  if (raw === undefined) return { setup: d, notices }
  if (!isObj(raw)) return { setup: d, notices: ['setup must be an object'] }

  // a setup saved before the work bar has no bar key: that reads as the work bar
  let bar = d.bar
  if (raw.bar !== undefined) {
    if (raw.bar === 'work' || raw.bar === 'band') bar = raw.bar
    else notices.push(`bar must be one of: ${BARS.join(', ')}`)
  }

  let band = d.band
  if (raw.band !== undefined) {
    const got = ids(raw.band, BAND_ITEMS, 'band item', notices)
    if (got) band = got
    else notices.push(`band must be a list of: ${BAND_ITEMS.join(', ')}`)
  }

  // Format 3 saves are the user's own choice, so only older stored setups are migrated.
  const fmt = typeof raw.format === 'number' ? raw.format : 0

  let tabs = d.tabs
  if (raw.tabs !== undefined) {
    const was = Array.isArray(raw.tabs) ? raw.tabs.join() : ''
    // a retired tab is dropped without a word; a list of nothing else is the default
    const kept = Array.isArray(raw.tabs) ? raw.tabs.filter(x => !RETIRED_TABS.includes(x as string)) : raw.tabs
    const got = ids(kept, TAB_IDS, 'tab', notices)
    // Saving any setup field stored the tabs too, so an older default order is the default, not a choice.
    // Format 4 is the first to know Music, so only a stored older format can hold the pre-music default.
    const stale = typeof raw.format !== 'number' || raw.format < 4
    const old = (stale && (was === OLD_DEFAULT_TABS || was === PRE_MUSIC_TABS)) || was === PRE_CONTEXT_TABS || was === CHANGES_TABS || was === PRE_GUARDRAILS_TABS || was === PRE_SETTINGS_TABS
    if (got?.length) tabs = old ? d.tabs : got
    else if (Array.isArray(raw.tabs) && raw.tabs.length && !(kept as unknown[]).length) tabs = d.tabs
    else notices.push(`tabs must name at least one of: ${TAB_IDS.join(', ')}`)
  }

  let meter = d.meter
  if (raw.meter !== undefined) {
    const m = isObj(raw.meter) ? raw.meter : {}
    const warn = m.warn ?? d.meter.warn, danger = m.danger ?? d.meter.danger
    if (!whole(warn, 1, 99)) notices.push('meter.warn must be a whole number from 1 to 99')
    else if (!whole(danger, 1, 99)) notices.push('meter.danger must be a whole number from 1 to 99')
    else if (warn >= danger) notices.push('meter.warn must be below meter.danger')
    else meter = { warn, danger }
  }

  const b = isObj(raw.bubbles) ? raw.bubbles : {}
  let moods = d.bubbles.moods
  if (b.moods !== undefined) {
    const got = ids(b.moods, SETUP_MOODS, 'mood', notices)
    if (got) moods = holdsAll(got, MOODS_KNOWN[typeof raw.format === 'number' ? raw.format : 1]) ? d.bubbles.moods : got
    else notices.push(`bubbles.moods must be a list of: ${SETUP_MOODS.join(', ')}`)
  }
  let ms = d.bubbles.ms
  if (b.ms !== undefined) {
    if (whole(b.ms, 1500, 10_000)) ms = b.ms
    else notices.push('bubbles.ms must be a whole number from 1500 to 10000')
  }

  const p = isObj(raw.pet) ? raw.pet : {}
  let sleepMs = d.pet.sleepMs
  if (p.sleepMs !== undefined) {
    if (whole(p.sleepMs, 15_000, 600_000)) sleepMs = p.sleepMs
    else notices.push('pet.sleepMs must be a whole number from 15000 to 600000')
  }
  // A setup saved before 1.1 has no dance key: that reads as on.
  let dance = d.pet.dance
  if (p.dance !== undefined) {
    if (typeof p.dance === 'boolean') dance = p.dance
    else notices.push('pet.dance must be true or false')
  }

  return { setup: { format: 4, bar, band, tabs, meter, bubbles: { moods, ms }, pet: { sleepMs, dance } }, notices }
}

const list = (v: string) => (v === 'none' ? [] : v.split(',').map(s => s.trim()).filter(Boolean))

// A typed value is strict: what parseSetup would drop with a notice is refused here.
export function setSetupField(s: Setup, key: string, value: string): { setup: Setup } | { error: string } {
  const num = Number(value)
  const next: Record<string, unknown> = JSON.parse(JSON.stringify(s))
  const meter = next.meter as Record<string, unknown>, bubbles = next.bubbles as Record<string, unknown>, pet = next.pet as Record<string, unknown>
  switch (key) {
    case 'bar': next.bar = value; break
    case 'band': next.band = list(value); break
    case 'tabs': next.tabs = list(value); break
    case 'meter.warn': meter.warn = num; break
    case 'meter.danger': meter.danger = num; break
    case 'bubbles.moods': bubbles.moods = list(value); break
    case 'bubbles.ms': bubbles.ms = num; break
    case 'pet.sleepMs': pet.sleepMs = num; break
    case 'pet.dance':
      if (value !== 'on' && value !== 'off') return { error: 'pet.dance takes on or off' }
      pet.dance = value === 'on'
      break
    default: return { error: `Unknown setup key "${shown(key)}". Keys: ${SETUP_KEYS.join(', ')}.` }
  }
  const r = parseSetup(next)
  return r.notices.length ? { error: r.notices[0]! } : { setup: r.setup }
}

const shownList = (xs: readonly string[]) => (xs.length ? xs.join(', ') : 'none')

export function describeSetup(s: Setup): string {
  const rows: [string, string][] = [
    ['bar', s.bar],
    ['band', shownList(s.band)],
    ['tabs', shownList(s.tabs)],
    ['meter.warn', String(s.meter.warn)],
    ['meter.danger', String(s.meter.danger)],
    ['bubbles.moods', shownList(s.bubbles.moods)],
    ['bubbles.ms', String(s.bubbles.ms)],
    ['pet.sleepMs', String(s.pet.sleepMs)],
    ['pet.dance', s.pet.dance ? 'on' : 'off'],
  ]
  return rows.map(([k, v]) => `${k.padEnd(15)}${v}`).join('\n')
}

export const toneFor = (p: number, m: Meter): 'pass' | 'edit' | 'fail' => (p >= m.danger ? 'fail' : p >= m.warn ? 'edit' : 'pass')
