import { describeTool, testOutcome, planFrom, editCounts, type PlanItem } from './events.ts'
import type { Music } from './music/parse.ts'
import type { Milestone } from './requests.ts'
export type { PlanItem }

export type Act = { glyph: string; label: string; kind?: string; tone: 'text' | 'dim' | 'read' | 'edit' | 'shell' | 'agent' | 'pass' | 'fail' | 'accent' }
// One thing an agent did, for the Agents tab's detail view: the tool's glyph and label, and when.
export type Step = { at: number; text: string }
// prompt: the start of what the agent was asked, from its Agent call; log: its latest steps, oldest first
export type Agent = { key: string; agentId?: string; name: string; task: string; state: 'running' | 'done'; startedAt: number; endedAt?: number; tokens?: number; now?: string; prompt?: string; log?: Step[]
  // the context its last model request filled, in percent of the window; the milestones it last reported, and their objective
  ctxPercent?: number; milestones?: Milestone[]; objective?: string }
export type FileTouch = { path: string; add: number; del: number; how: 'edit' | 'new'; at: number }
export type NeedsYou = { toolUseId: string; what: string; before: Act }
export type RateLimit = { kind: string; percentUsed: number; resetsAt?: string }
export type Model = {
  working: boolean; doneAt?: number; act: Act; agents: Agent[]; plan: PlanItem[]; files: FileTouch[]; ctxPercent: number; needsYou?: NeedsYou
  // context percent once per finished turn (the first reading after turn-done replaces the stale one), capped at CTX_SAMPLES
  ctxHistory: number[]
  ctxSampledAt?: number
  ctxPeak: number
  compactions: number
  compactAt?: number
  turnAt?: number
  // last time something visible happened; the pet sleeps after a long gap
  actAt: number
  // successful main-agent calls in a row this turn
  combo: number
  lastTest?: { passed: boolean; at: number }
  limits: RateLimit[]
  // task ids the plan covered when it folded at a prompt; read through planFold, which says whether the fold still holds
  planFolded?: string[]
  costUsd?: number
  modelName?: string
  effort?: string
  root?: string
  branch?: string
  // undefined until the level store is read
  xp?: number
  // the local Spotify player, polled by register.tsx; undefined until the first read
  music?: Music
  // the main session's latest steps, oldest first (the Agents tab lists the main session too)
  mainLog?: Step[]
}
export type Ev =
  | { type: 'turn-start'; at: number }
  | { type: 'tool-start'; at: number; tool: string; toolUseId: string; agentId?: string; input: Record<string, unknown> }
  | { type: 'tool-end'; at: number; tool: string; toolUseId: string; agentId?: string; input: Record<string, unknown>; isError: boolean; text: string; resultTaskId?: string; agentTokens?: number; writeType?: 'create' | 'update' }
  | { type: 'needs-you'; at: number; toolUseId: string; what: string }
  // at, name and task: the spawn's own, for an agent no Agent call announced (a /subtask fork, a workflow's agent)
  | { type: 'agent-bind'; toolUseId: string; agentId: string; at?: number; name?: string; task?: string }
  | { type: 'agent-done'; at: number; agentId: string; tokens?: number }
  // a subagent's own context, from each of its model requests, and the milestones it reports
  | { type: 'agent-context'; agentId: string; percent: number }
  | { type: 'agent-milestones'; agentId: string; milestones: Milestone[]; objective?: string }
  | { type: 'turn-done'; at: number; reason: 'answer' | 'aborted' | 'error' | 'refusal' }
  | { type: 'context'; percent: number }
  | { type: 'compact'; at: number }
  // Claude Code's saved task list; an empty read leaves the plan built from this session's calls
  | { type: 'plan-load'; plan: PlanItem[] }
  | { type: 'usage'; limits: RateLimit[]; costUsd?: number }
  // a field left out keeps its last value: model() and root() are read separately and either can fail
  | { type: 'session-info'; modelName?: string; root?: string }
  | { type: 'branch'; branch?: string }
  | { type: 'music'; music: Music }
  // from each main-loop model request; a request without one (a model with no effort support) clears it
  | { type: 'effort'; effort?: string }
  | { type: 'level'; xp: number }

export const LINGER_MS = 1500
// steps kept per agent for the Agents tab's detail view
export const LOG_STEPS = 30
const PROMPT_CHARS = 600
const logged = (log: Step[] | undefined, step: Step): Step[] => [...(log ?? []), step].slice(-LOG_STEPS)
export const CTX_SAMPLES = 120
// Own table: subagent "now" lines are labelled here, without a theme.
const GLYPH = { read: '▸', search: '⌕', edit: '✎', shell: '$', agent: '◆', plan: '◇', other: '·' } as const
const TONE: Record<string, Act['tone']> = { read: 'read', search: 'read', edit: 'edit', shell: 'shell', agent: 'agent', plan: 'accent', other: 'text' }

const text = (v: unknown) => (typeof v === 'string' ? v : '')

export const initialModel = (): Model => ({ working: false, act: { glyph: '✻', label: 'Ready', tone: 'text' }, agents: [], plan: [], files: [], ctxPercent: 0, ctxHistory: [], ctxPeak: 0, compactions: 0, actAt: 0, combo: 0, limits: [] })
const ARRAYS = ['agents', 'plan', 'files', 'ctxHistory', 'limits'] as const
const NUMBERS = ['ctxPercent', 'ctxPeak', 'compactions', 'actAt', 'combo'] as const

// A model read back from $.state or a snapshot may predate fields added since (0.3.1 added
// ctxHistory, ctxPeak and compactions), and a hot reload keeps old state. Every such read goes
// through here so the renderers can rely on the current shape.
export function normalizeModel(raw: unknown): Model {
  const base = initialModel()
  if (!raw || typeof raw !== 'object') return base
  const m = { ...base, ...(raw as Partial<Model>) }
  for (const k of ARRAYS) if (!Array.isArray(m[k])) (m as Record<string, unknown>)[k] = base[k]
  for (const k of NUMBERS) if (typeof m[k] !== 'number' || !Number.isFinite(m[k])) (m as Record<string, unknown>)[k] = base[k]
  if (!m.act || typeof m.act !== 'object') m.act = base.act
  if (!Array.isArray(m.planFolded)) m.planFolded = undefined
  if (!Array.isArray(m.mainLog)) m.mainLog = undefined
  if (!Number.isInteger(m.xp) || m.xp! < 0) m.xp = undefined
  // before 0.3.5 reads were stored here too
  m.files = m.files.filter(f => (f.how as string) !== 'read').sort((a, b) => b.at - a.at)
  const mu = m.music as { status?: unknown } | undefined
  if (!mu || typeof mu !== 'object' || !['open', 'closed', 'unsupported'].includes(mu.status as string)) m.music = undefined
  return m
}
// The task count while the plan shows as one line: it finished before the last prompt and nothing has
// been added or reopened since.
export const planFold = (m: Model): number | undefined =>
  m.planFolded && m.plan.length && m.plan.every(p => p.status === 'completed' && m.planFolded!.includes(p.id)) ? m.plan.length : undefined

// A plan that stops matching its fold forgets it, so finishing the same tasks again waits for the next prompt.
const settleFold = (m: Model): Model => (m.planFolded && planFold(m) === undefined ? { ...m, planFolded: undefined } : m)

export const agentsRunning = (m: Model) => m.agents.some(a => a.state === 'running')
// Subagents run in the background, so the main turn usually ends while they work.
export const isBusy = (m: Model) => m.working || agentsRunning(m)
export const bandVisible = (m: Model, now: number) => isBusy(m) || (m.doneAt !== undefined && now - m.doneAt <= LINGER_MS)

const ENDED: Record<Extract<Ev, { type: 'turn-done' }>['reason'], Act> = {
  answer: { glyph: '✓', label: 'Done', tone: 'pass' },
  aborted: { glyph: '■', label: 'Interrupted', tone: 'dim' },
  error: { glyph: '✗', label: 'Stopped', tone: 'fail' },
  refusal: { glyph: '✗', label: 'Stopped', tone: 'fail' },
}

// The permission question for this call is answered: show what Claude was doing again.
const answered = (m: Model, toolUseId: string): Model =>
  m.needsYou?.toolUseId === toolUseId ? { ...m, act: m.needsYou.before, needsYou: undefined } : m

// git runs while later tool calls land, so its answer may lack files added since
// it started; those keep their own counts. Files only git knows join the list. A path in
// `asked` (what the refresh was given) that did not come back was dropped by it.
export function mergeCounts(m: Model, refreshed: FileTouch[], asked: readonly string[] = []): Model {
  const byPath = new Map(refreshed.map(f => [f.path, f]))
  const have = new Set(m.files.map(f => f.path))
  const gone = new Set(asked.filter(p => !byPath.has(p)))
  const merged = m.files.filter(f => !gone.has(f.path)).map(f => {
    const r = byPath.get(f.path)
    // refreshCounts stamps a file whose counts changed; max keeps an edit that landed while git ran
    return r ? { ...f, add: r.add, del: r.del, at: Math.max(f.at, r.at) } : f
  })
  return { ...m, files: [...merged, ...refreshed.filter(f => !have.has(f.path))].sort((a, b) => b.at - a.at) }
}

function touch(files: FileTouch[], path: string, at: number, how: FileTouch['how'], add = 0, del = 0): FileTouch[] {
  const old = files.find(f => f.path === path)
  const next: FileTouch = old
    ? { ...old, at, add: old.add + add, del: old.del + del, how: old.how === 'new' ? 'new' : how }
    : { path, at, how, add, del }
  return [next, ...files.filter(f => f.path !== path)].sort((a, b) => b.at - a.at)
}

export function applyEvent(m: Model, ev: Ev): Model {
  switch (ev.type) {
    case 'turn-start': {
      const finished = m.plan.length > 0 && m.plan.every(p => p.status === 'completed')
      return { ...m, planFolded: finished ? m.plan.map(p => p.id) : undefined, working: true, doneAt: undefined, needsYou: undefined, turnAt: ev.at, actAt: ev.at, combo: 0, lastTest: undefined, act: { glyph: '✻', label: 'Thinking', tone: 'text' } }
    }
    case 'turn-done': return { ...m, working: false, doneAt: ev.at, actAt: ev.at, needsYou: undefined, act: ENDED[ev.reason], ctxHistory: [...m.ctxHistory, m.ctxPercent].slice(-CTX_SAMPLES), ctxSampledAt: ev.at }
    case 'context': {
      const ctxPercent = Math.max(0, Math.min(100, Math.round(ev.percent)))
      const fresh = !m.working && m.ctxSampledAt !== undefined && m.ctxSampledAt === m.doneAt && m.ctxHistory.length > 0
      return { ...m, ctxPercent, ctxPeak: Math.max(m.ctxPeak, ctxPercent), ctxHistory: fresh ? [...m.ctxHistory.slice(0, -1), ctxPercent] : m.ctxHistory }
    }
    case 'compact': return { ...m, compactions: m.compactions + 1, compactAt: ev.at }
    case 'plan-load': return ev.plan.length ? settleFold({ ...m, plan: ev.plan }) : m
    case 'usage': return { ...m, limits: ev.limits, costUsd: ev.costUsd ?? m.costUsd }
    case 'session-info': return { ...m, modelName: ev.modelName ?? m.modelName, root: ev.root ?? m.root }
    case 'effort': return { ...m, effort: ev.effort }
    case 'branch': return { ...m, branch: ev.branch }
    case 'level': return { ...m, xp: ev.xp }
    case 'music': return { ...m, music: ev.music }
    case 'needs-you': return { ...m, actAt: ev.at, needsYou: { toolUseId: ev.toolUseId, what: ev.what, before: m.needsYou?.before ?? m.act }, act: { glyph: '!', label: `Needs you: ${ev.what}`, tone: 'fail' } }
    case 'agent-bind': {
      if (m.agents.some(a => a.agentId === ev.agentId)) return m
      // the Agent call's row, while it has no agent yet; a workflow's agents share one call
      if (ev.toolUseId && m.agents.some(a => a.key === ev.toolUseId && a.agentId === undefined)) {
        let bound = false
        return { ...m, agents: m.agents.map(a => (!bound && a.key === ev.toolUseId && a.agentId === undefined ? (bound = true, { ...a, agentId: ev.agentId }) : a)) }
      }
      // a spawn no Agent call announced (a /subtask fork, a command's or a workflow's agent) joins the list here
      if (ev.at === undefined) return m
      return { ...m, agents: [...m.agents, { key: `${ev.toolUseId || 'spawn'}:${ev.agentId}`, agentId: ev.agentId, name: ev.name || 'agent', task: ev.task ?? '', state: 'running' as const, startedAt: ev.at }] }
    }
    case 'agent-context': return { ...m, agents: m.agents.map(a => a.agentId === ev.agentId ? { ...a, ctxPercent: ev.percent } : a) }
    case 'agent-milestones': return { ...m, agents: m.agents.map(a => a.agentId === ev.agentId ? { ...a, milestones: ev.milestones, objective: ev.objective } : a) }
    case 'agent-done': return { ...m, agents: m.agents.map(a => a.agentId === ev.agentId && a.state === 'running' ? { ...a, state: 'done' as const, endedAt: ev.at, now: undefined, tokens: ev.tokens ?? a.tokens } : a) }
    case 'tool-start': {
      const d = describeTool(ev.tool, ev.input)
      const step: Step = { at: ev.at, text: `${GLYPH[d.kind]} ${d.label}` }
      if (ev.agentId) return { ...m, agents: m.agents.map(a => a.agentId === ev.agentId ? { ...a, now: step.text, log: logged(a.log, step) } : a) }
      const agents = ev.tool === 'Agent'
        ? [...m.agents, {
            key: ev.toolUseId,
            name: text(ev.input.name) || text(ev.input.subagent_type) || text(ev.input.description) || 'agent',
            task: text(ev.input.description),
            state: 'running' as const,
            startedAt: ev.at,
            ...(text(ev.input.prompt) && { prompt: text(ev.input.prompt).slice(0, PROMPT_CHARS) }),
          }]
        : m.agents
      const act: Act = { glyph: GLYPH[d.kind], label: d.label, kind: d.kind, tone: TONE[d.kind]! }
      // a parallel call must not hide an open question; it becomes what shows after the answer
      const mainLog = logged(m.mainLog, step)
      if (m.needsYou) return { ...m, agents, mainLog, needsYou: { ...m.needsYou, before: act } }
      const changed = act.glyph !== m.act.glyph || act.label !== m.act.label
      return { ...m, agents, mainLog, act, actAt: changed ? ev.at : m.actAt }
    }
    case 'tool-end': {
      const d = describeTool(ev.tool, ev.input)
      let next = answered(m, ev.toolUseId)
      // only tokens: a background Agent call returns at once, so done comes from agent-done
      if (ev.tool === 'Agent' && !ev.agentId && ev.agentTokens !== undefined) {
        next = { ...next, agents: next.agents.map(a => a.key === ev.toolUseId ? { ...a, tokens: ev.agentTokens } : a) }
      }
      if (!ev.isError && d.file) {
        // editCounts has no answer for NotebookEdit (no line diff); it is still an edit.
        const counts = editCounts(ev.tool, ev.input) ?? (ev.tool === 'NotebookEdit' ? { add: 0, del: 0 } : undefined)
        const how: FileTouch['how'] | undefined = ev.tool === 'Write' && ev.writeType === 'create' ? 'new' : counts ? 'edit' : undefined
        if (how) next = { ...next, files: touch(next.files, d.file, ev.at, how, counts?.add, counts?.del) }
      }
      // a failed spawn never gets an agent-done
      if (ev.tool === 'Agent' && !ev.agentId && ev.isError) {
        next = { ...next, agents: next.agents.map(a => a.key === ev.toolUseId && a.state === 'running' ? { ...a, state: 'done' as const, endedAt: ev.at, now: undefined } : a) }
      }
      // a subagent's own todo list is not Claude's plan
      const plan = ev.isError || ev.agentId ? undefined : planFrom(ev.tool, ev.input, next.plan, ev.resultTaskId)
      if (plan) next = settleFold({ ...next, plan })
      if (!ev.agentId) next = { ...next, combo: ev.isError ? 0 : next.combo + 1 }
      if (!ev.agentId && d.isTest) {
        const o = testOutcome(ev.text, ev.isError)
        next = {
          ...next,
          act: { glyph: o.passed ? '✓' : '✗', label: o.summary, tone: o.passed ? 'pass' : 'fail' },
          lastTest: { passed: o.passed, at: ev.at },
          actAt: ev.at,
          combo: o.passed ? next.combo : 0,
        }
      }
      return next
    }
  }
}
