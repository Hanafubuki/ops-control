import { test, expect } from 'claude-code/testing'
import { DEFAULT_SETUP, SETUP_MOODS, parseSetup, setSetupField, describeSetup, toneFor, type Setup } from '../hooks/setup.ts'

test('no stored setup is the default with no notices', () => {
  expect(parseSetup(undefined)).toEqual({ setup: DEFAULT_SETUP, notices: [] })
})

test('a full valid setup round-trips', () => {
  const s: Setup = { format: 4, bar: 'band', band: ['plan', 'meter'], tabs: ['plan', 'diff'], meter: { warn: 40, danger: 90 }, bubbles: { moods: ['done'], ms: 5000 }, pet: { sleepMs: 120000, dance: false } }
  expect(parseSetup(JSON.parse(JSON.stringify(s)))).toEqual({ setup: s, notices: [] })
})

test('a setup from a later ops-control loads with notices for what it does not know', () => {
  const r = parseSetup({ format: 3, band: ['plan', 'weather'], tabs: ['agents', 'timeline'], bubbles: { moods: ['done', 'cheer'] }, sound: { on: true } })
  expect(r.setup.band).toEqual(['plan'])
  expect(r.setup.tabs).toEqual(['agents'])
  expect(r.setup.bubbles.moods).toEqual(['done'])
  expect(r.setup.meter).toEqual(DEFAULT_SETUP.meter)
  expect(r.notices).toEqual(['unknown band item "weather"', 'unknown tab "timeline"', 'unknown mood "cheer"'])
})

test('bad values fall back per field with a notice', () => {
  const r = parseSetup({ band: 'plan', tabs: [], meter: { warn: 80, danger: 50 }, bubbles: { ms: 200 }, pet: { sleepMs: 'soon' } })
  expect(r.setup).toEqual(DEFAULT_SETUP)
  expect(r.notices).toEqual([
    'band must be a list of: combo, agents, meter, plan',
    'tabs must name at least one of: plan, context, guardrails, agents, diff, music, settings',
    'meter.warn must be below meter.danger',
    'bubbles.ms must be a whole number from 1500 to 10000',
    'pet.sleepMs must be a whole number from 15000 to 600000',
  ])
})

test('the default tabs open on plan and the diff tab is a valid choice', () => {
  expect(DEFAULT_SETUP.tabs).toEqual(['plan', 'context', 'guardrails', 'agents', 'diff', 'music', 'settings'])
  expect(parseSetup({ tabs: ['diff', 'agents'] })).toEqual({ setup: { ...DEFAULT_SETUP, tabs: ['diff', 'agents'] }, notices: [] })
  expect(setSetupField(DEFAULT_SETUP, 'tabs', 'diff,plan')).toMatchObject({ setup: { tabs: ['diff', 'plan'] } })
})

test('a stored setup holding the old default tabs gets the new default; a custom order stays', () => {
  expect(parseSetup({ tabs: ['changes', 'agents', 'plan'] }).setup.tabs).toEqual(DEFAULT_SETUP.tabs)
  expect(parseSetup({ tabs: ['agents', 'changes', 'plan'] }).setup.tabs).toEqual(['agents', 'plan'])
})

test('the Changes tab is gone: a stored one is dropped without a notice, the last default with it is today\'s', () => {
  expect(parseSetup({ format: 4, tabs: ['plan', 'context', 'agents', 'diff', 'changes', 'music'] }).setup.tabs).toEqual(DEFAULT_SETUP.tabs)
  expect(parseSetup({ format: 4, tabs: ['changes', 'diff'] })).toEqual({ setup: { ...DEFAULT_SETUP, tabs: ['diff'] }, notices: [] })
  expect(parseSetup({ format: 4, tabs: ['changes'] })).toEqual({ setup: DEFAULT_SETUP, notices: [] })
  expect(setSetupField(DEFAULT_SETUP, 'tabs', 'plan,changes')).toMatchObject({ setup: { tabs: ['plan'] } })
})

test('a non-object stored setup is the default with a notice', () => {
  expect(parseSetup('band=plan')).toEqual({ setup: DEFAULT_SETUP, notices: ['setup must be an object'] })
})

test('an empty band and empty moods are choices, not errors', () => {
  const r = parseSetup({ band: [], bubbles: { moods: [] } })
  expect(r.notices).toEqual([])
  expect(r.setup.band).toEqual([])
  expect(r.setup.bubbles.moods).toEqual([])
})

test('setSetupField sets lists, numbers and none', () => {
  const a = setSetupField(DEFAULT_SETUP, 'band', 'plan,meter')
  expect('setup' in a && a.setup.band).toEqual(['plan', 'meter'])
  const b = setSetupField(DEFAULT_SETUP, 'bubbles.moods', 'none')
  expect('setup' in b && b.setup.bubbles.moods).toEqual([])
  const c = setSetupField(DEFAULT_SETUP, 'meter.warn', '60')
  expect('setup' in c && c.setup.meter).toEqual({ warn: 60, danger: 80 })
})

test('setSetupField refuses what parseSetup would only warn about', () => {
  expect(setSetupField(DEFAULT_SETUP, 'band', 'plan,weather')).toEqual({ error: 'unknown band item "weather"' })
  expect(setSetupField(DEFAULT_SETUP, 'meter.warn', '85')).toEqual({ error: 'meter.warn must be below meter.danger' })
  expect(setSetupField(DEFAULT_SETUP, 'meter.danger', '1.5')).toEqual({ error: 'meter.danger must be a whole number from 1 to 99' })
  expect(setSetupField(DEFAULT_SETUP, 'colour', 'x')).toEqual({ error: 'Unknown setup key "colour". Keys: bar, band, tabs, meter.warn, meter.danger, bubbles.moods, bubbles.ms, pet.sleepMs, pet.dance.' })
})

test('a format 1 setup holding the old mood default reads as the new default; any other list is kept', async () => {
  expect(parseSetup({ bubbles: { moods: ['needs-you', 'fail', 'done'] } }).setup.bubbles.moods).toEqual([...SETUP_MOODS])
  expect(parseSetup({ format: 1, bubbles: { moods: ['needs-you', 'fail', 'done'] } }).setup.bubbles.moods).toEqual([...SETUP_MOODS])
  expect(parseSetup({ format: 1, bubbles: { moods: ['fail', 'needs-you'] } }).setup.bubbles.moods).toEqual(['fail', 'needs-you'])
})

test('a format 2 setup holding every moment it knew reads as the default; any other list is kept', () => {
  const seven = ['compact', 'long-done', 'hello', 'green', 'done', 'fail', 'needs-you']
  expect(parseSetup({ format: 2, bubbles: { moods: seven } }).setup.bubbles.moods).toEqual([...SETUP_MOODS])
  expect(parseSetup({ format: 2, bubbles: { moods: ['fail', 'done'] } }).setup.bubbles.moods).toEqual(['fail', 'done'])
  expect(parseSetup({ format: 2, bubbles: { moods: ['needs-you', 'fail', 'done'] } }).setup.bubbles.moods).toEqual(['needs-you', 'fail', 'done'])
})

test('format 3 and 4 setups keep their moods as a choice, and a saved setup is format 4', () => {
  const seven = SETUP_MOODS.filter(m => m !== 'level-up')
  expect(parseSetup({ format: 3, bubbles: { moods: seven } }).setup.bubbles.moods).toEqual(seven)
  expect(parseSetup({ format: 4, bubbles: { moods: seven } }).setup.bubbles.moods).toEqual(seven)
  expect(parseSetup({ format: 3, bubbles: { moods: [...SETUP_MOODS].reverse() } }).setup.bubbles.moods).toEqual([...SETUP_MOODS])
  expect(parseSetup({ format: 4, bubbles: { moods: [...SETUP_MOODS].reverse() } }).setup.bubbles.moods).toEqual([...SETUP_MOODS])
  const r = setSetupField(DEFAULT_SETUP, 'bubbles.moods', 'needs-you,fail,done')
  if (!('setup' in r)) throw new Error(r.error)
  expect(r.setup.format).toBe(4)
  expect(r.setup.bubbles.moods).toEqual(['needs-you', 'fail', 'done'])
  expect(parseSetup(JSON.parse(JSON.stringify(r.setup))).setup.bubbles.moods).toEqual(['needs-you', 'fail', 'done'])
  expect(DEFAULT_SETUP.format).toBe(4)
  expect(SETUP_MOODS.at(-1)).toBe('level-up')
})

test('format 4 neither re-migrates moods nor the pre-music tab list; older formats do', () => {
  const four = ['plan', 'agents', 'diff', 'changes']
  expect(parseSetup({ format: 4, bubbles: { moods: ['needs-you', 'fail', 'done'] } }).setup.bubbles.moods).toEqual(['needs-you', 'fail', 'done'])
  expect(parseSetup({ format: 4, tabs: four }).setup.tabs).toEqual(['plan', 'agents', 'diff'])
  expect(parseSetup({ format: 3, tabs: four }).setup.tabs).toEqual(DEFAULT_SETUP.tabs)
  expect(parseSetup({ format: 2, tabs: four }).setup.tabs).toEqual(DEFAULT_SETUP.tabs)
  expect(parseSetup({ tabs: four }).setup.tabs).toEqual(DEFAULT_SETUP.tabs)
  expect(parseSetup({ format: 3, tabs: ['changes', 'agents', 'plan'] }).setup.tabs).toEqual(DEFAULT_SETUP.tabs)
  expect(parseSetup({ format: 3, tabs: ['plan', 'music'] }).setup.tabs).toEqual(['plan', 'music'])
})

test('typing tabs without Music hides the Music tab', () => {
  const r = setSetupField(DEFAULT_SETUP, 'tabs', 'plan,agents,diff')
  if (!('setup' in r)) throw new Error(r.error)
  expect(r.setup.tabs).toEqual(['plan', 'agents', 'diff'])
  expect(parseSetup(JSON.parse(JSON.stringify(r.setup))).setup.tabs).toEqual(['plan', 'agents', 'diff'])
})

test('describeSetup lists every key with its value', () => {
  expect(describeSetup(DEFAULT_SETUP)).toBe([
    'bar            work',
    'band           combo, agents, meter, plan',
    'tabs           plan, context, guardrails, agents, diff, music, settings',
    'meter.warn     50',
    'meter.danger   80',
    'bubbles.moods  needs-you, fail, done, green, hello, long-done, compact, level-up',
    'bubbles.ms     3000',
    'pet.sleepMs    60000',
    'pet.dance      on',
  ].join('\n'))
  expect(describeSetup({ ...DEFAULT_SETUP, band: [] })).toContain('band           none')
})

test('toneFor uses the meter', () => {
  const m = { warn: 50, danger: 80 }
  expect([0, 49, 50, 79, 80, 100].map(p => toneFor(p, m))).toEqual(['pass', 'pass', 'edit', 'edit', 'fail', 'fail'])
  expect(toneFor(30, { warn: 20, danger: 30 })).toBe('fail')
})

test('music is a tab, before Settings by default; a stored 0.11 default order gains it', () => {
  expect(DEFAULT_SETUP.tabs).toEqual(['plan', 'context', 'guardrails', 'agents', 'diff', 'music', 'settings'])
  expect(parseSetup({ tabs: ['plan', 'agents', 'diff', 'changes'] }).setup.tabs).toEqual(DEFAULT_SETUP.tabs)
  expect(parseSetup({ tabs: ['changes', 'plan'] }).setup.tabs).toEqual(['plan'])
  expect(parseSetup({ tabs: ['music'] }).setup.tabs).toEqual(['music'])
})

test('context is a tab after plan; the stored default from before it gains it, a custom list stays', () => {
  const before = ['plan', 'agents', 'diff', 'changes', 'music']
  expect(parseSetup({ format: 4, tabs: before }).setup.tabs).toEqual(DEFAULT_SETUP.tabs)
  expect(parseSetup({ format: 4, tabs: ['plan', 'music'] }).setup.tabs).toEqual(['plan', 'music'])
  expect(parseSetup({ format: 4, tabs: ['context', 'plan'] }).setup.tabs).toEqual(['context', 'plan'])
})

test('settings is the last tab; the stored default from before it gains it, a custom list stays', () => {
  expect(parseSetup({ format: 4, tabs: ['plan', 'context', 'guardrails', 'agents', 'diff', 'music'] }).setup.tabs).toEqual(DEFAULT_SETUP.tabs)
  expect(parseSetup({ format: 4, tabs: ['plan', 'guardrails', 'music'] }).setup.tabs).toEqual(['plan', 'guardrails', 'music'])
  expect(parseSetup({ format: 4, tabs: ['settings', 'plan'] }).setup.tabs).toEqual(['settings', 'plan'])
})

test('pet.dance: default on, a stored false is off, a missing key is on, a non-boolean is a notice', () => {
  expect(DEFAULT_SETUP.pet.dance).toBe(true)
  expect(parseSetup({ format: 4, pet: { sleepMs: 60000, dance: false } }).setup.pet.dance).toBe(false)
  expect(parseSetup({ format: 4, pet: { sleepMs: 60000 } }).setup.pet.dance).toBe(true)
  expect(parseSetup({ format: 4, pet: { dance: 'nope' } }).notices).toEqual(['pet.dance must be true or false'])
})

test('setup pet.dance takes on or off', () => {
  expect(setSetupField(DEFAULT_SETUP, 'pet.dance', 'off')).toEqual({ setup: { ...DEFAULT_SETUP, pet: { sleepMs: 60000, dance: false } } })
  expect(setSetupField(DEFAULT_SETUP, 'pet.dance', 'yes')).toEqual({ error: 'pet.dance takes on or off' })
  expect(describeSetup({ ...DEFAULT_SETUP, pet: { sleepMs: 60000, dance: false } })).toContain('pet.dance      off')
})

test('the bar over the prompt is the work bar unless the setup says band; a setup from before it reads as work', () => {
  expect(DEFAULT_SETUP.bar).toBe('work')
  expect(parseSetup({ format: 4, band: ['combo', 'agents', 'meter', 'plan'] }).setup.bar).toBe('work')
  expect(parseSetup({ bar: 'band' }).setup.bar).toBe('band')
  expect(parseSetup({ bar: 'neon' })).toEqual({ setup: DEFAULT_SETUP, notices: ['bar must be one of: work, band'] })
  expect(setSetupField(DEFAULT_SETUP, 'bar', 'band')).toMatchObject({ setup: { bar: 'band' } })
  expect(setSetupField(DEFAULT_SETUP, 'bar', 'neon')).toEqual({ error: 'bar must be one of: work, band' })
})
