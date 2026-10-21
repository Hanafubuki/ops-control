import { test, expect } from 'claude-code/testing'
import { agentWork, countdown, elapsed, headline, instrumentRow, meterCells, scaleTrack, workBarRows, workIssues, workOf, type WorkInput } from '../hooks/workbar.ts'
import { visibleLength } from '../hooks/layout.tsx'
import { initialModel, applyEvent } from '../hooks/model.ts'
import { resolveTheme } from '../hooks/themes.ts'
import { DEFAULT_SETUP } from '../hooks/setup.ts'
import { initialRequests, startTurn, submit, toolEnd, type Milestone } from '../hooks/requests.ts'

const T = resolveTheme('classic', {}).theme
const text = (segs: { text: string }[]) => segs.map(s => s.text).join('')
const MS: Milestone[] = [
  { title: 'Map the code', status: 'completed' }, { title: 'Write the bar', status: 'in_progress', doing: 'Writing the two-row bar' },
  { title: 'Test it', status: 'pending' }, { title: 'Ship it', status: 'pending' },
]
const input = (over: Partial<WorkInput> = {}): WorkInput => ({ model: initialModel(), steps: MS, meter: DEFAULT_SETUP.meter, now: 100_000, columns: 120, ...over })
const working = applyEvent(initialModel(), { type: 'turn-start', at: 0 })

test('the headline says what the milestone at work is doing, its step and how long it has run', () => {
  expect(headline(T, input({ model: working, since: 65_000 }))).toMatchObject({ glyph: '▸', text: 'Writing the two-row bar', detail: 'step 2 of 4 · 35s' })
  const verifying = MS.map((m, i) => (i === 1 ? { ...m, status: 'verifying' as const, doing: undefined } : m))
  expect(headline(T, input({ model: working, steps: verifying }))).toMatchObject({ glyph: '◎', text: 'Verifying: Write the bar', detail: 'step 2 of 4' })
  // no milestone at work: ops-control's own activity, and how far the list is
  expect(headline(T, input({ model: working, steps: MS.map(m => ({ ...m, status: 'pending' as const })) }))).toMatchObject({ text: 'Thinking', detail: '0 of 4 milestones done' })
})

test('between turns the headline names what holds the work, all done, or where it stands', () => {
  const blocked = MS.map((m, i) => (i === 1 ? { ...m, status: 'blocked' as const, blocker: 'needs the API key' } : m))
  expect(headline(T, input({ steps: blocked }))).toMatchObject({ glyph: '⊘', text: 'Blocked: needs the API key', detail: 'step 2 of 4' })
  const waiting = MS.map((m, i) => (i === 1 ? { ...m, status: 'waiting' as const, blocker: 'the CI run' } : m))
  expect(headline(T, input({ steps: waiting }))).toMatchObject({ glyph: '◷', text: 'Waiting for the CI run' })
  expect(headline(T, input({ steps: MS.map(m => ({ ...m, status: 'completed' as const })) }))).toMatchObject({ glyph: '✓', text: 'All 4 milestones done' })
  expect(headline(T, input({ steps: MS.map(m => ({ ...m, status: 'pending' as const })), objective: 'Ship the bar' }))).toMatchObject({ glyph: '○', text: 'Ship the bar', detail: '0 of 4 milestones done' })
  expect(headline(T, input({ steps: [] }))).toMatchObject({ text: 'Ready' })
  const asking = { ...working, needsYou: { toolUseId: 'b', what: 'npm publish', before: working.act } }
  expect(headline(T, input({ model: asking }))).toMatchObject({ glyph: '◆', text: 'Waiting for you to approve: npm publish' })
})

test('the track: done stops joined by a heavy line, the one at work bold, many milestones scaled down', () => {
  const row = text(instrumentRow(T, input()))
  expect(row).toContain('WORK ●━◉─○─○ 1/4')
  expect(scaleTrack(['done', 'done', 'now', 'open', 'open', 'open'], 3)).toEqual(['done', 'now', 'open'])
  expect(scaleTrack(['done', 'held', 'open', 'open'], 2)).toEqual(['held', 'open'])
})

test('the context meter fills to the percent and marks the auto-compact point; a fill past it reaches beyond', () => {
  expect(meterCells(0.25, 8)).toEqual(['fill', 'fill', 'track', 'track', 'track', 'track', 'track', 'track'])
  expect(meterCells(0.25, 8, 0.75)).toEqual(['fill', 'fill', 'track', 'track', 'track', 'notch', 'track', 'track'])
  expect(meterCells(0.76, 8, 0.75).slice(-3)).toEqual(['notch', 'fill', 'track'])
  const row = text(instrumentRow(T, input({ model: { ...initialModel(), ctxPercent: 32 }, marker: 83 })))
  expect(row).toMatch(/CONTEXT [▇█]{24} 32%/)
  expect(row).toContain('█')
})

test('the 5-hour limit sits at the right end with its reset; the row fits every width', () => {
  const m = { ...initialModel(), ctxPercent: 32, limits: [{ kind: 'five_hour', percentUsed: 33, resetsAt: new Date(100_000 + 3 * 60_000 + 1).toISOString() }] }
  const wide = instrumentRow(T, input({ model: m }))
  expect(text(wide)).toMatch(/5H ▂{6} 33% · 4m$/)
  expect(visibleLength(wide)).toBe(120)
  for (const columns of [30, 40, 60, 72, 80, 100]) expect(visibleLength(instrumentRow(T, input({ model: m, columns })))).toBeLessThanOrEqual(columns)
  // narrow: no labels, and the least needed instrument goes first
  expect(text(instrumentRow(T, input({ model: m, columns: 40 })))).not.toContain('CONTEXT')
  expect([countdown(20_000), countdown(14 * 60_000), countdown(134 * 60_000), countdown(51 * 3_600_000)]).toEqual(['<1m', '14m', '2h14m', '2d3h'])
  expect([elapsed(4_000), elapsed(65_000), elapsed(3_725_000)]).toEqual(['4s', '1m 05s', '1h 02m'])
})

test('the headline row carries the open issues and the running subagents at its right end', () => {
  const m = applyEvent(working, { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a', input: { description: 'scout' } })
  const [, head] = workBarRows(T, input({ model: m, issues: 2 }))
  expect(text(head)).toMatch(/^▸ Writing the two-row bar · step 2 of 4 .*▲ 2 issues  ◆ 1 subagent$/)
  expect(visibleLength(head)).toBe(120)
  expect(text(workBarRows(T, input({ issues: 1 }))[1])).toContain('▲ 1 issue')
})

test('the bar follows the newest request alone: a new one clears the last list, a folded prompt keeps its host\'s', () => {
  let { rs } = submit(initialRequests(), { text: 'build it', at: 1 })
  rs = startTurn(rs, { turnId: 't1', text: 'build it', at: 1 })
  rs = toolEnd(rs, { tool: 'mcp__ops-control__milestones', toolUseId: 'm1', input: { objective: 'Build it', milestones: [{ title: 'A', status: 'in_progress' }] }, isError: false, text: '' })
  expect(workOf(rs, [])).toEqual({ steps: [{ title: 'A', status: 'in_progress' }], objective: 'Build it' })
  // a later request with none of its own starts with an empty track: the last task's milestones are gone
  rs = submit(rs, { text: 'and more', at: 2 }).rs
  expect(workOf(rs, [])).toEqual({ steps: [] })
  // Claude's task list fills in only while a task is open; a finished one is no current work
  expect(workOf(initialRequests(), [{ id: '1', title: 'Task', status: 'completed' }])).toEqual({ steps: [] })
  expect(workOf(rs, [{ id: '1', title: 'Task', status: 'in_progress' }, { id: '2', title: 'Next', status: 'pending' }]).steps).toHaveLength(2)
  rs = toolEnd(rs, { tool: 'Bash', toolUseId: 'b1', input: { command: 'make' }, isError: true, text: 'Exit code 2' })
  expect(workIssues(rs)).toBe(0)
  expect(workIssues({ ...rs, list: rs.list.slice(0, 1) })).toBe(1)
})

test('a rule tops the bar, parting it from Claude\'s thinking and text', () => {
  const [rule] = workBarRows(T, input({ columns: 50 }))
  expect(text(rule)).toBe('─'.repeat(50))
})

test('a subagent\'s bar is its own: its milestones, its context and what it does now', () => {
  let m = applyEvent(working, { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'c1', input: { description: 'scout the code' } })
  m = applyEvent(m, { type: 'agent-bind', toolUseId: 'c1', agentId: 'ag-1' })
  m = applyEvent(m, { type: 'agent-context', agentId: 'ag-1', percent: 37 })
  m = applyEvent(m, { type: 'agent-milestones', agentId: 'ag-1', milestones: MS, objective: 'Scout' })
  const w = agentWork({ ...m, ctxPercent: 80 }, 'ag-1')!
  expect(w.steps).toEqual(MS)
  expect(w.objective).toBe('Scout')
  expect(w.model.ctxPercent).toBe(37)
  expect(w.model.agents).toEqual([])
  const [, head, instruments] = workBarRows(T, input({ ...w }))
  expect(text(head)).toContain('Writing the two-row bar')
  expect(text(instruments)).toContain('37%')
  expect(text(instruments)).toContain('1/4')
  expect(agentWork(m, 'nobody')).toBeUndefined()
})

test('work with no milestones has no headline: the chips alone, right-aligned, or no row', () => {
  expect(workBarRows(T, input({ model: working, steps: [] }))[1]).toEqual([])
  const m = applyEvent(working, { type: 'tool-start', at: 1, tool: 'Agent', toolUseId: 'a', input: { description: 'scout' } })
  const head = workBarRows(T, input({ model: m, steps: [] }))[1]
  expect(text(head)).toMatch(/^ +◆ 1 subagent$/)
  expect(visibleLength(head)).toBe(120)
  // a permission waiting still says so
  const asking = { ...working, needsYou: { toolUseId: 't', what: 'Bash rm', before: working.act } }
  expect(text(workBarRows(T, input({ model: asking, steps: [] }))[1])).toContain('Waiting for you to approve: Bash rm')
})
