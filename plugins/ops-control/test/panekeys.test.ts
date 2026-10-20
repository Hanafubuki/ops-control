import { expect } from 'claude-code/testing'
import { focusablesOf, steer, stepOf, tabStep } from '../hooks/panekeys.ts'
import { test } from './kit.ts'

const RING = ['tab-plan', 'tab-context', 'tab-settings', 'settings-board', 'settings-theme', 'settings-pack', 'settings-pet']

test('the ring is the drawn Buttons, Inputs and Selects in order, wherever they are nested', () => {
  const els = { Box: 'Box', Text: 'Text', Button: 'Button', Input: 'Input' }
  const tree = { type: 'Box', props: { key: 'root' }, children: [
    { type: 'Box', props: {}, children: [{ type: 'Button', props: { key: 'tab-plan' } }, { type: 'Text', props: { key: 'x' } }] },
    { type: 'Box', props: { children: [{ type: 'Input', props: { key: 'field' } }] } },
    { type: 'Button', props: { key: 'last' } },
  ] }
  expect(focusablesOf(tree, els)).toEqual(['tab-plan', 'field', 'last'])
})

test('a ring move is a step only between neighbours, wrapping at the ends; a click elsewhere is none', () => {
  expect(stepOf(RING, 'settings-board', 'settings-theme')).toBe(1)
  expect(stepOf(RING, 'settings-theme', 'settings-board')).toBe(-1)
  expect(stepOf(RING, 'settings-pet', 'tab-plan')).toBe(1)
  expect(stepOf(RING, 'tab-plan', 'settings-pet')).toBe(-1)
  expect(stepOf(RING, 'tab-plan', 'settings-pack')).toBeUndefined()
  expect(stepOf(RING, undefined, 'tab-plan')).toBeUndefined()
  expect(stepOf(RING, 'gone', 'tab-plan')).toBeUndefined()
})

test('↓ and ↑ walk the tab\'s controls, the strip sits above the first, and the ends scroll', () => {
  // from the strip, ↓ enters the tab at its first control; ↑ scrolls
  expect(steer(RING, 'tab-context', 1, 'settings')).toEqual({ focus: 'settings-board' })
  expect(steer(RING, 'tab-settings', -1, 'settings')).toEqual({ scroll: -1 })
  expect(steer(RING, 'settings-board', 1, 'settings')).toEqual({ focus: 'settings-theme' })
  expect(steer(RING, 'settings-theme', -1, 'settings')).toEqual({ focus: 'settings-board' })
  // above the first control is the current tab's own button; below the last, the window scrolls
  expect(steer(RING, 'settings-board', -1, 'settings')).toEqual({ focus: 'tab-settings' })
  expect(steer(RING, 'settings-pet', 1, 'settings')).toEqual({ scroll: 1 })
  // a tab with no controls scrolls on both
  const bare = ['tab-plan', 'tab-context']
  expect(steer(bare, 'tab-context', 1, 'context')).toEqual({ scroll: 1 })
})

test('an open dropdown keeps ↑ and ↓ on itself and its options', () => {
  const ring = [...RING.slice(0, 5), 'settings-theme-arcade', 'settings-theme-classic', 'settings-pack', 'settings-pet']
  const inside = (k: string) => k === 'settings-theme' || k.startsWith('settings-theme-')
  expect(steer(ring, 'settings-theme', 1, 'settings', inside)).toEqual({ focus: 'settings-theme-arcade' })
  expect(steer(ring, 'settings-theme-classic', 1, 'settings', inside)).toEqual({ scroll: 1 })
  expect(steer(ring, 'settings-theme-arcade', -1, 'settings', inside)).toEqual({ focus: 'settings-theme' })
  expect(steer(ring, 'settings-theme', -1, 'settings', inside)).toEqual({})
})

test('← and → step through the tabs, wrapping at the ends', () => {
  const tabs = ['plan', 'context', 'settings']
  expect(tabStep(tabs, 'plan', 1)).toBe('context')
  expect(tabStep(tabs, 'plan', -1)).toBe('settings')
  expect(tabStep(tabs, 'settings', 1)).toBe('plan')
  expect(tabStep(tabs, 'gone', 1)).toBe('plan')
})
