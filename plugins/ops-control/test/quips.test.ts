import { test, expect } from 'claude-code/testing'
import { quipDue, QUIP_DELAY_MS, QUIP_GAP_MS } from '../hooks/moments.ts'
import { initialModel } from '../hooks/model.ts'
import { WORKING_LINES, workingLinesFor } from '../hooks/lines.ts'
import { BUBBLE_MAX } from '../hooks/bubbles.ts'
import { PACK_PET_NAMES } from '../hooks/petfile.ts'

const m = (o: object) => ({ ...initialModel(), ...o })
const tool = (at: number, agentId?: string) => ({ type: 'tool-start', at, tool: 'Bash', toolUseId: 't', input: {}, ...(agentId && { agentId }) }) as never

test('a quip waits for the turn to settle, then stays far apart', async () => {
  const busy = m({ working: true, turnAt: 1_000_000 })
  expect(quipDue(busy, tool(1_000_000 + QUIP_DELAY_MS - 1), 0)).toBe(false)
  expect(quipDue(busy, tool(1_000_000 + QUIP_DELAY_MS), 0)).toBe(true)
  const last = 1_000_000 + QUIP_DELAY_MS
  expect(quipDue(busy, tool(last + QUIP_GAP_MS - 1), last)).toBe(false)
  expect(quipDue(busy, tool(last + QUIP_GAP_MS), last)).toBe(true)
})

test('no quip outside a turn, while waiting on the person, or for a subagent call', async () => {
  const at = 2_000_000
  expect(quipDue(m({ working: false, turnAt: 0 }), tool(at), 0)).toBe(false)
  expect(quipDue(m({ working: true, turnAt: 0, needsYou: { what: 'approve ls', toolUseId: 't' } }), tool(at), 0)).toBe(false)
  expect(quipDue(m({ working: true, turnAt: 0 }), tool(at, 'a1'), 0)).toBe(false)
  expect(quipDue(m({ working: true, turnAt: 0 }), { type: 'tool-end', at } as never, 0)).toBe(false)
})

test('every pack character has its own quotes, each fitting a bubble; other pets have none', async () => {
  for (const pet of PACK_PET_NAMES) {
    expect(workingLinesFor(pet).length).toBeGreaterThanOrEqual(5)
    for (const l of workingLinesFor(pet)) expect([...l].length).toBeLessThanOrEqual(BUBBLE_MAX)
  }
  expect(Object.keys(WORKING_LINES).sort()).toEqual([...PACK_PET_NAMES].sort())
  expect(workingLinesFor('clawd')).toEqual([])
  expect(workingLinesFor('constructor')).toEqual([])
})
