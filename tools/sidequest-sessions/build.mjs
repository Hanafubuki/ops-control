#!/usr/bin/env node
// Builds what the Sidequest dashboard's Sessions page reads: every Claude Code session (its name, id and
// project) and, for each, every request with what glowup shows for it (status, objective, milestones, what was
// done, Claude's answer, the questions and action items left to you, files and commands), plus links to the
// markdown files each session created.
//
// Sessions come from Claude Code's transcripts (<config>/projects/<project>/<session>.jsonl). Where glowup kept
// its own list for a session (<config>/glowup/requests/<session>.json) that list is used: it was written as the
// work happened. Output goes to <config>/sidequest-sessions/data (served by Sidequest through the dashboard's
// sessions-data link): index.json, sessions/<id>.json, and files/<hash>.md links to the markdown files.
//
//   node build.mjs           build what changed since the last run
//   node build.mjs --full    rebuild every session
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

export const FORMAT = 1
const MAX_TEXT = 4000, MAX_ANSWER = 8000, MAX_TURNS = 8, MAX_FILES = 80, MAX_COMMANDS = 40, MAX_AGENTS = 30, MAX_TASKS = 40
const MAX_MILESTONES = 30, MAX_ASKED = 20, MAX_FOLLOW_UPS = 8, MAX_MD = 40
// a transcript that changed this recently, with its last turn still open, is a session at work
const LIVE_MS = 3 * 60_000

const str = v => (typeof v === 'string' ? v : '')
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const obj = v => (v && typeof v === 'object' ? v : {})
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const oneLine = s => s.replace(/\s+/g, ' ').trim()
const time = v => { const t = Date.parse(str(v)); return Number.isFinite(t) ? t : 0 }
export const requestTitle = r => oneLine(r.text.split('\n').find(l => l.trim()) ?? '')

// ---- what a tool call adds to its request (the same counting glowup does) ----

const lines = s => (s === '' ? 0 : s.replace(/\n$/, '').split('\n').length)
// The mod's own request list for a session: Ops Control's folder, else glowup's from before the rename.
function requestsFile(config, sid) {
  const name = `${sid.replace(/[^A-Za-z0-9-]/g, '')}.json`
  const mine = path.join(config, 'ops-control', 'requests', name)
  return fs.existsSync(mine) ? mine : path.join(config, 'glowup', 'requests', name)
}

function editCounts(tool, input) {
  if (tool === 'Edit') return { add: lines(str(input.new_string)), del: lines(str(input.old_string)) }
  if (tool === 'MultiEdit' && Array.isArray(input.edits)) return input.edits.reduce((n, e) => ({ add: n.add + lines(str(obj(e).new_string)), del: n.del + lines(str(obj(e).old_string)) }), { add: 0, del: 0 })
  if (tool === 'Write') return { add: lines(str(input.content)), del: 0 }
  if (tool === 'NotebookEdit') return { add: 0, del: 0 }
  return undefined
}
const countCommits = command => (command.match(/\bgit\b[^\n;&|]*\bcommit\b/g) ?? []).length
const TEST_COMMAND = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\b(vitest|jest|pytest|mocha|phpunit|go\s+test|cargo\s+test|dotnet\s+test|rspec|claude\s+plugin\s+test)\b/
function testOutcome(text, isError) {
  const failed = /\b(\d+)\s+(failed|failing|fail)\b/i.exec(text)
  return { passed: !isError && !(failed && Number(failed[1]) > 0), summary: oneLine(text.split('\n').reverse().find(l => /pass|fail/i.test(l)) ?? '').slice(0, 120) }
}

const MILESTONE_STATUSES = ['pending', 'in_progress', 'verifying', 'waiting', 'blocked', 'completed', 'failed', 'skipped']
const MILESTONES_TOOL = /(^|__)milestones$/
const PROGRESS_TOOL = /(^|__)plan_progress$/
const PROGRESS_STATUS = { pending: 'pending', active: 'in_progress', done: 'completed', error: 'failed', skipped: 'skipped' }

export function readMilestones(v) {
  return (Array.isArray(v) ? v : []).flatMap(m => {
    const o = obj(m), title = oneLine(str(o.title))
    if (!title) return []
    const s = str(o.status), doing = oneLine(str(o.doing)), evidence = oneLine(str(o.evidence)), blocker = oneLine(str(o.blocker))
    return [{ title: clip(title, 200), status: MILESTONE_STATUSES.includes(s) ? s : 'pending', ...(doing && { doing: clip(doing, 200) }), ...(evidence && { evidence: clip(evidence, 200) }), ...(blocker && { blocker: clip(blocker, 200) }) }]
  }).slice(0, MAX_MILESTONES)
}

function progressed(r, input) {
  if (r.milestonesFrom === 'milestones') return
  let ms = r.milestones
  if (Array.isArray(input.stages)) {
    ms = input.stages.flatMap(st => (Array.isArray(obj(st).steps) ? obj(st).steps : [])).flatMap(step => {
      const o = obj(step), title = oneLine(str(o.title))
      return title ? [{ title: clip(title, 200), status: PROGRESS_STATUS[str(o.status)] ?? 'pending' }] : []
    }).slice(0, MAX_MILESTONES)
  }
  const set = (title, status) => { const t = oneLine(str(title)); if (t) ms = ms.map(m => (m.title === t ? { ...m, status } : m)) }
  if (input.next === true) {
    const at = ms.findIndex(m => m.status === 'in_progress'), then = ms.findIndex((m, i) => i > at && m.status === 'pending')
    if (at >= 0) ms = ms.map((m, i) => (i === at ? { ...m, status: 'completed' } : i === then ? { ...m, status: 'in_progress' } : m))
  }
  if (Array.isArray(input.done)) for (const t of input.done) set(t, 'completed')
  set(input.failed, 'failed')
  set(input.active, 'in_progress')
  if (input.state === 'done') ms = ms.map(m => (m.status === 'in_progress' ? { ...m, status: 'completed' } : m))
  r.milestones = ms
  if (ms.length) r.milestonesFrom = 'progress'
  const title = oneLine(str(input.title))
  if (title && !r.objective) r.objective = clip(title, 300)
}

function askedIn(input, text, isError) {
  const answers = new Map()
  if (!isError) for (const m of text.matchAll(/"([^"]+)"\s*=\s*"([^"]*)"/g)) answers.set(oneLine(m[1]), m[2])
  return (Array.isArray(input.questions) ? input.questions : []).flatMap(q => {
    const question = oneLine(str(obj(q).question))
    if (!question) return []
    const a = answers.get(question)
    return [{ question: clip(question, 300), ...(a !== undefined && { answer: clip(oneLine(a), 300) }) }]
  })
}

// What an answer leaves to the person: the same reading glowup does (hooks/requests.ts asksOfYou).
const ACTION_HEAD = /\b(next steps?|action items?|to-?dos?|for you|on your (side|end)|your (turn|part|move)|you('ll| will)? need|what you need|manual steps?|follow-?ups?|still (needed|missing|open|to do)|open items|needs? (from )?you|decisions? (needed|for you)|to finish|before (you|it|this) (can|works?))\b/i
const QUESTION_HEAD = /\bquestions?\b/i
const ACTION_LINE = /\b(you('ll| will)? (need|have) to|you (should|must)|please|make sure (you|to)|don'?t forget|remember to|restart (claude|the session|your)|run \/reload|approve (the|it|this|that))\b/i
const plainText = s => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim()
const headKind = s => (ACTION_HEAD.test(s) ? 'action' : QUESTION_HEAD.test(s) ? 'question' : undefined)

export function asksOfYou(answer) {
  const out = { questions: [], actions: [] }
  const add = (list, s) => { const t = clip(plainText(s), 300); if (t && !list.includes(t) && list.length < MAX_FOLLOW_UPS) list.push(t) }
  let fence = false, section, lead
  for (const raw of answer.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    if (/^(```|~~~)/.test(line)) { fence = !fence; continue }
    if (fence || !line || line.startsWith('|')) continue
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (heading) { section = headKind(heading[1]); lead = undefined; continue }
    const item = /^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line)
    if (!item) {
      const leadIn = /^\*\*(.+?)\*\*:?$/.exec(line)?.[1] ?? (line.endsWith(':') ? line : undefined)
      if (leadIn !== undefined) { lead = headKind(plainText(leadIn)); continue }
      lead = undefined
    }
    const text = item ? item[1] : line.replace(/^>\s?/, '')
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

function newRequest(n, text, at, extra = {}) {
  return { id: `r${n}-${Math.max(0, Math.round(at)).toString(36)}`, n, text: clip(text.trim(), MAX_TEXT), status: 'in_progress', at, startedAt: at, turnIds: [], turns: [], files: [], commands: [], commandCount: 0, commits: 0, agents: [], tasks: [], tools: 0, milestones: [], asked: [], ...extra }
}

function addWork(r, tool, input, { isError, text, result }) {
  r.tools++
  if (tool === 'Bash' && TEST_COMMAND.test(str(input.command))) r.test = testOutcome(text, isError)
  if (tool === 'AskUserQuestion') r.asked = [...r.asked, ...askedIn(input, text, isError)].slice(-MAX_ASKED)
  if (isError) return
  const file = str(input.file_path) || str(input.notebook_path)
  const counts = file ? editCounts(tool, input) : undefined
  if (file && counts) {
    const how = tool === 'Write' && obj(result).type === 'create' ? 'new' : 'edit'
    const old = r.files.find(f => f.path === file)
    if (old) { old.add += counts.add; old.del += counts.del; if (how === 'new') old.how = 'new' }
    else if (r.files.length < MAX_FILES) r.files.push({ path: file, how, add: counts.add, del: counts.del })
  }
  if (tool === 'Bash' && typeof input.command === 'string') {
    r.commandCount++
    r.commits += countCommits(input.command)
    if (r.commands.length < MAX_COMMANDS) r.commands.push(clip(oneLine(input.command), 300))
  }
  if ((tool === 'Agent' || tool === 'Task') && r.agents.length < MAX_AGENTS) r.agents.push({ name: str(input.name) || str(input.subagent_type) || 'agent', task: oneLine(str(input.description)) })
  if (tool === 'TaskCreate' || tool === 'TaskUpdate') {
    const id = tool === 'TaskCreate' ? str(obj(obj(result).task).id) || String(obj(obj(result).task).id ?? '') : str(input.taskId)
    if (id) {
      const known = r.tasks.find(x => x.id === id)
      const status = ['pending', 'in_progress', 'completed'].includes(str(input.status)) ? input.status : known?.status ?? 'pending'
      if (str(input.status) === 'deleted') r.tasks = r.tasks.filter(x => x.id !== id)
      else if (known) Object.assign(known, { status, ...(str(input.subject) && { title: str(input.subject) }) })
      else if (r.tasks.length < MAX_TASKS) r.tasks.push({ id, title: str(input.subject) || `task ${id}`, status })
    }
  }
  if (MILESTONES_TOOL.test(tool) && Array.isArray(input.milestones)) {
    r.milestones = readMilestones(input.milestones)
    r.milestonesFrom = 'milestones'
    const objective = oneLine(str(input.objective))
    if (objective) r.objective = clip(objective, 300)
  }
  if (PROGRESS_TOOL.test(tool)) progressed(r, input)
}

// ---- reading a transcript ----

const promptOf = o => {
  const c = obj(o.message).content
  if (typeof c === 'string') return c
  return Array.isArray(c) ? c.filter(b => obj(b).type === 'text').map(b => str(b.text)).join('\n') : ''
}
const commandLine = text => {
  const name = /<command-name>([^<]*)<\/command-name>/.exec(text)?.[1]?.trim()
  if (!name) return undefined
  const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1]?.trim()
  return `${name.startsWith('/') ? name : '/' + name}${args ? ' ' + args : ''}`
}
const resultText = block => {
  const c = obj(block).content
  return typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => obj(b).type === 'text').map(b => str(b.text)).join('\n') : ''
}

// One pass over the entries in order. A prompt you typed starts a request and its turn; a message you sent while
// a turn ran (queued_command) is answered by that turn; a background notification's turn is more work for the
// latest request; the turn ends at Claude Code's turn_duration record, an interruption, or the next prompt.
export function readTranscript(entries, { now = Date.now() } = {}) {
  const meta = { aiTitle: '', customTitle: '', summary: '', cwd: '', branch: '', startedAt: 0, updatedAt: 0, costUsd: undefined, version: '' }
  const requests = []
  const tools = new Map()
  let turn, latest, turnSeq = 0
  const at = o => time(o.timestamp)
  const startTurn = (whenAt, forRequests) => {
    turn = { id: `t${++turnSeq}`, at: whenAt, segments: [], requests: forRequests }
    for (const r of forRequests) { r.status = 'in_progress'; r.endedAt = undefined; if (!r.turnIds.includes(turn.id)) r.turnIds.push(turn.id) }
  }
  const endTurn = (reason, whenAt, durationMs) => {
    if (!turn) return
    const lastTool = turn.segments.map(s => s.kind).lastIndexOf('tool')
    const after = turn.segments.slice(lastTool + 1).filter(s => s.kind === 'text').map(s => s.text)
    const answer = clip((after.length ? after.join('\n\n') : turn.segments.filter(s => s.kind === 'text').map(s => s.text).slice(-1).join('')).trim(), MAX_ANSWER)
    const t = { answer, reason, durationMs: Math.max(0, Math.round(durationMs ?? (whenAt - turn.at))), endedAt: whenAt }
    const followUps = answer && reason === 'answer' ? asksOfYou(answer) : undefined
    for (const r of turn.requests) {
      r.status = reason === 'answer' ? 'completed' : reason === 'aborted' ? 'interrupted' : 'failed'
      r.endedAt = whenAt
      r.turns = [...r.turns, t].slice(-MAX_TURNS)
      if (followUps) r.followUps = followUps
    }
    turn = undefined
  }
  const open = (text, whenAt, extra) => {
    const r = newRequest(requests.length + 1, text, whenAt, extra)
    requests.push(r)
    latest = r
    return r
  }
  let lastAt = 0
  for (const o of entries) {
    if (!o || typeof o !== 'object' || o.isSidechain) continue
    const when = at(o)
    if (when) { lastAt = Math.max(lastAt, when); meta.startedAt = meta.startedAt || when; meta.updatedAt = Math.max(meta.updatedAt, when) }
    if (!meta.cwd && str(o.cwd)) meta.cwd = o.cwd
    if (str(o.gitBranch)) meta.branch = o.gitBranch
    if (str(o.version)) meta.version = o.version
    switch (o.type) {
      case 'ai-title': if (str(o.aiTitle)) meta.aiTitle = o.aiTitle; continue
      case 'custom-title': if (str(o.customTitle)) meta.customTitle = o.customTitle; continue
      case 'summary': if (str(o.summary)) meta.summary = o.summary; continue
      case 'cost-state': if (typeof o.totalCostUSD === 'number') meta.costUsd = o.totalCostUSD; continue
      case 'system':
        if (o.subtype === 'turn_duration') endTurn('answer', when || lastAt, num(o.durationMs) || undefined)
        continue
      case 'attachment': {
        const a = obj(o.attachment)
        if (a.type !== 'queued_command') continue
        const kind = obj(a.origin).kind
        if (kind === 'human') {
          const r = open(str(a.prompt), when || lastAt, turn ? { foldedInto: turn.requests[0]?.id } : {})
          if (turn) { turn.requests.push(r); r.turnIds.push(turn.id) } else startTurn(when || lastAt, [r])
        } else if (!turn && latest) startTurn(when || lastAt, [latest])
        continue
      }
      case 'assistant': {
        const content = obj(o.message).content
        if (!Array.isArray(content)) continue
        if (!turn && latest) startTurn(when || lastAt, [latest])
        for (const b of content) {
          if (b?.type === 'text' && str(b.text).trim() && turn) turn.segments.push({ kind: 'text', text: b.text })
          if (b?.type === 'tool_use') {
            if (turn) turn.segments.push({ kind: 'tool' })
            tools.set(b.id, { name: str(b.name), input: obj(b.input), request: turn?.requests[0] })
          }
        }
        continue
      }
      case 'user': {
        const content = obj(o.message).content
        if (Array.isArray(content) && content.some(b => b?.type === 'tool_result')) {
          for (const b of content) {
            if (b?.type !== 'tool_result') continue
            const t = tools.get(b.tool_use_id)
            if (!t?.request) continue
            addWork(t.request, t.name, t.input, { isError: b.is_error === true, text: resultText(b), result: o.toolUseResult })
            tools.delete(b.tool_use_id)
          }
          continue
        }
        if (o.isMeta || o.isCompactSummary) continue
        const text = promptOf(o)
        if (/^\[Request interrupted by user/.test(text.trim())) { endTurn('aborted', when || lastAt); continue }
        const kind = obj(o.origin).kind
        const command = commandLine(text)
        if (kind === 'human' || (kind === undefined && !command && !/^</.test(text.trim()) && !/^This session is being continued/.test(text) && text.trim())) {
          endTurn('answer', when || lastAt)
          startTurn(when || lastAt, [open(command ?? text, when || lastAt, command ? { command: true } : {})])
        } else if (!turn && latest && (kind === 'task-notification' || kind === 'scheduled-trigger' || kind === 'peer' || kind === 'plugin')) startTurn(when || lastAt, [latest])
        continue
      }
    }
  }
  // a turn still open: a session at work if the transcript is fresh (its requests say since when), else one that was cut off
  if (turn && now - lastAt > LIVE_MS) endTurn('aborted', lastAt)
  else if (turn) for (const r of turn.requests) r.runningSince = turn.at
  for (const r of requests) if (r.status === 'completed' && !r.turns.length) r.status = 'interrupted'
  return { meta, requests, live: Boolean(turn) }
}

export function readJsonl(text) {
  const out = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try { out.push(JSON.parse(line)) } catch {}
  }
  return out
}

// ---- glowup's own list, when it kept one ----

function glowupList(config, sid) {
  try {
    const o = JSON.parse(fs.readFileSync(requestsFile(config, sid), 'utf8'))
    if (!o || typeof o.format !== 'number' || o.format > 1 || !Array.isArray(o.list)) return undefined
    return o.list.filter(r => r && typeof r.id === 'string' && typeof r.n === 'number').map(r => ({
      ...r, files: Array.isArray(r.files) ? r.files : [], commands: Array.isArray(r.commands) ? r.commands : [], turns: Array.isArray(r.turns) ? r.turns : [],
      agents: Array.isArray(r.agents) ? r.agents : [], tasks: Array.isArray(r.tasks) ? r.tasks : [], milestones: Array.isArray(r.milestones) ? r.milestones : [], asked: Array.isArray(r.asked) ? r.asked : [],
      // a list glowup saved while a turn ran, read now, was cut off unless the session is still at work
      status: r.status === 'pending' ? 'interrupted' : r.status,
    }))
  } catch { return undefined }
}

// ---- writing ----

const hashOf = p => crypto.createHash('sha1').update(p).digest('hex').slice(0, 16)
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value))
  fs.renameSync(tmp, file)
}

// The markdown files a session created, each linked under files/ so the dashboard can fetch it.
function markdownOf(requests, out) {
  const seen = new Map()
  for (const r of requests) for (const f of r.files) {
    if (f.how !== 'new' || !/\.(md|markdown)$/i.test(f.path) || seen.has(f.path) || seen.size >= MAX_MD) continue
    let exists = false
    try { exists = fs.statSync(f.path).isFile() } catch {}
    const hash = hashOf(f.path)
    if (exists) {
      const link = path.join(out, 'files', `${hash}.md`)
      fs.mkdirSync(path.dirname(link), { recursive: true })
      try { if (fs.readlinkSync(link) !== f.path) { fs.unlinkSync(link); fs.symlinkSync(f.path, link) } } catch { try { fs.unlinkSync(link) } catch {} fs.symlinkSync(f.path, link) }
    }
    seen.set(f.path, { path: f.path, name: path.basename(f.path), request: r.n, exists, ...(exists && { href: `sessions-data/files/${hash}.md` }) })
  }
  return [...seen.values()]
}

export function buildSession({ config, out, file, sid, project, now = Date.now(), stat }) {
  const { meta, requests: fromTranscript, live } = readTranscript(readJsonl(fs.readFileSync(file, 'utf8')), { now })
  const kept = glowupList(config, sid)
  const requests = kept?.length ? kept : fromTranscript
  const name = oneLine(meta.customTitle || meta.aiTitle || meta.summary || requestTitle(fromTranscript[0] ?? { text: '' }) || sid)
  const md = markdownOf(requests, out)
  const session = {
    format: FORMAT, id: sid, name: clip(name, 200), project, cwd: meta.cwd, branch: meta.branch, startedAt: meta.startedAt, updatedAt: meta.updatedAt || stat.mtimeMs,
    live, costUsd: meta.costUsd, version: meta.version, from: kept?.length ? 'glowup' : 'transcript', requests, markdown: md,
    source: { size: stat.size, mtimeMs: stat.mtimeMs, glowupMtimeMs: glowupStamp(config, sid) },
  }
  writeJson(path.join(out, 'sessions', `${sid}.json`), session)
  return session
}

function glowupStamp(config, sid) {
  try { return fs.statSync(requestsFile(config, sid)).mtimeMs } catch { return 0 }
}

const SID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function build({ config, out, now = Date.now(), full = false }) {
  const projects = path.join(config, 'projects')
  const index = []
  const alive = new Set()
  let built = 0
  for (const project of fs.existsSync(projects) ? fs.readdirSync(projects) : []) {
    const dir = path.join(projects, project)
    let names = []
    try { names = fs.readdirSync(dir) } catch { continue }
    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue
      const sid = name.slice(0, -'.jsonl'.length)
      if (!SID.test(sid)) continue
      const file = path.join(dir, name)
      let stat
      try { stat = fs.statSync(file) } catch { continue }
      alive.add(sid)
      const target = path.join(out, 'sessions', `${sid}.json`)
      let session
      if (!full) {
        try {
          const old = JSON.parse(fs.readFileSync(target, 'utf8'))
          // unchanged, and not a session that was at work when it was last read
          if (old.format === FORMAT && old.source?.size === stat.size && old.source?.mtimeMs === stat.mtimeMs && old.source?.glowupMtimeMs === glowupStamp(config, sid) && !(old.live && now - old.updatedAt > LIVE_MS)) session = old
        } catch {}
      }
      if (!session) {
        try { session = buildSession({ config, out, file, sid, project, now, stat }); built++ } catch (err) { process.stderr.write(`sidequest-sessions: ${sid}: ${err?.message ?? err}\n`); continue }
      }
      const rs = session.requests
      const last = rs.at(-1)
      // a session with nothing asked and no title (one opened and closed) is left out
      if (!rs.length && session.name === sid) continue
      index.push({
        id: sid, name: session.name, project, cwd: session.cwd, branch: session.branch, startedAt: session.startedAt, updatedAt: session.updatedAt, live: session.live,
        requests: rs.length, done: rs.filter(r => r.status === 'completed').length, working: rs.filter(r => r.status === 'in_progress').length,
        lastPrompt: last ? clip(requestTitle(last), 200) : '', markdown: session.markdown.length, costUsd: session.costUsd, from: session.from,
      })
    }
  }
  // sessions whose transcript is gone, and links to files nothing names any more
  const sessionsDir = path.join(out, 'sessions')
  for (const f of fs.existsSync(sessionsDir) ? fs.readdirSync(sessionsDir) : []) if (f.endsWith('.json') && !alive.has(f.slice(0, -5))) fs.rmSync(path.join(sessionsDir, f), { force: true })
  const named = new Set()
  for (const f of fs.existsSync(sessionsDir) ? fs.readdirSync(sessionsDir) : []) {
    try { for (const m of JSON.parse(fs.readFileSync(path.join(sessionsDir, f), 'utf8')).markdown ?? []) if (m.href) named.add(path.basename(m.href)) } catch {}
  }
  const filesDir = path.join(out, 'files')
  for (const f of fs.existsSync(filesDir) ? fs.readdirSync(filesDir) : []) if (!named.has(f)) fs.rmSync(path.join(filesDir, f), { force: true })
  index.sort((a, b) => b.updatedAt - a.updatedAt)
  writeJson(path.join(out, 'index.json'), { format: FORMAT, generatedAt: now, sessions: index })
  return { sessions: index.length, built }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const config = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  const out = process.env.SIDEQUEST_SESSIONS_DATA || path.join(config, 'sidequest-sessions', 'data')
  const r = build({ config, out, full: process.argv.includes('--full') })
  if (!process.argv.includes('--quiet')) process.stdout.write(`sidequest-sessions: ${r.sessions} sessions, ${r.built} rebuilt -> ${out}\n`)
}
