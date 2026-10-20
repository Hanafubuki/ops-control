import type { ClientSurface } from 'claude-code'
import { renderSegs, type Seg } from '../layout.tsx'
import { fieldFrame, fieldTickMs } from '../effects.ts'
import type { Colors } from '../themes.ts'
import type { Field } from '../packs.ts'

// Either a renderer plugin's frames (ops.field), checked and cut to the open rows, played
// every ms; or a built-in shape, drawn fresh each tick from the time, so it never loops or stutters.
export type FieldClientProps = { reduced: boolean } & (
  | { frames: Seg[][][]; ms: number }
  | { live: { cols: number; rows: number; colors: Colors; field: Field } }
)
// i counts ticks; at is when the timer started; ms the period it was started with. rows is the
// live frame on screen and key what it was drawn for. The frame is computed on the tick alone:
// the pane hands over fresh props whenever it redraws, and drawing then only repaints rows.
type FieldState = { i: number; at: number; ms: number; stop?: () => void; rows?: Seg[][]; key?: string; props: FieldClientProps }

// The tests move time with this; Date.now is read-only in the test sandbox.
export const clock = { now: () => Date.now() }

const liveKey = (p: FieldClientProps) => ('live' in p ? JSON.stringify([p.live, p.reduced]) : '')
function draw(st: FieldState, now: number): FieldState {
  const p = st.props
  if (!('live' in p)) return st
  const { cols, rows, colors, field } = p.live
  return { ...st, rows: fieldFrame(cols, rows, colors, p.reduced ? 0 : (now - st.at) / 1000, field), key: liveKey(p) }
}

export default function FieldClient(props: FieldClientProps, surface: ClientSurface<FieldState>) {
  const { Box } = surface.elements
  const ms = 'frames' in props ? props.ms : fieldTickMs(props.live.field)
  let st = surface.state
  if (!st || st.ms !== ms || (props.reduced && st.stop)) {
    st?.stop?.()
    st = draw({ i: 0, at: clock.now(), ms, props }, clock.now())
    if (!props.reduced) {
      st.stop = surface.every(ms, () => {
        const cur = surface.state
        if (cur) surface.setState(draw({ ...cur, i: cur.i + 1 }, clock.now()))
      })
    }
    surface.setState(st)
  } else if (st.props !== props) {
    // the timer reads the newest props; a new size or palette redraws now rather than next tick
    st.props = props
    if (st.key !== liveKey(props)) { st = draw(st, clock.now()); surface.setState(st) }
  }
  const rows = 'frames' in props ? props.frames[st.i % props.frames.length] ?? [] : st.rows ?? []
  return <Box flexDirection="column">{rows.map((r, i) => renderSegs(surface.elements, r, 'f' + i))}</Box>
}
