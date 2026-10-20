import type { Theme } from './themes.ts'
import type { Act } from './model.ts'
import { cellWidth } from './cells.ts'
import { gradient } from './color.ts'
import type { Look } from './packs.ts'
import type { Seg } from './segs.ts'
import { levelBar } from './levels.ts'

export type Tier = 'wide' | 'medium' | 'compact'
export type { Seg }

export const tierFor = (columns: number, paneDocked: boolean): Tier => paneDocked ? 'wide' : columns >= 80 ? 'medium' : 'compact'
export { cellWidth }
const cells = (text: string) => [...text].reduce((n, c) => n + cellWidth(c.codePointAt(0)!), 0)
export const visibleLength = (segs: Seg[]) => segs.reduce((n, s) => n + cells(s.text), 0)

export function fit(segs: Seg[], width: number): Seg[] {
  if (width <= 0) return []
  if (visibleLength(segs) <= width) return segs
  const out: Seg[] = []
  let used = 0
  for (const s of segs) {
    const w = cells(s.text)
    if (used + w < width) { out.push(s); used += w; continue }
    // one cell is kept for the ellipsis; a 2-cell character that would cross the line is dropped
    let kept = '', room = width - used - 1
    for (const c of s.text) {
      const cw = cellWidth(c.codePointAt(0)!)
      if (cw > room) break
      kept += c; room -= cw
    }
    out.push({ ...s, text: kept + '…' })
    break
  }
  return out
}

export function hearts(used: number, t: Theme): Seg[] {
  const full = Math.max(0, Math.min(5, Math.ceil((100 - used) / 20)))
  return [{ text: t.hearts[0].repeat(full), color: t.colors.fail }, { text: t.hearts[1].repeat(5 - full), color: t.colors.dim }].filter(s => s.text)
}

// The arcade packs' life bar: full when nothing of `what` is used, drained as it fills. Besides the bar it
// takes "HP ", two spaces and "100% <what> left", sized for 100% so the bar keeps its width as the number drops.
// When that leaves under 5 cells for the bar, the words go and the bare percent stays.
export function hpBar(used: number, t: Theme, width: number, what = 'context'): Seg[] {
  const c = t.colors, left = Math.max(0, Math.min(100, 100 - used))
  const words = 3 + 2 + `100% ${what} left`.length
  const short = width - words < 5
  const w = short ? Math.max(3, width - 9) : width - words, n = Math.round((left / 100) * w)
  return [
    { text: 'HP ', color: c.accent, bold: true },
    ...gradient('█'.repeat(n), c.fail, c.pass),
    { text: '░'.repeat(w - n), color: c.faint },
    { text: short ? `  ${left}%` : `  ${left}% ${what} left`, color: c.dim },
  ].filter(s => s.text)
}

// Three successes in a row; the pack has to switch the extra on.
export function comboSegs(n: number, look?: Look): Seg[] {
  if (!look?.extras.combo || n < 3) return []
  const c = look.theme.colors, [a, b] = look.gradient ?? [c.accent, c.pass]
  return gradient(` COMBO x${n} `, a, b).map(s => ({ ...s, bold: true }))
}

export function levelSegs(xp: number, t: Theme, cells: number): Seg[] {
  const { level, filled } = levelBar(xp, cells)
  return [{ text: `Lv ${level} `, color: t.colors.accent }, { text: '▰'.repeat(filled), color: t.colors.accent }, { text: '▱'.repeat(cells - filled), color: t.colors.faint }]
}

// Act tones are a subset of the theme's color keys, so this is the one place they meet.
export const toneColor = (t: Theme, tone: Act['tone']): string => t.colors[tone]

// One row of colored text. `els` is the table from $.ui.resolve(e).
// Text takes no `key` (not in TextProps); only the Box is keyed.
export function renderSegs(els: { Box: any; Text: any }, segs: Seg[], key?: string) {
  const { Box, Text } = els
  // a childless row has zero height; an empty row is a spacer and must keep its line
  if (!segs.length) return <Box key={key} height={1} />
  return <Box key={key} flexDirection="row">{segs.map(s => <Text color={s.color} bold={s.bold} backgroundColor={s.bg} wrap="truncate">{s.text}</Text>)}</Box>
}
