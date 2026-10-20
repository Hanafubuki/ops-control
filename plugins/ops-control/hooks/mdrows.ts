// Claude's answers are markdown and the pane draws rows of Segs inside its boxes, so a request's answer is laid
// out here: headings bold, list items hang under their bullet, code blocks and tables stay as written (cut, not
// wrapped), **bold**, `code` and [links](url) styled inline, the rest wrapped at word breaks.
import { cellWidth } from './cells.ts'
import { fit, visibleLength, type Seg } from './layout.tsx'
import type { Theme } from './themes.ts'

type Style = Omit<Seg, 'text'>
const cells = (s: string) => [...s].reduce((n, c) => n + cellWidth(c.codePointAt(0)!), 0)

// Inline marks: the text between them keeps `base`.
export function inline(text: string, base: Style, t: Theme): Seg[] {
  const out: Seg[] = []
  const re = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g
  let at = 0
  for (const m of text.matchAll(re)) {
    if (m.index! > at) out.push({ ...base, text: text.slice(at, m.index) })
    const s = m[0]
    if (s.startsWith('`')) out.push({ ...base, color: t.colors.read, text: s.slice(1, -1) })
    else if (s.startsWith('[')) out.push({ ...base, color: t.colors.accent, text: s.slice(1, s.indexOf('](')) })
    else out.push({ ...base, bold: true, text: s.slice(2, -2) })
    at = m.index! + s.length
  }
  if (at < text.length) out.push({ ...base, text: text.slice(at) })
  return out.filter(s => s.text)
}

// Greedy word wrap. The first row starts with `first`, the rest with `rest` (a hanging indent); a word longer
// than a row is broken by cells.
export function wrapSegs(segs: Seg[], width: number, first: Seg[] = [], rest: Seg[] = first.length ? [{ text: ' '.repeat(visibleLength(first)), color: first[0]!.color }] : []): Seg[][] {
  const rows: Seg[][] = []
  let row: Seg[] = [...first], used = visibleLength(first), bare = true
  const push = (s: Seg) => {
    const last = row.at(-1)
    if (last && last.color === s.color && last.bold === s.bold && last.bg === s.bg) row[row.length - 1] = { ...last, text: last.text + s.text }
    else row.push(s)
    used += cells(s.text)
  }
  const breakRow = () => { rows.push(row); row = [...rest]; used = visibleLength(rest); bare = true }
  for (const seg of segs) {
    for (const piece of seg.text.split(/(\s+)/)) {
      if (!piece) continue
      if (/^\s+$/.test(piece)) { if (!bare) push({ ...seg, text: ' ' }); continue }
      let word = piece
      if (!bare && used + cells(word) > width) {
        // a space left at the end of the row is not drawn
        const last = row.at(-1)
        if (last && last.text.endsWith(' ')) row[row.length - 1] = { ...last, text: last.text.replace(/ +$/, '') }
        breakRow()
      }
      // a word wider than a whole row: as much as fits, the rest on the rows after
      while (used + cells(word) > width) {
        let take = '', w = 0
        for (const ch of word) {
          const cw = cellWidth(ch.codePointAt(0)!)
          if (used + w + cw > width) break
          take += ch; w += cw
        }
        // not one character fits beside the indent: the row takes the word and fit() cuts it
        if (!take && bare) break
        if (!take) { breakRow(); continue }
        push({ ...seg, text: take }); bare = false
        word = word.slice(take.length)
        if (word) breakRow()
      }
      if (word) { push({ ...seg, text: word }); bare = false }
    }
  }
  if (!bare || !rows.length) rows.push(row)
  return rows.map(r => fit(r, width))
}

const BULLET = /^(\s*)([-*+])\s+(.*)$/
const NUMBERED = /^(\s*)(\d+[.)])\s+(.*)$/
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/
const FENCE = /^\s*(```|~~~)/

export function markdownRows(text: string, width: number, t: Theme): Seg[][] {
  const c = t.colors, body: Style = { color: c.text }
  const rows: Seg[][] = []
  const blank = () => { if (rows.length && rows.at(-1)!.length) rows.push([]) }
  let fence: string | undefined
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\t/g, '  ')
    if (fence) {
      if (line.trim().startsWith(fence)) { fence = undefined; continue }
      rows.push(fit([{ text: '  ' + line, color: c.dim }], width))
      continue
    }
    const f = FENCE.exec(line)
    if (f) { fence = f[1]; continue }
    if (!line.trim()) { blank(); continue }
    const h = HEADING.exec(line)
    if (h) { blank(); rows.push(...wrapSegs(inline(h[2]!, { color: c.accent, bold: true }, t), width)); continue }
    if (RULE.test(line)) { rows.push([{ text: '─'.repeat(Math.max(1, width)), color: c.faint }]); continue }
    // tables are read across, so a row is cut rather than wrapped into the next
    if (line.trim().startsWith('|')) {
      if (/^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-')) continue
      rows.push(fit(inline(line.trim(), body, t), width))
      continue
    }
    const q = /^\s*>\s?(.*)$/.exec(line)
    if (q) { rows.push(...wrapSegs(inline(q[1]!, { color: c.dim }, t), width, [{ text: '│ ', color: c.faint }])); continue }
    const b = BULLET.exec(line) ?? NUMBERED.exec(line)
    if (b) {
      const indent = ' '.repeat(Math.min(8, b[1]!.length))
      const mark = /^\d/.test(b[2]!) ? b[2]! : '•'
      rows.push(...wrapSegs(inline(b[3]!, body, t), width, [{ text: `${indent}${mark} `, color: c.accent }]))
      continue
    }
    rows.push(...wrapSegs(inline(line.trim(), body, t), width))
  }
  while (rows.length && !rows.at(-1)!.length) rows.pop()
  return rows
}
