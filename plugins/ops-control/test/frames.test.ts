import { test, expect } from 'claude-code/testing'
import { makeFrames } from '../hooks/frames.ts'

const FINAL = 'the final answer of the turn'
const newFrames = (finals: Set<string> = new Set()) => makeFrames(text => finals.has(text))

const at = (fields: object) => ({ closes: false, opens: false, opensAfter: false, inside: false, ...fields })

test('a prompt opens the box under itself; the first message carries it on, the next reply closes it and opens its own', async () => {
  const frames = newFrames()
  expect(frames.prompt('UserMessage:p1')).toEqual(at({ opensAfter: true }))
  expect(frames.opener('AssistantMessage:a1', 'text of AssistantMessage:a1')).toEqual(at({ inside: true }))
  expect(frames.member('ToolUse:t1')).toEqual(at({ inside: true }))
  expect(frames.member('ToolGroup:g1')).toEqual(at({ inside: true }))
  expect(frames.opener('AssistantMessage:a2', 'text of AssistantMessage:a2')).toEqual(at({ closes: true, opens: true, inside: true }))
  expect(frames.isOpen()).toBe(true)
  expect(frames.closer('TurnDuration:d1')).toEqual(at({ closes: true }))
  expect(frames.isOpen()).toBe(false)
  // nothing open: the next prompt closes nothing
  expect(frames.prompt('UserMessage:p2')).toEqual(at({ opensAfter: true }))
})

test('a reply that starts with a tool call sits in the box the prompt opened; the message after it starts a new one', async () => {
  const frames = newFrames()
  frames.prompt('UserMessage:p1')
  // drawn first as its own row, then folded into a group row: neither draws an edge
  expect(frames.member('ToolUse:t1')).toEqual(at({ inside: true }))
  expect(frames.member('ToolGroup:g1')).toEqual(at({ inside: true }))
  expect(frames.opener('AssistantMessage:a1', 'text of AssistantMessage:a1')).toEqual(at({ closes: true, opens: true, inside: true }))
})

test('a prompt after an open box closes it; a slash command opens no new box', async () => {
  const frames = newFrames()
  frames.prompt('UserMessage:p1')
  frames.opener('AssistantMessage:a1', 'text of AssistantMessage:a1')
  expect(frames.prompt('UserMessage:c1', { opensNext: false })).toEqual(at({ closes: true }))
  expect(frames.isOpen()).toBe(false)
  expect(frames.member('Notice:n1')).toEqual(at())
  expect(frames.opener('AssistantMessage:a2', 'text of AssistantMessage:a2')).toEqual(at({ opens: true, inside: true }))
})

test('a redrawn row keeps the place it first drew with', async () => {
  const frames = newFrames()
  frames.prompt('UserMessage:p1')
  const first = frames.member('ToolUse:t1')
  frames.opener('AssistantMessage:a1', 'text of AssistantMessage:a1')
  frames.closer('TurnDuration:d1')
  expect(frames.member('ToolUse:t1')).toEqual(first)
  expect(frames.opener('AssistantMessage:a1', 'text of AssistantMessage:a1').opens).toBe(true)
})

test('a prompt drawn as placeholder answers without taking the place its stored row will', async () => {
  const frames = newFrames()
  frames.prompt('UserMessage:p1')
  frames.opener('AssistantMessage:a1', 'text of AssistantMessage:a1')
  expect(frames.prompt('UserMessage:placeholder', { peek: true })).toEqual(at({ closes: true, opensAfter: true }))
  expect(frames.prompt('UserMessage:placeholder', { peek: true }).closes).toBe(true)
  expect(frames.prompt('UserMessage:p2')).toEqual(at({ closes: true, opensAfter: true }))
})

test('the final answer opens no box: the box before it closes, the prompt opens none for it, and what follows is outside', async () => {
  const finals = new Set<string>()
  const frames = newFrames(finals)
  frames.prompt('UserMessage:p1')
  frames.member('ToolGroup:g1')
  // drawn while the turn runs: a reply box like any other
  expect(frames.opener('AssistantMessage:a1', 'text of AssistantMessage:a1')).toEqual(at({ closes: true, opens: true, inside: true }))
  expect(frames.member('Notice:n1')).toEqual(at({ inside: true }))
  // the turn ended and the rows draw again: it is the final answer
  finals.add('text of AssistantMessage:a1')
  expect(frames.opener('AssistantMessage:a1', 'text of AssistantMessage:a1')).toEqual(at({ closes: true }))
  expect(frames.member('Notice:n1')).toEqual(at())
  expect(frames.closer('TurnDuration:d1')).toEqual(at())
  expect(frames.isOpen()).toBe(false)
})

test('a turn that only answers: the prompt opens no box over the final answer, even when it draws again first', async () => {
  const finals = new Set<string>()
  const frames = newFrames(finals)
  expect(frames.prompt('UserMessage:p1').opensAfter).toBe(true)
  frames.opener('AssistantMessage:a1', FINAL)
  // the turn ended: the prompt draws again before the message does
  finals.add(FINAL)
  expect(frames.prompt('UserMessage:p1')).toEqual(at())
  expect(frames.opener('AssistantMessage:a1', FINAL)).toEqual(at())
  expect(frames.closer('TurnDuration:d1')).toEqual(at())
})

test('a folded run of calls whose row draws after the next prompt joins the box its calls were made in', async () => {
  const frames = newFrames()
  frames.prompt('UserMessage:n1')
  frames.noteCall('t1')
  // the next notification arrives before the group row of t1 first draws
  frames.prompt('UserMessage:n2')
  expect(frames.member('ToolGroup:g1', ['t1'])).toEqual(at({ inside: true }))
  // n1's box holds the group: n2 closes it, and n2's own box is empty so far
  expect(frames.prompt('UserMessage:n2')).toEqual(at({ closes: true, opensAfter: true }))
  frames.noteCall('t2')
  expect(frames.member('ToolGroup:g2', ['t2'])).toEqual(at({ inside: true }))
  expect(frames.prompt('UserMessage:n3')).toEqual(at({ closes: true, opensAfter: true }))
})
