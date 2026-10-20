import { expect } from 'claude-code/testing'
import { test } from './kit.ts'
import { cycleValue, cycleCommands, inputValue, inputCommand, type ConfigState } from '../hooks/configrows.ts'
import { DEFAULT_SETUP } from '../hooks/setup.ts'
import { DEFAULT_FIELDS } from '../hooks/fields.ts'
import { resolveLook, DEFAULT_MIX, SPINNER_IDS } from '../hooks/packs.ts'

const base = (over: Partial<ConfigState> = {}): ConfigState => ({
  packs: ['classic', 'cozy', 'arcade', 'mine'],
  mix: DEFAULT_MIX,
  colors: resolveLook(DEFAULT_MIX, {}, {}).look.theme.colors,
  pet: 'clawd', shiny: false, egg: false, userPets: [], bubbles: 'on', reduced: false,
  setup: DEFAULT_SETUP, fields: DEFAULT_FIELDS,
  ...over,
})

test('pack cycles through the installed packs and wraps', () => {
  expect(cycleValue('pack', base())).toBe('classic')
  expect(cycleCommands('pack', base())).toEqual(['pack cozy'])
  expect(cycleCommands('pack', base({ mix: { colors: 'mine', motion: 'mine' } }))).toEqual(['pack classic'])
})

test('a custom mix shows as one and cycles to the first pack', () => {
  const s = base({ mix: { colors: 'cozy', motion: 'arcade' } })
  expect(cycleValue('pack', s)).toBe('custom mix')
  expect(cycleCommands('pack', s)).toEqual(['pack classic'])
})

test('spinner starts at the pack default and walks the spinner ids', () => {
  expect(cycleValue('spinner', base())).toBe('pack default')
  expect(cycleCommands('spinner', base())[0]).toMatch(/^spinner [a-z-]+$/)
  const last = base({ mix: { ...DEFAULT_MIX, spinner: SPINNER_IDS.at(-1)! } })
  expect(cycleCommands('spinner', last)).toEqual(['spinner default'])
})

test('pet offers shiny and the egg only once they are unlocked', () => {
  expect(cycleCommands('pet', base())).toEqual(['pet robot'])
  expect(cycleCommands('pet', base({ shiny: true }))).toEqual(['pet clawd-shiny'])
  expect(cycleCommands('pet', base({ egg: true, pet: 'ghost' }))).toEqual(['pet egg'])
  expect(cycleCommands('pet', base({ pet: 'off' }))).toEqual(['pet clawd'])
})

test('the pet cycle runs clawd, robot, ghost, user pets, off', () => {
  const s = base({ userPets: ['mochi'] })
  const seq: string[] = []
  let cur = s.pet
  for (let i = 0; i < 5; i++) { const cmd = cycleCommands('pet', { ...s, pet: cur })[0]!; cur = cmd.slice(4); seq.push(cur) }
  expect(seq).toEqual(['robot', 'ghost', 'mochi', 'off', 'clawd'])
})

test('bubbles and motion toggle through their settings', () => {
  expect(cycleCommands('bubbles', base())).toEqual(['bubbles haiku'])
  expect(cycleCommands('bubbles', base({ bubbles: 'off' }))).toEqual(['bubbles on'])
  expect(cycleValue('motion', base({ reduced: true }))).toBe('reduced')
  expect(cycleCommands('motion', base())).toEqual(['motion reduced'])
})

test('meter steps run in an order the warn < danger check accepts', () => {
  expect(cycleValue('meter', base())).toBe('warn 50%  danger 80%')
  expect(cycleCommands('meter', base())).toEqual(['setup meter.danger 85', 'setup meter.warn 60'])
  const top = base({ setup: { ...DEFAULT_SETUP, meter: { warn: 70, danger: 90 } } })
  expect(cycleCommands('meter', top)).toEqual(['setup meter.warn 40', 'setup meter.danger 70'])
  const odd = base({ setup: { ...DEFAULT_SETUP, meter: { warn: 30, danger: 95 } } })
  expect(cycleCommands('meter', odd)).toEqual(['setup meter.warn 50', 'setup meter.danger 80'])
})

test('bubble time and sleep show in seconds or minutes', () => {
  expect(cycleValue('bubbleMs', base())).toBe('3 s')
  expect(cycleCommands('bubbleMs', base())).toEqual(['setup bubbles.ms 5000'])
  expect(cycleValue('sleep', base())).toBe('1 min')
  expect(cycleCommands('sleep', base())).toEqual(['setup pet.sleepMs 300000'])
})

test('hex input accepts #rgb, #rrggbb, a bare hex and spaces, and refuses a name', () => {
  const s = base()
  expect(inputCommand('color:accent', '8ecbff', s)).toEqual({ cmd: 'color accent #8ecbff' })
  expect(inputCommand('color:accent', '#ABC', s)).toEqual({ cmd: 'color accent #aabbcc' })
  expect(inputCommand('color:accent', ' #8ecbff ', s)).toEqual({ cmd: 'color accent #8ecbff' })
  expect(inputCommand('color:accent', 'blue', s)).toEqual({ error: '"blue" is not a color. Use #rgb or #rrggbb.' })
  expect(inputCommand('color:accent', '', s)).toEqual({ cmd: 'color reset accent' })
})

test('list inputs take commas or spaces and reorder', () => {
  const s = base()
  expect(inputValue('tabs', s)).toBe('plan, context, guardrails, agents, diff, music, settings')
  expect(inputCommand('tabs', 'plan, changes', s)).toEqual({ cmd: 'setup tabs plan,changes' })
  expect(inputCommand('band', 'meter plan', s)).toEqual({ cmd: 'setup band meter,plan' })
  expect(inputCommand('moods', 'fail', s)).toEqual({ cmd: 'setup bubbles.moods fail' })
})

test('an empty list means none for band and moods, default for fields, and is refused for tabs', () => {
  const s = base()
  expect(inputCommand('band', '', s)).toEqual({ cmd: 'setup band none' })
  expect(inputCommand('moods', ' ', s)).toEqual({ cmd: 'setup bubbles.moods none' })
  expect(inputCommand('fields', '', s)).toEqual({ cmd: 'statusline fields default' })
  expect(inputCommand('fields', ' default ', s)).toEqual({ cmd: 'statusline fields default' })
  expect('error' in inputCommand('tabs', '', s)).toBe(true)
})

test('unknown list ids are refused before anything runs', () => {
  const s = base()
  expect(inputCommand('tabs', 'plan; rm -rf', s)).toHaveProperty('error')
  expect(inputCommand('fields', 'ctx bogus', s)).toEqual({ error: 'Unknown field: bogus. Choose from: activity, ctx, 5h, week, cost, model, effort, agents, plan, branch, changes, cwd, level, music, and / to start a second line.' })
  expect(inputCommand('fields', 'ctx / cost', s)).toEqual({ cmd: 'statusline fields ctx / cost' })
  expect(inputCommand('fields', 'ctx / cost / 5h', s)).toEqual({ error: 'Use one / to start the second line.' })
  expect(inputCommand('fields', '/', s)).toEqual({ error: 'List at least one field.' })
  expect(inputValue('fields', s)).toBe(DEFAULT_FIELDS.join(' '))
})

test('dance shows on or off and flips', () => {
  expect(cycleValue('dance', base())).toBe('on')
  expect(cycleCommands('dance', base())).toEqual(['setup pet.dance off'])
  const off = base({ setup: { ...DEFAULT_SETUP, pet: { sleepMs: 60000, dance: false } } })
  expect(cycleValue('dance', off)).toBe('off')
  expect(cycleCommands('dance', off)).toEqual(['setup pet.dance on'])
})
