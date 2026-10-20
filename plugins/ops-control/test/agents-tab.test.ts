import { expect } from 'claude-code/testing'
import { LOG_STEPS, applyEvent as reduce, initialModel, type Model } from '../hooks/model.ts'
import { MAIN_AGENT, renderPane, tabParts } from '../hooks/pane.tsx'
import { resolveTheme } from '../hooks/themes.ts'
import { test } from './kit.ts'

const T = resolveTheme('classic', {}).theme
const text = (rows: { text: string }[][]) => rows.map(r => r.map(s => s.text).join(''))

function withAgents(): Model {
  let m = initialModel()
  m = reduce(m, { type: 'turn-start', at: 1_000 })
  m = reduce(m, { type: 'tool-start', at: 1_100, tool: 'Agent', toolUseId: 'call-1', input: { subagent_type: 'Explore', description: 'Find the tab code', prompt: 'Look through hooks/pane.tsx and report how tabs are drawn.' } })
  m = reduce(m, { type: 'agent-bind', toolUseId: 'call-1', agentId: 'ag-1' })
  m = reduce(m, { type: 'tool-start', at: 1_200, tool: 'Read', toolUseId: 'r1', agentId: 'ag-1', input: { file_path: '/p/hooks/pane.tsx' } })
  m = reduce(m, { type: 'tool-start', at: 1_300, tool: 'Grep', toolUseId: 'g1', agentId: 'ag-1', input: { pattern: 'TABS' } })
  m = reduce(m, { type: 'tool-start', at: 1_400, tool: 'Bash', toolUseId: 'b1', input: { command: 'git status' } })
  return m
}

test('each agent keeps its prompt and its latest steps; the main session keeps its own', () => {
  const m = withAgents()
  const a = m.agents[0]!
  expect(a.prompt).toBe('Look through hooks/pane.tsx and report how tabs are drawn.')
  expect(a.log!.map(s => s.at)).toEqual([1_200, 1_300])
  expect(m.mainLog!.map(s => s.at)).toEqual([1_100, 1_400])
  let many = m
  for (let i = 0; i < LOG_STEPS + 5; i++) many = reduce(many, { type: 'tool-start', at: 2_000 + i, tool: 'Read', toolUseId: 'x' + i, agentId: 'ag-1', input: { file_path: `/p/f${i}.ts` } })
  expect(many.agents[0]!.log).toHaveLength(LOG_STEPS)
  expect(many.agents[0]!.log!.at(-1)!.at).toBe(2_000 + LOG_STEPS + 4)
})

test('the Agents tab lists the main session first under its pack name, and every agent under its given name', () => {
  const m = withAgents()
  const v = { tab: 'agents' as const, names: { 'call-1': 'Suzaku' }, mainName: 'Lelouch' }
  const p = tabParts(m, T, v, 60, false, 5_000)
  const rows = text(p.rows)
  const main = rows.findIndex(r => r.includes('★ Lelouch'))
  const sub = rows.findIndex(r => r.includes('◆ Suzaku'))
  expect(main).toBeGreaterThan(0)
  expect(sub).toBeGreaterThan(main)
  expect(rows.some(r => r.includes('◆ Explore'))).toBe(false)
  // both name rows open their agent
  expect(p.links!.map(l => l.id)).toEqual([MAIN_AGENT, 'call-1'])
  expect(text([p.links![1]!.row])[0]).toContain('Suzaku')
})

test('without pack names the tab shows the main session plainly and agents by their own names', () => {
  const rows = text(tabParts(withAgents(), T, { tab: 'agents' }, 60, false, 5_000).rows)
  expect(rows.some(r => r.includes('★ Main session'))).toBe(true)
  expect(rows.some(r => r.includes('◆ Explore'))).toBe(true)
})

test('an agent opened in full shows what it was asked, what it does now and its steps newest first, with a way back', () => {
  const m = withAgents()
  const p = tabParts(m, T, { tab: 'agents', agent: 'call-1', names: { 'call-1': 'Suzaku' } }, 60, false, 5_000)
  const rows = text(p.rows)
  expect(rows[0]).toContain('SUZAKU')
  expect(rows.some(r => r.includes('Find the tab code'))).toBe(true)
  expect(rows.some(r => r.includes('Look through hooks/pane.tsx'))).toBe(true)
  const steps = rows.filter(r => r.includes(' ago'))
  expect(steps).toHaveLength(2)
  expect(steps[0]).toContain('TABS')
  expect(steps[1]).toContain('pane.tsx')
  expect(p.nav).toEqual([{ key: 'agent-back', label: '‹ All agents', hotkey: 'q' }])
  const main = text(tabParts(m, T, { tab: 'agents', agent: MAIN_AGENT, mainName: 'Lelouch' }, 60, false, 5_000).rows)
  expect(main[0]).toContain('LELOUCH')
  expect(main.filter(r => r.includes(' ago'))).toHaveLength(2)
})

test('a detail view shows its own context, a rule under it, then its milestones: a subagent\'s and the main session\'s', () => {
  let m = withAgents()
  m = reduce(m, { type: 'agent-context', agentId: 'ag-1', percent: 42.4 })
  m = reduce(m, { type: 'agent-milestones', agentId: 'ag-1', objective: 'Map the tabs', milestones: [{ title: 'Read pane.tsx', status: 'completed' }, { title: 'Report', status: 'in_progress', doing: 'Writing it up' }] })
  const rows = text(tabParts(m, T, { tab: 'agents', agent: 'call-1' }, 60, false, 5_000).rows)
  const ctx = rows.findIndex(r => r.includes('Context') && r.includes('42%'))
  expect(ctx).toBeGreaterThan(0)
  expect(rows[ctx + 1]).toMatch(/─{10,}/)
  expect(rows[ctx + 2]).toContain('Milestones · 1/2 done')
  for (const words of ['Map the tabs', '✓ Read pane.tsx', '◉ Report', '└ Writing it up']) expect(rows.some(r => r.includes(words)), words).toBe(true)
  // the main session: its own context and the milestones the work bar follows
  const main = text(tabParts({ ...m, ctxPercent: 17 }, T, { tab: 'agents', agent: MAIN_AGENT, mainWork: { steps: [{ title: 'Ship it', status: 'pending' }] } }, 60, false, 5_000).rows)
  expect(main.some(r => r.includes('Context') && r.includes('17%'))).toBe(true)
  expect(main.some(r => r.includes('Milestones · 0/1 done'))).toBe(true)
  // a subagent that made no request yet says so instead of showing 0%
  const fresh = text(tabParts(withAgents(), T, { tab: 'agents', agent: 'call-1' }, 60, false, 5_000).rows)
  expect(fresh.some(r => r.includes('not measured yet'))).toBe(true)
  expect(fresh.some(r => r.includes('None reported.'))).toBe(true)
})

const walk = (n: any, out: any[] = []): any[] => {
  if (Array.isArray(n)) for (const c of n) walk(c, out)
  else if (n && typeof n === 'object') { out.push(n); walk(n.children, out) }
  return out
}
const keyOf = (n: any) => n.props?.key ?? n.key
const els = { Box: 'Box', Text: 'Text', Button: 'Button' }

test('pressing an agent row, and the way back, go to onAgent; the Settings tab draws the node it is given', () => {
  const m = withAgents()
  const opened: (string | undefined)[] = []
  const tree = renderPane(els, m, T, { tab: 'agents', names: { 'call-1': 'Suzaku' }, mainName: 'Lelouch' }, 60, false, 5_000, () => {}, { onAgent: k => opened.push(k), onRequest: () => opened.push('request!') })
  walk(tree).find(n => keyOf(n) === 'req-call-1').onPress({})
  walk(tree).find(n => keyOf(n) === 'req-main').onPress({})
  const detail = renderPane(els, m, T, { tab: 'agents', agent: 'call-1' }, 60, false, 5_000, () => {}, { onAgent: k => opened.push(k) })
  walk(detail).find(n => keyOf(n) === 'agent-back').onPress({})
  expect(opened).toEqual(['call-1', MAIN_AGENT, undefined])
  const settings = renderPane(els, m, T, { tab: 'settings' }, 60, false, 5_000, () => {}, { tabs: ['plan', 'settings'], settings: { type: 'Box', props: { key: 'the-settings' }, children: [] } })
  expect(walk(settings).find(n => keyOf(n) === 'the-settings')).toBeDefined()
  expect(walk(settings).find(n => keyOf(n) === 'tab-settings')).toBeDefined()
})
