import { test, expect } from 'claude-code/testing'
import { renderFields, renderLines, parseFields, DEFAULT_FIELDS, FIELD_IDS, BREAK, FIELD_CHOICES, type FieldToken } from '../hooks/fields.ts'
import { initialModel, type Model } from '../hooks/model.ts'
import { resolveTheme } from '../hooks/themes.ts'

const T = resolveTheme('classic', {}).theme
const NOW = Date.parse('2026-10-07T12:00:00Z') // a Wednesday
const plain = (m: Model, fields: readonly FieldToken[] = DEFAULT_FIELDS, now = NOW, tzOffset = 0) => renderFields(m, T, fields, { now, tzOffset, color: 'plain' })
const at = (mins: number) => new Date(NOW + mins * 60_000).toISOString()
const lim = (kind: string, percentUsed: number, resetsAt?: string) => ({ kind, percentUsed, resetsAt })

test('default fields on a fresh model show only activity', () => {
  expect(plain(initialModel())).toBe('◆ idle')
})

test('each field renders, and is omitted without data', () => {
  const m: Model = {
    ...initialModel(), working: true, ctxPercent: 48, act: { glyph: '✎', label: 'Editing a.ts', tone: 'edit' },
    limits: [lim('five_hour', 23, at(130)), lim('seven_day', 61, at(60 * 24 * 2))], costUsd: 1.234,
    modelName: 'claude-opus-5-5', effort: 'high', root: '/w/ops-control', branch: 'main',
    agents: [{ key: 'a', name: 'x', task: '', state: 'running', startedAt: 0 }, { key: 'b', name: 'y', task: '', state: 'running', startedAt: 0 }],
    plan: [{ id: '1', title: 'a', status: 'completed' }, { id: '2', title: 'b', status: 'pending' }],
    files: [{ path: 'a', add: 40, del: 7, how: 'edit', at: 0 }, { path: 'b', add: 2, del: 0, how: 'edit', at: 0 }],
  }
  expect(plain(m, FIELD_IDS)).toBe('◆ editing · ctx 48% · 5h 23% ↻2h10m · wk 61% ↻Fri · $1.23 · claude-opus-5-5 · ◐ high · 2 agents · plan 1/2 · main · +42 −7 · ops-control')
  const empty: Model = { ...initialModel(), root: '/w/ops-control' }
  expect(plain(empty, FIELD_IDS)).toBe('◆ idle · ops-control')
  expect(plain({ ...empty, agents: [{ key: 'a', name: 'x', task: '', state: 'running', startedAt: 0 }] }, ['agents'])).toBe('1 agent')
})

test('reset times: under a minute, under an hour, under a day, beyond, past, missing, unparsable', () => {
  const five = (resetsAt?: string) => plain({ ...initialModel(), limits: [lim('five_hour', 10, resetsAt)] }, ['5h'])
  expect(five(at(0.5))).toBe('5h 10% ↻<1m')
  expect(five(at(59))).toBe('5h 10% ↻59m')
  expect(five(at(60 * 23 + 59))).toBe('5h 10% ↻23h59m')
  expect(five(at(-1))).toBe('')
  expect(five(undefined)).toBe('5h 10%')
  expect(five('not a date')).toBe('5h 10%')
})

test('the weekday uses tzOffset, not the process timezone', () => {
  // the reset is Thursday 21:30 UTC, which is Friday 00:30 at +180
  const resets = '2026-10-08T21:30:00Z'
  const m = { ...initialModel(), limits: [lim('seven_day', 5, resets)] }
  const now = Date.parse('2026-10-06T21:30:00Z')
  expect(plain(m, ['week'], now, 0)).toBe('wk 5% ↻Thu')
  expect(plain(m, ['week'], now, 180)).toBe('wk 5% ↻Fri')
})

test('an all-empty render is an empty string', () => {
  expect(plain(initialModel(), ['5h', 'branch'])).toBe('')
})

test('colors: thresholds and both escape forms', () => {
  const pct = (p: number, color: 'truecolor' | '256') => renderFields({ ...initialModel(), limits: [lim('five_hour', p)] }, T, ['5h'], { now: NOW, tzOffset: 0, color })
  const tc = (hex: string) => `\x1b[38;2;${parseInt(hex.slice(1, 3), 16)};${parseInt(hex.slice(3, 5), 16)};${parseInt(hex.slice(5, 7), 16)}m`
  expect(pct(49, 'truecolor')).toContain(tc(T.colors.pass) + '49%')
  expect(pct(50, 'truecolor')).toContain(tc(T.colors.edit) + '50%')
  expect(pct(79, 'truecolor')).toContain(tc(T.colors.edit) + '79%')
  expect(pct(80, 'truecolor')).toContain(tc(T.colors.fail) + '80%')
  expect(pct(80, '256')).toMatch(/\x1b\[38;5;\d+m80%/)
  expect(pct(80, 'truecolor')).toContain('\x1b[39m')
  expect(plain({ ...initialModel(), limits: [lim('five_hour', 80)] }, ['5h'])).not.toContain('\x1b')
})

test('parseFields: arrays and strings, unknown dropped, repeats keep the first, empty is undefined', () => {
  expect(parseFields(['5h', 'week', '5h'])).toEqual(['5h', 'week'])
  expect(parseFields(' activity, ctx ,nope')).toEqual(['activity', 'ctx'])
  expect(parseFields(['nope'])).toBeUndefined()
  expect(parseFields('')).toBeUndefined()
  expect(parseFields(42)).toBeUndefined()
})

test('field tones follow the meter', () => {
  // the painted line with the number blanked, so only the color differs
  const tc = (p: number, meter?: { warn: number; danger: number }) =>
    renderFields({ ...initialModel(), ctxPercent: p }, T, ['ctx'], { now: NOW, tzOffset: 0, color: 'truecolor', meter }).replace(`${p}%`, 'N%')
  expect(tc(60)).toBe(tc(55))
  expect(tc(60)).not.toBe(tc(10))
  expect(tc(60, { warn: 70, danger: 90 })).toBe(tc(10))
  expect(tc(60, { warn: 30, danger: 55 })).toBe(tc(95))
})

test('effort shows the level after a half-circle, and nothing before the first request', () => {
  expect(plain({ ...initialModel(), effort: 'high' }, ['effort'])).toBe('◐ high')
  expect(plain({ ...initialModel(), effort: undefined }, ['effort'])).toBe('')
})

test('effort is in the default fields, after ctx', () => {
  expect(DEFAULT_FIELDS).toEqual(['activity', 'ctx', 'effort', '5h', 'week'])
})

test('level: hidden until xp is read, then Lv N and five cells', () => {
  const lv = (xp?: number) => plain({ ...initialModel(), xp }, ['level'])
  expect(FIELD_IDS).toContain('level')
  expect(DEFAULT_FIELDS).not.toContain('level')
  expect(lv(undefined)).toBe('')
  expect(lv(0)).toBe('Lv 1 ▱▱▱▱▱')
  expect(lv(100 + 80)).toBe('Lv 2 ▰▰▱▱▱')
  expect(lv(100 + 199)).toBe('Lv 2 ▰▰▰▰▱')
})

test('music field shows the playing track only', () => {
  const track = { id: 'x', title: 'Fembrook Dr', artist: 'Khary', album: '', durationMs: 1 }
  const m = (music: Model['music']): Model => ({ ...initialModel(), music })
  expect(DEFAULT_FIELDS).not.toContain('music')
  expect(plain(m({ status: 'open', playing: true, ad: false, progressMs: 0, readAt: 0, track }), ['music'])).toBe('♪ Fembrook Dr — Khary')
  expect(plain(m({ status: 'open', playing: false, ad: false, progressMs: 0, readAt: 0, track }), ['music'])).toBe('')
  expect(plain(m({ status: 'open', playing: true, ad: true, progressMs: 0, readAt: 0, track }), ['music'])).toBe('')
  expect(plain(m({ status: 'closed' }), ['music'])).toBe('')
})

test('parseFields keeps the first / and drops later ones; a list with no field is undefined', () => {
  expect(parseFields(['activity', '/', 'ctx', '/', '5h'])).toEqual(['activity', '/', 'ctx', '5h'])
  expect(parseFields('activity, / ,ctx')).toEqual(['activity', '/', 'ctx'])
  expect(parseFields('activity,/,ctx,/')).toEqual(['activity', '/', 'ctx'])
  expect(parseFields(['/'])).toBeUndefined()
  expect(parseFields('/,nope')).toBeUndefined()
  expect(parseFields(['/', 'ctx'])).toEqual(['/', 'ctx'])
})

test('renderLines: none, middle, start, end, and an empty side', () => {
  const m: Model = { ...initialModel(), ctxPercent: 48, effort: 'high' }
  const lines = (fields: Parameters<typeof renderLines>[2]) => renderLines(m, T, fields, { now: NOW, tzOffset: 0, color: 'plain' })
  expect(lines(['activity', 'ctx'])).toEqual(['◆ idle · ctx 48%'])
  expect(lines(['activity', BREAK, 'ctx', 'effort'])).toEqual(['◆ idle', 'ctx 48% · ◐ high'])
  expect(lines([BREAK, 'ctx'])).toEqual(['ctx 48%'])
  expect(lines(['ctx', BREAK])).toEqual(['ctx 48%'])
  expect(lines(['ctx', BREAK, '5h', 'music'])).toEqual(['ctx 48%'])
  expect(lines(['5h', BREAK, 'music'])).toEqual([])
})

test('renderFields joins the two lines into one with the separator', () => {
  const m: Model = { ...initialModel(), ctxPercent: 48 }
  expect(plain(m, ['activity', BREAK, 'ctx'])).toBe('◆ idle · ctx 48%')
  expect(plain(m, ['5h', BREAK, 'music'])).toBe('')
})

test('each line is painted on its own: line 2 opens with its own color, not a reset carried over', () => {
  const m: Model = { ...initialModel(), ctxPercent: 90, limits: [lim('five_hour', 60)] }
  const [one, two] = renderLines(m, T, ['ctx', BREAK, '5h'], { now: NOW, tzOffset: 0, color: 'truecolor' })
  expect(one!.endsWith('\x1b[39m')).toBe(true)
  expect(two!.startsWith('\x1b[38;2;')).toBe(true)
  expect(two).not.toContain(' · ')
  expect(one).not.toContain(' · ')
})

test('the field choices name / last', () => {
  expect(FIELD_CHOICES).toBe(`${FIELD_IDS.join(', ')}, and / to start a second line`)
})
