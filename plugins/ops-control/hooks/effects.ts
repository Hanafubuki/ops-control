// The built-in answers to ops.field, ops.meter and ops.divider, which a pack picks
// with motion.field, colors.meters and colors.dividers. A renderer plugin that answers first wins.
import type { Seg } from './segs.ts'
import type { Colors } from './themes.ts'
import type { Divider, Window } from './renderers.ts'
import type { Field } from './packs.ts'
import { mix } from './color.ts'

// Consecutive cells of one colour become one segment, which keeps a frame's data small.
function runs(cells: Seg[]): Seg[] {
  const out: Seg[] = []
  for (const c of cells) {
    const last = out[out.length - 1]
    if (last && last.color === c.color && !!last.bold === !!c.bold) last.text += c.text
    else out.push({ ...c })
  }
  return out
}

// Bayer threshold matrices by side; a braille cell is 2 dots across and 4 down.
function bayer(side: number): number[][] {
  let m = [[0]]
  for (let n = 1; n < side; n *= 2) m = Array.from({ length: n * 2 }, (_, y) => Array.from({ length: n * 2 }, (_, x) => m[y % n]![x % n]! * 4 + [[0, 2], [3, 1]][Math.floor(y / n)]![Math.floor(x / n)]!))
  return m
}
const BAYER: Record<Field['dither'], number[][]> = { '2x2': bayer(2), '4x4': bayer(4), '8x8': bayer(8) }
const DOT = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]]

// Integer hash of a lattice point to [0, 1): several times cheaper than the usual sin() hash,
// and the field calls it 16 times a sample, every tick.
function hash3(x: number, y: number, z: number) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}
const ease = (t: number) => t * t * (3 - 2 * t)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
function noise3(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), u = ease(x - ix), v = ease(y - iy), w = ease(z - iz)
  const c = (dx: number, dy: number, dz: number) => hash3(ix + dx, iy + dy, iz + dz)
  return lerp(lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v), lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v), w)
}
const fbm3 = (x: number, y: number, z: number) => noise3(x, y, z) * 0.6 + noise3(x * 2.03, y * 2.03, z * 1.7) * 0.4

// Paper's snoise (Ashima 2D simplex, from @paper-design/shaders shader-utils), in [-1, 1].
const mod289 = (x: number) => x - Math.floor(x / 289) * 289
const permute = (x: number) => mod289((x * 34 + 1) * x)
const fract = (x: number) => x - Math.floor(x)
function snoise(vx: number, vy: number): number {
  const s = (vx + vy) * 0.366025403784439
  let ix = Math.floor(vx + s), iy = Math.floor(vy + s)
  const u = (ix + iy) * 0.211324865405187, x0 = vx - ix + u, y0 = vy - iy + u
  const i1x = x0 > y0 ? 1 : 0, i1y = 1 - i1x
  const x1 = x0 + 0.211324865405187 - i1x, y1 = y0 + 0.211324865405187 - i1y
  const x2 = x0 - 0.577350269189626, y2 = y0 - 0.577350269189626
  ix = mod289(ix)
  iy = mod289(iy)
  let r = 0
  for (const [dx, dy, px, py] of [[0, 0, x0, y0], [i1x, i1y, x1, y1], [1, 1, x2, y2]] as const) {
    let m = Math.max(0.5 - (px * px + py * py), 0)
    if (!m) continue
    m *= m
    m *= m
    const g = 2 * fract(permute(permute(iy + dy) + ix + dx) * 0.024390243902439) - 1
    const h = Math.abs(g) - 0.5, a0 = g - Math.floor(g + 0.5)
    r += m * (1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h)) * (a0 * px + h * py)
  }
  return 130 * r
}
const smoothstep = (a: number, b: number, x: number) => ease(Math.min(1, Math.max(0, (x - a) / (b - a))))

// Claude Code repaints the whole field on every tick, about 2,000 characters at 88x24. Measured
// in one session against the same pack with no field: about 25 points of one core at fps 10.
export const fieldTickMs = (f: Field) => Math.round(1000 / f.fps)

// Density in [0, 1] at a point given in field heights. simplex is Paper's: the field's height
// stands for Paper's 720 px canvas, and two octaves drift apart vertically. warp (after Paper's
// "warp", not its formula) folds noise through itself with an offset that circles every 12 s.
function shapeAt(f: Field, x: number, y: number, t: number): number {
  if (f.shape === 'simplex') {
    const u = x * 0.72, v = y * 0.72, pt = 0.5 * t * f.speed
    const n = 0.5 * snoise(u, v - 0.3 * pt) + 0.5 * snoise(2 * u, 2 * v + 0.32 * pt)
    return Math.min(1, smoothstep(0.3, 0.9, 0.5 + 0.5 * n) * f.density)
  }
  x *= 1.6
  y *= 1.6
  const a = t * f.speed * Math.PI * 2 / 12, ox = Math.cos(a) * 0.6, oy = Math.sin(a) * 0.6
  const q = fbm3(x + ox, y + oy, 0)
  return Math.min(1, Math.pow(fbm3(x + f.warp * q + oy, y + f.warp * q + ox, 0), 1.4) * 1.2 * f.density)
}

// The shape is sampled on a lattice every STEP dots and blended in between: the noise is smooth at
// that scale, and the mod runtime runs this about 7 times slower than node, so sampling every dot
// cost 113 ms a frame at 88x24, more than the tick.
const STEP = 4

// Everything about the field that only its size and framing decide, worked out once and reused
// every tick: where each lattice point samples the shape, and for each dither pixel its four
// lattice neighbours, its blend weights and its Bayer threshold.
type Grid = { key: string; lw: number; xy: Float64Array; bw: number; at: Int32Array; wx: Float64Array; wy: Float64Array; cut: Float64Array }
let grid: Grid | undefined
function gridFor(cols: number, rows: number, f: Field): Grid {
  const key = [cols, rows, f.size, f.scale, f.rotation, f.offsetX, f.offsetY, f.dither].join()
  if (grid?.key === key) return grid
  const W = cols * 2, H = rows * 4, sz = f.size, short = Math.min(W, H) / H
  const rad = f.rotation * Math.PI / 180, cs = Math.cos(rad), sn = Math.sin(rad)
  const lw = Math.ceil(W / STEP) + 1, lh = Math.ceil(H / STEP) + 1
  const xy = new Float64Array(lw * lh * 2)
  // Paper's framing: y up, offsets in the canvas's short side applied before scale and rotation.
  for (let j = 0; j < lh; j++) for (let i = 0; i < lw; i++) {
    const u = ((i * STEP - W / 2) / H - f.offsetX * short) / f.scale, v = ((H / 2 - j * STEP) / H + f.offsetY * short) / f.scale, k = (j * lw + i) * 2
    xy[k] = u * cs - v * sn
    xy[k + 1] = u * sn + v * cs
  }
  const m = BAYER[f.dither], side = m.length
  const bw = Math.ceil(W / sz), bh = Math.ceil(H / sz), n = bw * bh
  const at = new Int32Array(n), wx = new Float64Array(n), wy = new Float64Array(n), cut = new Float64Array(n)
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const p = by * bw + bx, gx = ((bx + 0.5) * sz) / STEP, gy = ((by + 0.5) * sz) / STEP
    const ix = Math.min(lw - 2, Math.floor(gx)), iy = Math.min(lh - 2, Math.floor(gy))
    at[p] = iy * lw + ix
    wx[p] = gx - ix
    wy[p] = gy - iy
    cut[p] = 1 - m[by % side]![bx % side]! / (side * side)
  }
  return (grid = { key, lw, xy, bw, at, wx, wy, cut })
}

// One frame of the pack's field at t seconds, drawn live by client/field.tsx on every tick. The
// field is a grid of braille dots; `size` dots square make one dither pixel, and each pixel meets
// its own Bayer threshold, lit as Paper lights it: shape + bayer - 0.5 >= 0.5.
export function fieldFrame(cols: number, rows: number, colors: Colors, t: number, f: Field): Seg[][] {
  const ink = f.color ?? colors.faint
  const g = gridFor(cols, rows, f), sz = f.size
  const lattice = new Float64Array(g.xy.length / 2)
  for (let k = 0; k < lattice.length; k++) lattice[k] = shapeAt(f, g.xy[k * 2]!, g.xy[k * 2 + 1]!, t)
  const pix = new Float64Array(g.at.length)
  for (let p = 0; p < pix.length; p++) {
    const a = g.at[p]!, x = g.wx[p]!, y = g.wy[p]!
    const top = lattice[a]! + (lattice[a + 1]! - lattice[a]!) * x, low = lattice[a + g.lw]! + (lattice[a + g.lw + 1]! - lattice[a + g.lw]!) * x
    pix[p] = top + (low - top) * y
  }
  // One colour, as in Paper's two-colour dithering, so each row is one segment. Every segment is
  // an element Claude Code diffs and repaints each tick: a shade per cell split rows into ~40 runs
  // and the whole process used 84% of a core at 88x24; with one colour it uses about 35%.
  const frame: Seg[][] = []
  for (let r = 0; r < rows; r++) {
    let text = ''
    for (let c = 0; c < cols; c++) {
      let bits = 0
      for (let y = 0; y < 4; y++) {
        const base = Math.floor((r * 4 + y) / sz) * g.bw
        for (let x = 0; x < 2; x++) {
          const p = base + Math.floor((c * 2 + x) / sz)
          if (pix[p]! >= g.cut[p]!) bits |= DOT[y]![x]!
        }
      }
      text += bits ? String.fromCharCode(0x2800 + bits) : ' '
    }
    frame.push([{ text, color: ink }])
  }
  return frame
}

// One bar per window: the fill ramps from accent to text, its edge dissolves through ▓▒░,
// and what is used is a row of faint dots.
function bar(label: string, left: number, tail: string, width: number, c: Colors): Seg[] {
  const pct = ` ${left}%`, room = Math.max(4, width - label.length - 1 - pct.length - (tail ? tail.length + 1 : 0))
  const fill = Math.round((left / 100) * room), edge = Math.max(0, fill - 3)
  const cells: Seg[] = []
  for (let i = 0; i < room; i++) {
    if (i < edge) cells.push({ text: '█', color: mix(c.accent, c.text, i / Math.max(1, fill)) })
    else if (i < fill) cells.push({ text: '▓▒░'[i - edge]!, color: c.text })
    else cells.push({ text: '·', color: c.faint })
  }
  return [{ text: label + ' ', color: c.dim }, ...runs(cells), { text: pct, color: c.text, bold: true }, ...(tail ? [{ text: ' ' + tail, color: c.dim }] : [])]
}

export function ditherMeters(width: number, windows: Window[], ctxPercent: number, c: Colors): Seg[][] {
  if (!windows.length) return [bar('ctx', 100 - Math.round(ctxPercent), '', width, c)]
  return windows.map(w => bar(w.label, 100 - w.usedPercent, w.reset, width, c))
}

export const turnDivider = (turn: number, c: Colors): Divider => ({
  left: [{ text: '░▒▓━━ ', color: c.faint }, { text: String(turn).padStart(2, '0'), color: c.accent, bold: true }, { text: ' ', color: c.faint }],
  fill: { text: '━', color: c.faint },
  right: [{ text: '▓▒░', color: c.faint }],
})
