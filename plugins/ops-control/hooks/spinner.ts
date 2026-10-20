// JSX-free: shared by register.tsx and the Client module.
import type { Span } from './color.ts'
import { SPINNERS, spinnerCells, spinnerWordSpans, cellsToSpans, type OrbState, type SpinnerId } from './motion.ts'
import { agentsRunning, type Model } from './model.ts'
import type { Look } from './packs.ts'

export type SpinInput = { word: string; turnAt: number; detail: string; state: OrbState }

// The slice of Look that spinnerLine reads. Client props are JSON under 100,000 characters,
// and a whole Look carries the theme's spinner words and glyph tables.
export type SpinLook = {
  bg: string
  gradient?: [string, string]
  motion: { spinner: SpinnerId; shimmer: 0 | 1 | 2; color: string }
  theme: { colors: { text: string; accent: string; dim: string; read: string; agent: string } }
}
export type SpinnerProps = { look: SpinLook; input: SpinInput; reduced: boolean }

export function orbStateOf(m: Model): OrbState {
  if (m.act.tone === 'agent' || (!m.working && agentsRunning(m))) return 'agents'
  if (m.act.glyph === '⌕') return 'search'
  if (m.act.tone === 'edit') return 'work'
  if (m.act.tone === 'shell' || m.act.tone === 'pass' || m.act.tone === 'fail') return 'run'
  return 'think'
}

export const usesOwnSpinner = (look: Look, reduced: boolean, message: string | null) =>
  !reduced && message === null && look.motion.spinner !== 'stock'

export function elapsed(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

export function spinnerLine(look: SpinLook, input: SpinInput, now: number): { badge: Span[][]; word: Span[]; tail: string; detail?: string } {
  const { spinner, color } = look.motion
  const c = look.theme.colors
  const t = now - input.turnAt
  const word = input.word + '…'
  const badge = cellsToSpans(spinnerCells(spinner, t, { color, bg: look.bg, fg: c.text, wordLen: [...word].length }, input.state))
  const spans = spinnerWordSpans(look, word, now, { t, st: input.state })
  return { badge, word: spans, tail: `(${elapsed(t)} · esc to interrupt)`, ...(SPINNERS[spinner].rows >= 2 ? { detail: input.detail } : {}) }
}

export function spinnerProps(look: Look, input: SpinInput, reduced: boolean): SpinnerProps {
  const { text, accent, dim, read, agent } = look.theme.colors
  return {
    look: { bg: look.bg, ...(look.gradient ? { gradient: look.gradient } : {}), motion: look.motion, theme: { colors: { text, accent, dim, read, agent } } },
    input,
    reduced,
  }
}

// A throw inside a Client unmounts it to a blank region, so the props are drawn once here
// first; undefined means the caller keeps the engine's line.
export function checkedSpinnerProps(look: Look, input: SpinInput, reduced: boolean, now: number): SpinnerProps | undefined {
  try {
    const props = spinnerProps(look, input, reduced)
    spinnerLine(props.look, props.input, now)
    return props
  } catch {
    return undefined
  }
}
