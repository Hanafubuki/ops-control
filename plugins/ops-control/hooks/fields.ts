import { agentsRunning, type Model, type RateLimit } from './model.ts'
import type { Colors, Theme } from './themes.ts'
import { localTime } from './eggs.ts'
import { levelBar } from './levels.ts'
import { DEFAULT_SETUP, toneFor, type Meter } from './setup.ts'

export const FIELD_IDS = ['activity', 'ctx', '5h', 'week', 'cost', 'model', 'effort', 'agents', 'plan', 'branch', 'changes', 'cwd', 'level', 'music'] as const
export type FieldId = (typeof FIELD_IDS)[number]
export const DEFAULT_FIELDS: readonly FieldId[] = ['activity', 'ctx', 'effort', '5h', 'week']
export const isFieldId = (s: string): s is FieldId => (FIELD_IDS as readonly string[]).includes(s)
// Ends line 1 of the status line. A 1.0.x reader drops it as an unknown id and draws one line.
export const BREAK = '/'
export type FieldToken = FieldId | typeof BREAK
export const isFieldToken = (s: string): s is FieldToken => s === BREAK || isFieldId(s)
export const FIELD_CHOICES = `${FIELD_IDS.join(', ')}, and ${BREAK} to start a second line`
export const TWO_BREAKS = `Use one ${BREAK} to start the second line.`

// Lenient: the store, the /plugin setting and links drop unknown ids and every / after the first.
export function parseFields(v: unknown): FieldToken[] | undefined {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []
  const words = raw.filter((s): s is string => typeof s === 'string').map(s => s.trim())
  const first = words.indexOf(BREAK)
  const ids = [...new Set(words.filter((s, i) => isFieldId(s) || i === first))] as FieldToken[]
  return ids.some(s => s !== BREAK) ? ids : undefined
}

export type ColorMode = 'plain' | 'truecolor' | '256'
type Span = { text: string; color?: keyof Colors }

const WORD: Record<string, string> = { '▸': 'reading', '⌕': 'searching', '✎': 'editing', $: 'running', '◆': 'delegating', '✗': 'failing', '✓': 'passing', '!': 'waiting' }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Rounded down: "↻0m" would read as already reset.
export function resetIn(resetsAt: string | undefined, now: number, tzOffset: number): string {
  const at = resetsAt === undefined ? NaN : Date.parse(resetsAt)
  if (Number.isNaN(at)) return ''
  const mins = Math.floor((at - now) / 60_000)
  if (mins < 1) return ' ↻<1m'
  if (mins < 60) return ` ↻${mins}m`
  if (mins < 24 * 60) return ` ↻${Math.floor(mins / 60)}h${mins % 60}m`
  return ` ↻${DAYS[localTime(at, tzOffset).day]}`
}

// The figure is this session's last reading; once the window resets it no longer holds.
export function liveLimit(m: Model, kind: string, now: number): RateLimit | undefined {
  const w = m.limits.find(l => l.kind === kind)
  return !w || (w.resetsAt !== undefined && Date.parse(w.resetsAt) <= now) ? undefined : w
}

function field(id: FieldId, m: Model, now: number, tzOffset: number, meter: Meter): Span[] | undefined {
  const tone = (p: number): keyof Colors => toneFor(p, meter)
  const window = (kind: string, label: string): Span[] | undefined => {
    const w = liveLimit(m, kind, now)
    if (!w) return undefined
    return [{ text: label + ' ', color: 'dim' }, { text: `${w.percentUsed}%`, color: tone(w.percentUsed) }, { text: resetIn(w.resetsAt, now, tzOffset), color: 'dim' }]
  }
  switch (id) {
    case 'activity': {
      const word = m.working ? (Object.hasOwn(WORD, m.act.glyph) ? WORD[m.act.glyph]! : 'thinking') : agentsRunning(m) ? 'delegating' : 'idle'
      return [{ text: '◆ ', color: 'accent' }, { text: word, color: 'text' }]
    }
    case 'ctx': return m.ctxPercent ? [{ text: 'ctx ', color: 'dim' }, { text: `${m.ctxPercent}%`, color: tone(m.ctxPercent) }] : undefined
    case '5h': return window('five_hour', '5h')
    case 'week': return window('seven_day', 'wk')
    case 'cost': return m.costUsd === undefined ? undefined : [{ text: `$${m.costUsd.toFixed(2)}`, color: 'text' }]
    case 'model': return m.modelName ? [{ text: m.modelName, color: 'text' }] : undefined
    case 'effort': return m.effort ? [{ text: '◐ ', color: 'dim' }, { text: m.effort, color: 'text' }] : undefined
    case 'agents': {
      const n = m.agents.filter(a => a.state === 'running').length
      return n ? [{ text: `${n} agent${n === 1 ? '' : 's'}`, color: 'text' }] : undefined
    }
    case 'plan': {
      if (!m.plan.length) return undefined
      const done = m.plan.filter(p => p.status === 'completed').length
      return [{ text: 'plan ', color: 'dim' }, { text: `${done}/${m.plan.length}`, color: 'text' }]
    }
    case 'branch': return m.branch ? [{ text: m.branch, color: 'text' }] : undefined
    case 'changes': {
      const add = m.files.reduce((s, f) => s + f.add, 0), del = m.files.reduce((s, f) => s + f.del, 0)
      return add || del ? [{ text: `+${add}`, color: 'pass' }, { text: ' ' }, { text: `−${del}`, color: 'fail' }] : undefined
    }
    case 'level': {
      if (m.xp === undefined) return undefined
      const { level, filled } = levelBar(m.xp, 5)
      return [{ text: `Lv ${level} `, color: 'accent' }, { text: '▰'.repeat(filled), color: 'accent' }, { text: '▱'.repeat(5 - filled), color: 'faint' }]
    }
    case 'cwd': return m.root ? [{ text: m.root.replace(/\/+$/, '').split('/').pop() || '/', color: 'text' }] : undefined
    case 'music': {
      const mu = m.music
      if (mu?.status !== 'open' || !mu.playing || mu.ad || !mu.track) return undefined
      return [{ text: `♪ ${mu.track.title}${mu.track.artist ? ` — ${mu.track.artist}` : ''}`, color: 'text' }]
    }
  }
}

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
const cube = (c: number) => c < 48 ? 0 : c < 115 ? 1 : Math.floor((c - 35) / 40)
function escape(hex: string, mode: Exclude<ColorMode, 'plain'>): string {
  const [r, g, b] = rgb(hex)
  return mode === 'truecolor' ? `\x1b[38;2;${r};${g};${b}m` : `\x1b[38;5;${16 + 36 * cube(r) + 6 * cube(g) + cube(b)}m`
}
const paint = (spans: Span[], t: Theme, mode: ColorMode) =>
  spans.map(s => mode === 'plain' || !s.color || !s.text ? s.text : `${escape(t.colors[s.color], mode)}${s.text}\x1b[39m`).join('')

type RenderOpts = { now: number; tzOffset: number; color: ColorMode; meter?: Meter }
const SEP: Span[] = [{ text: ' · ', color: 'dim' }]

function renderLine(m: Model, t: Theme, fields: readonly FieldToken[], o: RenderOpts): string {
  const parts = fields.filter(isFieldId).map(id => field(id, m, o.now, o.tzOffset, o.meter ?? DEFAULT_SETUP.meter)).filter((s): s is Span[] => s !== undefined)
  return parts.map(s => paint(s, t, o.color)).join(paint(SEP, t, o.color))
}

// One line, or two when a / splits the list; a side that renders nothing is left out.
export function renderLines(m: Model, t: Theme, fields: readonly FieldToken[], o: RenderOpts): string[] {
  const at = fields.indexOf(BREAK)
  const sides = at < 0 ? [fields] : [fields.slice(0, at), fields.slice(at + 1)]
  return sides.map(s => renderLine(m, t, s, o)).filter(Boolean)
}

export function renderFields(m: Model, t: Theme, fields: readonly FieldToken[], o: RenderOpts): string {
  return renderLines(m, t, fields, o).join(paint(SEP, t, o.color))
}
