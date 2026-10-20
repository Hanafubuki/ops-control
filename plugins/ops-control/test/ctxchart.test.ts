import { test, expect } from 'claude-code/testing'
import { tabRows, COMPACT_ROWS } from '../hooks/pane.tsx'
import { stackBar, legendRows, shortName, heaviest, cacheHit } from '../hooks/ctxchart.ts'
import { tokensK, brailleArea, chartTop, growth } from '../hooks/trend.ts'
import { visibleLength, type Seg } from '../hooks/layout.tsx'
import { initialModel, type Model, type PlanItem } from '../hooks/model.ts'
import { resolveTheme, PRESETS } from '../hooks/themes.ts'

const T = resolveTheme('classic', {}).theme
const text = (rows: Seg[][]) => rows.map(r => r.map(s => s.text).join(''))
const cat = (name: string, tokens: number) => ({ name, tokens, kind: 'used' as const })
const CATS = [cat('Messages', 62000), cat('System tools', 36000), cat('System prompt', 18000), cat('Memory files', 8000), cat('Skills', 2000)]
const MAX = 200000
const plan = (n: number, status: PlanItem['status'], from = 0): PlanItem[] => Array.from({ length: n }, (_, i) => ({ id: String(from + i + 1), title: `${status} ${from + i + 1}`, status }))
const base = (extra: Partial<Model> = {}): Model => ({ ...initialModel(), ctxPercent: 62, ...extra })
const view = { tab: 'context' as const, categories: CATS, maxTokens: MAX }
const planView = { ...view, tab: 'plan' as const }
const cells = (s: Seg[]) => s.reduce((n, x) => n + [...x.text].length, 0)
const inside = (r: string) => r.slice(2, -2).trimEnd()

test('stacked bar segments fill the width exactly and match the percentages', async () => {
  for (const w of [10, 24, 37, 57, 87]) {
    const { segs, slices } = stackBar(CATS, MAX, 62, w, T)
    expect(cells(segs), `width ${w}`).toBe(w)
    for (const s of slices) expect(Math.abs(s.cells - (s.pct / 100) * w), `${s.label} at ${w}`).toBeLessThanOrEqual(1.5)
    const free = segs.filter(s => s.text.startsWith('░')).reduce((n, s) => n + s.text.length, 0)
    expect(Math.abs(free - (1 - 126000 / MAX) * w)).toBeLessThanOrEqual(1.5)
  }
})

test('every category gets its own theme-derived color, biggest first, and free space is a faint track', async () => {
  for (const name of Object.keys(PRESETS)) {
    const t = resolveTheme(name, {}).theme
    const { segs, slices } = stackBar(CATS, MAX, 62, 60, t)
    const colors = slices.map(s => s.color)
    expect(new Set(colors).size, name).toBe(colors.length)
    expect(slices.map(s => s.label)).toEqual(['messages', 'tools', 'system', 'memory', 'skills'])
    expect(colors[0], name).toBe(t.colors.read)
    expect(segs.at(-1)).toMatchObject({ color: t.colors.faint })
    expect(segs.at(-1)!.text).toMatch(/^░+$/)
  }
})

test('without usable colors the segments fall back to block shades', async () => {
  const mono = { ...T, colors: { ...T.colors, read: 'default', agent: 'default', shell: 'default', edit: 'default', accent: 'default' } }
  const { segs, slices } = stackBar(CATS, MAX, 62, 60, mono)
  expect(slices.map(s => s.glyph)).toEqual(['█', '▓', '▒', '░', '█'])
  expect(segs.some(s => s.text.includes('▓'))).toBe(true)
  expect(segs.at(-1)!.text).toMatch(/^·+$/)
})

test('more than six categories fold into other; no categories draws one used segment', async () => {
  const many = Array.from({ length: 9 }, (_, i) => cat('Thing ' + i, 9000 - i * 100))
  const { slices, segs } = stackBar(many, MAX, 40, 50, T)
  expect(slices).toHaveLength(6)
  expect(slices.at(-1)!.label).toBe('other')
  expect(cells(segs)).toBe(50)
  const plain = stackBar([], undefined, 30, 40, T)
  expect(plain.slices.map(s => [s.label, s.cells])).toEqual([['used', 12]])
  expect(cells(plain.segs)).toBe(40)
})

test('names are short and tokens are in k', async () => {
  expect(['System prompt', 'System tools', 'Memory files', 'Messages', 'MCP tools', 'Custom agents', 'Skills'].map(shortName)).toEqual(['system', 'tools', 'memory', 'messages', 'mcp', 'agents', 'skills'])
  expect([124000, 200000, 900, 1700, 3000, 1500000].map(tokensK)).toEqual(['124k', '200k', '900', '1.7k', '3k', '1.5M'])
})

test('the legend wraps onto more rows when narrow and every row fits', async () => {
  const { slices } = stackBar(CATS, MAX, 62, 50, T)
  const wide = legendRows(slices, 90, T), narrow = legendRows(slices, 30, T)
  expect(wide).toHaveLength(1)
  expect(narrow.length).toBeGreaterThan(1)
  for (const r of narrow) expect(visibleLength(r)).toBeLessThanOrEqual(30)
  expect(text(narrow).join(' ')).toContain('messages 31%')
  expect(text(wide)[0]).toMatch(/^● messages 31%   ● tools 18%/)
  for (const r of text(narrow)) expect(r.startsWith(' ')).toBe(false)
})

test('the plan tab is the PLAN box, the context tab the CONTEXT box with tokens in its top edge', async () => {
  const m = base({ plan: [...plan(5, 'completed'), ...plan(1, 'in_progress', 5), ...plan(1, 'pending', 6)] })
  for (const w of [40, 60, 90]) {
    const rows = text(tabRows(m, T, planView, w, false, 0))
    expect(rows[0]).toMatch(/^╭─ PLAN ─+ 5\/7 ─╮$/)
    expect(rows.some(r => r.startsWith('├'))).toBe(false)
    const ctx = text(tabRows(m, T, view, w, false, 0))
    expect(ctx[0]).toMatch(/^╭─ CONTEXT ─+ 62% · 126k \/ 200k ─╮$/)
    for (const r of [...rows, ...ctx]) if (r) expect(visibleLength([{ text: r, color: '' }])).toBe(w)
  }
})

test('plan rows: active first, then pending, then the last three done and a count of the rest', async () => {
  const m = base({ plan: [...plan(12, 'completed'), { id: '13', title: 'Writing speech', status: 'in_progress', active: 'Writing the speech' }, ...plan(2, 'pending', 13)] })
  const rows = text(tabRows(m, T, planView, 60, false, 0))
  expect(rows.slice(1, 8).map(inside)).toEqual(['◉ Writing the speech', '○ pending 14', '○ pending 15', '✓ completed 10', '✓ completed 11', '✓ completed 12', '  +9 more done'])
  expect(rows[0]).toMatch(/ 12\/15 ─╮$/)
})

const BRAILLE = /[⠁-⣿]/
const DETAIL = { autoCompact: true, threshold: 160000, window: 200000, heavy: [], cacheHit: 92 }

test('braille area: two samples per cell, eight levels, and a rule at the given percent', async () => {
  const full = brailleArea([100, 100], 1)
  expect(full.rows).toEqual(['⣿', '⣿'])
  const low = brailleArea([12, 0, 12], 1)
  expect(low.rows).toEqual([' ', '⢀'])
  // while samples fit, each fills a whole cell
  expect(brailleArea([12], 2).rows).toEqual(['  ', '⣀ '])
  // 50% fills the bottom row only; a 100% rule adds the top-left dot
  expect(brailleArea([50, 50, 50], 2, 100)).toEqual({ rows: ['⠁⠁', '⣿⡇'], data: [true, true] })
  const many = brailleArea(Array.from({ length: 50 }, () => 30), 10)
  expect(many.rows.every(r => [...r].length === 10)).toBe(true)
  expect(many.data.every(Boolean)).toBe(true)
})

test('the chart scales to the session: the auto-compact point when near it, room above the peak when far', async () => {
  expect(chartTop([20, 50], 80)).toBe(80)
  expect(chartTop([20, 90], 80)).toBe(90)
  expect(chartTop([3, 17], 99.7)).toBe(25)
  expect(chartTop([3, 17])).toBe(25)
  expect(chartTop([])).toBe(5)
  // a 17% session on a 25% scale reaches the top row; the far-off rule is not drawn
  expect(brailleArea([17, 17], 4, 99.7, 25).rows).toEqual(['⣀⣀  ', '⣿⣿  '])
})

test('growth is per turn since the last drop', async () => {
  expect(growth([10])).toBeUndefined()
  expect(growth([10, 20, 30])).toBe(10)
  expect(growth([40, 60, 8, 12, 16])).toBe(4)
  expect(growth([40, 60, 8])).toBeUndefined()
  expect(growth([10, 10, 10])).toBe(0)
})

test('heaviest groups MCP tools by server, skips unloaded schemas, and ranks every source', async () => {
  const b = {
    mcpTools: [
      { name: 'a', serverName: 'linear', tokens: 9000, isLoaded: true },
      { name: 'b', serverName: 'linear', tokens: 5000, isLoaded: true },
      { name: 'c', serverName: 'slack', tokens: 40000, isLoaded: false },
    ],
    memoryFiles: [{ path: '/r/CLAUDE.md', type: 'Project', tokens: 3000 }],
    agents: [{ agentType: 'x', source: 'userSettings', tokens: 400 }],
    skills: { totalSkills: 50, includedSkills: 41, tokens: 6000, skillFrontmatter: [] },
  }
  expect(heaviest(b)).toEqual([
    { kind: 'mcp', name: 'linear', tokens: 14000, note: '2 tools' },
    { kind: 'skills', name: '41 listed', tokens: 6000 },
    { kind: 'memory', name: 'CLAUDE.md', tokens: 3000, note: 'project' },
  ])
  expect(heaviest({ mcpTools: [], memoryFiles: [], agents: [] })).toEqual([])
})

test('cache hit is the cached share of the input', async () => {
  expect(cacheHit({ input_tokens: 10, cache_read_input_tokens: 90, cache_creation_input_tokens: 0, output_tokens: 5 } as any)).toBe(90)
  expect(cacheHit(null)).toBeUndefined()
})

test('the trend chart is two braille rows inside the width, with growth and turns to auto-compact', async () => {
  const hist = Array.from({ length: 100 }, (_, i) => 20 + (i % 50))
  for (const w of [30, 40, 60, 90]) {
    const rows = text(tabRows(base({ ctxHistory: hist, ctxPeak: 99, compactions: 2 }), T, { ...view, ctx: DETAIL }, w, false, 0))
    expect(rows.filter(r => BRAILLE.test(r))).toHaveLength(2)
    for (const r of rows) if (r) expect(visibleLength([{ text: r, color: '' }])).toBe(w)
  }
  const rows = text(tabRows(base({ ctxHistory: [20, 30, 40, 50], ctxPercent: 50, ctxPeak: 50, compactions: 1 }), T, { ...view, ctx: DETAIL }, 60, false, 0)).map(inside)
  expect(rows.find(r => BRAILLE.test(r))).toMatch(/ 80%$/)
  // +10 points a turn on a 200k window is 20k; 80% - 50% at 10 a turn is 3 turns
  expect(rows).toContain('+20k/turn · auto-compact in ~3 turns')
  expect(rows).toContain('cache hit 92% · peak 50% · compacted 1×')
  expect(text(tabRows(base({ ctxHistory: [20, 30] }), T, { ...view, ctx: { ...DETAIL, autoCompact: false, threshold: undefined } }, 60, false, 0)).map(inside)).toContain('+20k/turn · auto-compact off')
  expect(text(tabRows(base(), T, view, 60, false, 0)).some(r => BRAILLE.test(r))).toBe(false)
})

test('the bar marks the auto-compact point and the heaviest sources list under the chart', async () => {
  const heavy = [{ kind: 'mcp', name: 'linear', tokens: 14000, note: '38 tools' }, { kind: 'memory', name: 'CLAUDE.md', tokens: 3000, note: 'project' }]
  const rows = text(tabRows(base(), T, { ...view, ctx: { ...DETAIL, heavy } }, 60, false, 0))
  const bar = inside(rows.find(r => r.includes('█'))!)
  expect(bar.indexOf('┊')).toBe(Math.floor(0.8 * 56))
  expect([...bar]).toHaveLength(56)
  expect(rows.map(inside)).toContainEqual(expect.stringMatching(/^mcp {4}linear  38 tools +14k$/))
  expect(rows.map(inside)).toContainEqual(expect.stringMatching(/^memory CLAUDE\.md  project +3k$/))
  // the drawer's bar is its first row, the legend under it
  expect(text(tabRows(base(), T, { ...view, ctx: DETAIL }, 40, true, 0))[0]).toContain('┊')
})

test('the warning appears from 80% only', async () => {
  const rows = (p: number) => text(tabRows(base({ ctxPercent: p }), T, view, 60, false, 0))
  expect(rows(80).some(r => r.includes('! messages is the biggest share'))).toBe(true)
  expect(rows(79).some(r => r.includes('!'))).toBe(false)
})

test('compact drawer keeps its row budget and shows one stacked bar with the percent', async () => {
  for (const n of [0, 3, 20]) {
    const m = base({ plan: [...plan(n, 'pending'), ...plan(n, 'completed', 100)], ctxHistory: [10, 20], compactions: 1 })
    for (const w of [20, 40, 58]) {
      const rows = text(tabRows(m, T, view, w, true, 0))
      expect(rows.length).toBeLessThanOrEqual(COMPACT_ROWS)
      expect(rows[0]).toMatch(/ctx ▕.*▏ +62%$/)
      for (const r of rows) expect(visibleLength([{ text: r, color: '' }])).toBeLessThanOrEqual(w)
    }
  }
})

test('bar colors come from the theme: another theme gives other segment colors', async () => {
  const other = resolveTheme(Object.keys(PRESETS).find(n => n !== 'classic')!, {}).theme
  const a = stackBar(CATS, MAX, 62, 40, T).slices.map(s => s.color), b = stackBar(CATS, MAX, 62, 40, other).slices.map(s => s.color)
  expect(a[0]).toBe(T.colors.read)
  expect(b[0]).toBe(other.colors.read)
  expect(a).not.toEqual(b)
})
