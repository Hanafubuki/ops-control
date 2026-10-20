import { test, expect } from 'claude-code/testing'
import { tabRows, tabParts, statusRows, renderPane, section, BOX, MIN_BOX, COMPACT_ROWS, petStripCols, bubbleBox, visibleTabs, type TabId } from '../hooks/pane.tsx'
import { BUILTIN_LINES, MOMENTS } from '../hooks/lines.ts'
import { anyLine } from './kit.ts'
import { resolveLook, BORDERS } from '../hooks/packs.ts'
import { PACKS } from '../hooks/packpresets.ts'
import { visibleLength } from '../hooks/layout.tsx'
import { initialModel, applyEvent, type Model } from '../hooks/model.ts'
import { resolveTheme } from '../hooks/themes.ts'
import type { Music } from '../hooks/music/parse.ts'

const T = resolveTheme('classic', {}).theme
const text = (rows: { text: string }[][]) => rows.map(r => r.map(s => s.text).join(''))
// the content of a boxed body row, without the side borders and padding
const inside = (r: string) => r.slice(2, -2).trimEnd()
const cellsOf = (r: string) => visibleLength([{ text: r, color: '' }])
const M: Model = {
  ...initialModel(), working: true, ctxPercent: 64,
  act: { glyph: '✎', label: 'Editing src/auth.ts', tone: 'edit' },
  files: [
    { path: '/r/src/safe-next.ts', add: 10, del: 1, how: 'new', at: 3 },
    { path: '/r/src/auth.ts', add: 2, del: 1, how: 'edit', at: 2 },
    { path: '/r/src/日本語のとても長いファイル名.ts', add: 5, del: 5, how: 'edit', at: 0 },
  ],
  agents: [
    { key: 'a', name: 'scout', task: 'Find the redirect tests', state: 'done', startedAt: 0, endedAt: 9000, tokens: 4100 },
    { key: 'b', name: 'scout 2', task: 'Check other callers', state: 'running', startedAt: 5000, now: '▸ Reading src/nav.tsx' },
  ],
  plan: [{ id: '1', title: 'Find it', status: 'completed' }, { id: '2', title: 'Patch it', status: 'in_progress' }, { id: '3', title: 'Push', status: 'pending' }],
}
const many = (n: number): Model => ({
  ...M,
  files: Array.from({ length: n }, (_, i) => ({ path: `/r/src/f${i}.ts`, add: 1, del: 0, how: 'edit' as const, at: n - i })),
  agents: Array.from({ length: n }, (_, i) => ({ key: 'k' + i, name: 'a' + i, task: 't', state: 'running' as const, startedAt: 0 })),
  plan: Array.from({ length: n }, (_, i) => ({ id: String(i), title: 'step ' + i, status: 'pending' as const })),
})

test('diff tab is one box with the counts in its top edge', async () => {
  const rows = text(tabRows(M, T, { tab: 'diff' }, 54, false, 10000))
  expect(rows[0]).toMatch(/^╭─ DIFF ─+ 3 files  \+17 −7 ─╮$/)
  expect(rows.at(-1)).toBe('╰' + '─'.repeat(52) + '╯')
  expect(rows.some(r => r.includes('src/safe-next.ts') && r.includes('new') && inside(r).endsWith('+10 −1'))).toBe(true)
  expect(rows.slice(1, -1).every(r => r.startsWith('│ ') && r.endsWith(' │'))).toBe(true)
})

test('a file Claude only read stays out of the diff tab, and the tab then says nothing changed', async () => {
  let m = applyEvent(initialModel(), { type: 'tool-end', at: 1, tool: 'Read', toolUseId: 'r', input: { file_path: '/r/test/auth.test.ts' }, isError: false, text: '' })
  for (const compact of [false, true]) {
    const rows = text(tabRows(m, T, { tab: 'diff' }, 54, compact, 10000))
    if (!compact) expect(rows[0]).toMatch(/^╭─ DIFF ─+ 0 files  \+0 −0 ─╮$/)
    expect(rows.some(r => r.includes('Nothing changed yet.'))).toBe(true)
    expect(rows.some(r => r.includes('auth.test.ts'))).toBe(false)
  }
  m = applyEvent(m, { type: 'tool-end', at: 2, tool: 'Edit', toolUseId: 'e', input: { file_path: '/r/test/auth.test.ts', old_string: 'a', new_string: 'b' }, isError: false, text: '' })
  expect(text(tabRows(m, T, { tab: 'diff' }, 54, false, 10000)).some(r => r.includes('auth.test.ts'))).toBe(true)
})

test('agents tab is one box: status, time, tokens and current tool, entries one blank row apart', async () => {
  const rows = text(tabRows(M, T, { tab: 'agents' }, 54, false, 12000))
  expect(rows[0]).toMatch(/^╭─ AGENTS ─+ 1 running · 1 done ─╮$/)
  expect(rows.some(r => r.includes('scout') && r.includes('9s · 4.1k') && inside(r).endsWith('✓'))).toBe(true)
  expect(rows.some(r => r.includes('└ ▸ Reading src/nav.tsx'))).toBe(true)
  expect(inside(rows.at(-2)!)).not.toBe('')
  // the main session's row first, then each agent one blank row after the last
  expect(inside(rows[1]!)).toMatch(/^★ Main session/)
  expect(rows.filter(r => inside(r) === '')).toHaveLength(2)
})

test('the plan tab is one PLAN box and the context tab the CONTEXT box, no loose divider', async () => {
  const view = { categories: [{ name: 'Messages', tokens: 60000, kind: 'used' as const }, { name: 'System tools', tokens: 20000, kind: 'used' as const }], maxTokens: 200000 }
  const plan = text(tabRows(M, T, { tab: 'plan', ...view }, 54, false, 0))
  expect(plan[0]).toMatch(/^╭─ PLAN ─+ 1\/3 ─╮$/)
  expect(plan.map(inside)).toContain('✓ Find it')
  expect(plan.map(inside)).toContain('◉ Patch it')
  expect(plan.at(-1)!.startsWith('╰')).toBe(true)
  expect(plan.some(r => r.includes('CONTEXT'))).toBe(false)
  const ctx = text(tabRows(M, T, { tab: 'context', ...view }, 54, false, 0))
  expect(ctx[0]).toMatch(/^╭─ CONTEXT ─+ 64% · 80k \/ 200k ─╮$/)
  expect(inside(ctx[1]!)).toMatch(/^█+░+$/)
  expect(cellsOf(inside(ctx[1]!))).toBe(50)
  expect(ctx.some(r => r.includes('messages 30%') && r.includes('tools 10%'))).toBe(true)
  for (const rows of [plan, ctx]) {
    expect(rows.some(r => r.startsWith('├'))).toBe(false)
    for (const r of rows) if (r) expect(cellsOf(r)).toBe(54)
  }
})

test('plan and context tabs are boxed in every border style and every built-in pack fits the pane', async () => {
  for (const border of BORDERS)
    for (const tab of ['plan', 'context'] as const)
      for (const w of [16, 40, 60, 90]) {
        const rows = text(tabRows({ ...M, ctxHistory: [10, 40, 64], ctxPeak: 64, compactions: 1 }, T, { tab, categories: [{ name: 'メッセージ', tokens: 5, kind: 'used' }], maxTokens: 10 }, w, false, 0, COMPACT_ROWS, border))
        // tl + h + ' ' matches only a top edge: under classic, tl and bl are both '+'
        expect(rows.filter(r => r.startsWith(BOX[border].tl + BOX[border].h + ' ')), `${border} ${tab} ${w}`).toHaveLength(1)
        for (const r of rows) if (r) expect(cellsOf(r), `${border} ${tab} ${w}`).toBe(w)
      }
  for (const name of Object.keys(PACKS)) {
    const look = resolveLook({ colors: name, motion: name }, {}, {}).look
    for (const tab of ['diff', 'agents', 'plan', 'context'] as const)
      for (const width of [40, 54, 80]) {
        const rows = textRows(renderPane(els, M, T, { tab }, width, false, 0, () => {}, { look }))
        expect(rows.some(r => r.startsWith(BOX[look.border].tl)), `${name} ${tab} ${width}`).toBe(true)
        for (const r of rows) expect(cellsOf(r), `${name} ${tab} ${width}`).toBeLessThanOrEqual(width)
      }
  }
})

test('peak and compactions show inside CONTEXT even with no samples', async () => {
  const rows = text(tabRows({ ...M, ctxHistory: [], ctxPeak: 40, compactions: 2 }, T, { tab: 'context' }, 60, false, 0))
  const stats = rows.find(r => r.includes('peak'))!
  expect(inside(stats)).toBe('peak 40% · compacted 2×')
  expect(cellsOf(stats)).toBe(60)
})

test('every row fits its width in cells, full and compact, CJK names included', async () => {
  for (const tab of ['diff', 'agents', 'plan', 'context'] as const)
    for (const [w, compact] of [[54, false], [40, false], [58, true], [30, true], [20, true]] as const)
      for (const r of tabRows(M, T, { tab, categories: [{ name: 'メッセージ', tokens: 5, kind: 'used' }], maxTokens: 10 }, w, compact, 12000)) expect(visibleLength(r)).toBeLessThanOrEqual(w)
})

test('section: every border style draws its own corners, every row exactly w cells', async () => {
  const body = [[{ text: 'hello', color: T.colors.text }], [], [{ text: 'x'.repeat(200), color: T.colors.text }]]
  for (const border of BORDERS)
    for (const w of [16, 40, 60, 90]) {
      const b = BOX[border], rows = text(section('PLAN', '1/3', body, w, T, border))
      for (const r of rows) expect(cellsOf(r), `${border} ${w}`).toBe(w)
      expect(rows[0]!.startsWith(b.tl + b.h + ' PLAN ')).toBe(true)
      expect(rows[0]!.endsWith(b.h + b.tr)).toBe(true)
      expect(rows.at(-1)).toBe(b.bl + b.h.repeat(w - 2) + b.br)
      for (const r of rows.slice(1, -1)) expect(r.startsWith(b.v + ' ') && r.endsWith(' ' + b.v)).toBe(true)
      const segs = section('PLAN', '1/3', body, w, T, border), edges = [...segs[0]!.filter(x => x.text.includes(b.tl) || x.text.includes(b.tr) || x.text === b.h.repeat(x.text.length)), ...segs.at(-1)!]
      expect(edges.length).toBeGreaterThanOrEqual(4)
      for (const x of edges) expect(x.color, `${border} ${w} ${x.text}`).toBe(T.colors.faint)
    }
})

test('section: the right text drops before the title clips, and the edge never overflows', async () => {
  const top = text(section('CONTEXT', '11% · 110k / 1M', [], 18, T))[0]!
  expect(cellsOf(top)).toBe(18)
  expect(top).not.toContain('1M')
  expect(top).toContain('CONTEXT')
  const tiny = text(section('A VERY LONG SECTION TITLE', '', [], MIN_BOX, T))[0]!
  expect(cellsOf(tiny)).toBe(MIN_BOX)
  expect(tiny.endsWith('─╮')).toBe(true)
})

test('below MIN_BOX the tabs are unboxed and still fit', async () => {
  for (const tab of ['diff', 'agents', 'plan', 'context'] as const) {
    const rows = text(tabRows(M, T, { tab }, MIN_BOX - 1, false, 12000))
    expect(rows.join('\n')).not.toMatch(/[╭╮╰╯│]/)
    for (const r of rows) expect(cellsOf(r)).toBeLessThanOrEqual(MIN_BOX - 1)
  }
})

test('docked tabs are boxed in every border style, every row exactly the width, CJK names included', async () => {
  for (const border of BORDERS)
    for (const tab of ['diff', 'agents'] as const)
      for (const w of [16, 40, 60, 90]) {
        const rows = text(tabRows(M, T, { tab }, w, false, 12000, COMPACT_ROWS, border))
        expect(rows[0]!.startsWith(BOX[border].tl), `${border} ${tab} ${w}`).toBe(true)
        for (const r of rows) expect(cellsOf(r), `${border} ${tab} ${w}`).toBe(w)
      }
})

const planView = (ctxPercent: number, categories?: { name: string; tokens: number; kind: 'used' | 'free' | 'buffer' | 'deferred' }[]) =>
  text(tabRows({ ...M, ctxPercent }, T, { tab: 'context', categories, maxTokens: 200000 }, 54, false, 0))
const CATS = [
  { name: 'Free space', tokens: 90000, kind: 'free' as const },
  { name: 'Autocompact buffer', tokens: 40000, kind: 'buffer' as const },
  { name: 'Skills', tokens: 10000, kind: 'used' as const },
  { name: 'Messages', tokens: 50000, kind: 'used' as const },
]

test('context breakdown draws only used categories, biggest first', async () => {
  const rows = planView(50, CATS)
  expect(rows.some(r => r.includes('Free space') || r.includes('Autocompact'))).toBe(false)
  const legend = rows.find(r => r.includes('messages'))!
  expect(legend.indexOf('messages')).toBeLessThan(legend.indexOf('skills'))
})

test('context warning names the biggest used category, falls back to the percent, and is absent below 80', async () => {
  const withCats = planView(85, CATS)
  expect(withCats.map(inside)).toContain('! messages is the biggest share')
  expect(withCats.join('\n')).not.toContain('Free space')
  expect(planView(85).map(inside)).toContain('! context 85% used')
  expect(planView(85, [{ name: 'Free space', tokens: 9, kind: 'free' }]).map(inside)).toContain('! context 85% used')
  expect(planView(79, CATS).some(r => r.includes('!'))).toBe(false)
})

test('compact diff is one row per edited file', async () => {
  const rows = text(tabRows(M, T, { tab: 'diff' }, 58, true, 0))
  expect(rows.filter(r => r.includes('✎'))).toHaveLength(3)
})

test('compact drawer is at most 6 rows and ends with a count of the rest', async () => {
  for (const tab of ['diff', 'agents', 'plan'] as const) {
    const rows = text(tabRows(many(20), T, { tab }, 58, true, 0))
    expect(rows.length).toBeLessThanOrEqual(6)
    expect(rows.some(r => /… \d+ more$/.test(r))).toBe(true)
  }
  const six = text(tabRows(many(6), T, { tab: 'diff' }, 58, true, 0))
  expect(six).toHaveLength(6)
  expect(six.some(r => r.includes('more'))).toBe(false)
  expect(text(tabRows(many(8), T, { tab: 'diff' }, 58, true, 0))[5]).toBe('  … 3 more')
  // the context tab's drawer opens on its bar
  expect(text(tabRows(many(20), T, { tab: 'context' }, 58, true, 0))[0]).toContain('ctx')
})

test('running agents spin, or show a still ◌ when motion is reduced', async () => {
  const agentRows = (reduced?: boolean) => text(tabRows(M, T, { tab: 'agents', reduced }, 54, false, 90)).join('\n')
  expect(agentRows()).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/)
  expect(agentRows(true)).toContain('◌')
  expect(agentRows(true)).not.toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/)
  expect(text(tabRows(M, T, { tab: 'agents', reduced: true }, 58, true, 90)).join('\n')).toContain('◌')
})

test('empty states', async () => {
  const empty = initialModel()
  expect(text(tabRows(empty, T, { tab: 'diff' }, 54, false, 0)).join('\n')).toContain('Nothing changed yet')
  expect(text(tabRows(empty, T, { tab: 'agents' }, 54, false, 0)).join('\n')).toContain('No subagents this session')
  expect(text(tabRows(empty, T, { tab: 'plan' }, 54, false, 0)).join('\n')).toContain('No task list yet')
})

test('status rows say the action and context in words', async () => {
  const rows = text(statusRows(M, T, 54, 0))
  expect(rows[0]).toBe('✎ Editing src/auth.ts')
  expect(rows[1]).toMatch(/^HP █+░+  36% context left$/)
  expect(rows[2]).toBe('◆ scout 2 working')
})

test('the first status row carries Lv N and a ten-cell bar when it fits, and drops them when it does not', async () => {
  const row = (m: Partial<Model>, width = 54) => text(statusRows({ ...M, ...m }, T, width, 0))[0]
  expect(row({})).toBe('✎ Editing src/auth.ts')
  expect(row({ xp: 180 })).toBe('✎ Editing src/auth.ts  Lv 2 ▰▰▰▰▱▱▱▱▱▱')
  expect(row({ xp: 180 }, 30)).toBe('✎ Editing src/auth.ts')
})

test('the life row shows the tighter usage window, then spend, then context', async () => {
  const life = (m: Partial<Model>, now = 0) => text(statusRows({ ...M, ...m }, T, 54, now))[1]
  const limits = [{ kind: 'five_hour', percentUsed: 30, resetsAt: '1970-01-01T05:00:00Z' }, { kind: 'seven_day', percentUsed: 62.4 }]
  expect(life({ limits, costUsd: 4.2 })).toMatch(/^HP █+░+  38% weekly limit left$/)
  expect(life({ limits: [{ ...limits[0]!, percentUsed: 90 }, limits[1]!] })).toMatch(/^HP █+░+  10% 5h limit left$/)
  // a window past its reset no longer counts; with neither left, an API-key session shows spend
  expect(life({ limits: [limits[0]!], costUsd: 4.2 }, Date.parse('1970-01-01T06:00:00Z'))).toBe('$4.20 spent this session')
  expect(life({ costUsd: 0.5 })).toBe('$0.50 spent this session')
})

// Fake element table: lets renderPane run without the engine.
const els = { Box: 'Box', Text: 'Text', Button: 'Button' }
const walk = (n: any, out: any[] = []): any[] => {
  if (typeof n === 'string') out.push(n)
  else if (n && typeof n === 'object') {
    out.push(n)
    for (const c of n.children ?? []) walk(c, out)
  }
  return out
}
// the text of every row Box (a Box whose children are Text)
const textRows = (tree: any): string[] =>
  walk(tree).filter(n => n?.type === 'Box' && (n.children ?? []).some((c: any) => c?.type === 'Text')).map(n => walk(n).filter(x => typeof x === 'string').join(''))

const PETNODE = { type: 'Client', props: { key: 'pet', module: './client/pet.tsx' } }
const arcade = resolveLook({ colors: 'arcade', motion: 'arcade' }, {}, {}).look

test('docked pane: the pet strip sits at the bottom, inside the pack border', async () => {
  const tree = renderPane(els, M, T, { tab: 'diff' }, 54, false, 0, () => {}, { look: arcade, pet: { id: 'clawd', node: PETNODE } })
  const box = walk(tree).find(n => n.props?.borderStyle)
  expect([box.props.borderStyle, box.props.borderColor]).toEqual(['bold', '#ff3ec8'])
  const nodes = walk(tree)
  expect(nodes).toContain(PETNODE)
  expect(nodes.indexOf(PETNODE)).toBeGreaterThan(nodes.findIndex(n => n.props?.borderStyle))
  expect(walk(box)).toContain(PETNODE)
})

test('docked pane: the column is at least the visible body tall, so the status box lands at the bottom', async () => {
  const outer = (extra: object, compact = false) => renderPane(els, M, T, { tab: 'diff' }, 54, compact, 0, () => {}, extra) as any
  expect(outer({ minRows: 30 }).props.minHeight).toBe(30)
  expect(outer({}).props.minHeight).toBeUndefined()
  expect(outer({ minRows: undefined }, true).props.minHeight).toBeUndefined()
})

test('compact drawer: one row of pet, everything within COMPACT_ROWS and the width', async () => {
  for (const tab of ['diff', 'agents', 'plan'] as const) {
    const tree = renderPane(els, many(20), T, { tab }, 50, true, 0, () => {}, { pet: { id: 'clawd', node: PETNODE }, bubble: { text: 'a very long thing to say, far wider than the drawer can hold', mood: 'fail' } })
    const rows = textRows(tree)
    // the tab strip takes one more row
    expect(rows.length + 1).toBeLessThanOrEqual(COMPACT_ROWS)
    for (const r of rows) expect(visibleLength([{ text: r, color: '' }])).toBeLessThanOrEqual(50)
    expect(walk(tree)).toContain(PETNODE)
  }
})

test('a bubble draws a round bordered Box in the mood color beside the pet', async () => {
  for (const [mood, key] of [['fail', 'fail'], ['done', 'pass'], ['needs-you', 'accent']] as const) {
    const tree = renderPane(els, M, T, { tab: 'diff' }, 80, false, 0, () => {}, { pet: { id: 'clawd', node: PETNODE }, bubble: { text: 'ouch, 3 failed', mood } })
    const bubble = walk(tree).find(n => n.props?.borderStyle === 'round' && n.props.borderColor === T.colors[key] && walk(n).includes('ouch, 3 failed'))
    expect(bubble, mood).toBeDefined()
  }
})

test('on a narrow pane the bubble sits above the pet and stays inside the width', async () => {
  const tree = renderPane(els, M, T, { tab: 'diff' }, 54, false, 0, () => {}, { pet: { id: 'clawd', node: PETNODE }, bubble: { text: 'ouch, 3 failed and then some more words', mood: 'fail' } })
  const nodes = walk(tree)
  const at = nodes.findIndex(n => n.props?.borderColor === T.colors.fail)
  expect(at).toBeGreaterThan(-1)
  expect(at).toBeLessThan(nodes.indexOf(PETNODE))
  for (const r of textRows(tree)) expect(visibleLength([{ text: r, color: '' }])).toBeLessThanOrEqual(54)
})

test("the friday sign sits next to the pet, not in the band", async () => {
  const tree = renderPane(els, M, T, { tab: 'diff' }, 80, false, 0, () => {}, { pet: { id: 'clawd', node: PETNODE }, friday: true })
  expect(walk(tree).some(n => typeof n === 'string' && n.includes("it's friday"))).toBe(true)
})

test('no Text in the pane tree carries a key (Text takes none)', async () => {
  for (const [width, compact] of [[54, false], [80, false], [50, true]] as const)
    for (const extra of [{ friday: true }, { bubble: { text: 'hi', mood: 'done' as const } }, { friday: true, bubble: { text: 'ouch', mood: 'fail' as const } }, {}])
      for (const n of walk(renderPane(els, M, T, { tab: 'diff' }, width, compact, 0, () => {}, { pet: { id: 'clawd', node: PETNODE }, ...extra })))
        if (n?.type === 'Text') expect(n.props.key).toBeUndefined()
})

test('petStripCols is the width of the Box the Client sits in', async () => {
  expect(petStripCols(80)).toBe(46)
  expect(petStripCols(54)).toBe(46)
  expect(petStripCols(40)).toBe(34)
  const tree = renderPane(els, M, T, { tab: 'diff' }, 40, false, 0, () => {}, { pet: { id: 'clawd', node: PETNODE } })
  expect(walk(tree).find(n => n.props?.width === 34 && walk(n).includes(PETNODE))).toBeDefined()
})

test('an outfit makes the strip two rows taller', async () => {
  const strip = (rows?: number) => walk(renderPane(els, M, T, { tab: 'diff' }, 54, false, 0, () => {}, { pet: { id: 'clawd', node: PETNODE, rows } })).find(n => n.props?.height && walk(n).includes(PETNODE) && n.props.width === undefined)
  expect(strip()!.props.height).toBe(6)
  expect(strip(8)!.props.height).toBe(8)
})

test('HP and COMBO show in the status box under an arcade look', async () => {
  const rows = text(statusRows({ ...M, combo: 4 }, T, 54, 0, arcade))
  expect(rows[0]).toContain('COMBO x4')
  expect(rows[1]).toContain('HP ')
  expect(rows[1]).toContain('36% context left')
  expect(text(statusRows({ ...M, limits: [{ kind: 'seven_day', percentUsed: 20 }] }, T, 54, 0, arcade))[1]).toContain('80% weekly limit left')
})

test('renderPane draws seven tab buttons with hotkeys 1-7 and presses switch tab', async () => {
  const picked: TabId[] = []
  const tree = renderPane(els, M, T, { tab: 'agents' }, 54, false, 0, id => picked.push(id))
  const buttons = walk(tree).filter(n => n.type === 'Button')
  expect(buttons.map(b => [b.props.key, b.props.hotkey, b.props.label])).toEqual([['tab-plan', '1', 'Plan'], ['tab-context', '2', 'Context'], ['tab-guardrails', '3', 'Guardrails'], ['tab-agents', '4', 'Agents'], ['tab-diff', '5', 'Diff'], ['tab-music', '6', 'Music'], ['tab-settings', '7', 'Settings']])
  expect(buttons.map(b => b.props.variant)).toEqual([undefined, undefined, undefined, 'primary', undefined, undefined, undefined])
  buttons[4].onPress({})
  expect(picked).toEqual(['diff'])
})

const track = { id: 'x', title: 'Fembrook Dr', artist: 'Khary', album: 'uhhh 3', durationMs: 176959 }
const withMusic = (music?: Music): Model => ({ ...initialModel(), music })
const playing: Music = { status: 'open', playing: true, ad: false, progressMs: 73827, readAt: 10000, track }

test('music tab: the cover sits beside title, artist · album and the bar; ♪ until the art arrives', async () => {
  const rows = text(tabRows(withMusic(playing), T, { tab: 'music' }, 54, false, 12000))
  expect(rows).toHaveLength(6)
  expect(rows[0]).toMatch(/^╭─ NOW PLAYING ─+ Spotify ─╮$/)
  expect(inside(rows[1]!)).toBe('          Fembrook Dr')
  expect(inside(rows[2]!)).toBe('   ♪      Khary · uhhh 3')
  expect(inside(rows[3]!)).toBe('')
  expect(inside(rows[4]!).slice(10)).toMatch(/^▶ 1:15 ━+─+ 2:56$/)
  expect(rows.every(r => cellsOf(r) === 54)).toBe(true)
  const cover = Array.from({ length: 4 }, () => [{ text: '▀▀▀▀▀▀▀▀', color: '#111111', bg: '#222222' }])
  const art = tabRows(withMusic(playing), T, { tab: 'music', cover }, 54, false, 12000)
  expect(art[1]![1]).toEqual({ text: '▀▀▀▀▀▀▀▀', color: '#111111', bg: '#222222' })
})

test('music tab: under 40 inner columns there is no cover', async () => {
  const rows = text(tabRows(withMusic(playing), T, { tab: 'music' }, 40, false, 12000)).map(inside)
  expect(rows.slice(1, 4)).toEqual(['Fembrook Dr', 'Khary · uhhh 3', expect.stringMatching(/^▶ 1:15 ━+─+ 2:56$/)])
})

test('music tab: paused, ad, closed, unsupported and an empty album', async () => {
  const at = (m?: Music) => text(tabRows(withMusic(m), T, { tab: 'music' }, 40, false, 12000)).map(inside)
  expect(at({ ...playing, playing: false })[3]).toMatch(/^‖ 1:13 /)
  expect(at({ ...playing, ad: true })[1]).toBe('Ad')
  expect(at({ status: 'closed' })[1]).toBe("Open Spotify to see what's playing.")
  expect(at(undefined)[1]).toBe("Open Spotify to see what's playing.")
  expect(at({ status: 'unsupported', hint: 'needs busctl' })[1]).toBe('needs busctl')
  expect(at({ ...playing, track: { ...track, album: '', durationMs: 0 } })[2]).toBe('Khary')
})

test('music tab: compact is one line and has no controls or seek slot', async () => {
  const p = tabParts(withMusic(playing), T, { tab: 'music' }, 50, true, 12000)
  expect(text(p.rows)).toEqual(['  ♪ Fembrook Dr — Khary ▶'])
  expect(p.controls).toBeUndefined()
  expect(p.seek).toBeUndefined()
})

test('the bar row is a seek slot: the same row object, its border and cover beside it, and the bar props', async () => {
  const p = tabParts(withMusic(playing), T, { tab: 'music' }, 54, false, 12000)
  expect(p.seek!.row).toBe(p.rows[4])
  // the box edge, then the cover's last row (8) and the 2-cell gap
  expect(p.seek!.left.map(s => s.text).join('')).toBe('│ ' + ' '.repeat(10))
  expect(p.seek!.right.map(s => s.text).join('')).toBe(' │')
  expect(p.seek!.props).toEqual({ kind: 'progress', cols: 40, progressMs: 73827, readAt: 10000, durationMs: 176959, playing: true,
    colors: { text: T.colors.text, accent: T.colors.accent, faint: T.colors.faint, dim: T.colors.dim } })
  const seen: unknown[] = []
  const tree = renderPane(els, withMusic(playing), T, { tab: 'music' }, 60, false, 12000, () => {}, { seek: props => { seen.push(props); return { type: 'SeekProbe', props: {}, children: [] } } })
  expect(walk(tree).some(n => n?.type === 'SeekProbe')).toBe(true)
  expect(seen).toHaveLength(1)
})

test('music controls: transport always, shuffle and repeat only when reported; repeat cycles the modes the player has', async () => {
  expect(tabParts(withMusic({ status: 'closed' }), T, { tab: 'music' }, 54, false, 0).controls).toBeUndefined()
  expect(tabParts(withMusic(playing), T, { tab: 'music' }, 54, false, 0).controls).toEqual([
    { key: 'previous', cmd: { cmd: 'previous' }, label: 'Prev', hotkey: 'r' },
    { key: 'playpause', cmd: { cmd: 'playpause' }, label: 'Pause', hotkey: 'p' },
    { key: 'next', cmd: { cmd: 'next' }, label: 'Next', hotkey: 'n' },
  ])
  const full: Music = { ...playing, shuffle: true, repeat: 'context' }
  const c = tabParts(withMusic(full), T, { tab: 'music' }, 54, false, 0).controls!
  expect(c.slice(3)).toEqual([
    { key: 'shuffle', cmd: { cmd: 'shuffle', on: false }, label: '⇄', hotkey: 's', on: true },
    { key: 'repeat', cmd: { cmd: 'repeat', mode: 'track' }, label: '↻', hotkey: 'e', on: true },
  ])
  const mac = tabParts(withMusic(full), T, { tab: 'music', musicCaps: { repeat: ['off', 'context'], shuffle: true, raise: true, volume: false } }, 54, false, 0).controls!
  expect(mac[4]!.cmd).toEqual({ cmd: 'repeat', mode: 'off' })
  const none = tabParts(withMusic(full), T, { tab: 'music', musicCaps: { repeat: [], shuffle: true, raise: true, volume: false } }, 54, false, 0).controls!
  expect(none.map(b => b.key)).toEqual(['previous', 'playpause', 'next', 'shuffle'])
  const mpris = tabParts(withMusic(full), T, { tab: 'music', musicCaps: { repeat: [], shuffle: false, raise: true, volume: false } }, 54, false, 0).controls!
  expect(mpris.map(b => b.key)).toEqual(['previous', 'playpause', 'next'])
  const one = tabParts(withMusic({ ...full, repeat: 'track' }), T, { tab: 'music' }, 54, false, 0).controls!
  expect([one[4]!.label, one[4]!.cmd]).toEqual(['↻1', { cmd: 'repeat', mode: 'off' }])
  const pressed: unknown[] = []
  const tree = renderPane(els, withMusic(full), T, { tab: 'music' }, 60, false, 0, () => {}, { onMusic: c => pressed.push(c) })
  walk(tree).find(n => n.props?.key === 'music-shuffle').onPress({})
  walk(tree).find(n => n.props?.key === 'music-playpause').onPress({})
  expect(pressed).toEqual([{ cmd: 'shuffle', on: false }, { cmd: 'playpause' }])
  expect(walk(tree).find(n => n.props?.key === 'music-repeat').props.dimColor).toBe(false)
})

const conn: Music = { ...playing, source: 'api', liked: true, upNext: { uri: 'spotify:track:n', title: 'Next One', artist: 'Someone', durationMs: 1 }, device: { id: 'd', name: 'Desktop', type: 'Computer', isThisComputer: true } }

test('music tab connected: the heart ends the title row, Up next takes the third line, and l likes', async () => {
  const rows = text(tabRows(withMusic(conn), T, { tab: 'music' }, 54, false, 12000))
  expect(rows[0]).toMatch(/ Spotify ─╮$/)
  expect(inside(rows[1]!)).toMatch(/^ {10}Fembrook Dr +♥$/)
  expect(inside(rows[3]!)).toBe('          Up next: Next One — Someone')
  expect(rows.every(r => cellsOf(r) === 54)).toBe(true)
  expect(tabParts(withMusic(conn), T, { tab: 'music' }, 54, false, 0).controls!.at(-1)).toEqual({ key: 'like', cmd: { cmd: 'like', on: false }, label: '♥', hotkey: 'l', on: true })
  expect(tabParts(withMusic({ ...conn, liked: false }), T, { tab: 'music' }, 54, false, 0).controls!.at(-1)).toMatchObject({ cmd: { cmd: 'like', on: true }, label: '♡', on: false })
  expect(tabParts(withMusic(playing), T, { tab: 'music' }, 54, false, 0).controls!.map(b => b.key)).not.toContain('like')
})

test('music tab: another device on the third line, (local) while falling back, and no third row without a cover unless it has words', async () => {
  const phone: Music = { ...playing, source: 'api', device: { id: 'p', name: 'Pixel 9', type: 'Smartphone', isThisComputer: false } }
  expect(inside(text(tabRows(withMusic(phone), T, { tab: 'music' }, 54, false, 12000))[3]!)).toBe('          on: Pixel 9')
  expect(text(tabRows(withMusic({ ...playing, source: 'local' }), T, { tab: 'music' }, 54, false, 12000))[0]).toMatch(/ Spotify \(local\) ─╮$/)
  const narrow = text(tabRows(withMusic(conn), T, { tab: 'music' }, 40, false, 12000)).map(inside)
  expect(narrow.slice(1, 5)).toEqual([expect.stringMatching(/^Fembrook Dr +♥$/), 'Khary · uhhh 3', 'Up next: Next One — Someone', expect.stringMatching(/^▶ 1:15 /)])
  const p = tabParts(withMusic(conn), T, { tab: 'music' }, 40, false, 12000)
  expect(p.seek!.row).toBe(p.rows[4])
  expect(text(tabRows(withMusic(playing), T, { tab: 'music' }, 40, false, 12000))).toHaveLength(5)
})

test('the Player button follows the music controls only when the pane is given onPlayer', () => {
  const keysOf = (tree: unknown) => walk(tree).map((n: any) => n?.props?.key).filter(Boolean)
  const pressed: string[] = []
  const withIt = renderPane(els, withMusic(playing), T, { tab: 'music' }, 60, false, 0, () => {}, { onPlayer: () => pressed.push('player') })
  const btn = walk(withIt).find((n: any) => n?.props?.key === 'music-player')
  expect(btn.props.hotkey).toBe('o')
  btn.onPress({})
  expect(pressed).toEqual(['player'])
  expect(keysOf(renderPane(els, withMusic(playing), T, { tab: 'music' }, 60, false, 0, () => {}, {}))).not.toContain('music-player')
})

test('the Diff tab lists the most recently touched file first, ties in their given order', async () => {
  const file = (name: string, at: number): Model['files'][number] => ({ path: `/r/${name}`, add: 1, del: 0, how: 'edit', at })
  const m: Model = { ...M, files: [file('old.ts', 1), file('new.ts', 5), file('tie1.ts', 3), file('tie2.ts', 3)] }
  const names = (rows: string[]) => rows.map(r => r.match(/(old|new|tie\d)\.ts/)?.[1]).filter(Boolean)
  expect(names(text(tabRows(m, T, { tab: 'diff' }, 54, false, 0)))).toEqual(['new', 'tie1', 'tie2', 'old'])
  expect(names(text(tabRows(m, T, { tab: 'diff' }, 54, true, 0)))).toEqual(['new', 'tie1', 'tie2', 'old'])
  const diff = Object.fromEntries(m.files.map(f => [f.path, [{ kind: 'add' as const, text: '+x' }]]))
  expect(names(text(tabRows(m, T, { tab: 'diff', diff }, 54, false, 0)))).toEqual(['new', 'tie1', 'tie2', 'old'])
})

const DIFF_FILES: Model['files'] = [
  { path: '/r/src/a.ts', add: 1, del: 1, how: 'edit', at: 2 },
  { path: '/r/src/n.ts', add: 1, del: 0, how: 'new', at: 1 },
]
const DIFF: Record<string, { kind: 'hunk' | 'add' | 'del' | 'ctx' | 'note'; text: string }[]> = {
  '/r/src/a.ts': [{ kind: 'hunk', text: '@@ -1,2 +1,2 @@ f' }, { kind: 'ctx', text: ' keep' }, { kind: 'del', text: '-old' }, { kind: 'add', text: '+new' }],
  '/r/src/n.ts': [{ kind: 'hunk', text: '@@ -0,0 +1 @@' }, { kind: 'add', text: '+fresh' }],
}

test('the Diff tab is one box with a header per file and the hunks under it, colored by the theme', async () => {
  const m = { ...M, files: DIFF_FILES }
  const segs = tabRows(m, T, { tab: 'diff', diff: DIFF }, 54, false, 0)
  const rows = text(segs)
  expect(rows[0]).toMatch(/^╭─ DIFF ─+ 2 files  \+2 −1 ─╮$/)
  expect(rows.at(-1)).toBe('╰' + '─'.repeat(52) + '╯')
  expect(rows.some(r => /^✎ src\/a\.ts +\+1 −1$/.test(inside(r)))).toBe(true)
  expect(rows.some(r => /^✎ src\/n\.ts  new +\+1 −0$/.test(inside(r)))).toBe(true)
  const row = (frag: string) => segs[rows.findIndex(r => r.includes(frag))]!
  const c = T.colors
  expect(row('@@ -1,2').find(s => s.text.includes('@@'))).toMatchObject({ color: c.dim })
  expect(row('+new').find(s => s.text.includes('+new'))).toMatchObject({ color: c.pass, bg: c.addBg })
  expect(row('-old').find(s => s.text.includes('-old'))).toMatchObject({ color: c.fail, bg: c.delBg })
  expect(row(' keep').find(s => s.text.includes('keep'))).toMatchObject({ color: c.text })
  expect(row(' keep').some(s => s.bg)).toBe(false)
  // the colored bar runs the full inner width
  expect(row('+new').filter(s => s.bg).reduce((n, s) => n + s.text.length, 0)).toBe(50)
  expect(rows.slice(1, -1).every(r => cellsOf(r) === 54)).toBe(true)
})

test('the Diff tab cuts long lines at the pane width and says when no file has changed', async () => {
  const m = { ...M, files: [DIFF_FILES[0]!] }
  const long = { '/r/src/a.ts': [{ kind: 'add' as const, text: '+' + 'x'.repeat(200) }] }
  const rows = text(tabRows(m, T, { tab: 'diff', diff: long }, 54, false, 0))
  expect(rows.every(r => cellsOf(r) <= 54)).toBe(true)
  expect(rows.some(r => r.includes('xxx…'))).toBe(true)
  expect(text(tabRows({ ...M, files: [] }, T, { tab: 'diff' }, 54, false, 0)).some(r => r.includes('Nothing changed yet.'))).toBe(true)
})

test('the Diff tab stops at 2000 diff lines and counts the rest in a dim line', async () => {
  const lines = Array.from({ length: 2500 }, (_, i) => ({ kind: 'add' as const, text: '+line ' + i }))
  const m = { ...M, files: [DIFF_FILES[0]!] }
  const segs = tabRows(m, T, { tab: 'diff', diff: { '/r/src/a.ts': lines } }, 54, false, 0)
  const rows = text(segs)
  expect(rows.some(r => r.includes('+line 1999'))).toBe(true)
  expect(rows.some(r => r.includes('+line 2000'))).toBe(false)
  const more = rows.findIndex(r => r.includes('… 500 more lines'))
  expect(more).toBeGreaterThan(0)
  expect(segs[more]!.find(s => s.text.includes('more lines'))).toMatchObject({ color: T.colors.dim })
})

test('the Diff tab scrolls with the pane window, pet and status box in place', async () => {
  const lines = Array.from({ length: 80 }, (_, i) => ({ kind: 'add' as const, text: '+line ' + i }))
  const m = { ...M, files: [DIFF_FILES[0]!] }
  const draw = (offset?: number) => renderPane(els, m, T, { tab: 'diff', offset, diff: { '/r/src/a.ts': lines } }, 54, false, 0, () => {}, { pet: { id: 'clawd', node: PETNODE }, bodyRows: 30 }) as any
  const all = (t: any) => textRows(t).join('\n')
  expect(all(draw())).toContain('+line 0')
  expect(all(draw())).not.toContain('+line 60')
  expect(all(draw(1000))).toContain('+line 79')
  expect(rowsOf(draw(1000))).toBeLessThanOrEqual(30)
  expect(walk(draw())).toContain(PETNODE)
})

test('renderPane drops the status section when compact', async () => {
  const bordered = (compact: boolean) => walk(renderPane(els, M, T, { tab: 'plan' }, 58, compact, 0, () => {})).some(n => n.props?.borderStyle)
  expect(bordered(false)).toBe(true)
  expect(bordered(true)).toBe(false)
})

const SAMPLES = [
  ...MOMENTS.flatMap(m => anyLine(BUILTIN_LINES.clawd, m, { n: '3', command: 'npm', file: 'a.ts' })),
  'tests are sulking, so am i, honestly ok',
  'green at last, i knew you had it in you',
  'supercalifragilisticexpialidocious!!!!!!',
  'a b c d e f g h i j k l m n o p q r s t',
  'x'.repeat(40),
]

test('every bubble line wraps at spaces, in two rows at most, inside the pane', { timeoutMs: 20000 }, async () => {
  for (const [width, compact] of [[30, false], [40, false], [60, false], [90, false], [30, true], [40, true], [60, true]] as const) {
    const box = bubbleBox(width, compact)
    for (const text of SAMPLES) {
      const tree = renderPane(els, M, T, { tab: 'diff' }, width, compact, 0, () => {}, { pet: { id: 'clawd', node: PETNODE }, bubble: { text, mood: 'fail' } })
      const bub = walk(tree).find(n => n?.props?.borderColor === T.colors.fail)
      // the bubble's own rows are checked line by line below; textRows would join its lines
      const own = (bub?.children ?? []).map((c: any) => c.children.join('')).join('')
      for (const r of textRows(tree)) if (r !== own) expect(visibleLength([{ text: r, color: '' }]), `${width} ${text}`).toBeLessThanOrEqual(width)
      const lines: string[] = compact
        ? [String(walk(tree).filter(n => n?.type === 'Text' && typeof n.children?.[0] === 'string' && n.children[0].startsWith(' ')).map(n => n.children[0]).pop() ?? '').trim()]
        : (bub?.children ?? []).map((c: any) => c.children.join(''))
      expect(lines.length, `${width} ${text}`).toBeGreaterThan(0)
      expect(lines.length).toBeLessThanOrEqual(box.lines)
      const words = new Set(text.split(' '))
      lines.forEach((l, i) => {
        expect(visibleLength([{ text: l, color: '' }]), `${width}/${compact} ${text} -> ${l}`).toBeLessThanOrEqual(box.cols)
        const cut = l.endsWith('…')
        const parts = l.replace(/…$/, '').split(' ').filter(Boolean)
        // a whole word, unless this line was cut at its end
        parts.forEach((p, j) => { if (!(cut && j === parts.length - 1 && i === lines.length - 1)) expect(words.has(p), `${l}`).toBe(true) })
      })
      if (!lines.at(-1)!.endsWith('…')) expect(lines.join(' ')).toBe(text)
    }
  }
})

// Rows a tree takes: Box columns sum, rows take the tallest, a set height wins, a border adds two.
const rowsOf = (n: any): number => {
  if (!n || typeof n !== 'object') return 0
  if (n.type === 'Text' || n.type === 'Button') return 1
  if (n.type !== 'Box') return 0
  const kids = (n.children ?? []).flat(Infinity).map(rowsOf)
  const inside = n.props.flexDirection === 'row' ? Math.max(0, ...kids) : kids.reduce((a: number, b: number) => a + b, 0)
  return (n.props.height ?? inside) + (n.props.borderStyle ? 2 : 0) + (n.props.marginTop ?? 0)
}

test('a long tab leaves the pet and status box in the rows the pane has, docked or inline', async () => {
  const BODY = 30
  for (const [width, compact] of [[54, false], [80, false], [50, true]] as const)
    for (const tab of ['diff', 'agents', 'plan'] as const) {
      const tree = renderPane(els, many(60), T, { tab }, width, compact, 0, () => {}, { pet: { id: 'clawd', node: PETNODE }, bodyRows: compact ? COMPACT_ROWS : BODY, minRows: compact ? undefined : BODY }) as any
      expect(rowsOf(tree), `${tab} ${width}`).toBeLessThanOrEqual(compact ? COMPACT_ROWS : BODY)
      expect(walk(tree)).toContain(PETNODE)
    }
})

test('with a bubble above the pet the long tab still fits the body exactly', async () => {
  const tree = renderPane(els, many(60), T, { tab: 'diff' }, 54, false, 0, () => {}, { pet: { id: 'clawd', node: PETNODE }, bubble: { text: 'ouch, 3 failed', mood: 'fail' }, bodyRows: 30 }) as any
  expect(rowsOf(tree)).toBe(30)
})

test('a pet shorter than its bubble still gets the whole bubble beside it', async () => {
  for (const text of ['blob done', 'a much longer line that needs both of the bubble rows to fit'])
    for (const rows of [1, 2, 3]) {
      const tree = renderPane(els, many(60), T, { tab: 'diff' }, 80, false, 0, () => {}, { pet: { id: 'clawd', node: PETNODE, rows }, bubble: { text, mood: 'done' }, bodyRows: 30, minRows: 30 }) as any
      const bubble = walk(tree).find(n => n?.props?.key === 'bubble')
      const strip = walk(tree).find(n => n?.type === 'Box' && n.props.flexDirection === 'row' && walk(n).includes(bubble))
      expect(strip.props.height, `${rows} ${text}`).toBeGreaterThanOrEqual(rowsOf(bubble))
      expect(rowsOf(tree), `${rows} ${text}`).toBe(30)
    }
})

test('a long tab scrolls inside its rows, with plain hints for the hidden ones', async () => {
  const draw = (offset?: number, tab: TabId = 'diff') => renderPane(els, many(60), T, { tab, offset }, 54, false, 0, () => {}, { pet: { id: 'clawd', node: PETNODE }, bodyRows: 30 }) as any
  const all = (t: any) => walk(t).filter(n => n.type === 'Text').map(n => n.children.join('')).join('\n')
  const hints = (t: any) => walk(t).filter(n => n.type === 'Text' && /^[↑↓] \d+ more$/.test(n.children.join('')))
  const said = (t: any) => hints(t).map(h => h.children.join(''))
  expect(all(draw())).toContain('f0.ts')
  expect(all(draw())).not.toContain('f40.ts')
  expect(said(draw())).toEqual([expect.stringMatching(/^↓ \d+ more$/)])
  expect(all(draw(1000))).toContain('f59.ts')
  expect(said(draw(1000))).toEqual([expect.stringMatching(/^↑ \d+ more$/)])
  expect(said(draw(5)).map(h => h[0])).toEqual(['↑', '↓'])
  expect(rowsOf(draw(1000))).toBeLessThanOrEqual(30)
  for (const tab of ['diff', 'agents', 'plan'] as const) {
    const t = draw(3, tab)
    expect(hints(t).length, tab).toBeGreaterThan(0)
    expect(hints(t).every(h => h.props.color === T.colors.dim), tab).toBe(true)
    expect(walk(t).filter(n => n.type === 'Button' && /more/.test(n.props.label)), tab).toEqual([])
    expect(walk(t)).toContain(PETNODE)
  }
})

test('the hidden counts add up to the rows the window leaves out', async () => {
  const counts = (offset: number) => {
    const t = renderPane(els, many(60), T, { tab: 'diff', offset }, 54, false, 0, () => {}, { pet: { id: 'clawd', node: PETNODE }, bodyRows: 30 }) as any
    const n = (c: string) => Number(walk(t).filter(x => x.type === 'Text').map(x => x.children.join('')).find(x => x.startsWith(c))?.match(/\d+/)?.[0] ?? 0)
    return [n('↑'), n('↓')]
  }
  const below0 = counts(0)[1]!
  expect(counts(0)[0]).toBe(0)
  expect(counts(4)).toEqual([4, below0 - 4])
  expect(counts(1000)[1]).toBe(0)
})

test('the plan tab folds a finished plan into one line in the pass color', async () => {
  const done = (n: number): Model => ({ ...M, plan: Array.from({ length: n }, (_, i) => ({ id: String(i), title: 'step ' + i, status: 'completed' as const })), planFolded: Array.from({ length: n }, (_, i) => String(i)) })
  for (const compact of [false, true]) {
    const rows = tabRows(done(5), T, { tab: 'plan' }, 54, compact, 0)
    const line = rows.find(r => r.some(s => s.text.includes('plan done')))!
    expect(line.find(s => s.text.includes('plan done'))!.text).toBe('✓ plan done · 5 tasks')
    expect(line.find(s => s.text.includes('plan done'))!.color).toBe(T.colors.pass)
    expect(text(rows).join('\n')).not.toContain('step 0')
  }
  expect(text(tabRows(done(1), T, { tab: 'plan' }, 54, false, 0)).join('\n')).toContain('✓ plan done · 1 task ')
  const open: Model = { ...done(3), plan: [...done(3).plan, { id: '9', title: 'late one', status: 'pending' }] }
  const shown = text(tabRows(open, T, { tab: 'plan' }, 54, false, 0)).join('\n')
  expect(shown).toContain('late one')
  expect(shown).not.toContain('plan done')
  // the fold is the whole box: the context has a tab of its own
  expect(text(tabRows(done(3), T, { tab: 'plan' }, 54, false, 0)).join('\n')).not.toMatch(/CONTEXT/)
})

test('a long tab keeps its box edges and scrolls only the first body', async () => {
  const draw = (tab: TabId, bodyRows: number, offset?: number) => renderPane(els, many(40), T, { tab, offset }, 54, false, 0, () => {}, { pet: { id: 'clawd', node: PETNODE }, bodyRows }) as any
  const status = statusRows(many(40), T, 54 - 2 - 4, 0).length
  for (const offset of [0, 5]) {
    const rows = textRows(draw('diff', 30, offset)).slice(0, -status).filter(r => !/^[↑↓] \d+ more/.test(r))
    expect(rows[0], `${offset}`).toMatch(/^╭─ DIFF/)
    expect(rows.at(-1), `${offset}`).toMatch(/^╰/)
    expect(rows.join('\n')).toContain(`f${offset}.ts`)
  }
  // the plan tab is one box, its body the window that scrolls, with both edges kept
  const rows = textRows(draw('plan', 42)).slice(0, -status).filter(r => !/^[↑↓] \d+ more/.test(r))
  expect(rows[0]).toMatch(/^╭─ PLAN/)
  expect(rows.at(-1)).toMatch(/^╰/)
  expect(rows.some(r => r.startsWith('╭─ CONTEXT'))).toBe(false)
})

test('the docked status box is as wide as the section boxes', async () => {
  const tree = renderPane(els, M, T, { tab: 'diff' }, 54, false, 0, () => {}, { pet: { id: 'clawd', node: PETNODE } })
  expect(walk(tree).find(n => n.props?.borderStyle).props.width).toBe(52)
})

test('the context warning follows meter.danger', () => {
  const m = { ...initialModel(), ctxPercent: 75 }
  const text = (meter?: { warn: number; danger: number }) => tabRows(m, T, { tab: 'context', meter }, 80, false, 0).flat().map(s => s.text).join('')
  expect(text()).not.toContain('context 75% used')
  expect(text({ warn: 50, danger: 70 })).toContain('context 75% used')
})

test('tabs follow the setup and an open hidden tab falls to the first shown one', () => {
  expect(visibleTabs(undefined, 'agents')).toEqual({ tabs: [['plan', 'Plan'], ['context', 'Context'], ['guardrails', 'Guardrails'], ['agents', 'Agents'], ['diff', 'Diff'], ['music', 'Music'], ['settings', 'Settings']], tab: 'agents' })
  expect(visibleTabs(['plan', 'diff'], 'agents')).toEqual({ tabs: [['plan', 'Plan'], ['diff', 'Diff']], tab: 'plan' })
})
