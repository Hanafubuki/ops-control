import { test, expect } from 'claude-code/testing'
import { BUILTIN_LINES, DEFAULT_LINES, MOMENTS, MOMENT_SLOTS, FLAVOURS, linesFor, pool, flavoursOf } from '../hooks/lines.ts'
import { BUBBLE_MAX } from '../hooks/bubbles.ts'

const LONG = { file: 'f'.repeat(12), n: 999, command: 'c'.repeat(12), unlock: 'a new outfit' }
const tables = { ...BUILTIN_LINES, default: DEFAULT_LINES }

test('every built-in line fits the bubble and uses only its moment\'s slots', async () => {
  for (const [pet, t] of Object.entries(tables)) for (const [key, lines] of Object.entries(t)) {
    const parts = key.split('@')
    const moment = parts[0] as (typeof MOMENTS)[number]
    expect(MOMENTS.includes(moment)).toBe(true)
    if (/^lv\d+$/.test(parts.at(-1)!)) parts.pop()
    const flavour = parts[1]
    if (flavour !== undefined) expect((FLAVOURS as readonly string[]).includes(flavour)).toBe(true)
    for (const l of lines!) {
      // fill caps at 40 itself, so measure the line with its slots filled before any cap
      const filled = l.replace(/\{(\w+)\}/g, (_, k: keyof typeof LONG) => String(LONG[k]))
      expect({ pet, key, l, len: [...filled].length <= BUBBLE_MAX }).toEqual({ pet, key, l, len: true })
      for (const [, slot] of l.matchAll(/\{(\w+)\}/g)) expect({ pet, key, slot, ok: (MOMENT_SLOTS[moment] as readonly string[]).includes(slot!) }).toEqual({ pet, key, slot, ok: true })
    }
  }
})

test('every built-in pet has six base lines per moment', async () => {
  for (const t of Object.values(tables)) for (const m of MOMENTS) expect(t[m]!.length).toBeGreaterThanOrEqual(6)
})

test('level-up has six or more lines per table, some naming the unlock and some not', async () => {
  for (const t of Object.values(tables)) {
    const l = t['level-up']!
    expect(l.filter(x => x.includes('{unlock}')).length).toBeGreaterThanOrEqual(3)
    expect(l.filter(x => !x.includes('{unlock}')).length).toBeGreaterThanOrEqual(3)
  }
})

test('each built-in pet has tier lines for done, hello and green at levels 2, 4 and 7', async () => {
  for (const t of Object.values(BUILTIN_LINES)) for (const m of ['done', 'hello', 'green']) for (const n of [2, 4, 7]) expect(t[`${m}@lv${n}`]!.length).toBeGreaterThanOrEqual(2)
})

test('level keys join at their level, alone or with a flavour', async () => {
  const t = { done: ['a'], 'done@lv4': ['four'], 'done@night@lv7': ['n7'], 'done@night': ['n'] }
  expect(pool(t, 'done', [], 1)).toEqual(['a'])
  expect(pool(t, 'done', [], 4)).toEqual(['a', 'four'])
  expect(pool(t, 'done', ['night'], 6)).toEqual(['a', 'n', 'four'])
  expect(pool(t, 'done', ['night'], 7)).toEqual(['a', 'n', 'four', 'n7'])
})

test('pool joins flavour lines to the base lines', async () => {
  const t = { done: ['a', 'b'], 'done@night': ['n'], 'done@friday': ['f'] }
  expect(pool(t, 'done', [])).toEqual(['a', 'b'])
  expect(pool(t, 'done', ['night'])).toEqual(['a', 'b', 'n'])
  expect(pool(t, 'done', ['night', 'friday'])).toEqual(['a', 'b', 'n', 'f'])
})

test('a moment with no base lines falls back to the neutral set, never to Clawd', async () => {
  expect(pool({ 'done@night': ['n'] }, 'done', ['night'])).toEqual([...DEFAULT_LINES.done, 'n'])
  expect(pool({}, 'compact', [])).toEqual(DEFAULT_LINES.compact)
})

test('linesFor picks the pet\'s table; shiny uses Clawd\'s; a custom pet uses its own or none', async () => {
  expect(linesFor('robot')).toBe(BUILTIN_LINES.robot)
  expect(linesFor('ghost')).toBe(BUILTIN_LINES.ghost)
  expect(linesFor('clawd-shiny')).toBe(BUILTIN_LINES.clawd)
  expect(linesFor('egg')).toBe(BUILTIN_LINES.egg)
  const mine = { done: ['mine'] }
  expect(linesFor('blob', mine)).toBe(mine)
  expect(linesFor('blob')).toEqual({})
})

test('flavoursOf: daypart, any Friday, and the holiday outfits', async () => {
  const t = (o: Partial<{ day: number; hour: number }>) => ({ year: 2026, month: 3, date: 4, day: 3, hour: 10, ...o })
  expect(flavoursOf(t({}), [])).toEqual(['morning'])
  expect(flavoursOf(t({ day: 5, hour: 23 }), ['nightcap'])).toEqual(['night', 'friday'])
  expect(flavoursOf(t({ hour: 14 }), ['santa'])).toEqual(['afternoon', 'christmas'])
  expect(flavoursOf(t({ hour: 19 }), ['pumpkin', 'sweat'])).toEqual(['evening', 'halloween'])
  expect(flavoursOf(t({}), ['party'])).toEqual(['morning', 'birthday'])
})
