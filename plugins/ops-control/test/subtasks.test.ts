import { test, expect } from 'claude-code/testing'
import { initialRequests, loadSaved, saved, subtaskAsk, subtaskDrop, subtaskEnd, subtaskTurn } from '../hooks/requests.ts'
import { tabParts } from '../hooks/pane.tsx'
import { initialModel } from '../hooks/model.ts'
import { resolveTheme } from '../hooks/themes.ts'

const T = resolveTheme('classic', {}).theme
const text = (rows: { text: string }[][]) => rows.map(r => r.map(s => s.text).join('')).join('\n')
const FORK = 'ahow-is-the-d70cc6aaf61dfd43'

test('a /subtask is a subplan: its question, the fork that takes it, then each question and answer sent to the fork', () => {
  let rs = subtaskAsk(initialRequests(), { question: 'how is XP made?', at: 1000 }).rs
  expect(rs.subtasks).toMatchObject([{ n: 1, status: 'pending', exchanges: [{ question: 'how is XP made?', at: 1000 }] }])
  // the fork's first turn carries the same question: it binds, and asks nothing twice
  rs = subtaskTurn(rs, { agentId: FORK, text: 'how is XP made?', at: 1100 })
  expect(rs.subtasks[0]).toMatchObject({ agentId: FORK, status: 'in_progress' })
  expect(rs.subtasks[0]!.exchanges.length).toBe(1)
  rs = subtaskEnd(rs, { agentId: FORK, answer: 'At the end of each turn.', reason: 'answer', at: 5000 })
  expect(rs.subtasks[0]).toMatchObject({ status: 'completed', endedAt: 5000, exchanges: [{ question: 'how is XP made?', answer: 'At the end of each turn.', reason: 'answer' }] })
  // a message sent to the fork later is another exchange; a continuation turn with no text asks nothing
  rs = subtaskTurn(rs, { agentId: FORK, text: 'and does it reset?', at: 6000 })
  rs = subtaskTurn(rs, { agentId: FORK, text: '', at: 6500 })
  rs = subtaskEnd(rs, { agentId: FORK, answer: 'No.', reason: 'answer', at: 7000 })
  expect(rs.subtasks[0]!.exchanges.map(e => [e.question, e.answer])).toEqual([['how is XP made?', 'At the end of each turn.'], ['and does it reset?', 'No.']])
})

test('a fork seen with no /subtask before it is a subplan of its own; a dropped /subtask is none', () => {
  const rs = subtaskTurn(initialRequests(), { agentId: FORK, text: 'count the files', at: 0 })
  expect(rs.subtasks).toMatchObject([{ agentId: FORK, status: 'in_progress', exchanges: [{ question: 'count the files' }] }])
  const asked = subtaskAsk(initialRequests(), { question: 'q', at: 0 })
  expect(subtaskDrop(asked.rs, asked.id).subtasks).toEqual([])
  // an answer from an agent that is no subplan's changes nothing
  expect(subtaskEnd(rs, { agentId: 'other', answer: 'x', reason: 'answer', at: 1 })).toBe(rs)
})

test('subplans are saved with the session; one cut off by the end of the session reads back as interrupted', () => {
  let rs = subtaskTurn(subtaskAsk(initialRequests(), { question: 'one', at: 0 }).rs, { agentId: FORK, text: 'one', at: 0 })
  rs = subtaskEnd(rs, { agentId: FORK, answer: 'done', reason: 'answer', at: 10 })
  rs = subtaskAsk(rs, { question: 'two', at: 20 }).rs
  const back = loadSaved(JSON.parse(JSON.stringify(saved(rs))))
  expect(back.subtasks.map(x => [x.n, x.status, x.exchanges[0]!.question, x.exchanges[0]!.answer])).toEqual([[1, 'completed', 'one', 'done'], [2, 'interrupted', 'two', undefined]])
  expect(loadSaved({ format: 1, list: [] }).subtasks).toEqual([])
})

test('the Plan tab lists the subplans under the plan, newest on top, every question with its answer', () => {
  let rs = subtaskTurn(subtaskAsk(initialRequests(), { question: 'how is XP made?', at: 0 }).rs, { agentId: FORK, text: 'how is XP made?', at: 0 })
  rs = subtaskEnd(rs, { agentId: FORK, answer: 'At the end of each turn.', reason: 'answer', at: 60_000 })
  rs = subtaskAsk(rs, { question: 'second one', at: 70_000 }).rs
  const rows = text(tabParts(initialModel(), T, { tab: 'plan' }, 80, false, 80_000, 200, 'round', rs).rows)
  expect(rows).toContain('SUBPLANS')
  expect(rows.indexOf('SUBPLANS')).toBeGreaterThan(rows.indexOf('PLAN'))
  expect(rows.indexOf('⑂ #2 second one')).toBeLessThan(rows.indexOf('⑂ #1 how is XP made?'))
  expect(rows).toContain('Q how is XP made?')
  expect(rows).toContain('A At the end of each turn.')
  expect(rows).toContain('A Waiting for the fork…')
  expect(text(tabParts(initialModel(), T, { tab: 'plan' }, 80, false, 0, 200, 'round', initialRequests()).rows)).not.toContain('SUBPLANS')
})
