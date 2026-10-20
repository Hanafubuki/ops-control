// JSX-free: the pane draws the same row the seek bar Client draws, so a surface without Clients still shows the bar.
import type { Seg } from '../segs.ts'
import { extrapolate } from './parse.ts'

export type BarColors = { text: string; accent: string; faint: string; dim: string }
// cols is the width the pane gave the Client, used until surface.columns is laid out
export type SeekBarProps =
  | { kind: 'progress'; cols: number; progressMs: number; readAt: number; durationMs: number; playing: boolean; colors: BarColors }
  | { kind: 'volume'; cols: number; level: number; colors: BarColors }

export const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

export const nowValue = (p: SeekBarProps, now: number) => (p.kind === 'progress' ? extrapolate(p.progressMs, p.readAt, p.durationMs, p.playing, now) : p.level)

// The labels take their width from the value shown, so a click is measured against the row on screen.
function frame(p: SeekBarProps, cols: number, value: number) {
  // ⏸ has emoji presentation in some terminals and fonts, which draws two cells and pushes the box border out
  const left = p.kind === 'progress' ? `${p.playing ? '▶' : '‖'} ${mmss(value)} ` : 'vol '
  const right = p.kind === 'progress' ? (p.durationMs > 0 ? ` ${mmss(p.durationMs)}` : '') : ` ${String(Math.round(value * 100)).padStart(3)}%`
  return { left, right, bar: Math.max(4, cols - left.length - right.length) }
}

export function barRow(p: SeekBarProps, cols: number, value: number): Seg[] {
  const { left, right, bar } = frame(p, cols, value)
  const total = p.kind === 'progress' ? p.durationMs : 1
  const done = total > 0 ? Math.round(bar * Math.min(1, Math.max(0, value / total))) : 0
  return [{ text: left, color: p.colors.text }, { text: '━'.repeat(done), color: p.colors.accent }, { text: '─'.repeat(bar - done), color: p.colors.faint }, { text: right, color: p.colors.dim }]
}

// x is a column with its fraction (fine.x, or the cell's middle). Undefined for a track of unknown length.
export function valueAt(p: SeekBarProps, cols: number, shown: number, x: number): number | undefined {
  if (p.kind === 'progress' && p.durationMs <= 0) return undefined
  const { left, bar } = frame(p, cols, shown)
  const f = Math.min(1, Math.max(0, (x - left.length) / bar))
  return p.kind === 'progress' ? Math.round(f * p.durationMs) : Math.round(f * 100) / 100
}
