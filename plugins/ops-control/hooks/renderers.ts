import type { Seg } from './segs.ts'
import type { Model } from './model.ts'
import { isUnsafe } from './themes.ts'
import { liveLimit, resetIn } from './fields.ts'

// What a renderer plugin hands back through $.ops.field, .meter and .divider. It is another
// plugin's data, so everything is checked here before it reaches a tree: Claude Code refuses a
// whole tree over one bad Text, which would blank the pane, not just the renderer's part.

export const MAX_FRAMES = 120
const MAX_SEGS = 400
const MAX_TEXT = 400
const HEX = /^#[0-9a-fA-F]{6}$/

export type Frames = { ms: number; frames: Seg[][][] }
export type Divider = { left: Seg[]; fill: Seg; right: Seg[] }
export type Window = { label: string; usedPercent: number; reset: string }

const obj = (v: unknown): Record<string, unknown> | undefined => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined

function seg(v: unknown, fallback: string): Seg | undefined {
  const o = obj(v)
  if (!o || typeof o.text !== 'string') return undefined
  const text = [...o.text].filter(c => !isUnsafe(c.codePointAt(0)!)).slice(0, MAX_TEXT).join('')
  const color = typeof o.color === 'string' && HEX.test(o.color) ? o.color : fallback
  return o.bold === true ? { text, color, bold: true } : { text, color }
}

function segs(v: unknown, fallback: string): Seg[] | undefined {
  if (!Array.isArray(v) || v.length > MAX_SEGS) return undefined
  const out: Seg[] = []
  for (const s of v) { const c = seg(s, fallback); if (!c) return undefined; out.push(c) }
  return out
}

export function cleanRows(v: unknown, max: number, fallback: string): Seg[][] | null {
  if (!Array.isArray(v) || !v.length) return null
  const out: Seg[][] = []
  for (const r of v.slice(0, max)) { const c = segs(r, fallback); if (!c) return null; out.push(c) }
  return out
}

export function cleanFrames(v: unknown, rows: number, fallback: string): Frames | null {
  const o = obj(v)
  if (!o || typeof o.ms !== 'number' || !Number.isFinite(o.ms) || !Array.isArray(o.frames) || !o.frames.length) return null
  const frames: Seg[][][] = []
  for (const f of o.frames.slice(0, MAX_FRAMES)) {
    if (!Array.isArray(f)) return null
    // the bottom rows are the ones a short pane shows (fieldTail)
    const c = cleanRows(f.slice(-rows), rows, fallback)
    if (!c) return null
    frames.push(c)
  }
  return { ms: Math.max(40, Math.min(2000, Math.round(o.ms))), frames }
}

export function cleanDivider(v: unknown, fallback: string): Divider | null {
  const o = obj(v)
  const left = segs(o?.left, fallback), right = segs(o?.right, fallback), fill = seg(o?.fill, fallback)
  // the fill is repeated to the row's width, so it must be exactly one cell
  if (!left || !right || !fill || [...fill.text].length !== 1) return null
  return { left, fill, right }
}

export const fieldTail = (frame: Seg[][], rows: number): Seg[][] => rows > 0 ? frame.slice(-rows) : []

// Claude Code refuses a Client whose props serialize past 100,000 characters, and with it ops-control's
// whole pane tree. Only the rows on show are sent; past the budget every other frame goes and each
// stays up twice as long, so the loop keeps its speed.
export const PROPS_BUDGET = 90_000
export function fitField(f: Frames, rows: number): Frames | null {
  let frames = f.frames.map(fr => fieldTail(fr, rows)), ms = f.ms
  while (JSON.stringify(frames).length > PROPS_BUDGET) {
    if (frames.length === 1) return null
    frames = frames.filter((_, i) => i % 2 === 0)
    ms = Math.min(2000, ms * 2)
  }
  return { ms, frames }
}

export function meterWindows(m: Model, now: number, tzOffset: number): Window[] {
  return ([['five_hour', '5h'], ['seven_day', 'wk']] as const).flatMap(([kind, label]) => {
    const w = liveLimit(m, kind, now)
    return w ? [{ label, usedPercent: Math.round(w.percentUsed), reset: resetIn(w.resetsAt, now, tzOffset).trim() }] : []
  })
}
