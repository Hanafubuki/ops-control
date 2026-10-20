import { test, expect } from 'claude-code/testing'
import { makeTurns } from '../hooks/turns.ts'

test('turns number prompts in first-drawn order, and a redraw keeps its number', async () => {
  const t = makeTurns()
  expect(t.turnFor('p1')).toBe(1)
  expect(t.turnFor('p2')).toBe(2)
  expect(t.turnFor('p1')).toBe(1)
})

test('a placeholder shows the next number without claiming it', async () => {
  const t = makeTurns()
  t.turnFor('p1')
  expect(t.turnFor('placeholder')).toBe(2)
  expect(t.turnFor('placeholder')).toBe(2)
  expect(t.turnFor('p2')).toBe(2)
})

test('tools count from 1 within each turn', async () => {
  const t = makeTurns()
  t.turnFor('p1')
  expect([t.toolSeq('a'), t.toolSeq('b'), t.toolSeq('c')]).toEqual([1, 2, 3])
  t.turnFor('p2')
  expect([t.toolSeq('d'), t.toolSeq('e')]).toEqual([1, 2])
})

test('a tool redrawn turns later keeps the number it first showed', async () => {
  const t = makeTurns()
  t.turnFor('p1'); t.toolSeq('a'); t.toolSeq('b')
  t.turnFor('p2'); t.toolSeq('c')
  expect(t.toolSeq('b')).toBe(2)
  expect(t.toolSeq('d')).toBe(2)
})
