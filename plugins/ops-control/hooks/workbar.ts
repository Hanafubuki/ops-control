// The work bar over the prompt, two rows: what Claude is doing toward the work's milestones (a headline with the
// step it is at and how long that step has run), then the instruments: the milestones as a track with the time
// still needed, the context meter with the auto-compact point marked, and the 5-hour limit. JSX-free, so it tests on plain models.
import type { Model } from './model.ts'
import type { Milestone, MilestoneStatus, Requests } from './requests.ts'
import { currentMilestone, openIssues } from './requests.ts'
import type { PlanItem } from './events.ts'
import type { Theme } from './themes.ts'
import type { Look } from './packs.ts'
import type { Meter } from './setup.ts'
import { toneFor } from './setup.ts'
import { eta, type Eta } from './eta.ts'
import { comboSegs, fit, toneColor, visibleLength, type Seg } from './layout.tsx'

export type WorkInput = {
  model: Model
  // the milestones of the work and its objective, as the latest request that has them reports them
  steps: readonly Milestone[]
  objective?: string
  // the open issues of the request at work (requests.ts openIssues)
  issues?: number
  // when the current milestone began, for the time it has run
  since?: number
  // the time left from how long the session's past requests ran, for work whose steps cannot tell (eta.ts historyEta)
  history?: Eta
  // the auto-compact point, in percent of the window: the meter's notch
  marker?: number
  meter: Meter
  now: number
  columns: number
  look?: Look
}

const INDENT = 2, GAP = 4
// Each tier is tried in turn until every instrument fits; the labels need 72 columns.
const TIERS = [
  { labels: true, meter: 24, stops: 16 }, { labels: true, meter: 16, stops: 12 }, { labels: true, meter: 12, stops: 10 },
  { labels: true, meter: 10, stops: 8 }, { labels: true, meter: 8, stops: 6 }, { labels: false, meter: 8, stops: 6 }, { labels: false, meter: 6, stops: 5 },
]
const LABELS_FROM = 72
const LIMIT_WARN = 80

export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

// Time to a reset, rounded up to the minute: <1m, 14m, 2h14m, 2d3h.
export function countdown(ms: number): string {
  if (ms < 60_000) return '<1m'
  const min = Math.ceil(ms / 60_000)
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h${min % 60 ? `${min % 60}m` : ''}`
  return `${Math.floor(h / 24)}d${h % 24 ? `${h % 24}h` : ''}`
}

type Head = { glyph: string; color: string; text: string; detail?: string; bold?: boolean; dim?: boolean }

// The headline: a permission waiting, the milestone at work, one blocked or waiting, all done, or where it stands.
export function headline(t: Theme, w: WorkInput): Head {
  const c = t.colors, m = w.model, steps = w.steps
  const at = currentMilestone(steps), cur = at >= 0 ? steps[at] : undefined
  const done = steps.filter(s => s.status === 'completed').length
  const step = cur ? `step ${at + 1} of ${steps.length}` : undefined
  const ran = cur && w.since !== undefined && w.now - w.since >= 1000 ? elapsed(w.now - w.since) : undefined
  const detail = (...xs: (string | undefined)[]) => xs.filter(Boolean).join(' · ') || undefined
  const tally = steps.length ? `${done} of ${steps.length} milestones done` : undefined
  if (m.needsYou) return { glyph: '◆', color: c.edit, text: `Waiting for you to approve: ${m.needsYou.what}`, bold: true }
  if (m.working) {
    if (cur?.status === 'verifying') return { glyph: '◎', color: c.accent, text: cur.doing ?? `Verifying: ${cur.title}`, detail: detail(step, ran), bold: true }
    if (cur?.status === 'in_progress') return { glyph: '▸', color: c.accent, text: cur.doing ?? cur.title, detail: detail(step, ran), bold: true }
    return { glyph: m.act.glyph, color: toneColor(t, m.act.tone), text: m.act.label, detail: tally, bold: true }
  }
  if (cur?.status === 'blocked') return { glyph: '⊘', color: c.fail, text: `Blocked: ${cur.blocker ?? cur.title}`, detail: step, bold: true }
  if (cur?.status === 'waiting') return { glyph: '◷', color: c.accent, text: `Waiting for ${cur.blocker ?? cur.title}`, detail: step }
  if (steps.length && done === steps.length) return { glyph: '✓', color: c.pass, text: `All ${steps.length} milestones done`, bold: true }
  if (steps.length) return { glyph: '○', color: c.dim, text: w.objective ?? 'Ready', detail: tally, dim: true }
  return { glyph: m.act.glyph, color: toneColor(t, m.act.tone), text: m.act.label, dim: m.act.label === 'Ready' }
}

type Stop = 'done' | 'now' | 'verify' | 'held' | 'open' | 'failed' | 'skipped'
const STOP: Record<MilestoneStatus, Stop> = { completed: 'done', in_progress: 'now', verifying: 'verify', waiting: 'held', blocked: 'held', pending: 'open', failed: 'failed', skipped: 'skipped' }
const STOP_GLYPH: Record<Stop, string> = { done: '●', now: '◉', verify: '◎', held: '◌', open: '○', failed: '✗', skipped: '–' }

// More milestones than stops: each stop stands for a stretch and shows the liveliest of it.
export function scaleTrack(stops: readonly Stop[], max: number): Stop[] {
  if (stops.length <= max) return [...stops]
  return Array.from({ length: max }, (_, i) => {
    const part = stops.slice(Math.floor((i * stops.length) / max), Math.floor(((i + 1) * stops.length) / max))
    for (const s of ['now', 'verify', 'held', 'failed'] as const) if (part.includes(s)) return s
    return part.every(s => s === 'done' || s === 'skipped') ? 'done' : 'open'
  })
}

function track(t: Theme, steps: readonly Milestone[], max: number): Seg[] {
  const c = t.colors, stops = scaleTrack(steps.map(s => STOP[s.status]), max), out: Seg[] = []
  const color: Record<Stop, string> = { done: c.accent, now: c.accent, verify: c.accent, held: c.edit, open: c.dim, failed: c.fail, skipped: c.dim }
  stops.forEach((s, i) => {
    if (i > 0) out.push(stops[i - 1] === 'done' && s !== 'open' ? { text: '━', color: c.accent } : { text: '─', color: c.faint })
    out.push({ text: STOP_GLYPH[s], color: color[s], bold: s === 'now' })
  })
  return out
}

// width cells filled to f (0..1); the cell at the marker is the notch, and a fill past it reaches beyond it.
export function meterCells(f: number, width: number, markerAt?: number): ('fill' | 'track' | 'notch')[] {
  const marker = markerAt === undefined ? -1 : Math.min(width - 1, Math.max(0, Math.round(markerAt * width) - 1))
  let filled = Math.round(Math.min(1, Math.max(0, f)) * width)
  if (marker >= 0 && f > markerAt!) filled = Math.min(width, Math.max(filled, marker + 2))
  return Array.from({ length: width }, (_, i) => (i === marker ? 'notch' : i < filled ? 'fill' : 'track'))
}

type Segment = { segs: Seg[]; priority: number }

function instruments(t: Theme, w: WorkInput, tier: (typeof TIERS)[number]): { left: Segment[]; right: Segment[] } {
  const c = t.colors, m = w.model, label = (s: string): Seg[] => (tier.labels ? [{ text: `${s} `, color: c.dim }] : [])
  const left: Segment[] = [], right: Segment[] = []
  if (w.steps.length) {
    const done = w.steps.filter(s => s.status === 'completed').length, all = done === w.steps.length
    left.push({ priority: 1, segs: [...label('WORK'), ...track(t, w.steps, tier.stops), { text: ` ${done}/${w.steps.length}`, color: all ? c.pass : c.text, bold: true }, ...etaSegs(t, w, tier.labels)] })
  } else {
    const segs = etaSegs(t, w, tier.labels)
    if (segs.length) left.push({ priority: 1, segs: [...label('ETA'), ...segs.slice(1)] })
  }
  const pct = Math.max(0, Math.min(100, Math.round(m.ctxPercent))), tone = c[toneFor(pct, w.meter)]
  const cells = meterCells(pct / 100, tier.meter, w.marker === undefined ? undefined : w.marker / 100)
  left.push({
    priority: 0, segs: [...label('CONTEXT'), ...cells.map((k): Seg => (k === 'notch' ? { text: '█', color: c.fail } : { text: '▇', color: k === 'fill' ? tone : c.faint })), { text: ` ${pct}%`, color: tone, bold: true }],
  })
  const five = m.limits.find(l => l.kind === 'five_hour')
  if (five) {
    const used = Math.max(0, Math.min(100, Math.round(five.percentUsed))), high = used >= LIMIT_WARN, f = used / 100
    const n = f > 0 ? Math.max(1, Math.round(f * 6)) : 0
    const reset = five.resetsAt ? Date.parse(five.resetsAt) : NaN
    right.push({
      priority: 1,
      segs: [
        ...label('5H'), ...(tier.labels ? [{ text: '▂'.repeat(n), color: high ? c.edit : c.accent }, { text: '▂'.repeat(6 - n), color: c.faint }] : []),
        { text: ` ${used}%`, color: high ? c.edit : c.text, bold: true },
        ...(Number.isFinite(reset) ? [{ text: ` · ${reset > w.now ? countdown(reset - w.now) : 'reset'}`, color: c.dim }] : []),
      ].filter(s => s.text),
    })
  }
  return { left, right }
}

// While Claude works: the time the steps still need at their pace so far, else as long as past requests ran (dim),
// `--` (labels only) until either can tell. Nothing while a step waits or all are done: the headline says so.
export function timeLeft(w: WorkInput): Eta | undefined {
  if (!w.model.working) return undefined
  const own = w.steps.length ? eta(w.steps, w.now) : { kind: 'unknown' as const }
  return own?.kind === 'unknown' && w.history?.kind === 'left' ? w.history : own
}

function etaSegs(t: Theme, w: WorkInput, labels: boolean): Seg[] {
  const c = t.colors, e = timeLeft(w)
  if (!e || (e.kind === 'unknown' && !labels)) return []
  const lead: Seg = { text: labels ? ' · ETA ' : ' · ', color: c.dim }
  if (e.kind === 'unknown') return [lead, { text: '--', color: c.dim }]
  return [lead, { text: e.ms < 60_000 ? '<1m' : `~${countdown(e.ms)}`, color: e.from === 'history' ? c.dim : c.text }]
}

const width = (xs: Segment[]) => xs.reduce((n, x) => n + visibleLength(x.segs), 0) + GAP * Math.max(0, xs.length - 1)
// While they overflow, the least needed instrument goes (the higher number, the later one on a tie).
function fitSegments(all: Segment[], room: number): Segment[] {
  const kept = [...all]
  while (kept.length > 1 && width(kept) > room) {
    let drop = kept.length - 1
    for (let i = kept.length - 1; i >= 0; i--) if (kept[i]!.priority > kept[drop]!.priority) drop = i
    kept.splice(drop, 1)
  }
  return kept
}

export function instrumentRow(t: Theme, w: WorkInput): Seg[] {
  const room = Math.max(10, w.columns - INDENT), c = t.colors
  const tiers = w.columns >= LABELS_FROM ? TIERS : TIERS.filter(x => !x.labels)
  let left: Segment[] = [], right: Segment[] = []
  for (const tier of tiers) {
    const got = instruments(t, w, tier), all = [...got.left, ...got.right], kept = fitSegments(all, room)
    left = got.left.filter(x => kept.includes(x)); right = got.right.filter(x => kept.includes(x))
    if (kept.length === all.length) break
  }
  const gap = (n: number): Seg => ({ text: ' '.repeat(Math.max(0, n)), color: c.text })
  const out: Seg[] = [gap(INDENT)]
  left.forEach((x, i) => out.push(...(i ? [gap(GAP)] : []), ...x.segs))
  if (right.length) {
    const r = right.flatMap(x => x.segs)
    out.push(gap(Math.max(GAP, w.columns - visibleLength(out) - visibleLength(r))), ...r)
  }
  return fit(out, w.columns)
}

// The headline row: the state, then the step and its time dim; chips to the right take at most 45% of the row.
// Work with no milestones has no headline (the spinner already says what Claude does), save a permission waiting:
// the chips alone are right-aligned, and a row with neither is empty, which the band leaves out.
export function headlineRow(t: Theme, w: WorkInput): Seg[] {
  const c = t.colors, h = headline(t, w), m = w.model
  const live = m.agents.filter(a => a.state === 'running').length
  const chips: Seg[][] = [
    w.issues ? [{ text: `▲ ${w.issues} issue${w.issues === 1 ? '' : 's'}`, color: c.edit, bold: true }] : [],
    comboSegs(m.combo, w.look),
    m.lastTest && !m.lastTest.passed ? [{ text: '✗ tests fail', color: c.fail }] : [],
    live ? [{ text: `◆ ${live} subagent${live === 1 ? '' : 's'}`, color: c.agent }] : [],
  ].filter(x => x.length)
  const right: Seg[] = []
  for (const chip of chips) {
    const next = [...right, ...(right.length ? [{ text: '  ', color: c.text }] : []), ...chip]
    if (visibleLength(next) > Math.floor(w.columns * 0.45)) break
    right.splice(0, right.length, ...next)
  }
  const shown = w.steps.length > 0 || !!m.needsYou
  const left: Seg[] = shown ? [
    { text: h.glyph.padEnd(INDENT), color: h.color },
    { text: h.text, color: h.dim ? c.dim : c.text, bold: h.bold },
    ...(h.detail ? [{ text: ` · ${h.detail}`, color: c.dim }] : []),
  ] : []
  if (!shown && !right.length) return []
  const room = w.columns - (right.length ? visibleLength(right) + 3 : 0)
  const l = shown ? fit(left, Math.max(INDENT + 1, room)) : []
  if (!right.length) return l
  return [...l, { text: ' '.repeat(Math.max(1, w.columns - visibleLength(l) - visibleLength(right))), color: c.text }, ...right]
}

// The work the bar follows: the newest request's milestones (a prompt taken into another request's turn has that
// turn's), else Claude's task list while some task is still open. A new request starts with an empty track, so the
// last task's milestones leave the bar as soon as the next request is sent.
// tasks: the steps are Claude's task list, which carries no times; the caller stamps them (requests.ts stamped).
export function workOf(rs: Requests | undefined, plan: readonly PlanItem[]): { steps: Milestone[]; objective?: string; tasks?: true } {
  const list = rs?.list ?? []
  const r = list.at(-1)
  if (r) {
    const host = !r.milestones.length && r.foldedInto ? list.find(x => x.id === r.foldedInto) : undefined
    const from = r.milestones.length ? r : host?.milestones.length ? host : undefined
    if (from) return { steps: from.milestones, ...((from.objective ?? r.objective) && { objective: from.objective ?? r.objective }) }
  }
  if (!plan.some(p => p.status !== 'completed')) return { steps: [] }
  return { steps: plan.map(p => ({ title: p.title, status: p.status })), tasks: true }
}

// The open issues of the request at work: the newest one, or the one whose turn took it in.
export function workIssues(rs: Requests | undefined): number {
  const list = rs?.list ?? [], r = list.at(-1)
  if (!r) return 0
  const host = r.foldedInto ? list.find(x => x.id === r.foldedInto) : undefined
  return openIssues(host ?? r).length
}

// A subagent's own bar, while its transcript is in view: its milestones, its context and what it does now.
// The session's limits and a dialog waiting on the person stay; the main loop's combo, tests and agents do not.
export function agentWork(m: Model, agentId: string): { model: Model; steps: Milestone[]; objective?: string } | undefined {
  const a = m.agents.find(x => x.agentId === agentId)
  if (!a) return undefined
  const running = a.state === 'running'
  const act: Model['act'] = running ? { glyph: '◆', label: a.now ?? (a.task || 'Starting'), tone: 'agent' } : { glyph: '✓', label: `Finished: ${a.task || a.name}`, tone: 'dim' }
  return {
    model: { ...m, working: running, act, agents: [], combo: 0, lastTest: undefined, ctxPercent: a.ctxPercent ?? 0 },
    steps: a.milestones ?? [],
    ...(a.objective && { objective: a.objective }),
  }
}

// A rule over the bar parts it from Claude's thinking and text above.
export function ruleRow(t: Theme, columns: number): Seg[] {
  return [{ text: '─'.repeat(Math.max(0, columns)), color: t.colors.faint }]
}

export function workBarRows(t: Theme, w: WorkInput): [Seg[], Seg[], Seg[]] {
  return [ruleRow(t, w.columns), headlineRow(t, w), instrumentRow(t, w)]
}
