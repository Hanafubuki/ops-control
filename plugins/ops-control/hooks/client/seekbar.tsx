import type { ClientSurface } from 'claude-code'
import { renderSegs } from '../layout.tsx'
import { barRow, nowValue, valueAt, type SeekBarProps } from '../music/seek.ts'

// Tests swap now; everything else reads it through here.
export const clock = { now: () => Date.now() }
const TICK_MS = 500
// After a release the bar shows the chosen value until a read confirms it, or this long.
const HOLD_MS = 3000
const STEP = 0.05

// mark is the readAt (or the level) the hold was made against: props with another mark are a newer read.
type Held = { value: number; at: number; mark: number }
type SeekState = { props: SeekBarProps; now: number; drag?: number; held?: Held }

const markOf = (p: SeekBarProps) => (p.kind === 'progress' ? p.readAt : p.level)

function shown(st: SeekState, now: number): number {
  const p = st.props
  if (st.drag !== undefined) return st.drag
  const h = st.held
  if (h && now - h.at < HOLD_MS && markOf(p) === h.mark) return p.kind === 'progress' && p.playing ? Math.min(h.value + (now - h.at), p.durationMs) : h.value
  return nowValue(p, now)
}

// The bar moves on the surface's own clock, so the hooks redraw the pane only when the track or its state changes.
export default function SeekBarClient(props: SeekBarProps, surface: ClientSurface<SeekState>) {
  const cur = surface.state
  // In place: setState during render would schedule another render, and the pointer and tick handlers need the latest props.
  if (cur) cur.props = props
  else {
    surface.setState({ props, now: clock.now() })
    // A paused bar redraws once, to drop a hold that ran out or that a newer read replaced, then stops.
    if (props.kind === 'progress') surface.every(TICK_MS, () => {
      const st = surface.state
      if (!st || st.props.kind !== 'progress' || st.drag !== undefined) return
      const now = clock.now()
      const live = st.held !== undefined && now - st.held.at < HOLD_MS && markOf(st.props) === st.held.mark
      if (st.held && !live) surface.setState({ ...st, now, held: undefined })
      else if (st.props.playing) surface.setState({ ...st, now })
    })
    surface.onPointer(ev => {
      const st = surface.state
      if (!st) return
      const now = clock.now()
      const v = valueAt(st.props, surface.columns || st.props.cols, shown(st, now), ev.fine?.x ?? ev.x + 0.5)
      if (ev.type === 'down') { if (ev.button === 'left' && v !== undefined) surface.setState({ ...st, now, drag: v }); return }
      if (st.drag === undefined) return
      if (ev.type === 'move' && v !== undefined && v !== st.drag) surface.setState({ ...st, now, drag: v })
      else if (ev.type === 'up') {
        const value = v ?? st.drag
        surface.post(st.props.kind === 'progress' ? { kind: 'seek', ms: value } : { kind: 'volume', level: value })
        surface.setState({ ...st, now, drag: undefined, held: { value, at: now, mark: markOf(st.props) } })
      }
    })
    // keys reach a Client only after a click on it
    if (props.kind === 'volume') surface.onKey(ev => {
      const st = surface.state
      if (!st || (ev.key !== 'left' && ev.key !== 'right')) return
      const now = clock.now()
      const level = Math.round(Math.min(1, Math.max(0, shown(st, now) + (ev.key === 'right' ? STEP : -STEP))) * 100) / 100
      surface.post({ kind: 'volume', level })
      surface.setState({ ...st, now, held: { value: level, at: now, mark: markOf(st.props) } })
    })
  }
  const st = surface.state ?? { props, now: clock.now() }
  return renderSegs(surface.elements, barRow(props, surface.columns || props.cols, shown({ ...st, props }, st.now)), 'bar')
}
