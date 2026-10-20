// The requests a session made before ops-control was there to see them (ops-control turned on or reloaded mid-session, or a
// session resumed from before ops-control kept a list), read back from the session's transcript through the same steps
// a live session takes. JSX-free and engine-free, so it tests on recorded transcript lines.
import type { PlanItem } from './events.ts'
import { endTurn, foldIn, initialRequests, startTurn, submit, toolEnd, type Request, type Requests, type TurnReason } from './requests.ts'

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {})
const textOf = (content: unknown) =>
  typeof content === 'string' ? content : Array.isArray(content) ? content.filter(b => obj(b).type === 'text').map(b => str(obj(b).text)).join('\n') : ''
// A slash command's row names it in tags; the request reads as the command typed.
const commandLine = (text: string) => {
  const name = /<command-name>([^<]*)<\/command-name>/.exec(text)?.[1]?.trim()
  if (!name) return undefined
  const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1]?.trim()
  return `${name.startsWith('/') ? name : '/' + name}${args ? ' ' + args : ''}`
}
// Origins the transcript gives a turn that is not the person's: more work for the latest request.
const OTHER_ORIGINS = new Set(['task-notification', 'scheduled-trigger', 'peer', 'plugin'])

type Turn = { id: string; at: number; texts: string[]; afterTool: string[]; answered: boolean }

export class TranscriptReader {
  private rs: Requests = initialRequests()
  private turn?: Turn
  private turns = 0
  private lastAt = 0
  private tools = new Map<string, { name: string; input: Record<string, unknown> }>()
  private plan: PlanItem[] = []
  // requests whose turn never got to Claude: a local slash command (/clear, /reload-plugins)
  private unanswered = new Set<string>()

  // One line of the transcript, as written; a line that does not parse is skipped.
  line(raw: string) {
    if (!raw.trim()) return
    let o: Record<string, unknown>
    try { o = obj(JSON.parse(raw)) } catch { return }
    if (o.isSidechain) return
    const t = Date.parse(str(o.timestamp))
    const at = Number.isFinite(t) ? t : this.lastAt
    this.lastAt = Math.max(this.lastAt, at)
    switch (o.type) {
      case 'system':
        if (o.subtype === 'turn_duration') this.end('answer', at, typeof o.durationMs === 'number' ? o.durationMs : undefined)
        return
      case 'attachment': {
        const a = obj(o.attachment)
        if (a.type !== 'queued_command') return
        if (obj(a.origin).kind === 'human') this.prompt(textOf(a.prompt), at, false, true)
        else if (!this.turn) this.more(at)
        return
      }
      case 'assistant': return this.assistant(obj(o.message).content, at)
      case 'user': return this.user(o, at)
    }
  }

  private user(o: Record<string, unknown>, at: number) {
    const content = obj(o.message).content
    if (Array.isArray(content) && content.some(b => obj(b).type === 'tool_result')) {
      for (const b of content.map(obj)) if (b.type === 'tool_result') this.result(b, obj(o.toolUseResult))
      return
    }
    if (o.isMeta || o.isCompactSummary) return
    const text = textOf(content)
    if (/^\[Request interrupted by user/.test(text.trim())) return this.end('aborted', at)
    const kind = obj(o.origin).kind, command = commandLine(text)
    // a transcript from before origins were written: a prompt is plain text that is not a tagged notice
    const person = kind === 'human' || (kind === undefined && (command !== undefined || (!/^</.test(text.trim()) && !/^This session is being continued/.test(text) && text.trim() !== '')))
    if (person) this.prompt(command ?? text, at, command !== undefined, false)
    else if (typeof kind === 'string' && OTHER_ORIGINS.has(kind) && !this.turn) this.more(at)
  }

  // A prompt the person sent: typed while a turn ran (queued), that turn takes it in; else it starts its own.
  private prompt(text: string, at: number, command: boolean, queued: boolean) {
    if (!text.trim()) return
    if (queued && this.turn) {
      const made = submit(this.rs, { text, at, turnId: this.turn.id })
      this.rs = foldIn(made.rs, text, at)
      return
    }
    this.end('answer', at)
    const made = submit(this.rs, { text, at, ...(command && { command: true }) })
    this.begin(at, text, made.rs)
    if (command) this.unanswered.add(made.id)
  }

  // A turn no prompt started (a notification's, a continuation): more work for the latest request.
  private more(at: number) {
    if (this.rs.list.length) this.begin(at, '', this.rs)
  }

  private begin(at: number, text: string, rs: Requests) {
    const id = `transcript-${++this.turns}`
    this.turn = { id, at, texts: [], afterTool: [], answered: false }
    this.rs = startTurn(rs, { turnId: id, text, at })
  }

  private assistant(content: unknown, at: number) {
    if (!Array.isArray(content)) return
    if (!this.turn) this.more(at)
    const turn = this.turn
    if (!turn) return
    turn.answered = true
    for (const id of this.rs.list.filter(r => r.turnIds.includes(turn.id)).map(r => r.id)) this.unanswered.delete(id)
    for (const b of content.map(obj)) {
      if (b.type === 'text' && str(b.text).trim()) { turn.texts.push(str(b.text)); turn.afterTool.push(str(b.text)) }
      if (b.type === 'tool_use' && str(b.id)) {
        turn.afterTool = []
        this.tools.set(str(b.id), { name: str(b.name), input: obj(b.input) })
      }
    }
  }

  private result(b: Record<string, unknown>, out: Record<string, unknown>) {
    const id = str(b.tool_use_id), call = this.tools.get(id)
    if (!call) return
    this.tools.delete(id)
    const isError = b.is_error === true, text = textOf(b.content)
    const taskId = call.name === 'TaskCreate' ? String(obj(out.task).id ?? '') : undefined
    this.track(call.name, call.input, taskId, isError)
    this.rs = toolEnd(this.rs, {
      tool: call.name, toolUseId: id, input: call.input, isError, text,
      ...(taskId && { resultTaskId: taskId }), ...((out.type === 'create' || out.type === 'update') && { writeType: out.type }),
    }, this.plan)
  }

  // The task list as the calls left it, so a request's tasks read back with their titles and statuses.
  private track(tool: string, input: Record<string, unknown>, taskId: string | undefined, isError: boolean) {
    if (isError) return
    const status = (v: unknown): PlanItem['status'] | undefined => (v === 'pending' || v === 'in_progress' || v === 'completed' ? v : undefined)
    if (tool === 'TaskCreate' && taskId) this.plan = [...this.plan, { id: taskId, title: str(input.subject), status: 'pending' }]
    if (tool === 'TaskUpdate') {
      const id = str(input.taskId)
      if (input.status === 'deleted') { this.plan = this.plan.filter(p => p.id !== id); return }
      this.plan = this.plan.map(p => (p.id === id ? { ...p, status: status(input.status) ?? p.status, ...(str(input.subject) && { title: str(input.subject) }) } : p))
    }
  }

  private end(reason: TurnReason, at: number, durationMs?: number) {
    const turn = this.turn
    if (!turn) return
    this.turn = undefined
    // the answer is what Claude said after its last tool call, else the last thing it said
    const answer = (turn.afterTool.length ? turn.afterTool.join('\n\n') : turn.texts.at(-1) ?? '').trim()
    this.rs = endTurn(this.rs, { turnId: turn.id, answer, reason, durationMs: durationMs ?? Math.max(0, at - turn.at), at, plan: this.plan })
  }

  // The requests the transcript holds, in order. A turn the transcript leaves open ended where its lines stop:
  // answered if Claude had spoken, else cut off. A slash command no turn came of was no request.
  requests(): Request[] {
    if (this.turn) this.end(this.turn.answered ? 'answer' : 'aborted', this.lastAt)
    return this.rs.list.filter(r => !this.unanswered.has(r.id) && r.status !== 'pending')
  }
}

export function readTranscript(text: string): Request[] {
  const reader = new TranscriptReader()
  for (const line of text.split('\n')) reader.line(line)
  return reader.requests()
}

// Claude Code keeps a session's transcript under projects/, in a folder named for the directory it ran in.
export const projectFolder = (cwd: string) => cwd.replace(/[^A-Za-z0-9]/g, '-')
