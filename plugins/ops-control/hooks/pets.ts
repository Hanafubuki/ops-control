// JSX-free: the docs site imports it.
import { CLAWD_SHEET } from './sprites/clawd.ts'
import { CRT_SHEET } from './sprites/crt.ts'
import { EGG0_SHEET } from './sprites/egg0.ts'
import { GHOST_SHEET } from './sprites/ghost.ts'
import { EGG1_SHEET } from './sprites/egg1.ts'
import { EGG2_SHEET } from './sprites/egg2.ts'
import { EGG3_SHEET } from './sprites/egg3.ts'
import { LELOUCH_SHEET } from './sprites/lelouch.ts'
import { SHIKAMARU_SHEET } from './sprites/shikamaru.ts'
import { GOJO_SHEET } from './sprites/gojo.ts'
import { LEVI_SHEET } from './sprites/levi.ts'
import { crackStage, type EggStore } from './eggs.ts'
import type { PetLines } from './lines.ts'
import { LEVEL_OUTFITS } from './levels.ts'

export { CLAWD_SHEET }
export const CLAWD_COLOR = '#d77757'
export const SHINY_COLOR = '#f2c94c'
// lelouch, shikamaru, gojo and levi are the name packs' main characters (namepacks.ts)
export type BuiltinPet = 'clawd' | 'clawd-shiny' | 'robot' | 'ghost' | 'egg' | 'lelouch' | 'shikamaru' | 'gojo' | 'levi'
// Built-in ids, or the name of a pet installed under <config>/ops-control/pets.
export type PetSetting = BuiltinPet | 'off' | (string & {})
// `string & {}` stays in the union, so the type cannot exclude 'off'; the pane's render hook checks it.
export type PetId = Exclude<PetSetting, 'off'>
// A sheet may omit 'fail' (plays 'alert'), 'pant-walk' (plays 'walk') and 'work-dance' (plays 'working'). Any other missing pose falls back to idle.
export type Pose = 'idle' | 'walk' | 'working' | 'hop' | 'alert' | 'done' | 'sleep' | 'fail' | 'juggle' | 'scrunch' | 'pant' | 'pant-walk' | 'dance' | 'work-dance'
export type PetSpan = { text: string; color: string; bg?: string }
export type PetKind = 'read' | 'search' | 'edit' | 'shell' | 'agent' | 'plan' | 'think'
// agents is the number of subagents running; ctx the context window's percent used.
// music: Spotify is playing on this machine (not an ad)
export type PetInput = { music?: boolean; working: boolean; kind?: PetKind; needsYou: boolean; lastTest?: { passed: boolean; at: number }; doneAt?: number; doneOk?: boolean; actAt?: number; agents?: number; compactAt?: number; ctx?: number; sleepMs?: number; pantAt?: number; juggleAt?: number }

// Pixel rows of single-char palette keys, '.' = transparent. Two pixel rows make one terminal row.
// head is [x, y] of the top-centre of the head, where outfits anchor; dx is horizontal travel in pixels.
// exit marks a neutral frame: a pose change may cut away from the animation there.
// hand is where held outfits sit; without it they sit four pixels under the head.
export type PetFrame = { px: string[]; dx?: number; head?: [number, number]; exit?: boolean; hand?: [number, number] | null }
export type PetAnim = { loop: boolean; frames: (PetFrame & { ms: number })[] }
// A one-shot clip played between two animations; `from` and `to` are animation names or '*'.
export type PetClip = { from: string; to: string; frames: (PetFrame & { ms: number })[] }
// anchor is the point of the outfit grid that sits on the frame's head (slot "head", the default) or hand
export type PetOutfit = { slot?: 'head' | 'hand'; anchor: [number, number]; px: string[] }
export type PetSheet = {
  w: number
  h: number
  palette: Record<string, string>
  shiny?: Record<string, string>
  animations: Record<string, PetAnim>
  outfits?: Record<string, PetOutfit>
  transitions?: Record<string, PetClip>
  lines?: PetLines
  voice?: string
}

// Rows 13 and 14 of a sheet; optional.
export const IDLE_VARIANTS = ['idle2', 'idle3']
export const PET_COLS = 24
export const PET_ROWS = 6
// hats rise up to 4 px above the canvas
export const OUTFIT_PAD = 4
// Outfits that rise above the canvas and so need OUTFIT_PAD more rows; sweat is a head outfit too, but sits beside the head.
// The level outfits are all hats.
export const HEAD_OUTFITS = ['santa', 'party', 'nightcap', ...new Set(Object.values(LEVEL_OUTFITS).flat())]
// The hats that win the head over a level outfit.
const HATS = ['santa', 'party', 'nightcap', 'headphones']
// overlays plus the level outfit, unless the sheet has a hat among the overlays (a hand outfit or sweat stays beside it).
export const withLevelOutfit = (sheet: PetSheet, overlays: readonly string[], outfit: string | undefined): string[] =>
  outfit && sheet.outfits?.[outfit] && !overlays.some(o => HATS.includes(o) && sheet.outfits?.[o]) ? [...overlays, outfit] : [...overlays]
// Rows the pane gives the pet: half its pixel height, plus the outfit pad while a hat it has is worn.
export const stripRows = (sheet: PetSheet, overlays: readonly string[]) =>
  Math.ceil(sheet.h / 2) + (overlays.some(o => HEAD_OUTFITS.includes(o) && sheet.outfits?.[o]) ? OUTFIT_PAD / 2 : 0)
// the compact pane drawer's one-row Clawd
export const CLAWD_ROW = '▐▛█▜▌'

const ALERT_MS = 1500, DONE_MS = 4000, SCRUNCH_MS = 1500
export const HOP_MS = 1200
export const UNLOCK_JUGGLE_MS = 3000
// ClientKeyEvent names, as the pet Client receives them after a click
export const KONAMI = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'b', 'a']
export const SLEEP_MS = 60_000
export const JUGGLE_AGENTS = 3, PANT_CTX = 80
// the longest a pose change waits for an exit frame
export const EXIT_WAIT_MS = 300

export function petPose(p: PetInput, now: number): Pose {
  if (p.needsYou) return 'alert'
  const t = p.lastTest
  if (t && !t.passed && now - t.at <= ALERT_MS) return 'fail'
  if (t && t.passed && now - t.at <= HOP_MS) return 'hop'
  if (p.compactAt !== undefined && now - p.compactAt >= 0 && now - p.compactAt <= SCRUNCH_MS) return 'scrunch'
  if (p.juggleAt !== undefined && now - p.juggleAt >= 0 && now - p.juggleAt <= UNLOCK_JUGGLE_MS) return 'juggle'
  if (!p.working && p.doneOk && p.doneAt !== undefined && now - p.doneAt <= DONE_MS) return 'done'
  if ((p.agents ?? 0) >= JUGGLE_AGENTS) return 'juggle'
  const tired = (p.ctx ?? 0) >= (p.pantAt ?? PANT_CTX)
  // typing while he writes code, runs commands or has subagents at it; walking while he reads, searches, plans or waits
  if (p.working) return p.music ? 'work-dance' : p.kind === 'edit' || p.kind === 'shell' || p.kind === 'agent' ? 'working' : tired ? 'pant-walk' : 'walk'
  // music keeps him up
  if (p.music) return 'dance'
  // 0 is initialModel's "nothing yet", not a real time
  if (p.actAt !== undefined && p.actAt > 0 && now - p.actAt >= (p.sleepMs ?? SLEEP_MS)) return 'sleep'
  return tired ? 'pant' : 'idle'
}

export const shiny = (palette: Record<string, string>, tint: Record<string, string> = CLAWD_SHEET.shiny ?? {}): Record<string, string> => ({ ...palette, ...tint })
export type PetTint = { body?: string; light?: string; shade?: string }
// shiny is an earned reward, so it wins over a pack's tint
// The tint keys B, L, D are Clawd's; another sheet may use those letters for other parts.
export const petPalette = (sheet: PetSheet, pet: PetId, tint: PetTint = {}): Record<string, string> => {
  if (pet === 'clawd-shiny') return shiny(sheet.palette, sheet.shiny)
  const out = { ...sheet.palette }
  if (pet !== 'clawd') return out
  if (tint.body) out.B = tint.body
  if (tint.light) out.L = tint.light
  if (tint.shade) out.D = tint.shade
  return out
}

// one sheet per crack stage
export const EGG_SHEETS: readonly PetSheet[] = [EGG0_SHEET, EGG1_SHEET, EGG2_SHEET, EGG3_SHEET]
export const eggSheet = (s: EggStore | undefined): PetSheet => EGG_SHEETS[crackStage(s)]!
// Keys match BUILTIN_PET_NAMES in petfile.ts; clawd-shiny is Clawd's sheet with the shiny palette.
export const BUILTIN_SHEETS: Record<string, PetSheet> = { clawd: CLAWD_SHEET, 'clawd-shiny': CLAWD_SHEET, robot: CRT_SHEET, ghost: GHOST_SHEET, egg: EGG0_SHEET, lelouch: LELOUCH_SHEET, shikamaru: SHIKAMARU_SHEET, gojo: GOJO_SHEET, levi: LEVI_SHEET }
export const isClawd = (p: string) => p === 'clawd' || p === 'clawd-shiny'
// The drawer's one-row pet for anything but Clawd, whose own row is CLAWD_ROW.
export const CRITTER_ROW = '▗▟█▙▖'

export function mainColor(sheet: PetSheet): string {
  const n = new Map<string, number>()
  for (const r of sheet.animations.idle?.frames[0]?.px ?? []) for (const k of r) if (k !== '.' && sheet.palette[k]) n.set(k, (n.get(k) ?? 0) + 1)
  const top = [...n].sort((a, b) => b[1] - a[1])[0]
  return top ? sheet.palette[top[0]]! : CLAWD_COLOR
}

type Cell = { text: string; color?: string; bg?: string }

export function halfBlock(px: string[], palette: Record<string, string>): PetSpan[][] {
  const col = (k: string | undefined) => (k === undefined || k === '.' ? undefined : palette[k])
  const rows: PetSpan[][] = []
  for (let y = 0; y < px.length; y += 2) {
    const top = px[y]!, bot = px[y + 1] ?? ''
    const cells: Cell[] = []
    for (let x = 0; x < top.length; x++) {
      const t = col(top[x]), b = col(bot[x])
      if (!t && !b) cells.push({ text: ' ' })
      else if (t && !b) cells.push({ text: '▀', color: t })
      else if (!t && b) cells.push({ text: '▄', color: b })
      else if (t === b) cells.push({ text: '█', color: t })
      else cells.push({ text: '▀', color: t, bg: b })
    }
    // A blank takes the nearest color so it can join a neighbouring run; it never carries a bg.
    let last: string | undefined
    for (const c of cells) { if (c.color) last = c.color; else c.color = last }
    last = undefined
    for (let i = cells.length - 1; i >= 0; i--) { const c = cells[i]!; if (c.color) last = c.color; else c.color = last }
    const out: PetSpan[] = []
    for (const c of cells) {
      const color = c.color ?? '#000000'
      const prev = out.at(-1)
      if (prev && prev.color === color && prev.bg === c.bg) prev.text += c.text
      else out.push(c.bg ? { text: c.text, color, bg: c.bg } : { text: c.text, color })
    }
    rows.push(out)
  }
  return rows
}

export function frameAt(anim: { loop: boolean; frames: { ms: number }[] }, elapsedMs: number): number {
  const total = anim.frames.reduce((n, f) => n + f.ms, 0)
  if (total <= 0) return 0
  let t = anim.loop ? ((elapsedMs % total) + total) % total : Math.max(0, elapsedMs)
  for (let i = 0; i < anim.frames.length; i++) {
    if (t < anim.frames[i]!.ms) return i
    t -= anim.frames[i]!.ms
  }
  return anim.frames.length - 1
}

// A frame with the worn outfits on its head, as pixel rows; unknown names (such as the band's 'friday') are ignored.
export function composeFrame(sheet: PetSheet, fr: PetFrame, overlays: readonly string[], mirror: boolean): string[] {
  const worn = overlays.filter(n => sheet.outfits?.[n])
  const pad = worn.length ? OUTFIT_PAD : 0
  const g: string[][] = []
  for (let y = 0; y < pad; y++) g.push(Array<string>(sheet.w).fill('.'))
  for (const row of fr.px) g.push([...row])
  for (const name of worn) {
    const o = sheet.outfits![name]!
    // held items sit at the frame's hand, which defaults to four pixels below the head
    const at = o.slot === 'hand' ? fr.hand ?? (fr.head && [fr.head[0], fr.head[1] + 4]) : fr.head
    if (at) {
      const ox = at[0] - o.anchor[0], oy = at[1] - o.anchor[1] + pad
      o.px.forEach((row, j) => [...row].forEach((c, k) => {
        const x = ox + k, y = oy + j
        if (c !== '.' && g[y]?.[x] !== undefined) g[y]![x] = c
      }))
    }
  }
  if (mirror) g.forEach(r => r.reverse())
  return g.map(r => r.join(''))
}

// A typo in a palette key would otherwise draw as nothing.
export function validateSheet(sheet: PetSheet): void {
  const known = (k: string) => k === '.' || k in sheet.palette
  const rows = (where: string, px: string[], h: number) => {
    if (px.length !== h) throw new Error(`${where}: ${px.length} pixel rows, want ${h}`)
    for (const r of px) {
      if ([...r].length !== sheet.w) throw new Error(`${where}: a row is ${[...r].length} wide, want ${sheet.w}`)
      for (const k of r) if (!known(k)) throw new Error(`${where}: unknown palette key "${k}"`)
    }
  }
  for (const k of Object.keys(sheet.shiny ?? {})) if (!(k in sheet.palette)) throw new Error(`shiny: unknown palette key "${k}"`)
  for (const [name, a] of Object.entries(sheet.animations)) a.frames.forEach((f, i) => { if (!(f.ms > 0)) throw new Error(`${name}[${i}]: ms must be positive`); rows(`${name}[${i}]`, f.px, sheet.h) })
  for (const [name, c] of Object.entries(sheet.transitions ?? {})) c.frames.forEach((f, i) => { if (!(f.ms > 0)) throw new Error(`${name}[${i}]: ms must be positive`); rows(`transition ${name}[${i}]`, f.px, sheet.h) })
  for (const [name, o] of Object.entries(sheet.outfits ?? {})) if (o.slot !== undefined && o.slot !== 'head' && o.slot !== 'hand') throw new Error(`outfit ${name}: slot must be head or hand`)
  for (const [name, o] of Object.entries(sheet.outfits ?? {})) for (const r of o.px) for (const k of r) if (!known(k)) throw new Error(`outfit ${name}: unknown palette key "${k}"`)
}

// A missing animation falls back: fail to alert, a panting walk to the walk, the working dance to typing, anything else to idle.
const FALLBACK: Record<string, string> = { fail: 'alert', 'pant-walk': 'walk', 'pant-walk-left': 'walk-left', 'work-dance': 'working' }
export const animFor = (sheet: PetSheet, name: string): PetAnim => sheet.animations[name] ?? sheet.animations[FALLBACK[name] ?? ''] ?? sheet.animations.idle!

const clipMs = (c: { frames: { ms: number }[] }) => c.frames.reduce((n, f) => n + f.ms, 0)

type Named = { name: string; clip: PetClip }

// The clips played on the way from animation `from` to pose `to`, in order:
//  - a clip written for exactly that pair plays alone;
//  - otherwise a clip that leaves `from` for the rest pose: the walk's stop only on the way to idle or sleep
//    (a hop or a typing spell starts straight from the stride), sleep's wake-up for anything but alert,
//    which cuts in;
//  - then a clip any animation may enter `to` with ("*" -> sleep "lie-down", "*" -> alert "startle").
function clipsFor(sheet: PetSheet, fromName: string, to: string): Named[] {
  const from = IDLE_VARIANTS.includes(fromName) ? 'idle' : fromName
  const all = Object.entries(sheet.transitions ?? {}).map(([name, clip]) => ({ name, clip }))
  const pair = all.find(c => c.clip.from === from && c.clip.to === to)
  if (pair) return [pair]
  const out: Named[] = []
  const leave = all.find(c => c.clip.from === from && c.clip.to === 'idle')
  if (leave && (from.startsWith('walk') ? to === 'idle' || to === 'sleep' : to !== 'alert')) out.push(leave)
  const enter = all.find(c => c.clip.from === '*' && c.clip.to === to)
  if (enter) out.push(enter)
  return out
}

// What is on screen now: an animation (looped or held) or a transition clip, from `start` on.
// fi is the last frame entered; -1 until the first, so frame 0's dx counts on entry. `to` is the animation
// a clip leaves him in.
type Seg = { pose: string; anim: PetAnim; start: number; fi: number; clip: boolean; name: string; to: string }
// dest is the pose the queued clips were planned for.
export type Player = { seg?: Seg; queue: Named[]; dest?: string; pending?: { pose: string; at: number }; x: number; dir: 1 | -1 }
export const newPlayer = (): Player => ({ queue: [], x: 0, dir: 1 })

// Facing left uses the sheet's own "<pose>-left" animation when it has one (its dx is already negative);
// otherwise the walk is mirrored and dx is signed by the player's direction.
const sideName = (sheet: PetSheet, pose: string, dir: number) => (dir < 0 && sheet.animations[`${pose}-left`] ? `${pose}-left` : pose)
const segOf = (sheet: PetSheet, pose: string, start: number, dir: number, variant?: string): Seg => {
  const name = variant ?? sideName(sheet, pose, dir)
  return { pose, anim: animFor(sheet, name), start, fi: -1, clip: false, name, to: pose }
}
const clipSeg = (pose: string, name: string, clip: PetClip, start: number): Seg => ({ pose, anim: { loop: false, frames: clip.frames }, start, fi: -1, clip: true, name, to: clip.to === '*' ? pose : clip.to })

// True when the frame must be flipped to face left: a left-facing walk with no hand-drawn left animation.
export const mirrored = (p: Player): boolean => p.dir < 0 && !!p.seg && !p.seg.clip && (p.seg.pose === 'walk' || p.seg.pose === 'pant-walk') && !p.seg.name.endsWith('-left')

// Walking x follows the dx of every frame entered, so a slow tick still covers the ground.
function travel(p: Player, s: Seg, t: number, maxX: number, sheet: PetSheet) {
  const idx = frameAt(s.anim, t - s.start), n = s.anim.frames.length
  while (s.fi !== idx) {
    s.fi = (s.fi + 1) % n
    const dx = s.anim.frames[s.fi]!.dx ?? 0
    // with no room to walk there is nothing to bounce off
    if (!dx || maxX <= 0) continue
    p.x += dx * (s.name.endsWith('-left') ? 1 : p.dir)
    const before = p.dir
    if (p.x >= maxX) { p.x = maxX; p.dir = -1 } else if (p.x <= 0) { p.x = 0; p.dir = 1 }
    // the left and right walks share their timing, so the swap keeps the step
    const want = sideName(sheet, s.pose, p.dir), other = sheet.animations[want]
    if (p.dir !== before && !s.clip && want !== s.name && other && other.frames.length === n) { s.name = want; s.anim = other }
  }
  p.x = Math.max(0, Math.min(p.x, maxX))
}

// The last frame of an animation that plays once counts as an exit frame.
const isExit = (a: PetAnim, i: number) => !!a.frames[i]!.exit || (!a.loop && i === a.frames.length - 1)

// Earliest moment within EXIT_WAIT_MS of `since` that the animation shows an exit frame. An animation with
// none marked has nothing to wait for.
function exitAt(s: Seg, since: number): number {
  if (!s.anim.frames.some((_, i) => isExit(s.anim, i))) return since
  for (let t = since; t <= since + EXIT_WAIT_MS; t += 10) if (isExit(s.anim, frameAt(s.anim, t - s.start))) return t
  return since + EXIT_WAIT_MS
}

// level gates the idle variants; rand is injected so tests are deterministic.
export type IdleDice = { level: number; rand: () => number }
const NO_DICE: IdleDice = { level: 1, rand: Math.random }

// One time in eight, an idle variant the level has unlocked and the sheet has: idle2 from level 5, idle3 from level 10.
export function idleVariant(sheet: Pick<PetSheet, 'animations'>, level: number, rand: () => number): string | undefined {
  const open = IDLE_VARIANTS.filter((n, i) => level >= (i ? 10 : 5) && sheet.animations[n])
  if (!open.length || rand() >= 1 / 8) return undefined
  return open[Math.floor(rand() * open.length)]
}

// A pose entered by returning to it: idle may start a variant.
const enter = (sheet: PetSheet, pose: string, start: number, dir: number, dice: IdleDice): Seg =>
  segOf(sheet, pose, start, dir, pose === 'idle' ? idleVariant(sheet, dice.level, dice.rand) : undefined)

// Moves the player to `pose` as of `now`. A change waits for the next exit frame, then plays the clip
// between the two animations when the sheet has one; alert cuts in at once.
export function stepPlayer(p: Player, sheet: PetSheet, pose: string, now: number, maxX: number, dice: IdleDice = NO_DICE): void {
  if (!p.seg) p.seg = segOf(sheet, pose, now, p.dir)
  for (let guard = 0; guard < 4; guard++) {
    const s: Seg = p.seg
    if (s.clip) {
      const end: number = s.start + clipMs(s.anim)
      if (pose === 'alert' && s.pose !== 'alert') { travel(p, s, now, maxX, sheet); play(p, sheet, s.to, 'alert', now, dice); continue }
      if (now < end) break
      travel(p, s, end, maxX, sheet)
      // the pose moved on while clips were queued: plan again from where the clip left him
      if (p.dest !== pose) { play(p, sheet, s.to, pose, end, dice); continue }
      const next = p.queue.shift()
      p.seg = next ? clipSeg(pose, next.name, next.clip, end) : enter(sheet, pose, end, p.dir, dice)
      continue
    }
    if (s.pose === pose) {
      p.pending = undefined
      // a variant plays one loop and hands back to idle at an exit frame
      if (IDLE_VARIANTS.includes(s.name)) {
        const over = s.start + clipMs(s.anim), at = exitAt(s, over)
        if (now >= at) { travel(p, s, at, maxX, sheet); p.seg = segOf(sheet, 'idle', at, p.dir); continue }
      }
      break
    }
    if (pose === 'alert') { travel(p, s, now, maxX, sheet); play(p, sheet, s.name, pose, now, dice); continue }
    // an animation that plays once (hop, fail) runs to its last frame; the pose window only decides what is next
    const over = s.start + clipMs(s.anim)
    if (!s.anim.loop && now < over) break
    if (p.pending?.pose !== pose) p.pending = { pose, at: s.anim.loop ? exitAt(s, now) : over }
    const at = p.pending.at
    if (now < at) break
    travel(p, s, at, maxX, sheet)
    play(p, sheet, s.name, pose, at, dice)
  }
  travel(p, p.seg, now, maxX, sheet)
}

// Starts the way from animation `from` to `pose` at time `at`: the first clip now, the rest queued.
function play(p: Player, sheet: PetSheet, from: string, pose: string, at: number, dice: IdleDice) {
  p.pending = undefined
  p.dest = pose
  p.queue = clipsFor(sheet, from, pose)
  const first = p.queue.shift()
  p.seg = first ? clipSeg(pose, first.name, first.clip, at) : enter(sheet, pose, at, p.dir, dice)
}

export function playerFrame(p: Player, now: number): PetFrame {
  const s = p.seg!
  return s.anim.frames[frameAt(s.anim, now - s.start)]!
}
