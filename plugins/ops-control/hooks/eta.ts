// How long the work still needs, guessed from its pace: the time from the first milestone's start to the last one's
// finish, per milestone finished, times the ones still open. The one at work counts less what it has already run, but
// never less than a share of the pace. Work with no steps goes by how long past requests ran instead, this session's
// and earlier ones'.
// A guess, never a promise. JSX-free and engine-free, so it tests on any clock.
import { loadSaved, workedMs, type Milestone, type MilestoneStatus, type Request, type Requests } from './requests.ts'

// from: the work's own pace, or how long the session's past requests ran (a looser guess, drawn dim)
export type Eta = { kind: 'left'; ms: number; from?: 'history' } | { kind: 'unknown' }

const OPEN: readonly MilestoneStatus[] = ['pending', 'in_progress', 'verifying']
const HELD: readonly MilestoneStatus[] = ['waiting', 'blocked']
// a milestone that runs past the pace still has at least this share of it left
const FLOOR = 0.2

// undefined: nothing to time, all done, or the work waits (the headline says on what).
export function eta(steps: readonly Milestone[], now: number): Eta | undefined {
  const open = steps.filter(s => OPEN.includes(s.status))
  if (!open.length || steps.some(s => HELD.includes(s.status))) return undefined
  const done = steps.filter(s => s.status === 'completed' && s.doneAt !== undefined)
  const starts = steps.flatMap(s => (s.startedAt === undefined ? [] : [s.startedAt]))
  if (!done.length || !starts.length) return { kind: 'unknown' }
  const pace = Math.max(0, Math.max(...done.map(s => s.doneAt!)) - Math.min(...starts)) / done.length
  if (pace <= 0) return { kind: 'unknown' }
  const ms = open.reduce((sum, s) => {
    const running = s.status !== 'pending' && s.startedAt !== undefined
    return sum + (running ? Math.max(pace * FLOOR, pace - (now - s.startedAt!)) : pace)
  }, 0)
  return { kind: 'left', ms }
}

// fewer finished requests than this tell nothing about how long one runs
const MIN_PAST = 3

// the newest durations kept from earlier sessions
export const MAX_EARLIER = 500
const finished = (r: Request) => r.status === 'completed' && !r.command && !r.foldedInto

// How long each finished request in a saved session file worked; nothing for a file that does not read.
export function savedDurations(raw: unknown): number[] {
  try {
    const rs = loadSaved(raw)
    return rs.list.filter(finished).map(r => workedMs(r, rs, 0)).filter(ms => ms > 0)
  } catch { return [] }
}

// Work with no steps: of the finished requests, this session's and `earlier` ones (savedDurations), that ran longer
// than this one has so far, the middle one's time, less what this one has run. undefined while no request is at work.
export function historyEta(rs: Requests, now: number, earlier: readonly number[] = []): Eta | undefined {
  const cur = rs.active ? rs.list.find(r => r.id === rs.active) : undefined
  if (!cur) return undefined
  const ran = workedMs(cur, rs, now)
  const past = [...earlier, ...rs.list.filter(r => r !== cur && finished(r)).map(r => workedMs(r, rs, now)).filter(ms => ms > 0)]
  const longer = past.filter(ms => ms > ran).sort((a, b) => a - b)
  if (past.length < MIN_PAST || !longer.length) return { kind: 'unknown' }
  return { kind: 'left', ms: longer[Math.floor(longer.length / 2)]! - ran, from: 'history' }
}

// The request at work keeps the first guess the work bar gave it, so it can be set against how long it really
// worked. A guess from past requests gives way once to the first one from the request's own milestones: that one
// knows the work itself. Slash commands are not timed.
export function noteEta(rs: Requests, now: number, earlier: readonly number[] = []): Requests {
  const cur = rs.active ? rs.list.find(r => r.id === rs.active) : undefined
  if (!cur || cur.command || (cur.eta && cur.eta.from !== 'history')) return rs
  const own = cur.milestones.length ? eta(cur.milestones, now) : undefined
  const guess = own?.kind === 'left' ? own : cur.eta ? undefined : historyEta(rs, now, earlier)
  if (guess?.kind !== 'left') return rs
  const after = Math.round(workedMs(cur, rs, now))
  const noted = { ms: after + Math.round(guess.ms), after, ...(guess.from && { from: guess.from }) }
  return { ...rs, list: rs.list.map(r => (r === cur ? { ...r, eta: noted } : r)) }
}
