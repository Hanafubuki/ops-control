import { test, expect } from 'claude-code/testing'
import { styleRow, type RowInput } from '../hooks/rows.tsx'
import { resolveLook, type Look } from '../hooks/packs.ts'

const els = { Box: 'Box', Text: 'Text' }
const ENGINE = { type: 'engine', ref: 7 }
const look = (n: string) => resolveLook({ colors: n, motion: n }, {}, {}).look
const walk = (n: any, out: any[] = []): any[] => { if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }
const text = (n: any) => walk(n).flatMap(x => (x.children ?? []).filter((c: unknown) => typeof c === 'string')).join('')
const hasEngine = (n: any) => walk(n).includes(ENGINE)
const inner = (n: any) => (n.props?.marginLeft === 1 && n.children?.length === 1 ? n.children[0] : n)
const tool = (o: Partial<Extract<RowInput, { site: 'ToolUse' }>> = {}): RowInput => ({ site: 'ToolUse', tool: 'Read', input: { file_path: '/r/src/auth.ts' }, isRunning: false, isErrored: false, isInterrupted: false, ...o })
const user = (o: Partial<Extract<RowInput, { site: 'UserMessage' }>> = {}): RowInput => ({ site: 'UserMessage', text: 'fix the test', isExpanded: false, own: true, ...o })

test('classic leaves every row to the engine, plus the finished tool glyph', async () => {
  const l = look('classic')
  for (const r of [user(), { site: 'AssistantMessage', isFirstOfReply: true } as RowInput, { site: 'ToolResult' } as RowInput]) expect(styleRow(els, l, r, ENGINE)).toBe(ENGINE)
  expect(text(styleRow(els, l, tool(), ENGINE))).toContain('▸')
  expect(styleRow(els, l, tool({ isRunning: true }), ENGINE)).toBe(ENGINE)
})

// The bar and the tool frame are absolute overlays (see card() in rows.tsx): a column of ▎, a bordered Box.
const bar = (n: any) => walk(n).find(x => x.type === 'Text' && String(x.children?.[0]).startsWith('▎\n'))
const bordered = (n: any) => walk(n).some(x => x.props?.borderStyle)
const frame = (n: any) => walk(n).find(x => x.props?.borderStyle && x.props.position === 'absolute')
const asst = (first = true): RowInput => ({ site: 'AssistantMessage', isFirstOfReply: first })

const withFlags = (l: Look, f: Partial<Look['rowFlags']>): Look => ({ ...l, rowFlags: { ...l.rowFlags, ...f } })

test('cards: messages have no box, a side bar in accent (you) or faint (claude), accent label', async () => {
  const l: Look = { ...withFlags(look('arcade'), { labels: true, markers: false, xp: false }), gradient: undefined }
  const u = styleRow(els, l, user(), ENGINE)
  expect(bordered(u)).toBe(false)
  expect(bar(u).props.color).toBe(l.theme.colors.accent)
  const label = walk(u).find(x => x.type === 'Text' && text(x) === 'you')
  expect([label.props.color, label.props.bold]).toEqual([l.theme.colors.accent, undefined])
  expect(hasEngine(u)).toBe(true)
  for (const first of [true, false]) {
    const a = styleRow(els, l, asst(first), ENGINE)
    expect(bordered(a)).toBe(false)
    expect(bar(a).props.color).toBe(l.theme.colors.faint)
    expect(hasEngine(a)).toBe(true)
  }
})

test('cards: tool rows keep the pack border style, framed in faint', async () => {
  const l = look('arcade')
  const card = inner(styleRow(els, l, tool(), ENGINE)) as any
  expect([frame(card).props.borderStyle, frame(card).props.borderColor]).toEqual(['bold', l.theme.colors.faint])
  expect(frame(card).props.borderColor).not.toBe(l.borderColor)
  expect(hasEngine(card)).toBe(true)
})

test('cards: the frame and the bar lie over the engine row, so its blank margin line becomes the top edge', async () => {
  const l = look('arcade')
  const f = frame(styleRow(els, l, tool(), ENGINE)).props
  expect([f.top, f.bottom, f.left, f.right]).toEqual([0, 0, 0, 0])
  const b = walk(styleRow(els, look('cozy'), user(), ENGINE)).find(x => x.props?.position === 'absolute').props
  // the bar starts a line down, beside the text and not on the margin line
  expect([b.top, b.bottom, b.left, b.width, b.overflow]).toEqual([1, 0, 0, 1, 'hidden'])
})

test('cards: tool results stay indented 2', async () => {
  const r = inner(styleRow(els, look('cozy'), { site: 'ToolResult' }, ENGINE)) as any
  expect(r.props.paddingLeft).toBe(2)
  expect(bordered(r)).toBe(false)
})

test('cards: claude label only on the first block of a reply', async () => {
  const l = withFlags(look('cozy'), { labels: true })
  expect(text(styleRow(els, l, { site: 'AssistantMessage', isFirstOfReply: true }, ENGINE))).toContain('claude')
  expect(text(styleRow(els, l, { site: 'AssistantMessage', isFirstOfReply: false }, ENGINE))).not.toContain('claude')
})

test('cozy keeps its bars and drops the you and claude labels', async () => {
  const l = look('cozy')
  expect(l.rowFlags).toEqual({ labels: false, markers: false, xp: false })
  const u = styleRow(els, l, user(), ENGINE)
  const a = styleRow(els, l, asst(), ENGINE)
  expect(text(u).replace(/[▎\n]/g, '')).toBe('')
  expect(bar(u).props.color).toBe(l.theme.colors.accent)
  expect(text(a).replace(/[▎\n]/g, '')).toBe('')
  expect(bar(a).props.color).toBe(l.theme.colors.faint)
})

test('arcade: a pink triangle marks your prompt, a cyan diamond marks the reply, no labels and no bars', async () => {
  const l = look('arcade')
  const c = l.theme.colors
  const u = styleRow(els, l, user(), ENGINE)
  expect(text(u)).toBe('▶ ')
  expect(walk(u).find(x => x.type === 'Text')?.props.color).toBe(c.accent)
  expect(bar(u)).toBeUndefined()
  expect(hasEngine(u)).toBe(true)
  const a = styleRow(els, l, asst(), ENGINE)
  expect(text(a)).toBe('◆ ')
  expect(walk(a).find(x => x.type === 'Text')?.props.color).toBe(c.read)
  expect(bar(a)).toBeUndefined()
  expect(bordered(a)).toBe(false)
  expect(text(styleRow(els, l, asst(false), ENGINE))).toBe('  ')
})

test('arcade: +N XP sits above the first block of a reply, right-aligned with flex only, and is left out at 0', async () => {
  const l = look('arcade')
  const a = styleRow(els, l, { site: 'AssistantMessage', isFirstOfReply: true, xp: 4 }, ENGINE)
  expect(text(a)).toBe('+4 XP◆ ')
  const tag = walk(a).find(x => x.type === 'Text' && text(x) === '+4 XP')
  expect(tag.props.color).toBe(l.theme.colors.edit)
  const row = walk(a).find(x => x.type === 'Box' && x.children?.includes(tag))
  expect([row.props.flexDirection, row.props.justifyContent, row.props.width, row.props.minWidth]).toEqual(['row', 'flex-end', undefined, undefined])
  expect(text(styleRow(els, l, { site: 'AssistantMessage', isFirstOfReply: true, xp: 0 }, ENGINE))).toBe('◆ ')
  expect(text(styleRow(els, l, { site: 'AssistantMessage', isFirstOfReply: false, xp: 4 }, ENGINE))).toBe('  ')
  expect(text(styleRow(els, look('cozy'), { site: 'AssistantMessage', isFirstOfReply: true, xp: 4 }, ENGINE))).not.toContain('XP')
})

test('retro: labels off drops [YOU] and [CLAUDE]', async () => {
  const l = withFlags(look('crt'), { labels: false })
  expect(text(styleRow(els, l, user(), ENGINE))).toBe('')
  expect(text(styleRow(els, l, asst(), ENGINE))).toBe('')
})

test('tool marks: done, failed, interrupted, running', async () => {
  for (const [n, marks] of [['arcade', ['✓', '✗', '■', '…']], ['crt', ['[ OK ]', '[FAIL]', '[STOP]', '[....]']]] as const) {
    const l = look(n)
    const got = [tool(), tool({ isErrored: true }), tool({ isInterrupted: true }), tool({ isRunning: true })].map(r => text(styleRow(els, l, r, ENGINE)))
    marks.forEach((m, i) => expect(got[i]).toContain(m))
  }
})

test('minimal: own one-liner for a finished tool; errors and interruptions stay the engine', async () => {
  const l: Look = { ...look('classic'), rows: 'minimal' }
  const done = styleRow(els, l, tool(), ENGINE)
  expect(hasEngine(done)).toBe(false)
  expect(text(done)).toContain('· Reading src/auth.ts')
  expect(inner(styleRow(els, l, tool({ isErrored: true }), ENGINE))).toBe(ENGINE)
  expect(inner(styleRow(els, l, tool({ isInterrupted: true }), ENGINE))).toBe(ENGINE)
  expect(text(styleRow(els, l, user(), ENGINE))).toBe('› fix the test')
})

test("only the person's own, compact prompts are styled", async () => {
  for (const n of ['arcade', 'crt']) {
    expect(inner(styleRow(els, look(n), user({ own: false }), ENGINE))).toBe(ENGINE)
    expect(inner(styleRow(els, look(n), user({ isExpanded: true }), ENGINE))).toBe(ENGINE)
  }
})

test('a throw inside a style returns the engine element', async () => {
  const broken = { ...look('arcade'), get theme(): never { throw new Error('boom') } } as Look
  expect(inner(styleRow(els, broken, tool(), ENGINE))).toBe(ENGINE)
})

test('retro: bold [YOU] and [CLAUDE] tags, engine indented 3', async () => {
  const l = look('crt')
  const u = styleRow(els, l, user(), ENGINE)
  expect(text(u)).toBe('[YOU]')
  expect(walk(u).find(n => n.type === 'Text')?.props.bold).toBe(true)
  const first = styleRow(els, l, { site: 'AssistantMessage', isFirstOfReply: true }, ENGINE)
  expect(text(first)).toBe('[CLAUDE]')
  expect(walk(first).find(n => n.type === 'Text')?.props.bold).toBe(true)
  const pad = (n: any) => walk(n).find(x => x.props?.paddingLeft)?.props.paddingLeft
  expect(pad(first)).toBe(3)
  expect(pad(styleRow(els, l, { site: 'AssistantMessage', isFirstOfReply: false }, ENGINE))).toBe(3)
  expect(pad(styleRow(els, l, { site: 'ToolResult' }, ENGINE))).toBe(3)
})

test('prefixCards: tool rows also use a faint side bar instead of a border', async () => {
  const l = look('arcade')
  const c = styleRow(els, l, tool(), ENGINE, { prefixCards: true })
  expect(bordered(c)).toBe(false)
  expect(bar(c).props.color).toBe(l.theme.colors.faint)
  expect(hasEngine(c)).toBe(true)
  expect(text(c)).toContain('✓')
})

test('prefixCards leaves message rows as they are without it', async () => {
  const l = look('cozy')
  expect(bar(styleRow(els, l, user(), ENGINE, { prefixCards: true })).props.color).toBe(l.theme.colors.accent)
  expect(bar(styleRow(els, l, asst(), ENGINE, { prefixCards: true })).props.color).toBe(l.theme.colors.faint)
})

test('non-classic styles indent every row one column, classic does not', async () => {
  const rows: RowInput[] = [user(), user({ own: false }), asst(), asst(false), tool(), tool({ isErrored: true }), { site: 'ToolResult' }]
  for (const style of ['cards', 'minimal', 'retro', 'slab'] as const) {
    const l: Look = { ...look('arcade'), rows: style }
    for (const r of rows) {
      const s = styleRow(els, l, r, ENGINE) as any
      expect([style, r.site, s.type, s.props.marginLeft, s.props.flexDirection]).toEqual([style, r.site, 'Box', 1, 'column'])
      expect(s.children).toHaveLength(1)
    }
  }
  const cl: Look = { ...look('arcade'), rows: 'classic' }
  for (const r of rows) expect((styleRow(els, cl, r, ENGINE) as any).props?.marginLeft).toBeUndefined()
})

test('the margin wrapper leaves the inner row untouched', async () => {
  const l: Look = { ...look('arcade'), rows: 'cards' }
  const s = styleRow(els, l, tool(), ENGINE) as any
  expect(s.children).toHaveLength(1)
  expect(s.children[0].props.marginLeft).toBeUndefined()
  expect(frame(s.children[0])).toBeTruthy()
})

test('other styles never draw the side bar or a border on messages', async () => {
  for (const rows of ['minimal', 'retro', 'classic'] as const) {
    const l: Look = { ...look('arcade'), rows }
    for (const r of [user(), asst()]) {
      const s = styleRow(els, l, r, ENGINE)
      expect(bar(s)).toBeUndefined()
      expect(bordered(s)).toBe(false)
    }
  }
})

const cols = (n: any): number => walk(n).filter(x => x.type === 'Text').flatMap(x => x.children ?? []).reduce((s: number, c: any) => s + (typeof c === 'string' ? [...c].length : 0), 0)
// Columns added on the engine's own line: margins, padding, borders, and row-direction siblings.
function beside(n: any): number {
  if (n === ENGINE) return 0
  const p = n.props ?? {}
  const own = (p.marginLeft ?? 0) + (p.paddingLeft ?? 0) + (p.paddingRight ?? 0) + 2 * (p.paddingX ?? 0) + (p.borderStyle ? 2 : 0)
  const kids = n.children ?? []
  const hit = kids.findIndex((k: any) => k === ENGINE || (k && typeof k === 'object' && walk(k).includes(ENGINE)))
  if (hit < 0) return own
  // an absolute sibling is out of the flow and takes no columns
  const sib = p.flexDirection === 'row' ? kids.reduce((s: number, k: any, i: number) => (i === hit || typeof k !== 'object' || k?.props?.position === 'absolute' ? s : s + cols(k)), 0) : 0
  return own + sib + beside(kids[hit])
}

test('width budget: ToolResult and UserMessage rows add at most 4 columns beside the engine', async () => {
  for (const name of ['cozy', 'arcade', 'crt']) {
    for (const rows of ['cards', 'retro', 'minimal', 'slab'] as const) {
      const l: Look = { ...look(name), rows }
      for (const r of [user(), asst(), asst(false), { site: 'ToolResult' } as RowInput]) {
        const s = styleRow(els, l, r, ENGINE)
        if (hasEngine(s)) expect([name, rows, r.site, beside(s) <= 4]).toEqual([name, rows, r.site, true])
      }
    }
  }
  expect(beside(styleRow(els, look('crt'), { site: 'ToolResult' }, ENGINE))).toBe(4)
  expect(beside(styleRow(els, look('crt'), asst(false), ENGINE))).toBe(4)
})

test('retro: [YOU] sits on its own line above the engine row', async () => {
  const u = inner(styleRow(els, look('crt'), user(), ENGINE)) as any
  expect(u.props.flexDirection).toBe('column')
  expect(text(u)).toBe('[YOU]')
  expect(u.children.at(-1)).toBe(ENGINE)
})

test('tool header marks and tags never shrink or wrap; the engine box gives up width', async () => {
  for (const [name, rows] of [['crt', 'retro'], ['arcade', 'cards']] as const) {
    for (const prefixCards of [false, true]) {
      const s = styleRow(els, { ...look(name), rows }, tool(), ENGINE, { prefixCards })
      const mk = walk(s).find(x => x.type === 'Text' && /✓|\[ OK \]/.test(text(x)))
      const wrapper = walk(s).find(x => x.type === 'Box' && x.children?.includes(mk))
      expect([name, prefixCards, wrapper.props.flexShrink, mk.props.wrap]).toEqual([name, prefixCards, 0, 'truncate'])
      const eng = walk(s).find(x => x.type === 'Box' && x.children?.includes(ENGINE))
      expect([name, prefixCards, eng.props.flexShrink, eng.props.minWidth, eng.props.overflow]).toEqual([name, prefixCards, 1, undefined, undefined])
    }
  }
  const c = styleRow(els, look('classic'), tool(), ENGINE) as any
  const g = walk(c).find(x => x.type === 'Text' && text(x).includes('▸'))
  expect([walk(c).find(x => x.type === 'Box' && x.children?.includes(g)).props.flexShrink, g.props.wrap]).toEqual([0, 'truncate'])
  const ce = walk(c).find(x => x.type === 'Box' && x.children?.includes(ENGINE))
  expect([ce.props.flexShrink, ce.props.minWidth, ce.props.overflow]).toEqual([1, undefined, undefined])
  expect(c.props.marginLeft).toBeUndefined()
  const tag = walk(styleRow(els, look('crt'), tool(), ENGINE)).find(x => x.type === 'Box' && x.props?.flexShrink === 0 && text(x).startsWith('[READ'))
  expect(tag).toBeDefined()
})

const slab = (): Look => ({ ...look('classic'), rows: 'slab' })

test('slab: your prompt is an accent bar with its own text and the turn number', async () => {
  const l = slab(), c = l.theme.colors
  const u = inner(styleRow(els, l, { ...user(), turn: 3 } as RowInput, ENGINE))
  expect(hasEngine(u)).toBe(false)
  expect(walk(u).some(x => x.props?.backgroundColor === c.accent)).toBe(true)
  expect(text(u)).toContain('fix the test')
  expect(text(u)).toContain('PROMPT 03')
  const prompt = walk(u).find(x => x.type === 'Text' && text(x).includes('fix the test'))
  expect(prompt.props.color).toBe(l.bg)
  expect(text(prompt)).toBe('fix the test')
  expect(walk(u).find(x => x.type === 'Box' && x.children?.includes(prompt)).props.paddingX).toBe(1)
})

test('slab: a long prompt keeps all its text and is never truncated', async () => {
  const long = 'make the slab bar wrap '.repeat(20).trim()
  const u = styleRow(els, slab(), { ...user({ text: long }), turn: 1 } as RowInput, ENGINE)
  expect(text(u)).toContain(long)
  expect(walk(u).some(x => x.props?.wrap === 'truncate' && text(x).includes('make the slab'))).toBe(false)
})

test('slab: an expanded or foreign prompt stays the engine row', async () => {
  for (const r of [user({ isExpanded: true }), user({ own: false })]) expect(inner(styleRow(els, slab(), r, ENGINE))).toBe(ENGINE)
})

test('slab: tool rows carry the number, the upper-case tool in its role color, the engine line and the mark', async () => {
  const l = slab(), c = l.theme.colors
  const cases: [Partial<Extract<RowInput, { site: 'ToolUse' }>>, string, string][] = [
    [{}, 'OK', c.pass],
    [{ isErrored: true }, 'FAIL', c.fail],
    [{ isInterrupted: true }, 'STOP', c.dim],
    [{ isRunning: true }, '…', c.dim],
  ]
  for (const [o, mark, color] of cases) {
    const r = styleRow(els, l, { ...tool(o), seq: 2 } as RowInput, ENGINE)
    expect(hasEngine(r)).toBe(true)
    expect(text(r)).toContain('02')
    expect(text(r)).toContain('READ')
    expect(walk(r).find(x => x.type === 'Text' && text(x) === 'READ  ')?.props.color).toBe(c.read)
    expect(walk(r).find(x => x.type === 'Text' && text(x).trim() === mark)?.props.color).toBe(color)
  }
  const bash = styleRow(els, l, { ...tool({ tool: 'Bash', input: { command: 'pnpm test' } }), seq: 1 } as RowInput, ENGINE)
  expect(walk(bash).find(x => x.type === 'Text' && text(x) === 'BASH  ')?.props.color).toBe(c.shell)
})

test('slab: tool results sit indented under their call', async () => {
  const r = inner(styleRow(els, slab(), { site: 'ToolResult' }, ENGINE)) as any
  expect(r.props.paddingLeft).toBe(3)
  expect(hasEngine(r)).toBe(true)
})

test('slab: the first block of a reply gets an accent rule on its margin line, later blocks nothing', async () => {
  const l = slab()
  const first = styleRow(els, l, asst(true), ENGINE)
  const rule = walk(first).find(x => x.props?.position === 'absolute')
  expect([rule.props.top, rule.props.left]).toEqual([0, 0])
  expect(text(rule)).toBe('────────')
  expect(hasEngine(first)).toBe(true)
  expect(inner(styleRow(els, l, asst(false), ENGINE))).toBe(ENGINE)
})
