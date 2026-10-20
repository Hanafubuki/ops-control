// The context trend's math, kept free of imports so demo/src/pane.tsx can use it as is.

// 124000 -> 124k, 1700 -> 1.7k, 1500000 -> 1.5M
export const tokensK = (n: number) => n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(Math.round(n))

// The trend chart's ceiling: the auto-compact point when the session is within half of it,
// otherwise room above the peak, so a big window does not flatten a small session onto the floor.
export function chartTop(samples: number[], line?: number): number {
  const peak = Math.max(1, ...samples)
  if (line !== undefined && peak >= line / 2) return Math.min(100, Math.max(line, peak))
  return Math.min(100, Math.ceil(peak * 1.25 / 5) * 5)
}

// Puts a marker glyph over cell `at` of a bar, splitting whichever segment covers it.
export function markBar<S extends { text: string }>(segs: S[], at: number, mark: S): S[] {
  const out: S[] = []
  let pos = 0
  for (const s of segs) {
    const chars = [...s.text], end = pos + chars.length
    if (at >= pos && at < end) {
      const i = at - pos
      if (i) out.push({ ...s, text: chars.slice(0, i).join('') })
      out.push(mark)
      if (i + 1 < chars.length) out.push({ ...s, text: chars.slice(i + 1).join('') })
    } else out.push(s)
    pos = end
  }
  return out
}

// Braille dot bits by dot row (top to bottom) and column (left, right) within one cell.
const DOT = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]] as const

// A two-row braille area chart with eight dot levels for 0-100%: one sample per cell while they
// fit, two per cell (one per dot column) once they do not, so a short session is not squeezed left.
// `top` is the percent the top dot stands for. `line` draws a dashed horizontal rule at that
// percent across every cell, data or not, when it is within `top`.
// data[i] says whether cell i holds samples, so the caller can color the rule apart.
export function brailleArea(samples: number[], cols: number, line?: number, top = 100): { rows: [string, string]; data: boolean[] } {
  const wide = samples.length <= cols
  const s = samples.slice(-cols * 2)
  const bits = [new Array<number>(cols).fill(0), new Array<number>(cols).fill(0)]
  const set = (dot: number, col: number, side: 0 | 1) => { bits[dot >> 2]![col]! |= DOT[dot & 3]![side] }
  s.forEach((v, i) => {
    const h = Math.max(v > 0 ? 1 : 0, Math.min(8, Math.round(v / top * 8)))
    for (let d = 0; d < h; d++) {
      if (wide) { set(7 - d, i, 0); set(7 - d, i, 1) } else set(7 - d, i >> 1, (i & 1) as 0 | 1)
    }
  })
  if (line !== undefined && line <= top) {
    const dot = 8 - Math.max(1, Math.min(8, Math.round(line / top * 8)))
    for (let c = 0; c < cols; c++) set(dot, c, 0)
  }
  const row = (b: number[]) => b.map(x => (x ? String.fromCharCode(0x2800 + x) : ' ')).join('')
  const filled = wide ? s.length : Math.ceil(s.length / 2)
  return { rows: [row(bits[0]!), row(bits[1]!)], data: Array.from({ length: cols }, (_, i) => i < filled) }
}

// Percent points gained per turn over the last few samples since the last drop (a compaction or /clear).
export function growth(samples: number[], span = 6): number | undefined {
  let start = samples.length - 1
  while (start > 0 && samples[start - 1]! <= samples[start]!) start--
  const run = samples.slice(Math.max(start, samples.length - span))
  return run.length < 2 ? undefined : (run.at(-1)! - run[0]!) / (run.length - 1)
}

// The line under the chart: growth per turn and when auto-compact runs. `line` is the auto-compact
// point as a percent of `window`, the window the samples and `percent` are measured against.
export function outlook(samples: number[], percent: number, autoCompact: boolean | undefined, line?: number, window?: number): string {
  const rate = growth(samples), says: string[] = []
  if (rate !== undefined && window) says.push(rate > 0 ? `+${tokensK(rate / 100 * window)}/turn` : 'steady')
  if (autoCompact === false) says.push('auto-compact off')
  else if (line !== undefined) {
    const left = line - percent, turns = rate ? Math.ceil(left / rate) : 0
    says.push(left <= 0 ? 'auto-compact next turn' : turns > 0 ? `auto-compact in ~${turns} turn${turns === 1 ? '' : 's'}` : `auto-compact at ${Math.round(line)}%`)
  }
  return says.join(' · ')
}
