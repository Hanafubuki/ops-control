import type { ClientSurface } from 'claude-code'
import { HOP_MS, KONAMI, CLAWD_ROW, CLAWD_COLOR, SHINY_COLOR, CLAWD_SHEET, BUILTIN_SHEETS, CRITTER_ROW, composeFrame, withLevelOutfit, frameAt, halfBlock, isClawd, mainColor, mirrored, newPlayer, petPalette, petPose, playerFrame, stepPlayer, type PetId, type PetInput, type PetSheet, type PetSpan, type PetTint, type Player } from '../pets.ts'
import { renderSegs, type Seg } from '../layout.tsx'
import { SPEAKER_SHEET } from '../sprites/speaker.ts'

// sheet is present only for a user pet; a built-in is looked up by id. level gates the idle variants; outfit is the level outfit worn.
export type PetClientProps = { pet: PetId; input: PetInput; overlays: string[]; reduced: boolean; compact: boolean; width: number; tint?: PetTint; sheet?: PetSheet; level?: number; outfit?: string }
// now is wall-clock ms, the scale of the model's event times. The fields are mutated in place: the tick and
// the draw share one player, and only a changed picture replaces the state object (which redraws).
// props is the latest the draw saw, for the tick to read; stop cancels the timer.
// sheet is the one the player's clips were cut from; the engine keeps this state across redraws, so a different sheet needs a new player.
// sig is that sheet's content: props are cloned on their way here, so a user pet's sheet is a new object on every pane redraw.
type PetState = { now: number; player: Player; sheet: PetSheet; sig: string; props: PetClientProps; hopAt?: number; stop?: () => void }

const TICK_MS = 83
// a click's hop is the Client's own: the hooks module never hears of it
const poseOf = (st: { hopAt?: number } | undefined, p: PetClientProps, now: number) =>
  st?.hopAt !== undefined && now - st.hopAt >= 0 && now - st.hopAt <= HOP_MS ? 'hop' : petPose(p.input, now)
// The tests move time with this; Date.now is read-only in the test sandbox.
export const clock = { now: () => Date.now() }
export const dice = { rand: () => Math.random() }
const diceOf = (p: PetClientProps) => ({ level: p.level ?? 1, rand: dice.rand })
const quiet = (p: PetClientProps) => p.reduced || p.compact
const cols = (surface: ClientSurface<PetState | number>, p: PetClientProps) => (surface.columns > 0 ? surface.columns : p.width)
const sheetOf = (p: PetClientProps) => p.sheet ?? (Object.hasOwn(BUILTIN_SHEETS, p.pet) ? BUILTIN_SHEETS[p.pet] : undefined) ?? CLAWD_SHEET
function resheet(st: PetState, sheet: PetSheet) {
  if (st.sheet === sheet) return
  st.sheet = sheet
  const sig = JSON.stringify(sheet)
  if (sig === st.sig) return
  st.sig = sig
  st.player = newPlayer()
}
// The prop follows the animation on screen, not the pose asked for, so it changes with the exit frame.
const shownPose = (pl: Player) => (pl.seg && !pl.seg.clip ? pl.seg.pose : undefined)
const SPEAKER_GAP = 1
const speakerCols = SPEAKER_SHEET.w + SPEAKER_GAP
const maxXOf = (surface: ClientSurface<PetState | number>, p: PetClientProps, pl?: Player) =>
  Math.max(0, cols(surface, p) - sheetOf(p).w - (pl && shownPose(pl) === 'dance' ? speakerCols : 0))

const pulse = SPEAKER_SHEET.animations.pulse!
const speakerRows = (now: number) => halfBlock(pulse.frames[frameAt(pulse, now)]!.px, SPEAKER_SHEET.palette)
// The speaker stands on the pet's floor: bottom-aligned, a gap to his right. halfBlock rows are as wide as the sheet.
function beside(pet: PetSpan[][], spk: PetSpan[][]): PetSpan[][] {
  const lift = Math.max(0, pet.length - spk.length)
  return pet.map((r, i) => {
    const s = spk[i - lift]
    return s ? [...r, { text: ' '.repeat(SPEAKER_GAP), color: CLAWD_COLOR }, ...s] : r
  })
}

// A sprite wider than the strip is cut at its right edge here: left to the layout, a too-wide row shrinks every segment and adds an ellipsis.
// Every cell is one column wide (half blocks and spaces).
function cut(segs: Seg[], room: number): Seg[] {
  const out: Seg[] = []
  let left = Math.max(0, room)
  for (const s of segs) {
    if (left <= 0) break
    const text = [...s.text].slice(0, left).join('')
    out.push({ ...s, text })
    left -= [...text].length
  }
  return out
}

// What the eye can tell apart: a new frame, a new clip, a step, a new speaker frame.
const look = (pl: Player, now: number) => `${pl.seg?.name}:${pl.seg?.fi}:${pl.x}:${pl.dir}:${shownPose(pl) === 'dance' ? frameAt(pulse, now) : ''}`

function startClock(surface: ClientSurface<PetState | number>, st: PetState) {
  st.stop = surface.every(TICK_MS, () => {
    const cur = surface.state
    if (typeof cur !== 'object') return
    if (quiet(cur.props)) { cur.stop?.(); cur.stop = undefined; return }
    const sheet = sheetOf(cur.props)
    resheet(cur, sheet)
    const before = look(cur.player, cur.now)
    cur.now = clock.now()
    stepPlayer(cur.player, sheet, poseOf(cur, cur.props, cur.now), cur.now, maxXOf(surface, cur.props, cur.player), diceOf(cur.props))
    if (look(cur.player, cur.now) !== before) surface.setState({ ...cur })
  })
}

export default function PetClient(props: PetClientProps, surface: ClientSurface<PetState | number>) {
  const { Box, Text } = surface.elements
  const st = surface.state
  if (typeof st === 'object') st.props = props
  if (props.compact) {
    const color = props.pet === 'clawd-shiny' ? SHINY_COLOR : isClawd(props.pet) ? props.tint?.body ?? CLAWD_COLOR : mainColor(sheetOf(props))
    return <Box><Text color={color}>{isClawd(props.pet) ? CLAWD_ROW : CRITTER_ROW}</Text></Box>
  }

  const sheet = sheetOf(props)
  let now: number, player: Player
  if (typeof st === 'object') {
    resheet(st, sheet)
    now = st.now
    player = st.player
    if (!st.stop && !props.reduced) startClock(surface, st)
  } else {
    now = typeof st === 'number' ? st : clock.now()
    player = newPlayer()
    if (st === undefined && !props.reduced) {
      const fresh: PetState = { now, player, sheet, sig: JSON.stringify(sheet), props }
      surface.setState(fresh)
      startClock(surface, fresh)
      // keys reach the Client only after the person clicks it; the code is matched here so keystrokes never leave it
      // Not in PetState: the tick and the click replace that object, and a key landing on the old one would be lost.
      const keys: string[] = []
      let told = false
      surface.onPointer(ev => {
        const cur = surface.state
        if (ev.type !== 'down' || typeof cur !== 'object' || quiet(cur.props)) return
        // the click is what gives this Client the keyboard until Esc; the hooks module toasts it
        if (!told) { told = true; surface.post({ click: true }) }
        const t = clock.now()
        // the draw reads cur.now, which only the tick refreshes: without it a draw before the next tick would see the click in its future
        surface.setState({ ...cur, now: t, hopAt: t })
      })
      surface.onKey(ev => {
        const cur = surface.state
        if (typeof cur !== 'object' || quiet(cur.props) || ev.ctrl || ev.meta) return
        // Shift and Caps Lock deliver B and A
        keys.push(ev.key.toLowerCase())
        if (keys.length > KONAMI.length) keys.shift()
        if (keys.join(' ') !== KONAMI.join(' ')) return
        keys.length = 0
        surface.post({ konami: true })
      })
    }
  }

  stepPlayer(player, sheet, poseOf(typeof st === 'object' ? st : undefined, props, now), now, maxXOf(surface, props, player), diceOf(props))
  const pose = shownPose(player)
  const worn = withLevelOutfit(sheet, pose === 'work-dance' ? [...props.overlays, 'headphones'] : props.overlays, props.outfit)
  const rows = halfBlock(composeFrame(sheet, playerFrame(player, now), worn, mirrored(player)), petPalette(sheet, props.pet, props.tint))
  const pad: Seg[] = player.x > 0 ? [{ text: ' '.repeat(player.x), color: CLAWD_COLOR }] : []
  const room = cols(surface, props)
  const drawn = pose === 'dance' ? beside(rows, speakerRows(props.reduced ? 0 : now)) : rows
  return <Box flexDirection="column">{drawn.map((r, i) => renderSegs(surface.elements, cut([...pad, ...r], room), 'p' + i))}</Box>
}
