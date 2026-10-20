import { test, expect } from 'claude-code/testing'
import { MILESTONES_SPEC, otherOffers, policy, recorded } from '../hooks/milestones.ts'

test('the call answers how far the work is and the milestone at work', () => {
  expect(recorded({ milestones: [{ title: 'Map it', status: 'completed' }, { title: 'Build it', status: 'in_progress' }, { title: 'Ship it', status: 'pending' }] }))
    .toBe('Recorded: 1 of 3 milestones done, now: Build it.')
  expect(recorded({ milestones: [{ title: 'Done', status: 'completed' }] })).toBe('Recorded: 1 of 1 milestones done.')
  expect(recorded({ milestones: [] })).toMatch(/^No milestones/)
})

test('ops-control offers its tool only while no other plugin offers one', () => {
  expect(otherOffers({}, ['Read', 'Bash'])).toBe(false)
  expect(otherOffers({ 'project-sentinel@control-room': true }, [])).toBe(true)
  expect(otherOffers({ 'project-sentinel@control-room': false }, [])).toBe(false)
  expect(otherOffers(undefined, ['mcp__project-sentinel__milestones'])).toBe(true)
  // its own, from before a reload, is not another's
  expect(otherOffers(undefined, ['mcp__ops-control__milestones'])).toBe(false)
})

test('the spec takes the statuses the bar draws, and the policy names the tool', () => {
  expect(MILESTONES_SPEC.name).toBe('milestones')
  expect(MILESTONES_SPEC.inputSchema.properties.milestones.items.properties.status.enum).toEqual(['pending', 'in_progress', 'verifying', 'waiting', 'blocked', 'completed'])
  expect(policy('mcp__ops-control__milestones')).toContain('`mcp__ops-control__milestones`')
})
