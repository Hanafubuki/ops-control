import { test, expect } from 'claude-code/testing'
import { markdownRows, wrapSegs, inline } from '../hooks/mdrows.ts'
import { visibleLength } from '../hooks/layout.tsx'
import { resolveTheme } from '../hooks/themes.ts'

const T = resolveTheme('classic', {}).theme
const text = (rows: { text: string }[][]) => rows.map(r => r.map(s => s.text).join(''))

test('words wrap at spaces inside the width, a hanging indent under a bullet', () => {
  const rows = wrapSegs([{ text: 'one two three four five six seven', color: 'x' }], 12, [{ text: '• ', color: 'a' }])
  expect(text(rows)).toEqual(['• one two', '  three four', '  five six', '  seven'])
  for (const r of rows) expect(visibleLength(r)).toBeLessThanOrEqual(12)
})

test('a word wider than the row is broken by cells, wide characters included', () => {
  expect(text(wrapSegs([{ text: 'abcdefghijkl', color: 'x' }], 5))).toEqual(['abcde', 'fghij', 'kl'])
  const cjk = wrapSegs([{ text: '日本語のとても長い', color: 'x' }], 6)
  for (const r of cjk) expect(visibleLength(r)).toBeLessThanOrEqual(6)
  expect(text(cjk).join('')).toBe('日本語のとても長い')
  // nothing fits beside a wide indent: the row is cut, never an endless loop
  expect(wrapSegs([{ text: 'word', color: 'x' }], 3, [{ text: '    ', color: 'a' }]).length).toBeGreaterThan(0)
})

test('inline marks: bold, code and links keep their words and lose their marks', () => {
  const segs = inline('Run **now**: `npm test` then see [the docs](https://x.y).', { color: T.colors.text }, T)
  expect(segs.map(s => s.text).join('')).toBe('Run now: npm test then see the docs.')
  expect(segs.find(s => s.text === 'now')!.bold).toBe(true)
  expect(segs.find(s => s.text === 'npm test')!.color).toBe(T.colors.read)
  expect(segs.find(s => s.text === 'the docs')!.color).toBe(T.colors.accent)
})

test('markdown: headings, lists, quotes, rules, code and tables, every row inside the width', () => {
  const md = [
    '## What changed',
    '',
    'The **pane** lists every request and its answer, wrapped to the box.',
    '',
    '- first point that is long enough to wrap onto a second row',
    '  - a nested point',
    '1. numbered',
    '> quoted words',
    '---',
    '```ts',
    'const veryLongLineOfCodeThatMustNotWrap = someFunctionCall(withArguments, andMore)',
    '```',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
    '',
    '',
  ].join('\n')
  const rows = markdownRows(md, 30, T)
  const lines = text(rows)
  for (const r of rows) expect(visibleLength(r)).toBeLessThanOrEqual(30)
  expect(lines[0]).toBe('What changed')
  expect(rows[0]![0]).toMatchObject({ bold: true, color: T.colors.accent })
  expect(lines[1]).toBe('')
  expect(lines.some(l => l.startsWith('• first point'))).toBe(true)
  // the item's second row hangs under its first word
  expect(lines).toContain('• first point that is long')
  expect(lines).toContain('  enough to wrap onto a second')
  expect(lines).toContain('  • a nested point')
  expect(lines).toContain('1. numbered')
  expect(lines).toContain('│ quoted words')
  expect(lines).toContain('─'.repeat(30))
  // code is cut, not wrapped, and dim
  const code = rows.find(r => r.map(s => s.text).join('').includes('const veryLong'))!
  expect(code[0]!.color).toBe(T.colors.dim)
  expect(lines.filter(l => l.includes('someFunctionCall'))).toHaveLength(0)
  // the table's rule row goes; its rows stay
  expect(lines).toContain('| a | b |')
  expect(lines.some(l => l.includes('---|'))).toBe(false)
  // trailing blank rows go, runs of blank lines are one
  expect(lines.at(-1)).not.toBe('')
  expect(lines.join('\n')).not.toContain('\n\n\n')
})
