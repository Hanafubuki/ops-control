// JSX-free: the docs site and Client modules import it.
import { cellWidth } from './cells.ts'
import { gradient, mix, wave, wave3, type Span } from './color.ts'

export type Cell = { ch: string; fg: string; bg?: string }
export type OrbState = 'think' | 'search' | 'work' | 'run' | 'agents'
export type SpinnerId = 'stock' | 'comet' | 'eyes' | 'orb-states' | 'clawd' | 'shimmer' | 'scanline' | 'ring' | 'glitch' | 'signal'
type Canvas = { w: number; h: number; d: number[] }
type Spec = { name: string; cols: number; rows: number } & (
  | { kind: 'glyph'; frames: string }
  | { kind: 'dots' | 'half'; draw: (cv: Canvas, t: number, st: OrbState) => void; useFg?: boolean }
  | { kind: 'art'; art: string[][] }
  | { kind: 'scan' })
type CellOpts = { color: string; bg: string; fg: string; wordLen?: number }

const CLAWD = '#d77757'
const canvas = (w: number, h: number): Canvas => ({ w, h, d: new Array<number>(w * h).fill(0) })
function plot(cv: Canvas, x: number, y: number, v: number) {
  x = Math.round(x); y = Math.round(y)
  if (x < 0 || y < 0 || x >= cv.w || y >= cv.h) return
  const i = y * cv.w + x
  if (v > cv.d[i]!) cv.d[i] = Math.min(1, v)
}
const put = (cv: Canvas, x: number, y: number, v: number) => { if (x >= 0 && y >= 0 && x < cv.w && y < cv.h) cv.d[y * cv.w + x] = v }
// Eight levels keep a frame to a handful of colors (a Raster holds 1024 pairs).
const level = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 7) / 7

const BITS = [[0x01, 0x02, 0x04, 0x40], [0x08, 0x10, 0x20, 0x80]] as const
function dotCells(cv: Canvas, cols: number, rows: number, col: string, bg: string): Cell[][] {
  const out: Cell[][] = []
  for (let cy = 0; cy < rows; cy++) {
    const r: Cell[] = []
    for (let cx = 0; cx < cols; cx++) {
      let bits = 0, mx = 0
      for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 4; dy++) {
        const v = cv.d[(cy * 4 + dy) * cv.w + cx * 2 + dx]!
        if (v > 0.07) { bits |= BITS[dx]![dy]!; mx = Math.max(mx, v) }
      }
      r.push(bits ? { ch: String.fromCharCode(0x2800 + bits), fg: mix(bg, col, 0.12 + 0.88 * level(mx)) } : { ch: ' ', fg: col })
    }
    out.push(r)
  }
  return out
}
function halfCells(cv: Canvas, cols: number, rows: number, col: string, bg: string): Cell[][] {
  const out: Cell[][] = []
  for (let cy = 0; cy < rows; cy++) {
    const r: Cell[] = []
    for (let cx = 0; cx < cols; cx++) {
      const a = cv.d[cy * 2 * cv.w + cx]!, b = cv.d[(cy * 2 + 1) * cv.w + cx]!
      r.push(a < 0.04 && b < 0.04 ? { ch: ' ', fg: col } : { ch: '▀', fg: mix(bg, col, level(a)), bg: mix(bg, col, level(b)) })
    }
    out.push(r)
  }
  return out
}

const fib = (n: number): number[][] => Array.from({ length: n }, (_, i) => {
  const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * 2.39996
  return [Math.cos(a) * r, y, Math.sin(a) * r]
})
const P46 = fib(96), P14 = fib(30), P9 = fib(16)

function sphere(cv: Canvas, cx: number, cy: number, R: number, pts: number[][], ang: number, tilt: number,
  hook?: (i: number, x: number, y: number, v: number) => number[]) {
  const ca = Math.cos(ang), sa = Math.sin(ang), ct = Math.cos(tilt), stl = Math.sin(tilt)
  pts.forEach(([x, y, z], i) => {
    const x1 = x! * ca + z! * sa, z1 = -x! * sa + z! * ca, y1 = y! * ct - z1 * stl, z2 = y! * stl + z1 * ct
    if (z2 < -0.02) return
    let p = [x1, y1, (0.05 + 0.95 * Math.pow(Math.max(0, z2), 1.8)) * (i % 6 === 0 ? 1 : 0.5)]
    if (hook) p = hook(i, x1, y1, p[2]!)
    if (p[2]! > 0.16) plot(cv, cx + p[0]! * R, cy + p[1]! * R, p[2]!)
  })
}

function orbDraw(cv: Canvas, t: number, st: OrbState) {
  const cx = (cv.w - 1) / 2, cy = (cv.h - 1) / 2, R = Math.min(cv.w, cv.h) / 2 - 0.5, pts = cv.w < 5 ? P14 : P46
  if (st === 'think') sphere(cv, cx, cy, R * (0.86 + 0.14 * Math.sin(t * 2.2)), pts, t * 1.1, 0.4)
  else if (st === 'search') {
    const b = Math.sin(t * 3.5) * 0.9
    sphere(cv, cx, cy, R, pts, t * 2.8, 0.4, (_i, x, y, v) => [x, y, 0.12 + 0.2 * v + 0.9 * Math.max(0, 1 - Math.abs(x - b) / 0.3)])
  } else if (st === 'work') {
    sphere(cv, cx, cy, R * 0.95, pts, t * 1.8, 0.4, (i, x, y, v) => {
      const a = 1.4 * y * Math.sin(t * 3), c = Math.cos(a), s = Math.sin(a)
      return [x * c - y * s + 0.16 * Math.sin(t * 13 + i * 1.7), x * s + y * c + 0.16 * Math.cos(t * 11 + i * 2.3), v]
    })
  } else if (st === 'run') {
    const ph = (t * 1.3) % 1, k = 0.3 + 0.75 * ph
    sphere(cv, cx, cy, R, pts, t * 1.2, 0.4, (_i, x, y, v) => [x * k, y * k, v * (1 - ph) * 0.9 + 0.1])
    plot(cv, cx, cy, 1)
  } else {
    for (let j = 0; j < 3; j++) {
      const a = t * 2.2 + j * 2.094
      sphere(cv, cx + Math.cos(a) * R * 0.62, cy + Math.sin(a) * R * 0.62, R * 0.33, P9, t * 3 + j, 0.4)
    }
  }
}

const GAZE = [[1, 2], [2, 2], [1, 2], [1, 1], [2, 1], [2, 2], [1, 2]] as const
function eyes(cv: Canvas, t: number) {
  const g = GAZE[Math.floor(t / 0.9) % GAZE.length]!, bp = (t % 3.6) - 3.3
  const lid = bp < 0 ? 0 : [1, 2, 3, 2, 1][Math.min(4, Math.floor(bp / 0.06))] || 0
  for (const x0 of [0, 5]) {
    for (let y = lid; y < 4; y++) for (let x = 0; x < 4; x++) if (!((y === 0 || y === 3) && (x === 0 || x === 3))) put(cv, x0 + x, y, 0.96)
    if (g[1] >= lid) put(cv, x0 + g[0], g[1], 0)
  }
}

// One sweep crosses the bar, the one-cell gap the spinner leaves before the word, the word and a
// pause. spinnerWordSpans lights the word from the same position, so both must use this.
export const SCAN_BAR = 10
const SCAN_MS = 45, SCAN_PAUSE = 6
export function scanPos(tMs: number, wordLen: number, st: OrbState): number {
  const speed = st === 'run' || st === 'agents' ? 1.5 : 1
  return ((Math.max(0, tMs || 0) * speed) / SCAN_MS) % (SCAN_BAR + 1 + wordLen + SCAN_PAUSE)
}

const isLight = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 140
}

function scanCells(tMs: number, st: OrbState, o: CellOpts): Cell[][] {
  const pos = scanPos(tMs, o.wordLen ?? 12, st), shift = Math.floor(tMs / 400)
  // Toward white reads on a dark pack; on a light one it fades into the background, so text itself.
  const hi = isLight(o.bg) ? o.fg : mix(o.fg, '#ffffff', 0.5), faint = mix(o.bg, o.color, 0.25)
  return [Array.from({ length: SCAN_BAR }, (_, i) => {
    const d = pos - i
    if (d >= 0 && d < 1) return { ch: '█', fg: hi }
    return { ch: (i + shift) % 2 ? '▚' : '▞', fg: d >= 1 && d < 3 ? o.color : faint }
  })]
}

function ringDraw(cv: Canvas, t: number, st: OrbState) {
  const cx = (cv.w - 1) / 2, cy = (cv.h - 1) / 2
  const speed = st === 'work' || st === 'run' ? 1.5 : 1
  const [arcs, n] = st === 'agents' ? [[0, 2.094, 4.189], 3] : [[0], 9]
  for (const off of arcs) for (let i = 0; i < n; i++) {
    const a = t * Math.PI * speed + off - i * 0.55
    plot(cv, cx + Math.cos(a) * 5.2, cy + Math.sin(a) * 3.2, 1 - i / n)
  }
}

function signalDraw(cv: Canvas, t: number, st: OrbState) {
  const amp = st === 'think' ? 0.55 : st === 'run' ? 1 : 0.8
  const trace = (a: number, off: number, v: (x: number) => number) => {
    for (let x = 0; x < cv.w; x++) {
      const p = t / 0.16 + x * 0.55 + off
      plot(cv, x, 3.5 + a * 3.4 * (0.65 * Math.sin(p) + 0.35 * Math.sin(p * 2.7 + 1)), v(x))
    }
  }
  trace(amp, 0, x => (x >= cv.w - 3 ? 1 : 0.7))
  if (st === 'agents') trace(amp / 2, Math.PI, () => 0.45)
}

export const SPINNERS: Record<SpinnerId, Spec> = {
  stock: { name: 'stock ✻ cycle', cols: 1, rows: 1, kind: 'glyph', frames: '·✢✳✶✻✽' },
  comet: { name: 'comet', cols: 3, rows: 2, kind: 'dots', draw: (cv, t) => {
    const cx = (cv.w - 1) / 2, cy = (cv.h - 1) / 2
    for (let i = 0; i < 24; i++) { const a = (i / 24) * 6.283; plot(cv, cx + Math.cos(a) * 2.5, cy + Math.sin(a) * 3.4, 0.16) }
    for (let k = 0; k < 22; k++) { const a = t * 5 - k * 0.17; plot(cv, cx + Math.cos(a) * 2.5, cy + Math.sin(a) * 3.4, Math.pow(1 - k / 22, 2.2)) }
  } },
  eyes: { name: 'wandering eyes', cols: 9, rows: 2, kind: 'half', useFg: true, draw: eyes },
  'orb-states': { name: 'orb states', cols: 4, rows: 2, kind: 'dots', draw: orbDraw },
  clawd: { name: 'Clawd', cols: 5, rows: 2, kind: 'art', art: [['▐▛█▜▌', '▝▛█▜▘'], ['▐▛█▜▌', '▝▜█▛▘'], ['▐▛█▜▌', '▝▛█▜▘'], ['▐▛█▜▌', '▗▛█▜▖']] },
  shimmer: { name: 'text shimmer wave', cols: 1, rows: 1, kind: 'glyph', frames: '✻' },
  scanline: { name: 'scanline sweep', cols: SCAN_BAR, rows: 1, kind: 'scan' },
  ring: { name: 'angel ring', cols: 6, rows: 2, kind: 'dots', draw: ringDraw },
  glitch: { name: 'glitch word', cols: 1, rows: 1, kind: 'glyph', frames: '◆' },
  signal: { name: 'signal trace', cols: 10, rows: 2, kind: 'dots', draw: signalDraw },
}

export function spinnerCells(id: SpinnerId, tMs: number, o: CellOpts, st: OrbState = 'think'): Cell[][] {
  tMs = Math.max(0, tMs || 0)
  const s = SPINNERS[id]
  if (s.kind === 'glyph') { const f = [...s.frames]; return [[{ ch: f[Math.floor(tMs / 120) % f.length]!, fg: o.color }]] }
  if (s.kind === 'art') return s.art[Math.floor(tMs / 220) % s.art.length]!.map(r => [...r].map(ch => ({ ch, fg: CLAWD })))
  if (s.kind === 'scan') return scanCells(tMs, st, o)
  if (s.kind === 'dots') { const cv = canvas(s.cols * 2, s.rows * 4); s.draw(cv, tMs / 1000, st); return dotCells(cv, s.cols, s.rows, o.color, o.bg) }
  const cv = canvas(s.cols, s.rows * 2); s.draw(cv, tMs / 1000, st)
  return halfCells(cv, s.cols, s.rows, s.useFg ? o.fg : o.color, o.bg)
}

export function cellsToSpans(rows: Cell[][]): Span[][] {
  return rows.map(r => r.reduce<Span[]>((out, c) => {
    const last = out.at(-1)
    if (last && last.color === c.fg && last.bg === c.bg) last.text += c.ch
    else out.push(c.bg ? { text: c.ch, color: c.fg, bg: c.bg } : { text: c.ch, color: c.fg })
    return out
  }, []))
}

export type WordLook = {
  bg: string
  gradient?: [string, string]
  motion: { spinner: SpinnerId; shimmer: number; color: string }
  theme: { colors: { text: string; accent: string; read?: string; agent?: string } }
}

// One span per run of equal style: each span is an element the surface diffs every frame.
function runs(spans: Span[]): Span[] {
  const out: Span[] = []
  for (const s of spans) {
    const last = out.at(-1)
    if (last && last.color === s.color && last.bg === s.bg && !!last.bold === !!s.bold) last.text += s.text
    else out.push({ ...s })
  }
  return out
}

function scanWord(look: WordLook, text: string, t: number, st: OrbState): Span[] {
  const chars = [...text], pos = scanPos(t, chars.length, st), c = look.theme.colors
  return runs(chars.map((ch, i) => {
    const d = pos - (SCAN_BAR + 1 + i)
    return d >= 0 && d < 2 ? { text: ch, color: look.bg, bg: c.accent, bold: true } : { text: ch, color: c.text, bold: true }
  }))
}

// Seeded by the 70 ms frame, so every redraw within a frame draws the same glitch. A tear repeats
// the first letter in front and drops the trailing space: the line never changes width. Only
// width-1 letters become blocks or get torn; wide and zero-width ones take the background variant.
function glitchWord(look: WordLook, text: string, t: number, st: OrbState): Span[] {
  const c = look.theme.colors, a = c.read ?? c.accent, b = c.agent ?? c.text
  let seed = (Math.floor(Math.max(0, t || 0) / 70) * 9301 + 49297) % 233280
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
  const k = st === 'run' || st === 'agents' ? 2 : 1, chars = [...text], out: Span[] = []
  const tear = rnd() < 0.12 && chars[0] !== undefined && cellWidth(chars[0].codePointAt(0)!) === 1
  if (tear) out.push({ text: chars[0]!, color: b })
  for (const ch of chars) {
    const r = rnd(), pick = rnd() < 0.5 ? a : b, block = '▓▒░█▚'[Math.floor(rnd() * 5)]!
    if (r < 0.10 * k && cellWidth(ch.codePointAt(0)!) === 1) out.push({ text: block, color: pick })
    else if (r < 0.16 * k) out.push({ text: ch, color: look.bg, bg: pick })
    else out.push({ text: ch, color: c.text, bold: true })
  }
  if (!tear) out.push({ text: ' ', color: c.text })
  return runs(out)
}

export function spinnerWordSpans(look: WordLook, text: string, now: number, at?: { t: number; st: OrbState }): Span[] {
  const { spinner, shimmer, color } = look.motion
  const c = look.theme.colors
  const [c1, c2] = look.gradient ?? [c.accent, c.text]
  if (spinner === 'scanline') return scanWord(look, text, at?.t ?? now, at?.st ?? 'think')
  if (spinner === 'glitch') return glitchWord(look, text, at?.t ?? now, at?.st ?? 'think')
  if (spinner === 'shimmer') return wave3(text, mix(color, look.bg, 0.45), mix(color, '#ffffff', 0.6), now, Math.max(1, shimmer))
  if (shimmer > 0) return wave(text, c1, c2, now, shimmer * 1.2).map(s => ({ ...s, bold: true }))
  if (look.gradient) return gradient(text, c1, c2).map(s => ({ ...s, bold: true }))
  return [{ text, color: c.accent, bold: true }]
}
