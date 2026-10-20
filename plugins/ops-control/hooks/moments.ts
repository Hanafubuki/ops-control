import { isBusy, type Ev, type Model } from './model.ts'
import { shortPath } from './events.ts'
import type { BubbleVars } from './bubbles.ts'
import type { Moment } from './lines.ts'

export const LONG_TURN_MS = 300_000
// Longer than the sleep pose's 60 s default: a hello at every prompt after a minute's pause is noise.
export const WELCOME_BACK_MS = 1_800_000
// red: the last main-loop test run of this session failed. The model cannot say: turn-start clears lastTest.
export type MomentState = { red: boolean; moods: readonly Moment[] }

// A working quip: at a main-loop tool call, never in a turn's first seconds, and far apart.
export const QUIP_DELAY_MS = 8_000
export const QUIP_GAP_MS = 45_000
export function quipDue(now: Model, ev: Ev, lastAt: number): boolean {
  return ev.type === 'tool-start' && ev.agentId === undefined && now.working && !now.needsYou
    && now.turnAt !== undefined && ev.at - now.turnAt >= QUIP_DELAY_MS && ev.at - lastAt >= QUIP_GAP_MS
}

export function momentOf(old: Model, now: Model, ev: Ev, s: MomentState): { moment: Moment; vars: BubbleVars } | undefined {
  if (now.needsYou && !old.needsYou) return { moment: 'needs-you', vars: { command: now.needsYou.what.replace(/^approve /, '').split(/\s+/)[0] } }
  if (now.lastTest && now.lastTest.at !== old.lastTest?.at) {
    if (!now.lastTest.passed) {
      const n = /(\d+) tests? failed/.exec(now.act.label)?.[1]
      return { moment: 'fail', vars: { n: n === undefined ? undefined : Number(n) } }
    }
    if (s.red) return { moment: 'green', vars: {} }
  }
  if (ev.type === 'turn-done' && ev.reason === 'answer') {
    const file = now.files[0] && shortPath(now.files[0].path)
    const long = old.turnAt !== undefined && ev.at - old.turnAt >= LONG_TURN_MS && s.moods.includes('long-done')
    return { moment: long ? 'long-done' : 'done', vars: { file } }
  }
  if (ev.type === 'turn-start' && !isBusy(old) && old.actAt > 0 && ev.at - old.actAt >= WELCOME_BACK_MS) return { moment: 'hello', vars: {} }
  if (ev.type === 'compact') return { moment: 'compact', vars: {} }
}
