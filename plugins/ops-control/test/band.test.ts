import { test, expect } from 'claude-code/testing'
import { bandSegments, renderBand } from '../hooks/band.tsx'
import { visibleLength } from '../hooks/layout.tsx'
import { initialModel, applyEvent, LINGER_MS } from '../hooks/model.ts'
import { resolveTheme } from '../hooks/themes.ts'
import { resolveLook } from '../hooks/packs.ts'
import { CLAWD_COLOR } from '../hooks/pets.ts'

const T = resolveTheme('classic', {}).theme

test('band line reads action, subagents, hearts and plan', async () => {
  let m = applyEvent(initialModel(), { type: 'turn-start', at: 0 })
  m = applyEvent(m, { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a', input: { description: 'scout' } })
  m = applyEvent(m, { type: 'tool-start', at: 2, tool: 'Edit', toolUseId: 'e', input: { file_path: '/r/src/auth.ts' } })
  m = { ...m, ctxPercent: 52, plan: [{ id: '1', title: 'x', status: 'completed' }, { id: '2', title: 'y', status: 'pending' }] }
  const text = bandSegments(m, T, 120).map(s => s.text).join('')
  expect(text).toBe('✎ Editing src/auth.ts  ·  ◆ 1 subagent  ·  ♥♥♥♡♡  ·  ◇ ●○')
})

test('the band drops the plan item while the plan is folded', async () => {
  let m = applyEvent(initialModel(), { type: 'plan-load', plan: [{ id: '1', title: 'x', status: 'completed' }] })
  m = applyEvent({ ...m, ctxPercent: 52 }, { type: 'turn-start', at: 0 })
  expect(bandSegments(m, T, 120).map(s => s.text).join('')).toBe('✻ Thinking  ·  ♥♥♥♡♡')
})

test('band fits 40, 60 and 80 columns', async () => {
  let m = applyEvent(initialModel(), { type: 'tool-start', at: 1, tool: 'Read', toolUseId: 'r', input: { file_path: '/a/very/long/path/to/some/deeply/nested/file-name.ts' } })
  m = { ...m, working: true, ctxPercent: 30 }
  for (const w of [40, 60, 80]) expect(visibleLength(bandSegments(m, T, w))).toBeLessThanOrEqual(w)
})

test('band counts CJK path labels in cells', async () => {
  let m = applyEvent(initialModel(), { type: 'tool-start', at: 1, tool: 'Read', toolUseId: 'r', input: { file_path: '/プロジェクト/ソース/認証モジュール.ts' } })
  m = { ...m, working: true, ctxPercent: 30 }
  for (const w of [40, 60, 80]) expect(visibleLength(bandSegments(m, T, w))).toBeLessThanOrEqual(w)
})

// Fake element table: lets renderBand run without the engine.
const els = { Box: 'Box', Text: 'Text' }

const arcade = resolveLook({ colors: 'arcade', motion: 'arcade' }, {}, {}).look
const busy = () => applyEvent(applyEvent(initialModel(), { type: 'turn-start', at: 0 }), { type: 'tool-start', at: 1, tool: 'Edit', toolUseId: 'e', input: { file_path: '/r/src/auth.ts' } })
const walkTree = (n: any, out: any[] = []): any[] => {
  if (n && typeof n === 'object') {
    out.push(n)
    for (const c of n.children ?? []) walkTree(c, out)
  }
  return out
}

test('HP bar replaces hearts; COMBO from three in a row', async () => {
  const m = { ...busy(), combo: 3, ctxPercent: 62 }
  const line = bandSegments(m, arcade.theme, 120, { look: arcade }).map(s => s.text).join('')
  expect(line).toContain('HP ')
  expect(line).not.toContain('♥')
  expect(line).toContain('COMBO x3')
  expect(bandSegments({ ...m, combo: 2 }, arcade.theme, 120, { look: arcade }).map(s => s.text).join('')).not.toContain('COMBO')
  expect(visibleLength(bandSegments(m, arcade.theme, 120, { look: arcade }))).toBeLessThanOrEqual(120)
})

test('a narrow band keeps the hearts', async () => {
  const line = bandSegments({ ...busy(), ctxPercent: 62 }, arcade.theme, 60, { look: arcade }).map(s => s.text).join('')
  expect(line).not.toContain('HP ')
})

test('the band never draws the pet', async () => {
  for (const w of [50, 80, 120]) for (const tier of ['compact', 'medium'] as const) {
    const tree = renderBand(els, busy(), T, w, tier, 10, { look: arcade, friday: true })
    expect(walkTree(tree).some(n => n.props?.color === CLAWD_COLOR || n.type === 'Client')).toBe(false)
    expect(JSON.stringify(tree)).not.toContain("it's friday")
  }
})

test('renderBand draws only while working or lingering, and never when docked', async () => {
  const working = applyEvent(initialModel(), { type: 'turn-start', at: 0 })
  expect(renderBand(els, working, T, 120, 'medium', 10)).not.toBeNull()
  expect(renderBand(els, working, T, 120, 'wide', 10)).toBeNull()
  const done = applyEvent(working, { type: 'turn-done', at: 100, reason: 'answer' })
  expect(renderBand(els, done, T, 120, 'medium', 100 + LINGER_MS)).not.toBeNull()
  expect(renderBand(els, done, T, 120, 'medium', 100 + LINGER_MS + 1)).toBeNull()
  expect(renderBand(els, initialModel(), T, 120, 'compact', 0)).toBeNull()
})

test('the band stays while a background subagent outlives the main turn', async () => {
  let m = applyEvent(initialModel(), { type: 'turn-start', at: 0 })
  m = applyEvent(m, { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a1', input: { description: 'scout' } })
  m = applyEvent(m, { type: 'agent-bind', toolUseId: 'a1', agentId: 'ag-1' })
  m = applyEvent(m, { type: 'turn-done', at: 100, reason: 'answer' })
  expect(renderBand(els, m, T, 120, 'medium', 100 + LINGER_MS * 10)).not.toBeNull()
  m = applyEvent(m, { type: 'agent-done', at: 50_000, agentId: 'ag-1' })
  expect(renderBand(els, m, T, 120, 'medium', 50_001)).toBeNull()
})

test('band items follow the setup order and can be hidden', () => {
  const m = { ...busy(), ctxPercent: 30, plan: [{ id: '1', title: 'a', status: 'completed' as const }], agents: [{ key: 'a', name: 'x', task: '', state: 'running' as const, startedAt: 0 }] }
  const text = (band?: ('combo' | 'agents' | 'meter' | 'plan')[]) => bandSegments(m, T, 160, { band }).map(s => s.text).join('')
  const dflt = text()
  expect(dflt.indexOf('subagent')).toBeLessThan(dflt.indexOf('♥'))
  expect(dflt.indexOf('♥')).toBeLessThan(dflt.indexOf('◇'))
  const flipped = text(['plan', 'meter'])
  expect(flipped.indexOf('◇')).toBeLessThan(flipped.indexOf('♥'))
  expect(flipped).not.toContain('subagent')
  expect(text([])).not.toContain('♥')
})

test('combo hides when the setup leaves it out', () => {
  const m = { ...busy(), combo: 4 }
  expect(bandSegments(m, arcade.theme, 120, { look: arcade, band: ['meter'] }).map(s => s.text).join('')).not.toContain('COMBO')
})
