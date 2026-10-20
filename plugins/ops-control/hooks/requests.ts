// Each prompt the person sends is a request: the PLAN box lists every one of them, and each keeps
// what was done for it (Claude's answer, the files, commands, tests, agents and tasks), drawn when
// the row is pressed. JSX-free and engine-free, so it tests on plain events with any clock.
import { describeTool, editCounts, testOutcome, type PlanItem } from './events.ts'
import { countCommits } from './levels.ts'

export type RequestStatus = 'pending' | 'in_progress' | 'completed' | 'interrupted' | 'failed'
export type TurnReason = 'answer' | 'aborted' | 'error' | 'refusal'
export type RequestTurn = { answer: string; reason: TurnReason; durationMs: number; endedAt: number }
export type RequestFile = { path: string; add: number; del: number; how: 'edit' | 'new' }
export type RequestAgent = { name: string; task: string }
export type RequestTask = { id: string; title: string; status: PlanItem['status'] }
// The steps Claude reports for the work: a milestones tool's (Control Room), else a progress bar's (plan-progress).
export type MilestoneStatus = 'pending' | 'in_progress' | 'verifying' | 'waiting' | 'blocked' | 'completed' | 'failed' | 'skipped'
export type Milestone = { title: string; status: MilestoneStatus; doing?: string; evidence?: string; blocker?: string }
// A question Claude put to the person during the work (AskUserQuestion), with what they answered.
export type RequestQuestion = { question: string; answer?: string }
// A call that needs a look: one that failed (repeats of the same call count as tries of one), or one refused (a
// hook, a policy or the person said no). A later call of the same kind on the same thing that works fixes it.
export type RequestIssue = { kind: 'failed' | 'refused'; sig: string; title: string; reason?: string; attempts: number; fixed?: true }
export type Request = {
  id: string
  n: number
  text: string
  status: RequestStatus
  at: number
  startedAt?: number
  endedAt?: number
  // the main turn that was running when the prompt was typed: the prompt waits for a turn of its own, or that turn takes it in
  queuedIn?: string
  // a slash command: the turn starts from the command's own text, never from what was typed
  command?: true
  // the request whose turn answered this one, for a prompt taken into a turn that was already running
  foldedInto?: string
  turnIds: string[]
  turns: RequestTurn[]
  files: RequestFile[]
  commands: string[]
  commandCount: number
  commits: number
  test?: { passed: boolean; summary: string }
  agents: RequestAgent[]
  tasks: RequestTask[]
  tools: number
  objective?: string
  milestones: Milestone[]
  // where the milestones came from: a milestones tool wins over a progress bar, which then no longer moves them
  milestonesFrom?: 'milestones' | 'progress'
  asked: RequestQuestion[]
  issues: RequestIssue[]
  // what the last answer leaves to the person: the questions it puts and the steps it names for them
  followUps?: FollowUps
}
export type FollowUps = { questions: string[]; actions: string[] }
export type Requests = {
  list: Request[]
  seq: number
  // the main turn running now, when it started, and the request it works for
  turnId?: string
  turnAt?: number
  active?: string
  // Agent calls by tool_use_id and their subagents by agent id: their work counts for the request that started them
  owners: Record<string, string>
  // the session's transcript was read for the requests made before this list began (backfill), so it is not again
  filled?: true
}

export const MAX_REQUESTS = 150
const MAX_TEXT = 4000
const MAX_ANSWER = 8000
const MAX_TURNS = 8
const MAX_FILES = 80
const MAX_COMMANDS = 40
const MAX_AGENTS = 30
const MAX_TASKS = 40
const MAX_OWNERS = 200
const STATUSES: readonly RequestStatus[] = ['pending', 'in_progress', 'completed', 'interrupted', 'failed']
const REASONS: readonly TurnReason[] = ['answer', 'aborted', 'error', 'refusal']

export const initialRequests = (): Requests => ({ list: [], seq: 0, owners: {} })

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

// The row a request shows as: its first line with text in it, spaces collapsed.
export const requestTitle = (r: Pick<Request, 'text'>) => oneLine(r.text.split('\n').find(l => l.trim()) ?? '')

// Time spent working: every finished turn, plus the running one.
export function workedMs(r: Request, rs: Pick<Requests, 'turnId' | 'turnAt'>, now: number): number {
  const done = r.turns.reduce((n, t) => n + t.durationMs, 0)
  const running = r.status === 'in_progress' && rs.turnId !== undefined && rs.turnAt !== undefined && r.turnIds.includes(rs.turnId)
  return running ? done + Math.max(0, now - rs.turnAt!) : done
}

const update = (rs: Requests, id: string, f: (r: Request) => Request): Requests => ({ ...rs, list: rs.list.map(r => (r.id === id ? f(r) : r)) })

const begin = (r: Request, turnId: string, at: number): Request =>
  ({ ...r, status: 'in_progress', startedAt: r.startedAt ?? at, endedAt: undefined, turnIds: r.turnIds.includes(turnId) ? r.turnIds : [...r.turnIds, turnId] })

// Called before the prompt goes on: its turn can start before the submission settles. The id holds the time
// too, so requests from two lists joined into one (adopt) never share one.
export function submit(rs: Requests, p: { text: string; at: number; turnId?: string; command?: boolean }): { rs: Requests; id: string } {
  const n = rs.seq + 1, id = `r${n}-${Math.max(0, Math.round(p.at)).toString(36)}`
  const r: Request = {
    id, n, text: clip(p.text.trim(), MAX_TEXT), status: 'pending', at: p.at,
    ...(p.turnId && { queuedIn: p.turnId }), ...(p.command && { command: true as const }),
    turnIds: [], turns: [], files: [], commands: [], commandCount: 0, commits: 0, agents: [], tasks: [], tools: 0, milestones: [], asked: [], issues: [],
  }
  return { rs: { ...rs, seq: n, list: [...rs.list, r].slice(-MAX_REQUESTS) }, id }
}

// Requests made while a new session's id was not known yet join the list read back for it, numbered after it.
export function adopt(rs: Requests, extra: readonly Request[]): Requests {
  let seq = rs.seq
  const list = [...rs.list, ...extra.filter(r => !rs.list.some(x => x.id === r.id)).map(r => ({ ...r, n: ++seq }))].slice(-MAX_REQUESTS)
  return { ...rs, list, seq }
}

// The requests a session's transcript holds from before this list began go first, numbered from 1, and the list's
// own are numbered after them. A prompt the list has already (the same text within a minute) is not taken twice.
// Ids and turns are renamed so none can meet one of the list's own.
const SAME_PROMPT_MS = 60_000
export function backfill(rs: Requests, older: readonly Request[]): Requests {
  const first = Math.min(...rs.list.map(r => r.at))
  const seen = (r: Request) => rs.list.some(x => x.text === r.text && Math.abs(x.at - r.at) < SAME_PROMPT_MS)
  const kept = older.filter(r => r.at < first && !seen(r))
  if (!kept.length) return { ...rs, filled: true }
  const rename = new Map(kept.map((r, i) => [r.id, `b${i + 1}-${Math.max(0, Math.round(r.at)).toString(36)}`]))
  const before = kept.map((r, i): Request => ({
    ...r, id: rename.get(r.id)!, n: i + 1, turnIds: r.turnIds.map(t => `backfill:${t}`),
    ...(r.queuedIn && { queuedIn: `backfill:${r.queuedIn}` }), ...(r.foldedInto && { foldedInto: rename.get(r.foldedInto) ?? r.foldedInto }),
  }))
  const list = [...before, ...rs.list.map(r => ({ ...r, n: r.n + kept.length }))].slice(-MAX_REQUESTS)
  return { ...rs, list, seq: rs.seq + kept.length, filled: true }
}

// A hook beneath rewrote the prompt: the request keeps the text the turn will carry.
export const retext = (rs: Requests, id: string, text: string): Requests => update(rs, id, r => ({ ...r, text: clip(text.trim(), MAX_TEXT) }))

export const drop = (rs: Requests, id: string): Requests => ({ ...rs, list: rs.list.filter(r => r.id !== id) })

// A request still waiting with no turn running and none queued ahead of it never got a turn: a slash command that
// runs on its own, or a prompt a hook swallowed.
export const unstarted = (rs: Requests, id: string): boolean => {
  const r = rs.list.find(x => x.id === id)
  return r?.status === 'pending' && r.queuedIn === undefined && rs.turnId === undefined
}

// A main-loop turn starts. It takes the waiting prompts whose text it carries; a slash command's turn carries
// the command's own text, so it takes the command typed for it. A turn that takes nothing (a background task's
// notification, a hook's prompt, a continuation) is more work for the latest request.
export function startTurn(rs: Requests, p: { turnId: string; text: string; at: number }): Requests {
  const text = p.text.trim()
  const waiting = rs.list.filter(r => r.status === 'pending')
  let claim: Request[] = []
  if (text) {
    claim = waiting.filter(r => !r.command && r.text === text)
    if (!claim.length) claim = waiting.filter(r => !r.command && r.text !== '' && text.includes(r.text))
    if (!claim.length) claim = waiting.filter(r => r.command && r.queuedIn === undefined).slice(0, 1)
    // the text changed on its way (another plugin rewrote it): the oldest prompt typed while idle
    if (!claim.length) claim = waiting.filter(r => !r.command && r.queuedIn === undefined).slice(0, 1)
  }
  const ids = new Set(claim.map(r => r.id))
  let active = claim[0]?.id
  if (!active) active = [...rs.list].reverse().find(r => r.status !== 'pending')?.id
  const list = rs.list.map(r => (ids.has(r.id) || r.id === active ? begin(r, p.turnId, p.at) : r))
  return settleQueued({ ...rs, list, turnId: p.turnId, turnAt: p.at, active })
}

// A prompt typed during a turn was delivered into it (the row the engine appends holds its text): the running
// turn answers it along with the request it was already working on.
export function foldIn(rs: Requests, rowText: string, at: number): Requests {
  if (!rs.turnId) return rs
  const text = rowText.trim()
  const hit = new Set(rs.list.filter(r => r.status === 'pending' && r.queuedIn !== undefined && r.text !== '' && text.includes(r.text)).map(r => r.id))
  if (!hit.size) return rs
  return { ...rs, list: rs.list.map(r => (hit.has(r.id) ? { ...begin(r, rs.turnId!, at), ...(rs.active && rs.active !== r.id && { foldedInto: rs.active }) } : r)) }
}

export const hasQueued = (rs: Requests) => rs.list.some(r => r.status === 'pending' && r.queuedIn !== undefined)

// A prompt queued during a turn that has ended, which no turn of its own took: that turn took it in without the
// row being seen. It shares what that turn's request got.
export function settleQueued(rs: Requests): Requests {
  const stale = rs.list.filter(r => r.status === 'pending' && r.queuedIn !== undefined && r.queuedIn !== rs.turnId)
  if (!stale.length) return rs
  const host = (turnId: string) => rs.list.find(r => !stale.includes(r) && r.turnIds.includes(turnId))
  return {
    ...rs,
    list: rs.list.map(r => {
      if (!stale.includes(r)) return r
      const h = host(r.queuedIn!)
      const last = h?.turns.at(-1)
      return { ...r, status: h && h.status !== 'in_progress' ? h.status : 'completed', turnIds: [r.queuedIn!], ...(h && { foldedInto: h.id, startedAt: h.startedAt, endedAt: h.endedAt }), turns: last ? [last] : [] }
    }),
  }
}

// The main-loop turn ended: every request it worked for gets its answer.
export function endTurn(rs: Requests, p: { turnId: string; answer: string; reason: TurnReason; durationMs: number; at: number; plan?: readonly PlanItem[] }): Requests {
  const status: RequestStatus = p.reason === 'answer' ? 'completed' : p.reason === 'aborted' ? 'interrupted' : 'failed'
  const turn: RequestTurn = { answer: clip(p.answer.trim(), MAX_ANSWER), reason: p.reason, durationMs: Math.max(0, Math.round(p.durationMs)), endedAt: p.at }
  // an interrupted turn's answer is cut short: what it asks is not what the person was left with
  const followUps = turn.answer && p.reason === 'answer' ? asksOfYou(turn.answer) : undefined
  const list = rs.list.map(r => (r.status === 'in_progress' && r.turnIds.includes(p.turnId)
    ? { ...r, status, endedAt: p.at, turns: [...r.turns, turn].slice(-MAX_TURNS), tasks: p.plan ? snapshotTasks(r.tasks, p.plan) : r.tasks, ...(followUps && { followUps }) }
    : r))
  const ended = rs.turnId === p.turnId
  return { ...rs, list, ...(ended && { turnId: undefined, turnAt: undefined, active: undefined }) }
}

// Task titles and statuses as the plan has them now, so a request read later shows what its tasks came to.
function snapshotTasks(tasks: RequestTask[], plan: readonly PlanItem[]): RequestTask[] {
  return tasks.map(t => {
    const p = plan.find(x => x.id === t.id)
    return p ? { id: t.id, title: p.title, status: p.status } : t
  })
}

const own = (owners: Record<string, string>, key: string, id: string) => {
  const next = { ...owners, [key]: id }
  const keys = Object.keys(next)
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_OWNERS))) delete next[k]
  return next
}

// A main-loop Agent call: the subagent's own calls count for the request now running.
export function agentStart(rs: Requests, toolUseId: string): Requests {
  return rs.active ? { ...rs, owners: own(rs.owners, toolUseId, rs.active) } : rs
}
export function agentBind(rs: Requests, toolUseId: string, agentId: string): Requests {
  const id = rs.owners[toolUseId]
  return id ? { ...rs, owners: own(rs.owners, agentId, id) } : rs
}

// denied: a hook refused the call before it ran
export type ToolEnd = { tool: string; toolUseId: string; agentId?: string; input: Record<string, unknown>; isError: boolean; text: string; resultTaskId?: string; writeType?: 'create' | 'update'; denied?: boolean }

function touchFile(files: RequestFile[], path: string, how: RequestFile['how'], add: number, del: number): RequestFile[] {
  const old = files.find(f => f.path === path)
  if (!old) return files.length < MAX_FILES ? [...files, { path, how, add, del }] : files
  return files.map(f => (f === old ? { ...f, add: f.add + add, del: f.del + del, how: f.how === 'new' ? 'new' : how } : f))
}

// A finished tool call counts for the request its loop works for: a subagent's for the request that started it.
export function toolEnd(rs: Requests, ev: ToolEnd, plan: readonly PlanItem[] = []): Requests {
  const id = ev.agentId ? rs.owners[ev.agentId] : rs.active
  if (!id) return rs
  return update(rs, id, r => addWork(r, ev, plan))
}

function addWork(r: Request, ev: ToolEnd, plan: readonly PlanItem[]): Request {
  let n: Request = { ...r, tools: r.tools + 1 }
  const d = describeTool(ev.tool, ev.input)
  const main = !ev.agentId
  if (main && d.isTest) n = { ...n, test: testOutcome(ev.text, ev.isError) }
  // a question declined still was one
  if (main && ev.tool === 'AskUserQuestion') n = { ...n, asked: [...n.asked, ...askedIn(ev)].slice(-MAX_ASKED) }
  // a test run that fails shows as the test outcome; a question, or a progress report, is no work that can fail
  if (main && !d.isTest && ev.tool !== 'AskUserQuestion' && !MILESTONES_TOOL.test(ev.tool) && !PROGRESS_TOOL.test(ev.tool)) n = { ...n, issues: noted(n.issues, ev, d) }
  if (ev.isError) return n
  if (main && MILESTONES_TOOL.test(ev.tool) && Array.isArray(ev.input.milestones)) {
    const objective = oneLine(str(ev.input.objective))
    n = { ...n, milestones: readMilestones(ev.input.milestones), milestonesFrom: 'milestones', ...(objective && { objective: clip(objective, 300) }) }
  }
  if (main && PROGRESS_TOOL.test(ev.tool)) n = progressed(n, ev.input)
  if (d.file) {
    const counts = editCounts(ev.tool, ev.input) ?? (ev.tool === 'NotebookEdit' ? { add: 0, del: 0 } : undefined)
    const how: RequestFile['how'] | undefined = ev.tool === 'Write' && ev.writeType === 'create' ? 'new' : counts ? 'edit' : undefined
    if (how) n = { ...n, files: touchFile(n.files, d.file, how, counts?.add ?? 0, counts?.del ?? 0) }
  }
  if (main && ev.tool === 'Bash' && typeof ev.input.command === 'string') {
    const cmd = ev.input.command
    n = { ...n, commandCount: n.commandCount + 1, commits: n.commits + countCommits(cmd), commands: n.commands.length < MAX_COMMANDS ? [...n.commands, clip(oneLine(cmd), 300)] : n.commands }
  }
  if (main && ev.tool === 'Agent' && n.agents.length < MAX_AGENTS) {
    n = { ...n, agents: [...n.agents, { name: str(ev.input.name) || str(ev.input.subagent_type) || 'agent', task: oneLine(str(ev.input.description)) }] }
  }
  if (main && (ev.tool === 'TaskCreate' || ev.tool === 'TaskUpdate')) {
    const tid = ev.tool === 'TaskCreate' ? ev.resultTaskId : str(ev.input.taskId)
    if (tid && !n.tasks.some(t => t.id === tid) && n.tasks.length < MAX_TASKS) {
      const p = plan.find(x => x.id === tid)
      n = { ...n, tasks: [...n.tasks, { id: tid, title: p?.title ?? str(ev.input.subject), status: p?.status ?? 'pending' }] }
    } else if (tid) n = { ...n, tasks: snapshotTasks(n.tasks, plan) }
  }
  return n
}

const MAX_ISSUES = 20
// What a refusal reads as when no hook flag says so: the person declined, or a hook or policy blocked it.
const REFUSAL = /\b(doesn'?t want to proceed|does not want to proceed|user (rejected|declined|denied)|permission (was )?denied|denied by|blocked by|withheld its result|is set to deny)\b/i
const reasonOf = (text: string) => clip(oneLine(text.replace(/<\/?[a-z_]+>/g, ' ').split('\n').map(l => l.trim()).find(Boolean) ?? ''), 160)

function noted(issues: RequestIssue[], ev: ToolEnd, d: ReturnType<typeof describeTool>): RequestIssue[] {
  const sig = d.kind === 'edit' && d.file ? `edit\u0000${d.file}` : `${ev.tool}\u0000${d.label}`
  const open = issues.find(i => !i.fixed && i.sig === sig)
  if (!ev.isError) return open ? issues.map(i => (i.sig === sig && !i.fixed ? { ...i, fixed: true as const } : i)) : issues
  const reason = reasonOf(ev.text), kind: RequestIssue['kind'] = ev.denied || REFUSAL.test(ev.text) ? 'refused' : 'failed'
  if (open && open.kind === kind) return issues.map(i => (i === open ? { ...i, attempts: i.attempts + 1, ...(reason && { reason }) } : i))
  return [...issues, { kind, sig, title: clip(d.label, 120), ...(reason && { reason }), attempts: 1 }].slice(-MAX_ISSUES)
}

// The issues still open: a failure nothing fixed, a refusal nothing got past.
export const openIssues = (r: Pick<Request, 'issues'>) => r.issues.filter(i => !i.fixed)

const MAX_MILESTONES = 30
const MAX_ASKED = 20
const MAX_FOLLOW_UPS = 8
const MILESTONE_STATUSES: readonly MilestoneStatus[] = ['pending', 'in_progress', 'verifying', 'waiting', 'blocked', 'completed', 'failed', 'skipped']
// Any server's tool so named: Control Room's milestones take the whole list each call; plan-progress's bar takes
// its stages once and short ops after.
const MILESTONES_TOOL = /(^|__)milestones$/
const PROGRESS_TOOL = /(^|__)plan_progress$/
const PROGRESS_STATUS: Record<string, MilestoneStatus> = { pending: 'pending', active: 'in_progress', done: 'completed', error: 'failed', skipped: 'skipped' }
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {})

export function readMilestones(v: unknown): Milestone[] {
  return (Array.isArray(v) ? v : []).flatMap((m): Milestone[] => {
    const o = obj(m), title = oneLine(str(o.title))
    if (!title) return []
    const s = str(o.status) as MilestoneStatus, doing = oneLine(str(o.doing)), evidence = oneLine(str(o.evidence)), blocker = oneLine(str(o.blocker))
    return [{ title: clip(title, 200), status: MILESTONE_STATUSES.includes(s) ? s : 'pending', ...(doing && { doing: clip(doing, 200) }), ...(evidence && { evidence: clip(evidence, 200) }), ...(blocker && { blocker: clip(blocker, 200) }) }]
  }).slice(0, MAX_MILESTONES)
}

// A progress bar's call: its stages set the steps; next, done, active, failed and state move them.
function progressed(r: Request, input: Record<string, unknown>): Request {
  if (r.milestonesFrom === 'milestones') return r
  let ms = r.milestones
  if (Array.isArray(input.stages)) {
    ms = input.stages.flatMap(st => (Array.isArray(obj(st).steps) ? obj(st).steps as unknown[] : [])).flatMap((step): Milestone[] => {
      const o = obj(step), title = oneLine(str(o.title))
      return title ? [{ title: clip(title, 200), status: PROGRESS_STATUS[str(o.status)] ?? 'pending' }] : []
    }).slice(0, MAX_MILESTONES)
  }
  const set = (title: unknown, status: MilestoneStatus) => {
    const t = oneLine(str(title))
    if (t) ms = ms.map(m => (m.title === t ? { ...m, status } : m))
  }
  if (input.next === true) {
    const at = ms.findIndex(m => m.status === 'in_progress')
    const then = ms.findIndex((m, i) => i > at && m.status === 'pending')
    if (at >= 0) ms = ms.map((m, i) => (i === at ? { ...m, status: 'completed' } : i === then ? { ...m, status: 'in_progress' } : m))
  }
  if (Array.isArray(input.done)) for (const t of input.done) set(t, 'completed')
  set(input.failed, 'failed')
  set(input.active, 'in_progress')
  if (input.state === 'done') ms = ms.map(m => (m.status === 'in_progress' ? { ...m, status: 'completed' } : m))
  const title = oneLine(str(input.title))
  return { ...r, milestones: ms, ...(ms.length && { milestonesFrom: 'progress' as const }), ...(title && !r.objective && { objective: clip(title, 300) }) }
}

// AskUserQuestion's result names each answer as "question"="answer".
function askedIn(ev: ToolEnd): RequestQuestion[] {
  const answers = new Map<string, string>()
  if (!ev.isError) for (const m of ev.text.matchAll(/"([^"]+)"\s*=\s*"([^"]*)"/g)) answers.set(oneLine(m[1]!), m[2]!)
  return (Array.isArray(ev.input.questions) ? ev.input.questions : []).flatMap((q): RequestQuestion[] => {
    const question = oneLine(str(obj(q).question))
    if (!question) return []
    const a = answers.get(question)
    return [{ question: clip(question, 300), ...(a !== undefined && { answer: clip(oneLine(a), 300) }) }]
  })
}

// What an answer leaves to the person. Under a heading or lead-in that names it (Next steps, Action items, To do,
// For you, Questions), each line is one; elsewhere a sentence that ends in a question mark is a question, and one
// that tells the person what to do (you need to, please, make sure, remember to, restart) is a step. Code, tables
// and headings are not read as either.
const ACTION_HEAD = /\b(next steps?|action items?|to-?dos?|for you|on your (side|end)|your (turn|part|move)|you('ll| will)? need|what you need|manual steps?|follow-?ups?|still (needed|missing|open|to do)|open items|needs? (from )?you|decisions? (needed|for you)|to finish|before (you|it|this) (can|works?))\b/i
const QUESTION_HEAD = /\bquestions?\b/i
const ACTION_LINE = /\b(you('ll| will)? (need|have) to|you (should|must)|please|make sure (you|to)|don'?t forget|remember to|restart (claude|the session|your)|run \/reload|approve (the|it|this|that))\b/i
const plainText = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim()
const headKind = (s: string): 'action' | 'question' | undefined => (ACTION_HEAD.test(s) ? 'action' : QUESTION_HEAD.test(s) ? 'question' : undefined)

export function asksOfYou(answer: string): FollowUps {
  const out: FollowUps = { questions: [], actions: [] }
  const add = (list: string[], s: string) => {
    const t = clip(plainText(s), 300)
    if (t && !list.includes(t) && list.length < MAX_FOLLOW_UPS) list.push(t)
  }
  let fence = false
  // section: what the heading above names, until the next heading; lead: what a lead-in names, for its list
  let section: 'action' | 'question' | undefined, lead: 'action' | 'question' | undefined
  for (const raw of answer.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    if (/^(```|~~~)/.test(line)) { fence = !fence; continue }
    if (fence || !line || line.startsWith('|')) continue
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (heading) { section = headKind(heading[1]!); lead = undefined; continue }
    const item = /^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line)
    if (!item) {
      const leadIn = /^\*\*(.+?)\*\*:?$/.exec(line)?.[1] ?? (line.endsWith(':') ? line : undefined)
      if (leadIn !== undefined) { lead = headKind(plainText(leadIn)); continue }
      lead = undefined
    }
    const text = item ? item[1]! : line.replace(/^>\s?/, '')
    const named = (item && lead) || section
    // a question stays one whatever the section around it names
    if (named && /\?["')]*$/.test(plainText(text))) { add(out.questions, text); continue }
    if (named === 'action') { add(out.actions, text); continue }
    if (named === 'question') { add(out.questions, text); continue }
    for (const sentence of plainText(text).split(/(?<=[.!?])\s+(?=["'(*`A-Z])/)) {
      if (/\?["')]*$/.test(sentence)) add(out.questions, sentence)
      else if (ACTION_LINE.test(sentence)) add(out.actions, sentence)
    }
  }
  return out
}

// What a saved or hot-reloaded list holds is checked field by field: a file from another version, or a damaged
// one, gives the fields it can and never a shape the pane cannot draw.
function readRequest(raw: unknown): Request | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const id = str(o.id), n = num(o.n), status = str(o.status) as RequestStatus
  if (!id || !n || !STATUSES.includes(status)) return undefined
  const arr = (v: unknown) => (Array.isArray(v) ? v : [])
  const turns = arr(o.turns).flatMap((t): RequestTurn[] => {
    const x = (t ?? {}) as Record<string, unknown>
    const reason = str(x.reason) as TurnReason
    return REASONS.includes(reason) ? [{ answer: clip(str(x.answer), MAX_ANSWER), reason, durationMs: num(x.durationMs), endedAt: num(x.endedAt) }] : []
  })
  const files = arr(o.files).flatMap((f): RequestFile[] => {
    const x = (f ?? {}) as Record<string, unknown>
    return str(x.path) ? [{ path: str(x.path), add: num(x.add), del: num(x.del), how: x.how === 'new' ? 'new' : 'edit' }] : []
  })
  const tasks = arr(o.tasks).flatMap((t): RequestTask[] => {
    const x = (t ?? {}) as Record<string, unknown>
    const s = str(x.status)
    return str(x.id) ? [{ id: str(x.id), title: str(x.title), status: s === 'in_progress' || s === 'completed' ? s : 'pending' }] : []
  })
  const test = o.test && typeof o.test === 'object' ? o.test as Record<string, unknown> : undefined
  return {
    id, n, text: clip(str(o.text), MAX_TEXT), status, at: num(o.at),
    ...(typeof o.startedAt === 'number' && { startedAt: o.startedAt }),
    ...(typeof o.endedAt === 'number' && { endedAt: o.endedAt }),
    ...(str(o.queuedIn) && { queuedIn: str(o.queuedIn) }),
    ...(o.command === true && { command: true as const }),
    ...(str(o.foldedInto) && { foldedInto: str(o.foldedInto) }),
    turnIds: arr(o.turnIds).filter((x): x is string => typeof x === 'string'),
    turns: turns.slice(-MAX_TURNS),
    files: files.slice(0, MAX_FILES),
    commands: arr(o.commands).filter((x): x is string => typeof x === 'string').slice(0, MAX_COMMANDS),
    commandCount: num(o.commandCount),
    commits: num(o.commits),
    ...(test && typeof test.passed === 'boolean' && { test: { passed: test.passed, summary: str(test.summary) } }),
    agents: arr(o.agents).flatMap((a): RequestAgent[] => (a && typeof a === 'object' ? [{ name: str((a as RequestAgent).name), task: str((a as RequestAgent).task) }] : [])).slice(0, MAX_AGENTS),
    tasks: tasks.slice(0, MAX_TASKS),
    tools: num(o.tools),
    ...(str(o.objective) && { objective: clip(str(o.objective), 300) }),
    milestones: readMilestones(o.milestones),
    ...((o.milestonesFrom === 'milestones' || o.milestonesFrom === 'progress') && { milestonesFrom: o.milestonesFrom }),
    asked: arr(o.asked).flatMap((q): RequestQuestion[] => {
      const x = obj(q)
      return str(x.question) ? [{ question: clip(str(x.question), 300), ...(typeof x.answer === 'string' && { answer: clip(x.answer, 300) }) }] : []
    }).slice(-MAX_ASKED),
    issues: arr(o.issues).flatMap((i): RequestIssue[] => {
      const x = obj(i), kind = x.kind === 'refused' ? 'refused' : x.kind === 'failed' ? 'failed' : undefined
      return kind && str(x.title) ? [{ kind, sig: str(x.sig) || str(x.title), title: clip(str(x.title), 120), ...(str(x.reason) && { reason: clip(str(x.reason), 160) }), attempts: Math.max(1, num(x.attempts)), ...(x.fixed === true && { fixed: true as const }) }] : []
    }).slice(-MAX_ISSUES),
    ...(typeof o.followUps === 'object' && o.followUps !== null && {
      followUps: {
        questions: arr(obj(o.followUps).questions).filter((x): x is string => typeof x === 'string').slice(0, MAX_FOLLOW_UPS),
        actions: arr(obj(o.followUps).actions).filter((x): x is string => typeof x === 'string').slice(0, MAX_FOLLOW_UPS),
      },
    }),
  }
}

// The milestone the work is at: the one running, else one being checked, waiting or blocked.
export function currentMilestone(ms: readonly Milestone[]): number {
  for (const s of ['in_progress', 'verifying', 'waiting', 'blocked'] as const) {
    const i = ms.findIndex(m => m.status === s)
    if (i >= 0) return i
  }
  return -1
}

export function normalizeRequests(raw: unknown): Requests {
  if (!raw || typeof raw !== 'object') return initialRequests()
  const o = raw as Record<string, unknown>
  const list = (Array.isArray(o.list) ? o.list : []).map(readRequest).filter((r): r is Request => r !== undefined).slice(-MAX_REQUESTS)
  const owners: Record<string, string> = {}
  if (o.owners && typeof o.owners === 'object') for (const [k, v] of Object.entries(o.owners)) if (typeof v === 'string') owners[k] = v
  return {
    list,
    seq: Math.max(num(o.seq), ...list.map(r => r.n), 0),
    ...(str(o.turnId) && { turnId: str(o.turnId) }),
    ...(typeof o.turnAt === 'number' && { turnAt: o.turnAt }),
    ...(str(o.active) && { active: str(o.active) }),
    owners,
    ...(o.filled === true && { filled: true as const }),
  }
}

// Kept under this many characters of JSON, the oldest requests going first: a file read or written is held to
// 4 MiB, and the session's state is written as requests change.
export const MAX_JSON = 2_000_000
export function withinSize(rs: Requests, max = MAX_JSON): Requests {
  let list = rs.list, size = JSON.stringify(list).length
  while (size > max && list.length > 1) {
    size -= JSON.stringify(list[0]).length + 1
    list = list.slice(1)
  }
  return list === rs.list ? rs : { ...rs, list }
}

// What goes to disk for `claude --resume`: the list alone. A session read back runs no turn, so a request it
// left running was cut off, and one still waiting never ran.
export const SAVE_FORMAT = 1
export const saved = (rs: Requests) => ({ format: SAVE_FORMAT, seq: rs.seq, list: withinSize(rs).list, ...(rs.filled && { filled: true }) })
export function loadSaved(raw: unknown): Requests {
  const o = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  if (typeof o.format === 'number' && o.format > SAVE_FORMAT) return initialRequests()
  const rs = normalizeRequests({ list: o.list, seq: o.seq, filled: o.filled })
  return { ...rs, list: rs.list.filter(r => r.status !== 'pending').map(r => (r.status === 'in_progress' ? { ...r, status: 'interrupted' as const } : r)) }
}
