import type { ContextCategoryKind } from 'claude-code'
import { normalizeModel, planFold, runsOf, type Agent, type Model, type PlanItem } from './model.ts'
import { legendRows, stackBar, type Heavy } from './ctxchart.ts'
import { brailleArea, chartTop, markBar, outlook, tokensK } from './trend.ts'
import { planOrder } from './tasks.ts'
import type { Theme } from './themes.ts'
import { shortPath } from './events.ts'
import type { Border, Look } from './packs.ts'
import { wrapBubble } from './bubbles.ts'
import type { BubbleMood } from './lines.ts'
import { CLAWD_ROW, PET_ROWS, type PetId } from './pets.ts'
import { comboSegs, fit, hpBar, levelSegs, renderSegs, toneColor, visibleLength, type Seg } from './layout.tsx'
import { liveLimit } from './fields.ts'
import { DEFAULT_SETUP, toneFor, type Meter, type TabId } from './setup.ts'
import type { DiffLine, Diffs } from './diff.ts'
import { progressAt, type MusicCmd, type OpenMusic, type QueueItem } from './music/parse.ts'
import { barRow, type SeekBarProps } from './music/seek.ts'
import { coverPlaceholder } from './music/art.ts'
import type { MusicCaps } from './music/reader.ts'
import { currentMilestone, openIssues, requestTitle, workedMs, type Milestone, type MilestoneStatus, type Request, type Requests, type RequestStatus } from './requests.ts'
import { markdownRows, wrapSegs } from './mdrows.ts'
import type { GuardSwitches, Guardrails } from './guardrails.ts'
import { guardrailRows } from './guardrailstab.ts'
import { loadRows, type SysLoad } from './sysload.ts'

export type { TabId }
// ctx comes from the context breakdown: threshold is the auto-compact point in tokens (absent when it is off),
// window the model's window that m.ctxPercent and m.ctxHistory are measured against.
export type CtxDetail = { autoCompact: boolean; threshold?: number; window?: number; heavy: Heavy[]; cacheHit?: number }
// request: the id of the request the Plan tab shows in full, in place of the list; sys: the machine's load (Context tab)
export type PaneView = { tab: TabId; offset?: number; categories?: { name: string; tokens: number; kind: ContextCategoryKind }[]; maxTokens?: number; ctx?: CtxDetail; reduced?: boolean; meter?: Meter; diff?: Diffs; cover?: Seg[][]; musicCaps?: MusicCaps; request?: string; guardrails?: Guardrails; sys?: SysLoad
  // the Agents tab: the agent shown in full (MAIN_AGENT for the main session), the name pack's names by agent key,
  // and the main session's name
  agent?: string; names?: Record<string, string>; mainName?: string
  // the main session's milestones in its detail view, as the work bar follows them (workbar.ts workOf)
  mainWork?: { steps: readonly Milestone[]; objective?: string }
  // the Guardrails tab's switches for this project (guardrails.ts)
  guardSwitches?: GuardSwitches }
export const TABS: [TabId, string][] = [['plan', 'Plan'], ['context', 'Context'], ['guardrails', 'Guardrails'], ['agents', 'Agents'], ['diff', 'Diff'], ['music', 'Music'], ['settings', 'Settings']]
// The Agents tab's key for the main session's own row and detail view.
export const MAIN_AGENT = 'main'
// The engine actions that press the tabs from the prompt, first tab to seventh: F1-F7 are bound to them in
// keybindings.json (Global). A mod cannot name its own action, so these are actions the engine handles only inside
// its diff, model and effort dialogs: anywhere else no engine handler is mounted and the tab's Button takes the key.
export const TAB_ACTIONS = ['diff:back', 'diff:previousSource', 'diff:nextSource', 'diff:previousFile', 'diff:nextFile', 'modelPicker:thisSessionOnly', 'effortSlider:thisSessionOnly'] as const
export function visibleTabs(order: readonly TabId[] | undefined, open: TabId): { tabs: [TabId, string][]; tab: TabId } {
  const tabs = order ? order.map(id => TABS.find(([t]) => t === id)!).filter(Boolean) : TABS
  return { tabs, tab: tabs.some(([id]) => id === open) ? open : tabs[0]![0] }
}
// The compact drawer sits under a one-row tab strip in a short space.
export const COMPACT_ROWS = 6
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

const gap = (n: number, t: Theme): Seg => ({ text: ' '.repeat(Math.max(1, n)), color: t.colors.text })
const header = (left: string, right: string, w: number, t: Theme): Seg[] => {
  const l: Seg = { text: left, color: t.colors.text, bold: true }, r: Seg = { text: right, color: t.colors.dim }
  return fit([l, gap(w - visibleLength([l]) - visibleLength([r]), t), r], w)
}
// The left part shrinks so the right part always shows, flush to the edge.
const spread = (left: Seg[], right: Seg[], w: number, t: Theme): Seg[] => {
  const rl = visibleLength(right)
  const l = fit(left, Math.max(1, w - rl - 1))
  return fit([...l, gap(w - visibleLength(l) - rl, t), ...right], w)
}
const secs = (ms: number) => `${Math.max(1, Math.round(ms / 1000))}s`
const k = (n?: number) => (n === undefined ? '…' : `${(n / 1000).toFixed(1)}k`)
// Keeps `reserve` rows free for what the caller appends after the list.
const cap = (rows: Seg[][], t: Theme, w: number, reserve = 0, limit = COMPACT_ROWS): Seg[][] => {
  const room = limit - reserve
  if (rows.length <= room) return rows
  return [...rows.slice(0, room - 1), fit([{ text: `  … ${rows.length - room + 1} more`, color: t.colors.dim }], w)]
}

// The glyphs Ink draws for each borderStyle, so section boxes match the status box.
export const BOX: Record<Border, { tl: string; tr: string; bl: string; br: string; h: string; v: string }> = {
  round: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
  single: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
  double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
  bold: { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃' },
  classic: { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' },
}
export const MIN_BOX = 16
export const boxInner = (w: number) => (w >= MIN_BOX ? w - 4 : w)

// Top edge: corner, rule, title, rule fill, right text, rule, corner. The right text goes first when room runs out.
export function section(title: string, right: string, body: Seg[][], w: number, t: Theme, border: Border = 'round'): Seg[][] {
  if (w < MIN_BOX) return [header(title, right, w, t), ...body.map(r => fit(r, w))]
  const b = BOX[border], inner = w - 4
  const edge = (s: string): Seg => ({ text: s, color: t.colors.faint })
  const name: Seg = { text: ` ${title} `, color: t.colors.text, bold: true }
  let tail: Seg[] = right ? [{ text: ` ${right} `, color: t.colors.dim }] : []
  if (visibleLength([name, ...tail]) > w - 5) tail = []
  const label = fit([name], w - 5)
  const fill = w - 4 - visibleLength(label) - visibleLength(tail)
  const top = [edge(b.tl + b.h), ...label, edge(b.h.repeat(fill)), ...tail, edge(b.h + b.tr)]
  const row = (r: Seg[]): Seg[] => {
    const c = fit(r, inner)
    return [edge(b.v + ' '), ...c, { text: ' '.repeat(inner - visibleLength(c) + 1), color: t.colors.text }, edge(b.v)]
  }
  return [top, ...body.map(row), [edge(b.bl + b.h.repeat(w - 2) + b.br)]]
}

export type MusicButton = { key: string; cmd: MusicCmd; label: string; hotkey: string; on?: boolean }
// The row the seek bar Client replaces: the same array tabParts returns, with what is drawn either side of it.
export type SeekSlot = { row: Seg[]; left: Seg[]; right: Seg[]; props: SeekBarProps }
// A request's row, drawn as one Button: the same array tabParts returns, its first `lead` and last `tail` Segs
// the box edge either side of the press.
export type RowLink = { row: Seg[]; id: string; lead: number; tail: number }
// The buttons above a request shown in full; target is the request each opens, none for the list.
export type NavButton = { key: string; label: string; hotkey: string; target?: string }
type Part = { rows: Seg[][]; n: number; controls?: MusicButton[]; seek?: SeekSlot; links?: RowLink[]; nav?: NavButton[] }

export const COVER_COLS = 8, COVER_ROWS = 4, COVER_MIN = 40
const ALL_REPEAT = ['off', 'context', 'track'] as const

// Letters, not digits: the tab strip owns 1-n. Not b or a, which the pet Client's Konami code takes after a click.
// The tab also reserves o for its Player button. l likes.
export function musicControls(s: OpenMusic, caps?: MusicCaps): MusicButton[] {
  const out: MusicButton[] = [
    { key: 'previous', cmd: { cmd: 'previous' }, label: 'Prev', hotkey: 'r' },
    { key: 'playpause', cmd: { cmd: 'playpause' }, label: s.playing ? 'Pause' : 'Play', hotkey: 'p' },
    { key: 'next', cmd: { cmd: 'next' }, label: 'Next', hotkey: 'n' },
  ]
  if (s.shuffle !== undefined && caps?.shuffle !== false) out.push({ key: 'shuffle', cmd: { cmd: 'shuffle', on: !s.shuffle }, label: '⇄', hotkey: 's', on: s.shuffle })
  const modes = caps?.repeat ?? ALL_REPEAT
  if (s.repeat !== undefined && modes.length > 0) {
    // a mode the player cannot set (track, on macOS) is not in the cycle, so the next press turns repeat off
    const next = modes[(modes.indexOf(s.repeat) + 1) % modes.length] ?? 'off'
    out.push({ key: 'repeat', cmd: { cmd: 'repeat', mode: next }, label: s.repeat === 'track' ? '↻1' : '↻', hotkey: 'e', on: s.repeat !== 'off' })
  }
  // the like state is read only while Spotify is connected, so the heart shows only then
  if (s.liked !== undefined) out.push({ key: 'like', cmd: { cmd: 'like', on: !s.liked }, label: s.liked ? '♥' : '♡', hotkey: 'l', on: s.liked })
  return out
}

// Where the reader sees every app (Windows' media sessions), nothing playing is not about Spotify.
export const ANY_PLAYER_CLOSED = 'Nothing playing in Spotify or a browser.'
// The box names the app playing: another one by its name, Spotify by how ops-control reaches it. A reader that sees
// every app names none while nothing plays.
export const musicSource = (s: { status: string; source?: 'api' | 'local'; app?: string }, anyPlayer = false) =>
  s.status === 'open' && s.app && s.app !== 'Spotify' ? s.app
  : anyPlayer && s.status !== 'open' ? ''
  : s.status === 'open' && s.source === 'local' ? 'Spotify (local)' : 'Spotify'

// The tab's third line and the dialog's connected column both name the next track this way.
export const upNextLine = (q: QueueItem) => `Up next: ${q.title}${q.artist ? ` — ${q.artist}` : ''}`

// Up next while connected and the queue has a track; else the device playing, when it is not this computer.
const thirdLine = (s: OpenMusic) =>
  s.upNext ? upNextLine(s.upNext)
  : s.device && !s.device.isThisComputer ? `on: ${s.device.name}`
  : ''

function music(m: Model, t: Theme, v: PaneView, w: number, compact: boolean, now: number, border: Border): Part {
  const c = t.colors, s = m.music ?? { status: 'closed' as const }
  const lead = compact ? '  ' : '', iw = compact ? w : boxInner(w)
  const note = (text: string): Seg[][] => [[{ text: lead + text, color: c.dim }]]
  let body: Seg[][], bar: { index: number; prefix: Seg[]; props: SeekBarProps } | undefined
  if (s.status === 'unsupported') body = note(s.hint)
  else if (s.status === 'closed') body = note(v.musicCaps?.anyPlayer ? ANY_PLAYER_CLOSED : "Open Spotify to see what's playing.")
  else if (s.ad) body = note('Ad')
  else if (!s.track) body = note('Nothing playing.')
  else if (compact) body = [fit([{ text: `${lead}♪ `, color: c.accent }, { text: s.track.title, color: c.text, bold: true }, { text: `${s.track.artist ? ` — ${s.track.artist}` : ''} ${s.playing ? '▶' : '‖'}`, color: c.dim }], w)]
  else {
    const cover = iw >= COVER_MIN ? (v.cover ?? coverPlaceholder(COVER_COLS, COVER_ROWS, c.accent)) : undefined
    const textW = cover ? iw - COVER_COLS - 2 : iw
    const props: SeekBarProps = { kind: 'progress', cols: textW, progressMs: s.progressMs, readAt: s.readAt, durationMs: s.track.durationMs, playing: s.playing,
      colors: { text: c.text, accent: c.accent, faint: c.faint, dim: c.dim } }
    const name: Seg = { text: s.track.title, color: c.text, bold: true }
    const title = s.liked === undefined ? fit([name], textW) : spread([name], [{ text: s.liked ? '♥' : '♡', color: s.liked ? c.accent : c.dim }], textW, t)
    const by = fit([{ text: [s.track.artist, s.track.album].filter(Boolean).join(' · '), color: c.dim }], textW)
    const third = thirdLine(s)
    const next = third ? fit([{ text: third, color: c.dim }], textW) : undefined
    const row = barRow(props, textW, progressAt(s, now))
    if (cover) {
      // the cover spans all four rows; the third line stays, empty, until the queue or another device is known
      const prefix = (i: number): Seg[] => [...cover[i]!, { text: '  ', color: c.text }]
      body = [[...prefix(0), ...title], [...prefix(1), ...by], [...prefix(2), ...(next ?? [])], [...prefix(3), ...row]]
      bar = { index: 3, prefix: prefix(3), props }
    } else {
      body = next ? [title, by, next, row] : [title, by, row]
      bar = { index: body.length - 1, prefix: [], props }
    }
  }
  if (compact) return { rows: body.map(r => fit(r, w)), n: -1 }
  // local: connected, but the Web API is not answering, so this is the app on this computer
  const rows = section('NOW PLAYING', musicSource(s, v.musicCaps?.anyPlayer), body, w, t, border)
  const controls = s.status === 'open' ? musicControls(s, v.musicCaps) : undefined
  let seek: SeekSlot | undefined
  if (bar) {
    // section() draws a boxed row as [edge, ...content, pad, edge]; the bar fills the content, so pad is one space
    const r = rows[1 + bar.index]!, boxed = w >= MIN_BOX
    seek = { row: r, left: boxed ? [r[0]!, ...bar.prefix] : bar.prefix, right: boxed ? r.slice(-2) : [], props: bar.props }
  }
  return { rows, n: body.length, ...(controls && { controls }), ...(seek && { seek }) }
}

function fileRow(f: Model['files'][number], t: Theme, iw: number, lead: string): Seg[] {
  const c = t.colors, name = shortPath(f.path) + (f.how === 'new' ? '  new' : '')
  const left: Seg[] = [{ text: lead, color: c.text }, { text: '✎ ', color: c.edit }, { text: name, color: c.text }]
  const right: Seg[] = [{ text: `+${f.add}`, color: c.pass }, { text: ` −${f.del}`, color: c.fail }]
  return spread(left, right, iw, t)
}

// The project's rules for agents, or the default set (guardrails.ts reads them, guardrailstab.ts draws them).
function guardrailsTab(v: PaneView, t: Theme, w: number, compact: boolean, limit: number, border: Border): Part {
  const lead = compact ? '  ' : '', iw = compact ? w : boxInner(w)
  const { body, right, switches } = guardrailRows(v.guardrails, t, iw, lead, v.guardSwitches)
  // a switch row's place in `rows` once the box is drawn around `body`: pressing it toggles the switch
  const linksAt = (rows: Seg[][], first: number, edge: boolean): RowLink[] =>
    switches.flatMap(([i, id]) => { const row = rows[first + i]; return row ? [{ row, id, lead: edge ? 1 : 0, tail: edge ? 2 : 0 }] : [] })
  if (compact) {
    const capped = cap(body, t, w, 0, limit).map(r => fit(r, w))
    return { rows: capped, n: -1 }
  }
  const rows = section('GUARDRAILS', right, body, w, t, border)
  return { rows, n: body.length, links: linksAt(rows, 1, w >= MIN_BOX) }
}

const DIFF_LINES = 2000

// The colored bar runs the full width, so a changed line reads as a band and not as text.
function diffRow(l: DiffLine, t: Theme, iw: number, lead: string): Seg[] {
  const c = t.colors, room = Math.max(1, iw - lead.length)
  const color = l.kind === 'add' ? c.pass : l.kind === 'del' ? c.fail : l.kind === 'ctx' ? c.text : c.dim
  const bg = l.kind === 'add' ? c.addBg : l.kind === 'del' ? c.delBg : undefined
  const cut = fit([{ text: l.text, color, bg }], room)
  const pad = bg ? room - visibleLength(cut) : 0
  return [{ text: lead, color: c.text }, ...cut, ...(pad > 0 ? [{ text: ' '.repeat(pad), color, bg }] : [])]
}

function diff(m: Model, t: Theme, v: PaneView, w: number, compact: boolean, limit: number, border: Border): Part {
  const c = t.colors, list = m.files
  const add = list.reduce((n, f) => n + f.add, 0), del = list.reduce((n, f) => n + f.del, 0)
  const lead = compact ? '  ' : '', iw = compact ? w : boxInner(w)
  const body: Seg[][] = []
  if (!list.length) body.push([{ text: lead + 'Nothing changed yet.', color: c.dim }])
  let total = 0, shown = 0
  for (const f of list) {
    body.push(fileRow(f, t, iw, lead))
    for (const l of v.diff?.[f.path] ?? []) {
      total++
      if (shown < DIFF_LINES) { shown++; body.push(diffRow(l, t, iw, lead)) }
    }
  }
  if (total > shown) body.push(fit([{ text: `${lead}… ${total - shown} more lines`, color: c.dim }], iw))
  if (compact) return { rows: cap(body, t, w, 0, limit).map(r => fit(r, w)), n: -1 }
  return { rows: section('DIFF', `${list.length} files  +${add} −${del}`, body, w, t, border), n: body.length }
}

function agents(m: Model, t: Theme, v: PaneView, w: number, compact: boolean, now: number, limit: number, border: Border): Part {
  const c = t.colors, live = m.agents.filter(a => a.state === 'running').length, iw = boxInner(w)
  const nameOf = (a: Agent) => v.names?.[a.key] ?? a.name
  if (v.agent === MAIN_AGENT) return agentDetail(MAIN_AGENT, m, t, v, w, compact, now, limit, border)
  // "<key>#run:<n>" opens one of the runs a fork row held; a row that held several opens their list first
  const [openKey, runAt] = (v.agent ?? '').split(RUN_MARK) as [string, string | undefined]
  const open = m.agents.find(a => a.key === openKey)
  if (open && runAt !== undefined) {
    const runs = runsOf(open), at = Number(runAt)
    const run = runs[at]
    if (run) return agentDetail({ ...open, ...run, runs: undefined }, m, t, v, w, compact, now, limit, border, { key: 'agent-back', label: '‹ All runs', hotkey: 'q', target: open.key }, runs.length > 1 ? `run ${at + 1} of ${runs.length}` : undefined)
  }
  if (open?.runs?.length) return agentRuns(open, t, v, w, compact, now, limit, border)
  if (open) return agentDetail(open, m, t, v, w, compact, now, limit, border)
  const spin = v.reduced ? '◌' : SPIN[Math.floor(now / 90) % SPIN.length]!
  const body: Seg[][] = []
  // which body row opens which agent: the main session first, then each subagent's name row
  const keys: [number, string][] = []
  const mainName = v.mainName ?? 'Main session'
  const mainMark: Seg = { text: m.working ? spin : '·', color: m.working ? c.accent : c.dim }
  if (compact) {
    keys.push([body.length, MAIN_AGENT])
    body.push(fit([{ text: ` ★ ${mainName} `, color: c.accent, bold: true }, mainMark, { text: ' ' + m.act.label, color: m.working ? c.read : c.dim }], w))
  } else {
    keys.push([body.length, MAIN_AGENT])
    body.push(spread([{ text: '★ ' + mainName, color: c.accent, bold: true }], [{ text: 'main ', color: c.dim }, mainMark], iw, t))
    body.push(fit([{ text: '  └ ', color: c.faint }, { text: `${m.act.glyph} ${m.act.label}`, color: m.working ? c.read : c.dim }], iw))
  }
  if (!m.agents.length) body.push([{ text: (compact ? '  ' : '') + 'No subagents this session.', color: c.dim }])
  for (const a of m.agents) {
    const running = a.state === 'running'
    const mark: Seg = { text: running ? spin : '✓', color: running ? c.agent : c.pass }
    if (compact) { keys.push([body.length, a.key]); body.push(fit([{ text: ` ◆ ${nameOf(a)} `, color: c.agent, bold: true }, mark, { text: ' ' + (running ? a.now ?? a.task : a.task), color: running ? c.read : c.dim }], w)); continue }
    body.push([])
    // a fork row that held several /subtask runs says how many; opening it lists them
    const held = a.runs?.length ? `${a.runs.length + 1} subtasks · ` : ''
    const when = `${held}${secs((a.endedAt ?? now) - a.startedAt)} · ${k(a.tokens)} `
    keys.push([body.length, a.key])
    body.push(spread([{ text: '◆ ' + nameOf(a), color: c.agent, bold: true }], [{ text: when, color: c.dim }, mark], iw, t))
    body.push(fit([{ text: '  ' + a.task, color: c.text }], iw))
    if (running && a.now) body.push(fit([{ text: '  └ ', color: c.faint }, { text: a.now, color: c.read }], iw))
  }
  // a name row's place in `rows` once the box is drawn around `body`
  const linksAt = (rows: Seg[][], first: number, edge: boolean): RowLink[] =>
    keys.flatMap(([i, id]) => { const row = rows[first + i]; return row ? [{ row, id, lead: edge ? 1 : 0, tail: edge ? 2 : 0 }] : [] })
  if (compact) {
    const capped = cap(body, t, w, 0, limit)
    return { rows: capped, n: -1, links: linksAt(capped, 0, false).filter(l => body.includes(l.row)) }
  }
  const rows = section('AGENTS', `${live} running · ${m.agents.length - live} done`, body, w, t, border)
  return { rows, n: body.length, links: linksAt(rows, 1, w >= MIN_BOX) }
}

// The link id of one of a row's runs: the row's key, RUN_MARK, the run's place among runsOf(row)
export const RUN_MARK = '#run:'

// A fork row that held several /subtask runs: each run, the newest first, opens it in full.
function agentRuns(a: Agent, t: Theme, v: PaneView, w: number, compact: boolean, now: number, limit: number, border: Border): Part {
  const c = t.colors, iw = compact ? w : boxInner(w), lead = compact ? '' : ' '
  const name = v.names?.[a.key] ?? a.name
  const spin = v.reduced ? '◌' : SPIN[Math.floor(now / 90) % SPIN.length]!
  const runs = runsOf(a)
  const body: Seg[][] = []
  const keys: [number, string][] = []
  body.push(fit([{ text: `${lead}${runs.length} subtasks ran here`, color: c.dim }], iw))
  for (let at = runs.length - 1; at >= 0; at--) {
    const run = runs[at]!, running = run.state === 'running'
    const steps = run.milestones ?? [], done = steps.filter(x => x.status === 'completed').length
    const mark: Seg = { text: running ? spin : '✓', color: running ? c.agent : c.pass }
    body.push([])
    keys.push([body.length, a.key + RUN_MARK + at])
    body.push(spread([{ text: `${lead}${at + 1}. ${run.task || 'subtask'}`, color: c.text, bold: true }], [{ text: `${secs((run.endedAt ?? now) - run.startedAt)} · ${k(run.tokens)} `, color: c.dim }, mark], iw, t))
    const about = [steps.length ? `${done}/${steps.length} milestones` : '', `${run.log?.length ?? 0} steps`].filter(Boolean).join(' · ')
    body.push(fit([{ text: `${lead}   ${running && run.now ? run.now : about}`, color: running ? c.read : c.dim }], iw))
  }
  const nav: NavButton[] = [{ key: 'agent-back', label: '‹ All agents', hotkey: 'q' }]
  const linksAt = (rows: Seg[][], first: number, edge: boolean): RowLink[] =>
    keys.flatMap(([i, id]) => { const row = rows[first + i]; return row ? [{ row, id, lead: edge ? 1 : 0, tail: edge ? 2 : 0 }] : [] })
  const right = `${runs.length} subtasks`
  if (compact) {
    const capped = cap([fit([{ text: `${name} · ${right}`, color: c.agent }], w), ...body], t, w, 0, Math.max(2, limit - 1)).map(row => fit(row, w))
    return { rows: capped, n: -1, nav, links: linksAt(capped, 1, false) }
  }
  const rows = section(name.toUpperCase(), right, body, w, t, border)
  return { rows, n: body.length, nav, links: linksAt(rows, 1, w >= MIN_BOX) }
}

// One agent in full: what it was asked, what it is doing, and its latest steps, newest first. `back` replaces the
// button back to all agents (a run goes back to its row's runs), `which` says which run it is.
function agentDetail(a: Agent | typeof MAIN_AGENT, m: Model, t: Theme, v: PaneView, w: number, compact: boolean, now: number, limit: number, border: Border, back?: NavButton, which?: string): Part {
  const c = t.colors, iw = compact ? w : boxInner(w), lead = compact ? '' : ' '
  const main = a === MAIN_AGENT
  const name = main ? v.mainName ?? 'Main session' : v.names?.[a.key] ?? a.name
  const running = main ? m.working : a.state === 'running'
  const log = (main ? m.mainLog : a.log) ?? []
  const body: Seg[][] = []
  const heading = (text: string): Seg[] => [{ text: lead + text, color: c.accent, bold: true }]
  if (!main) {
    if (a.name !== name) body.push(fit([{ text: lead + a.name, color: c.dim }], iw))
    if (a.task) body.push(fit([{ text: lead + a.task, color: c.text, bold: true }], iw))
    if (a.prompt) for (const line of wrapText(a.prompt, iw - lead.length).slice(0, 6)) body.push([{ text: lead + line, color: c.dim }])
  }
  // its context, a rule under it, then its milestones
  const pct = Math.max(0, Math.min(100, Math.round(main ? m.ctxPercent : a.ctxPercent ?? 0))), known = main || a.ctxPercent !== undefined
  const tone = c[toneFor(pct, v.meter ?? DEFAULT_SETUP.meter)], cells = Math.max(4, Math.min(24, iw - lead.length - 16))
  const filled = Math.round((pct / 100) * cells)
  body.push([], fit([{ text: lead + 'Context  ', color: c.accent, bold: true }, ...(known
    ? [{ text: '▇'.repeat(filled), color: tone }, { text: '▇'.repeat(cells - filled), color: c.faint }, { text: ` ${pct}%`, color: tone, bold: true }]
    : [{ text: 'not measured yet', color: c.dim }])], iw))
  body.push(fit([{ text: lead + '─'.repeat(Math.max(0, iw - lead.length * 2)), color: c.faint }], iw))
  const steps = main ? v.mainWork?.steps ?? [] : a.milestones ?? []
  const objective = main ? v.mainWork?.objective : a.objective
  const at = currentMilestone(steps), done = steps.filter(x => x.status === 'completed').length
  body.push(heading(steps.length ? `Milestones · ${done}/${steps.length} done` : 'Milestones'))
  if (objective) body.push(fit([{ text: lead + objective, color: c.text }], iw))
  if (!steps.length) body.push([{ text: lead + 'None reported.', color: c.dim }])
  steps.forEach((x, i) => {
    const on = i === at
    body.push(fit([{ text: `${lead}${MILESTONE_MARK[x.status]} `, color: milestoneColor(x.status, t) }, { text: x.title, color: x.status === 'completed' || x.status === 'skipped' ? c.dim : on ? c.accent : c.text, bold: on }], iw))
    if (on && x.doing) body.push(fit([{ text: lead + '  └ ', color: c.faint }, { text: x.doing, color: c.text }], iw))
  })
  const doing = main ? `${m.act.glyph} ${m.act.label}` : running ? a.now : undefined
  body.push([], heading('Now'), fit([{ text: lead + (doing ?? (running ? 'starting…' : 'finished')), color: running ? c.read : c.dim }], iw))
  body.push([], heading(`Steps · ${log.length}`))
  if (!log.length) body.push([{ text: lead + 'Nothing yet.', color: c.dim }])
  for (const st of [...log].reverse()) body.push(spread([{ text: lead + st.text, color: c.text }], [{ text: `${secs(now - st.at)} ago`, color: c.dim }], iw, t))
  const nav: NavButton[] = [back ?? { key: 'agent-back', label: '‹ All agents', hotkey: 'q' }]
  const right = main ? (running ? 'working' : 'idle') : `${which ? which + ' · ' : ''}${running ? 'running' : 'done'} · ${secs((a.endedAt ?? now) - a.startedAt)} · ${k(a.tokens)}`
  if (compact) return { rows: cap([fit([{ text: `${name} · ${right}`, color: main ? c.accent : c.agent }], w), ...body], t, w, 0, Math.max(2, limit - 1)).map(row => fit(row, w)), n: -1, nav }
  return { rows: section(name.toUpperCase(), right, body, w, t, border), n: body.length, nav }
}

// Plain words wrapped to `w` cells; a word longer than a line is cut.
function wrapText(text: string, w: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.replace(/\s+/g, ' ').trim().split(' ')) {
    const cut = word.slice(0, Math.max(1, w))
    if (!line) line = cut
    else if (line.length + 1 + cut.length <= w) line += ' ' + cut
    else { out.push(line); line = cut }
  }
  if (line) out.push(line)
  return out
}

function planRow(p: PlanItem, t: Theme, w: number, lead: string): Seg[] {
  const c = t.colors, on = p.status === 'in_progress', done = p.status === 'completed'
  const g = done ? '✓' : on ? '◉' : '○'
  return fit([{ text: `${lead}${g} `, color: done ? c.pass : on ? c.accent : c.dim }, { text: on && p.active ? p.active : p.title, color: done ? c.dim : c.text, bold: on }], w)
}

// The bar measures against the breakdown's window; the history against the model's, which can be larger.
function markCompact(segs: Seg[], v: PaneView, w: number, t: Theme): Seg[] {
  const at = v.ctx?.threshold, max = v.maxTokens
  if (!at || !max) return segs
  return markBar(segs, Math.min(w - 1, Math.floor(at / max * w)), { text: '┊', color: t.colors.text })
}

// Cells holding samples in the accent color, the rest (the auto-compact rule alone) dim.
const chartRow = (row: string, data: boolean[], t: Theme): Seg[] =>
  [...row].reduce<Seg[]>((out, ch, i) => {
    const color = data[i] ? t.colors.accent : t.colors.dim, last = out.at(-1)
    if (last?.color === color) last.text += ch
    else out.push({ text: ch, color })
    return out
  }, [])

function trend(m: Model, v: PaneView, w: number, t: Theme): Seg[][] {
  if (!m.ctxHistory.length) return []
  const win = v.ctx?.window, line = v.ctx?.threshold && win ? v.ctx.threshold / win * 100 : undefined
  // the chart's ceiling sits at the right end of the top row; it is the auto-compact point when the rule shows
  const top = chartTop(m.ctxHistory, line)
  const label = w >= 24 ? ` ${Math.round(top)}%`.padStart(5) : ''
  const { rows, data } = brailleArea(m.ctxHistory, w - label.length, line, top)
  const says = outlook(m.ctxHistory, m.ctxPercent, v.ctx?.autoCompact, line, win)
  const out = rows.map(r => chartRow(r, data, t))
  if (label) out[0]!.push({ text: label, color: t.colors.dim })
  if (says) out.push(fit([{ text: says, color: t.colors.dim }], w))
  return out
}

const KIND_COLS = 7
const heavyRow = (h: Heavy, w: number, t: Theme): Seg[] => spread(
  [{ text: h.kind.padEnd(KIND_COLS), color: t.colors.dim }, { text: h.name, color: t.colors.text }, ...(h.note ? [{ text: '  ' + h.note, color: t.colors.dim }] : [])],
  [{ text: tokensK(h.tokens), color: t.colors.text }], w, t)

function stats(m: Model, v: PaneView, w: number, t: Theme): Seg[] | undefined {
  const says: string[] = []
  if (v.ctx?.cacheHit !== undefined) says.push(`cache hit ${v.ctx.cacheHit}%`)
  if (m.ctxHistory.length || m.compactions) says.push(`peak ${Math.max(m.ctxPeak, ...m.ctxHistory)}%`)
  if (m.compactions) says.push(`compacted ${m.compactions}×`)
  return says.length ? fit([{ text: says.join(' · '), color: t.colors.dim }], w) : undefined
}

export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}
const REQUEST_MARK: Record<RequestStatus, string> = { pending: '○', in_progress: '◉', completed: '✓', interrupted: '■', failed: '✗' }
const REQUEST_WORD: Record<RequestStatus, string> = { pending: 'queued', in_progress: 'working', completed: 'done', interrupted: 'interrupted', failed: 'stopped' }
const requestColor = (s: RequestStatus, t: Theme) => (s === 'in_progress' ? t.colors.accent : s === 'completed' ? t.colors.pass : s === 'failed' ? t.colors.fail : t.colors.dim)
const MILESTONE_MARK: Record<MilestoneStatus, string> = { pending: '○', in_progress: '◉', verifying: '◎', waiting: '◌', blocked: '!', completed: '✓', failed: '✗', skipped: '–' }
const milestoneColor = (s: MilestoneStatus, t: Theme) =>
  s === 'completed' ? t.colors.pass : s === 'in_progress' || s === 'verifying' ? t.colors.accent : s === 'blocked' || s === 'failed' ? t.colors.fail : t.colors.dim

// The steps a request shows: the milestones Claude reported, else its task-list tasks (a running request's as
// the plan has them now, a finished one's as they were when it ended). A prompt taken into another request's turn
// has none of its own: that turn's are the work done for it, so it shows them (from names that request).
function stepsOf(r: Request, rs: Requests, m: Model): { steps: Milestone[]; fromTasks: boolean; from?: Request } {
  if (r.milestones.length) return { steps: r.milestones, fromTasks: false }
  const host = r.foldedInto ? rs.list.find(x => x.id === r.foldedInto) : undefined
  if (host && !r.tasks.length) {
    const h = stepsOf(host, rs, m)
    if (h.steps.length) return { ...h, from: host }
  }
  const tasks = r.tasks.map(x => (r.status === 'in_progress' ? m.plan.find(p => p.id === x.id) ?? x : x))
  return { steps: tasks.map(x => ({ title: x.title, status: x.status })), fromTasks: tasks.length > 0 }
}

function requestRow(r: Request, rs: Requests, m: Model, t: Theme, w: number, lead: string, now: number): Seg[] {
  const c = t.colors, on = r.status === 'in_progress'
  const left: Seg[] = [{ text: `${lead}${REQUEST_MARK[r.status]} `, color: requestColor(r.status, t) }, { text: `#${r.n} `, color: c.dim }, { text: requestTitle(r) || '(empty prompt)', color: r.status === 'pending' ? c.dim : c.text, bold: on }]
  const { steps } = stepsOf(r, rs, m)
  const progress = steps.length ? `${steps.filter(x => x.status === 'completed').length}/${steps.length} · ` : ''
  const issues = openIssues(r).length
  return spread(left, [...(issues ? [{ text: `▲${issues} `, color: c.edit }] : []), { text: r.status === 'pending' ? 'queued' : progress + duration(workedMs(r, rs, now)), color: c.dim }], w, t)
}

// A path inside the project is shown from its root; another one by its last three parts.
function where(path: string, root?: string): string {
  const r = root?.replace(/\/+$/, '')
  if (r && path.startsWith(r + '/')) return path.slice(r.length + 1)
  const parts = path.split('/').filter(Boolean)
  return parts.length > 3 ? '…/' + parts.slice(-3).join('/') : path
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function facts(r: Request, t: Theme): Seg[] {
  const c = t.colors, out: Seg[][] = []
  if (r.files.length) out.push([{ text: `✎ ${plural(r.files.length, 'file')} `, color: c.edit }, { text: `+${r.files.reduce((n, f) => n + f.add, 0)}`, color: c.pass }, { text: ` −${r.files.reduce((n, f) => n + f.del, 0)}`, color: c.fail }])
  if (r.commandCount) out.push([{ text: `$ ${plural(r.commandCount, 'command')}`, color: c.shell }])
  if (r.commits) out.push([{ text: plural(r.commits, 'commit'), color: c.text }])
  if (r.test) out.push([{ text: r.test.passed ? '✓ tests pass' : '✗ tests fail', color: r.test.passed ? c.pass : c.fail }])
  if (r.agents.length) out.push([{ text: `◆ ${plural(r.agents.length, 'agent')}`, color: c.agent }])
  out.push([{ text: plural(r.tools, 'tool call'), color: c.dim }])
  return out.flatMap((segs, i) => (i ? [{ text: ' · ', color: c.faint }, ...segs] : segs))
}

const EMPTY_TURN: Record<Request['turns'][number]['reason'], string> = { answer: 'Claude said nothing more.', aborted: 'Interrupted before an answer.', error: 'Stopped by an error.', refusal: 'Claude declined.' }
const LABEL_COLS = 11

// One request in full, in one box so the whole of it scrolls: what was asked, where it stands (status,
// objective, the milestone it is at), every milestone, what was done, what is left to the person, then the
// files and agents.
function requestDetail(r: Request, rs: Requests, m: Model, t: Theme, w: number, compact: boolean, limit: number, border: Border, now: number): Part {
  const c = t.colors, lead = compact ? '  ' : '', iw = compact ? w : boxInner(w)
  const indent: Seg[] = lead ? [{ text: lead, color: c.text }] : []
  const dim = (s: string): Seg[] => fit([{ text: lead + s, color: c.dim }], iw)
  const heading = (s: string): Seg[] => fit([{ text: lead + s, color: c.accent, bold: true }], iw)
  const sub = (s: string): Seg[] => fit([{ text: lead + s, color: c.text, bold: true }], iw)
  // a label in its own column, the value wrapped beside it
  const field = (k: string, v: Seg[]): Seg[][] => wrapSegs(v, iw, [...indent, { text: k.padEnd(LABEL_COLS), color: c.dim }])
  const item = (mark: string, color: string, text: string, textColor = c.text, bold = false): Seg[][] =>
    wrapSegs([{ text, color: textColor, bold }], iw, [...indent, { text: `${mark} `, color }])
  const note = (text: string, color = c.dim): Seg[][] => wrapSegs([{ text, color }], iw, [...indent, { text: '  └ ', color: c.faint }])
  const body: Seg[][] = []

  // what was asked
  const prompt = r.text.split('\n').flatMap(l => (l.trim() ? wrapSegs([{ text: l.trim(), color: c.text, bold: true }], iw, indent) : [[]]))
  const PROMPT_ROWS = 10
  body.push(...prompt.slice(0, PROMPT_ROWS))
  if (prompt.length > PROMPT_ROWS) body.push(dim(`… ${prompt.length - PROMPT_ROWS} more lines`))
  const host = r.foldedInto ? rs.list.find(x => x.id === r.foldedInto) : undefined
  if (host) body.push(dim(`Sent while #${host.n} ran; that turn answered both.`))

  // where it stands
  const { steps, fromTasks, from } = stepsOf(r, rs, m)
  const at = currentMilestone(steps), done = steps.filter(x => x.status === 'completed').length
  const where_ = !steps.length ? [] : [{ text: at >= 0 ? ` · milestone ${at + 1} of ${steps.length}` : ` · ${done} of ${steps.length} milestones done`, color: c.text }]
  const open = openIssues(r)
  const flagged = open.length ? [{ text: ` · ▲ ${plural(open.length, 'issue')}`, color: c.edit, bold: true }] : []
  body.push([], ...field('Status', [{ text: `${REQUEST_MARK[r.status]} ${REQUEST_WORD[r.status]}`, color: requestColor(r.status, t), bold: true }, { text: ` · ${duration(workedMs(r, rs, now))}`, color: c.dim }, ...where_, ...flagged]))
  const objective = r.objective ?? host?.objective
  body.push(...field('Objective', [{ text: objective ?? requestTitle(r), color: objective ? c.text : c.dim }]))
  if (at >= 0) {
    const s = steps[at]!
    body.push(...field('Now', [{ text: s.title, color: c.accent, bold: true }, ...(s.doing ? [{ text: ` — ${s.doing}`, color: c.text }] : [])]))
  }

  // the milestones
  const source = [from && `#${from.n}`, fromTasks && 'tasks'].filter(Boolean).join(', ')
  body.push([], heading(steps.length ? `Milestones${source ? ` (from ${source})` : ''} · ${done}/${steps.length} done` : 'Milestones'))
  if (!steps.length) body.push(dim('None were reported for this request.'))
  steps.forEach((s, i) => {
    const on = i === at
    body.push(...item(MILESTONE_MARK[s.status], milestoneColor(s.status, t), s.title, s.status === 'completed' || s.status === 'skipped' ? c.dim : on ? c.accent : c.text, on))
    if ((s.status === 'blocked' || s.status === 'waiting') && s.blocker) body.push(...note(`${s.status}: ${s.blocker}`, s.status === 'blocked' ? c.fail : c.dim))
    else if (on && s.doing) body.push(...note(s.doing, c.text))
    else if (s.status === 'completed' && s.evidence) body.push(...note(s.evidence))
  })

  // what was done
  body.push([], heading('What was done'), ...wrapSegs(facts(r, t), iw, indent), [])
  if (!r.turns.length) body.push(dim(r.status === 'pending' ? 'Waiting for its turn.' : r.status === 'in_progress' ? 'Working on it…' : 'Nothing was said.'))
  r.turns.forEach((turn, i) => {
    if (r.turns.length > 1) body.push(...(i ? [[]] : []), dim(`Turn ${i + 1} · ${duration(turn.durationMs)}`))
    body.push(...(turn.answer ? markdownRows(turn.answer, iw - lead.length, t).map(row => (row.length ? [...indent, ...row] : row)) : [dim(EMPTY_TURN[turn.reason])]))
  })
  if (r.status === 'in_progress' && r.turns.length) body.push([], dim('Working on it again…'))

  // calls that need a look: the open ones, then the ones a later call fixed
  const fixed = r.issues.filter(i => i.fixed)
  body.push([], heading(open.length ? `Issues · ${open.length} open` : 'Issues'))
  if (!r.issues.length) body.push(dim('None: no call failed or was refused.'))
  else if (!open.length) body.push(dim(`None open: ${plural(fixed.length, 'failed call')} fixed later.`))
  for (const i of open) {
    body.push(...item(i.kind === 'refused' ? '⊘' : '▲', i.kind === 'refused' ? c.fail : c.edit, `${i.kind === 'refused' ? 'Refused' : 'Failed'}: ${i.title}${i.attempts > 1 ? ` (${i.attempts} tries)` : ''}`))
    if (i.reason) body.push(...note(i.reason))
  }
  for (const i of fixed) body.push(...item('✓', c.pass, `${i.title} — fixed${i.attempts > 1 ? ` after ${i.attempts} tries` : ''}`, c.dim))

  // what is left to the person
  const blocked = steps.filter(s => s.status === 'blocked')
  const questions = r.followUps?.questions ?? [], actions = r.followUps?.actions ?? []
  body.push([], heading('For you'))
  if (!r.asked.length && !questions.length && !actions.length && !blocked.length) body.push(dim(r.status === 'in_progress' ? 'Nothing asked of you so far.' : 'Nothing was asked of you.'))
  if (r.asked.length) {
    body.push(sub('Asked during the work'))
    for (const q of r.asked) {
      body.push(...item('?', c.accent, q.question))
      body.push(...note(q.answer !== undefined ? `you answered: ${q.answer}` : 'not answered', q.answer !== undefined ? c.dim : c.edit))
    }
  }
  if (questions.length) {
    body.push(sub('Questions'))
    for (const q of questions) body.push(...item('?', c.accent, q))
  }
  if (blocked.length || actions.length) {
    body.push(sub('Action items'))
    for (const s of blocked) body.push(...item('!', c.fail, `${s.title}${s.blocker ? ` — ${s.blocker}` : ''}`))
    for (const a of actions) body.push(...item('□', c.accent, a))
  }

  // the detail of the work
  if (r.files.length) {
    body.push([], heading(`Files · ${r.files.length}`))
    for (const f of r.files) body.push(spread([...indent, { text: '✎ ', color: c.edit }, { text: where(f.path, m.root), color: c.text }, ...(f.how === 'new' ? [{ text: '  new', color: c.dim }] : [])], [{ text: `+${f.add}`, color: c.pass }, { text: ` −${f.del}`, color: c.fail }], iw, t))
  }
  if (r.agents.length) {
    body.push([], heading(`Agents · ${r.agents.length}`))
    for (const a of r.agents) body.push(fit([...indent, { text: `◆ ${a.name}`, color: c.agent, bold: true }, { text: a.task ? '  ' + a.task : '', color: c.text }], iw))
  }
  // the task list, when it is not already what the milestones show
  if (!fromTasks && r.tasks.length) {
    const tasks = r.tasks.map(x => (r.status === 'in_progress' ? m.plan.find(p => p.id === x.id) ?? x : x))
    body.push([], heading(`Tasks · ${tasks.filter(x => x.status === 'completed').length}/${tasks.length}`))
    for (const x of tasks) body.push(planRow({ id: x.id, title: x.title, status: x.status }, t, iw, lead))
  }

  const i = rs.list.indexOf(r), newer = rs.list[i + 1], older = i > 0 ? rs.list[i - 1] : undefined
  const nav: NavButton[] = [
    { key: 'req-back', label: '‹ All requests', hotkey: 'q' },
    ...(newer ? [{ key: 'req-newer', label: `Newer #${newer.n}`, hotkey: 'k', target: newer.id }] : []),
    ...(older ? [{ key: 'req-older', label: `Older #${older.n}`, hotkey: 'j', target: older.id }] : []),
  ]
  const right = `${REQUEST_WORD[r.status]} · ${duration(workedMs(r, rs, now))}`
  // the drawer gives the buttons one of its rows
  if (compact) return { rows: cap([fit([{ text: `#${r.n} ${right}`, color: requestColor(r.status, t) }], w), ...body], t, w, 0, Math.max(2, limit - 1)).map(row => fit(row, w)), n: -1, nav }
  return { rows: section(`REQUEST #${r.n}`, right, body, w, t, border), n: body.length, nav }
}

// The person's requests, newest on top, each one a row to press, and Claude's own task list under them.
function plan(m: Model, t: Theme, v: PaneView, w: number, compact: boolean, limit: number, border: Border, rs: Requests | undefined, now: number): Part {
  const open = v.request && rs ? rs.list.find(r => r.id === v.request) : undefined
  if (open) return requestDetail(open, rs!, m, t, w, compact, limit, border, now)
  const c = t.colors, done = m.plan.filter(p => p.status === 'completed').length
  const { items: shown, hiddenDone } = planOrder(m.plan)
  const lead = compact ? '  ' : '', iw = compact ? w : boxInner(w)
  const folded = planFold(m)
  const asked = rs ? [...rs.list].reverse() : []
  const items: Seg[][] = asked.map(r => requestRow(r, rs!, m, t, iw, lead, now))
  const sub = asked.length ? lead + '  ' : lead
  if (asked.length && m.plan.length) items.push([], [{ text: `${lead}tasks `, color: c.dim }, { text: `${done}/${m.plan.length}`, color: c.dim }])
  items.push(...(folded === undefined ? shown.map(p => planRow(p, t, iw, sub)) : [[{ text: sub, color: c.text }, { text: `✓ plan done · ${folded} task${folded === 1 ? '' : 's'}`, color: c.pass }]]))
  if (!m.plan.length && !asked.length) items.push([{ text: lead + (rs ? 'No requests yet.' : 'No task list yet.'), color: c.dim }])
  // a request row's place in `rows` once the box is drawn around `items`
  const linksAt = (rows: Seg[][], first: number, edge: boolean): RowLink[] => asked.flatMap((r, i) => {
    const row = rows[first + i]
    return row ? [{ row, id: r.id, lead: edge ? 1 : 0, tail: edge ? 2 : 0 }] : []
  })
  if (compact) {
    const capped = cap(items, t, w, 0, limit)
    // a request cut into the "… more" row is not a link
    return { rows: capped, n: -1, links: linksAt(capped, 0, false).filter(l => items.includes(l.row)) }
  }
  if (hiddenDone && folded === undefined) items.push([{ text: `${sub}  +${hiddenDone} more done`, color: c.dim }])
  const finished = asked.filter(r => r.status !== 'pending' && r.status !== 'in_progress').length
  const box = section('PLAN', asked.length ? `${finished}/${asked.length}` : m.plan.length ? `${done}/${m.plan.length}` : '', items, w, t, border)
  // section() puts the top edge (or the unboxed header) first and edges a boxed row either side
  return { rows: box, n: items.length, links: linksAt(box, 1, w >= MIN_BOX) }
}

// What fills the context window: the bar split by kind, its legend, the chart over the session, the heaviest
// sources, and the warning past the danger mark. The drawer shows the bar and as much legend as fits.
function context(m: Model, t: Theme, v: PaneView, w: number, compact: boolean, limit: number, border: Border): Part {
  const c = t.colors, used = m.ctxPercent, cats = v.categories ?? []
  if (compact) {
    const inner = Math.max(4, w - 12)
    const bar = fit([{ text: ' ctx ▕', color: c.dim }, ...markCompact(stackBar(cats, v.maxTokens, used, inner, t).segs, v, inner, t), { text: `▏${String(used).padStart(4)}%`, color: c.text }], w)
    return { rows: cap([bar, ...legendRows(stackBar(cats, v.maxTokens, used, w - 2, t).slices, w - 2, t).map(r => fit([{ text: '  ', color: c.text }, ...r], w))], t, w, 0, limit), n: -1 }
  }
  const iw = boxInner(w)
  const usedTokens = cats.some(x => x.kind === 'used') ? cats.filter(x => x.kind === 'used').reduce((n, x) => n + x.tokens, 0) : v.maxTokens ? used / 100 * v.maxTokens : undefined
  const stack = stackBar(cats, v.maxTokens, used, iw, t)
  const ctx: Seg[][] = [markCompact(stack.segs, v, iw, t), ...legendRows(stack.slices, iw, t)]
  const load = loadRows(v.sys, m, Date.now(), iw, t, v.meter ?? DEFAULT_SETUP.meter)
  if (load.length) ctx.push([], ...load)
  const chart = trend(m, v, iw, t)
  if (chart.length) ctx.push([], ...chart)
  const heavy = v.ctx?.heavy ?? []
  if (heavy.length) ctx.push([], ...heavy.map(h => heavyRow(h, iw, t)))
  const tail = stats(m, v, iw, t)
  if (tail) ctx.push(...(chart.length || heavy.length ? [] : [[]]), tail)
  if (used >= (v.meter ?? DEFAULT_SETUP.meter).danger) {
    const top = stack.slices[0]
    ctx.push([{ text: `! ${top && top.label !== 'used' ? `${top.label} is the biggest share` : `context ${used}% used`}`, color: c.edit }])
  }
  return { rows: section('CONTEXT', v.maxTokens && usedTokens !== undefined ? `${used}% · ${tokensK(usedTokens)} / ${tokensK(v.maxTokens)}` : `${used}% used`, ctx, w, t, border), n: ctx.length }
}

// body is the half-open row range of the first section's body: row 0 is its top edge (or the unboxed header).
// requests: the person's requests, which the Plan tab lists (and shows one of in full, by v.request).
export function tabParts(model: Model, t: Theme, v: PaneView, width: number, compact: boolean, now: number, limit = COMPACT_ROWS, border: Border = 'round', requests?: Requests): { rows: Seg[][]; body: [number, number]; controls?: MusicButton[]; seek?: SeekSlot; links?: RowLink[]; nav?: NavButton[] } {
  const m = normalizeModel(model)
  const { rows, n, controls, seek, links, nav } = v.tab === 'diff' ? diff(m, t, v, width, compact, limit, border)
    : v.tab === 'agents' ? agents(m, t, v, width, compact, now, limit, border)
    : v.tab === 'music' ? music(m, t, v, width, compact, now, border)
    : v.tab === 'context' ? context(m, t, v, width, compact, limit, border)
    : v.tab === 'guardrails' ? guardrailsTab(v, t, width, compact, limit, border)
    : v.tab === 'settings' ? { rows: [], n: -1 }
    : plan(m, t, v, width, compact, limit, border, requests, now)
  return { rows, body: n < 0 ? [0, rows.length] : [1, 1 + n], ...(controls && { controls }), ...(seek && { seek }), ...(links?.length && { links }), ...(nav && { nav }) }
}

export const tabRows = (...a: Parameters<typeof tabParts>): Seg[][] => tabParts(...a).rows

// The pet's life is the tighter of the 5-hour and weekly windows. API-key sessions report no windows, so they
// show what the session has spent; context is the last resort because the CONTEXT box already shows it.
function lifeRow(m: Model, t: Theme, width: number, now: number): Seg[] {
  const c = t.colors
  const windows = [['five_hour', '5h limit'], ['seven_day', 'weekly limit']] as const
  const tight = windows.flatMap(([kind, what]) => {
    const w = liveLimit(m, kind, now)
    return w ? [{ used: Math.round(w.percentUsed), what }] : []
  }).sort((a, b) => b.used - a.used)[0]
  if (!tight && m.costUsd !== undefined) return [{ text: `$${m.costUsd.toFixed(2)}`, color: c.text }, { text: ' spent this session', color: c.dim }]
  const { used, what } = tight ?? { used: m.ctxPercent, what: 'context' }
  // every look draws the life bar; only the band keeps hearts, where a bar has no room
  return hpBar(used, t, width, what)
}

// meter: a renderer plugin's rows (ops.meter), drawn in place of the life row; names: the name pack's names by agent key.
export function statusRows(model: Model, base: Theme, width: number, now: number, look?: Look, meter?: Seg[][], names?: Record<string, string>): Seg[][] {
  const m = normalizeModel(model)
  const t = look?.theme ?? base, c = t.colors
  const live = m.agents.filter(a => a.state === 'running')
  // what Claude does is the work bar's and the spinner's to say; the status box names it only while it needs you
  const act: Seg[] = m.needsYou ? [{ text: `${m.act.glyph} ${m.act.label}`, color: toneColor(t, m.act.tone), bold: true }] : []
  const combo = comboSegs(m.combo, look)
  const first: Seg[] = act.length ? [...act, ...combo] : combo.map((x, i) => (i === 0 ? { ...x, text: x.text.trimStart() } : x))
  // the level never crowds the activity label: a row it does not fit stays as it was
  const withLevel = m.xp === undefined ? first : [...first, ...(first.length ? [{ text: '  ', color: c.text }] : []), ...levelSegs(m.xp, t, 10)]
  const top = visibleLength(withLevel) <= width ? withLevel : first
  const rows: Seg[][] = [
    ...(top.length ? [top] : []),
    ...(meter ?? [lifeRow(m, t, width, now)]),
  ]
  if (live.length) rows.push([{ text: `◆ ${live.map(a => names?.[a.key] ?? a.name).join(', ')} working`, color: c.agent }])
  return rows.map(r => fit(r, width))
}

// The pet node is the ready Client element register.tsx builds; the pane only places it.
// rows is the strip height, from stripRows: the sheet's height, plus headroom while an outfit is worn.
// meter and field come from a renderer plugin: rows for the status box, and a builder for the
// field's player given the rows left open between the tab and the status box.
// requests are the person's prompts the Plan tab lists; onRequest opens one in full, or the list with none.
export type PaneExtra = { look?: Look; pet?: { id: PetId; node: unknown; rows?: number }; bubble?: { text: string; mood: BubbleMood }; friday?: boolean; minRows?: number; bodyRows?: number; onRange?: (last: number, win: number) => void; meter?: Seg[][]; field?: (rows: number) => unknown; tabs?: readonly TabId[]; onMusic?: (cmd: MusicCmd) => void; onPlayer?: () => void; seek?: (props: SeekBarProps) => unknown; requests?: Requests; onRequest?: (id?: string) => void
  // the Agents tab: opens an agent's detail view (MAIN_AGENT for the main session), or the list with none
  onAgent?: (key?: string) => void
  // the Guardrails tab: flips the switch of a row (guardrailstab.ts switchKey)
  onGuard?: (key?: string) => void
  // the Settings tab's controls, drawn by register.tsx (settingstab.tsx)
  settings?: unknown }
export const PET_STRIP_COLS = 46
const BUBBLE_ROOM = 16

const bubbleColor = (t: Theme, m: BubbleMood) => (m === 'fail' ? t.colors.fail : m === 'done' || m === 'green' || m === 'long-done' ? t.colors.pass : t.colors.accent)

// Width of the Box the pet's Client sits in on a docked pane: inside the pane's border and padding (2 + 4).
export const petStripCols = (paneWidth: number) => Math.max(0, Math.min(PET_STRIP_COLS, paneWidth - 6))

const BUBBLE_LINES = 2
const cellsOf = (s: string) => visibleLength([{ text: s, color: '' }])

// Text cells and rows a bubble has at this pane width: inside its border and padding,
// beside Clawd when the docked strip leaves room, above him otherwise, and one row in the drawer.
export function bubbleBox(paneWidth: number, compact: boolean): { cols: number; lines: number; beside: boolean } {
  if (compact) return { cols: Math.max(1, paneWidth - 2 - CLAWD_ROW.length - 1), lines: 1, beside: true }
  const width = paneWidth - 6, room = width - petStripCols(paneWidth)
  const beside = room >= BUBBLE_ROOM
  return { cols: Math.max(1, (beside ? room : width) - 4), lines: BUBBLE_LINES, beside }
}

// Beside a pet shorter than its bubble, the strip grows to the bubble's rows: a row Box clips what is taller than its height.
function stripHeight(extra: PaneExtra, paneWidth: number): { rows: number; height: number } {
  const { beside, cols, lines } = bubbleBox(paneWidth, false)
  const rows = extra.pet!.rows ?? PET_ROWS
  const say = extra.bubble ? wrapBubble(extra.bubble.text, cols, lines, cellsOf).length + 2 : 0
  return { rows, height: beside ? Math.max(rows, say) : rows + (say || (extra.friday ? 1 : 0)) }
}

function petStrip(els: { Box: any; Text: any }, t: Theme, extra: PaneExtra, paneWidth: number) {
  const { Box, Text } = els
  const width = paneWidth - 6
  const cols = petStripCols(paneWidth)
  const room = width - cols
  const { beside, cols: textCols, lines } = bubbleBox(paneWidth, false)
  const { rows, height } = stripHeight(extra, paneWidth)
  const say = extra.bubble
  const bubble = say && (
    <Box key="bubble" borderStyle="round" borderColor={bubbleColor(t, say.mood)} paddingX={1} alignSelf="flex-start" flexDirection="column">
      {wrapBubble(say.text, textCols, lines, cellsOf).map((l, i) => <Text key={'b' + i} color={t.colors.text} wrap="truncate">{l}</Text>)}
    </Box>
  )
  const sign = !say && extra.friday && <Box key="friday"><Text color={t.colors.accent} wrap="truncate">{"it's friday"}</Text></Box>
  return (
    <Box flexDirection="column" key="pet">
      {!beside && bubble}
      <Box flexDirection="row" height={beside ? height : rows}>
        <Box width={cols} height={rows}>{extra.pet!.node as any}</Box>
        {beside && <Box flexDirection="column" width={room}>{bubble || sign}</Box>}
      </Box>
      {!beside && !say && sign}
    </Box>
  )
}

function petLine(els: { Box: any; Text: any }, t: Theme, extra: PaneExtra, width: number) {
  const { Box, Text } = els
  const say = extra.bubble, text = say?.text ?? (extra.friday ? "it's friday" : '')
  const color = say ? bubbleColor(t, say.mood) : t.colors.accent
  return (
    <Box flexDirection="row" key="pet" height={1}>
      <Box width={CLAWD_ROW.length} height={1}>{extra.pet!.node as any}</Box>
      {text && <Text color={color} wrap="truncate">{' ' + (wrapBubble(text, Math.max(1, width - CLAWD_ROW.length - 1), 1, cellsOf)[0] ?? '')}</Text>}
    </Box>
  )
}

// Rows the docked status box takes: margin, border, status lines, and the pet strip with its bubble or sign.
function footerRows(m: Model, t: Theme, extra: PaneExtra | undefined, width: number, now: number): number {
  const status = statusRows(m, t, width - 2 - 4, now, extra?.look, extra?.meter).length
  return 1 + 2 + status + (extra?.pet ? stripHeight(extra, width).height : 0)
}

// A request's row: the box edges stay text, and everything between them is one Button, so a click anywhere on
// the request opens it. The row's own colors are its children (a Button takes strings and Text).
function linkRow(els: { Box: any; Text: any; Button: any }, r: Seg[], l: RowLink, key: string, onPress: () => void) {
  const { Box, Text, Button } = els
  const texts = (segs: Seg[]) => segs.map(s => <Text color={s.color} bold={s.bold} backgroundColor={s.bg}>{s.text}</Text>)
  return (
    <Box key={key} flexDirection="row">
      {texts(r.slice(0, l.lead))}
      <Button key={'req-' + l.id} plain onPress={onPress}>{texts(r.slice(l.lead, r.length - l.tail))}</Button>
      {texts(r.slice(r.length - l.tail))}
    </Box>
  )
}

// The tab strip in rows that fit `width`: a tab draws as `[ Label ]`, one space apart, and goes to the next row
// when it would not fit. Each entry is the tab's index in `tabs`.
export function tabLines(tabs: readonly (readonly [string, string])[], width: number): number[][] {
  const lines: number[][] = []
  let used = 0
  tabs.forEach(([, label], i) => {
    const cells = visibleLength([{ text: label, color: '' }]) + 4
    const line = lines.at(-1)
    if (line && used + 1 + cells <= width) { line.push(i); used += 1 + cells; return }
    lines.push([i])
    used = cells
  })
  return lines
}

export function renderPane(els: { Box: any; Text: any; Button: any }, m: Model, base: Theme, v: PaneView, width: number, compact: boolean, now: number, onTab: (id: TabId) => void, extra?: PaneExtra) {
  const { Box, Text, Button } = els
  const look = extra?.look, t = look?.theme ?? base
  const inner = width - 2
  const shown = visibleTabs(extra?.tabs, v.tab)
  v = { ...v, tab: shown.tab }
  // a narrow pane wraps the tab strip onto more rows, which the tab's content gives up
  const strip = tabLines(shown.tabs, width), stripRows = strip.length
  // the drawer shows a tab strip, the tab content and one pet row, all within COMPACT_ROWS
  let rowsLeft = compact && extra?.pet ? COMPACT_ROWS - 2 : COMPACT_ROWS
  if (compact && extra?.bodyRows) rowsLeft = Math.max(1, Math.min(rowsLeft, extra.bodyRows - stripRows - (extra.pet ? 1 : 0)))
  let { rows, body, controls, seek, links, nav } = tabParts(m, t, v, inner, compact, now, rowsLeft, look?.border ?? 'round', extra?.requests)
  // links and nav open requests on the Plan tab and agents on the Agents tab; without a handler a row is plain
  // text and a view in full has no way back, so neither is drawn
  const go = v.tab === 'agents' ? extra?.onAgent : v.tab === 'guardrails' ? extra?.onGuard : extra?.onRequest
  if (!go) { links = undefined; nav = undefined }
  const linkOf = new Map((links ?? []).map(l => [l.row, l] as const))
  let hint: any = null, open = 0, last = 0, win = 0
  if (!compact && extra?.bodyRows) {
    // tab strip and its margin sit above, the footer below; the tab gets the rest and scrolls on its own
    const room = Math.max(2, extra.bodyRows - stripRows - 1 - footerRows(m, t, extra, width, now) - (controls ? 2 : 0) - (nav ? 1 : 0))
    open = Math.max(0, room - rows.length)
    if (rows.length > room) {
      // box edges and what follows the first box stay put; only that box's body rows scroll
      const bodyRoom = room - 1 - (rows.length - (body[1] - body[0]))
      const [from, to] = bodyRoom >= 1 ? body : [0, rows.length]
      win = bodyRoom >= 1 ? bodyRoom : room - 1
      const top = Math.max(0, Math.min(v.offset ?? 0, to - from - win))
      last = to - from - win
      const below = last - top
      hint = (
        <Box key="scroll" flexDirection="row" gap={1}>
          {top > 0 && <Text key="up" color={t.colors.dim} wrap="truncate">{`↑ ${top} more`}</Text>}
          {below > 0 && <Text key="down" color={t.colors.dim} wrap="truncate">{`↓ ${below} more`}</Text>}
        </Box>
      )
      rows = [...rows.slice(0, from), ...rows.slice(from + top, from + top + win), ...rows.slice(to)]
    }
  }
  extra?.onRange?.(last, win)
  return (
    // minHeight, not height: a short tab still pushes the status box to the bottom of the body
    <Box flexDirection="column" width={width} minHeight={compact ? undefined : extra?.minRows}>
      {strip.map((line, row) => (
        <Box key={'tabs-' + row} flexDirection="row" gap={1}>
          {line.map(i => { const [id, label] = shown.tabs[i]!; return <Button key={'tab-' + id} label={label} hotkey={String(i + 1)} {...(TAB_ACTIONS[i] && { action: TAB_ACTIONS[i] })} variant={v.tab === id ? 'primary' : undefined} dimColor={v.tab !== id} onPress={() => onTab(id)} /> })}
        </Box>
      ))}
      <Box flexDirection="column" flexGrow={1} marginTop={compact ? 0 : 1}>
        {nav && (
          <Box key="request-nav" flexDirection="row" gap={2}>
            {nav.map(b => <Button key={b.key} label={b.label} hotkey={b.hotkey} plain onPress={() => go!(b.target)} />)}
          </Box>
        )}
        {rows.map((r, i) => {
          if (seek && extra?.seek && r === seek.row) return <Box key={'r' + i} flexDirection="row">{seek.left.length ? renderSegs(els, seek.left, 'sl') : null}{extra.seek(seek.props) as any}{seek.right.length ? renderSegs(els, seek.right, 'sr') : null}</Box>
          const l = linkOf.get(r)
          return l ? linkRow(els, r, l, 'r' + i, () => go!(l.id)) : renderSegs(els, r, 'r' + i)
        })}
        {v.tab === 'settings' && (extra?.settings as any)}
        {hint}
        {controls && (
          <Box key="music-controls" flexDirection="row" gap={2} marginTop={1}>
            {controls.map(b => <Button key={'music-' + b.key} label={b.label} hotkey={b.hotkey} plain dimColor={b.on === false} onPress={() => extra?.onMusic?.(b.cmd)} />)}
            {extra?.onPlayer && <Button key="music-player" label="Player" hotkey="o" plain onPress={() => extra.onPlayer!()} />}
          </Box>
        )}
        {open > 0 && extra?.field?.(open)}
      </Box>
      {compact && extra?.pet && petLine(els, t, extra, inner)}
      {!compact && (
        <Box flexDirection="column" width={inner} borderStyle={look?.border ?? 'round'} borderColor={look?.borderColor ?? t.colors.faint} marginTop={1} paddingX={1}>
          {statusRows(m, t, inner - 4, now, look, extra?.meter, v.names).map((r, i) => renderSegs(els, r, 's' + i))}
          {extra?.pet && petStrip(els, t, extra, width)}
        </Box>
      )}
    </Box>
  )
}
