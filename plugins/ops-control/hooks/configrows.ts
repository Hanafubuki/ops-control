// JSX-free: the studio can reuse the same cycles.
import { normalizeHex, SPINNER_IDS, type Mix } from './packs.ts'
import { COLOR_KEYS, shown } from './themes.ts'
import { setSetupField, type Setup } from './setup.ts'
import { FIELD_CHOICES, TWO_BREAKS, BREAK, isFieldId, isFieldToken, type FieldToken } from './fields.ts'
import { builtinPets } from './petfile.ts'
import type { PetSetting } from './pets.ts'
import type { BubbleSetting } from './bubbles.ts'

export type Role = (typeof COLOR_KEYS)[number]
export type ConfigState = {
  packs: readonly string[]
  mix: Mix
  colors: Record<Role, string>
  pet: PetSetting
  shiny: boolean
  egg: boolean
  userPets: readonly string[]
  bubbles: BubbleSetting
  reduced: boolean
  setup: Setup
  fields: readonly FieldToken[]
}
export const CYCLES = ['pack', 'spinner', 'pet', 'bubbles', 'motion', 'meter', 'bubbleMs', 'sleep', 'dance'] as const
export type CycleId = (typeof CYCLES)[number]
export type InputId = `color:${Role}` | 'band' | 'tabs' | 'moods' | 'fields'

const METER_STEPS: readonly [number, number][] = [[50, 80], [60, 85], [70, 90], [40, 70]]
const BUBBLE_MS = [3000, 5000, 8000, 1500]
const SLEEP_MS = [60_000, 300_000, 600_000, 15_000]
const BUBBLE_ORDER: readonly BubbleSetting[] = ['on', 'haiku', 'off']

// A value not in the list (a custom mix, a meter set by command) moves to the list's first entry.
const after = <T>(xs: readonly T[], cur: T | undefined): T => xs[(cur === undefined ? -1 : xs.indexOf(cur)) + 1] ?? xs[0]!
const plainPack = (m: Mix) => (m.colors === m.motion && !m.theme ? m.colors : undefined)
const petList = (s: ConfigState): PetSetting[] => [...builtinPets(s.shiny, s.egg), ...s.userPets, 'off']
const duration = (ms: number) => (ms >= 60_000 ? `${ms / 60_000} min` : `${ms / 1000} s`)

export function cycleValue(id: CycleId, s: ConfigState): string {
  switch (id) {
    case 'pack': return plainPack(s.mix) ?? 'custom mix'
    case 'spinner': return s.mix.spinner ?? 'pack default'
    case 'pet': return s.pet
    case 'bubbles': return s.bubbles
    case 'motion': return s.reduced ? 'reduced' : 'full'
    case 'meter': return `warn ${s.setup.meter.warn}%  danger ${s.setup.meter.danger}%`
    case 'bubbleMs': return duration(s.setup.bubbles.ms)
    case 'sleep': return duration(s.setup.pet.sleepMs)
    case 'dance': return s.setup.pet.dance ? 'on' : 'off'
  }
}

export function cycleCommands(id: CycleId, s: ConfigState): string[] {
  switch (id) {
    case 'pack': return [`pack ${after(s.packs, plainPack(s.mix))}`]
    case 'spinner': return [`spinner ${after(['default', ...SPINNER_IDS], s.mix.spinner ?? 'default')}`]
    case 'pet': return [`pet ${after(petList(s), s.pet)}`]
    case 'bubbles': return [`bubbles ${after(BUBBLE_ORDER, s.bubbles)}`]
    case 'motion': return [`motion ${s.reduced ? 'full' : 'reduced'}`]
    case 'meter': {
      const { warn, danger } = s.setup.meter
      const cur = METER_STEPS.find(([w, d]) => w === warn && d === danger)
      const [w, d] = after(METER_STEPS, cur)
      // setup refuses warn >= danger after each single change, so a rise moves danger first
      return d > danger ? [`setup meter.danger ${d}`, `setup meter.warn ${w}`] : [`setup meter.warn ${w}`, `setup meter.danger ${d}`]
    }
    case 'bubbleMs': return [`setup bubbles.ms ${after(BUBBLE_MS, s.setup.bubbles.ms)}`]
    case 'sleep': return [`setup pet.sleepMs ${after(SLEEP_MS, s.setup.pet.sleepMs)}`]
    case 'dance': return [`setup pet.dance ${s.setup.pet.dance ? 'off' : 'on'}`]
  }
}

export function inputValue(id: InputId, s: ConfigState): string {
  if (id === 'band') return s.setup.band.join(', ')
  if (id === 'tabs') return s.setup.tabs.join(', ')
  if (id === 'moods') return s.setup.bubbles.moods.join(', ')
  if (id === 'fields') return s.fields.join(' ')
  return s.colors[id.slice('color:'.length) as Role]
}

const words = (text: string) => text.split(/[\s,]+/).filter(Boolean)
const SETUP_KEY = { band: 'band', tabs: 'tabs', moods: 'bubbles.moods' } as const

export function inputCommand(id: InputId, text: string, s: ConfigState): { cmd: string } | { error: string } {
  if (id.startsWith('color:')) {
    const role = id.slice('color:'.length), t = text.trim()
    if (!t) return { cmd: `color reset ${role}` }
    const hex = normalizeHex(/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(t) ? '#' + t : t)
    return hex ? { cmd: `color ${role} ${hex}` } : { error: `"${shown(t)}" is not a color. Use #rgb or #rrggbb.` }
  }
  if (id === 'fields') {
    const ids = words(text)
    if (!ids.length || (ids.length === 1 && ids[0] === 'default')) return { cmd: 'statusline fields default' }
    const bad = ids.filter(x => !isFieldToken(x))
    if (bad.length) return { error: `Unknown field${bad.length > 1 ? 's' : ''}: ${bad.map(shown).join(', ')}. Choose from: ${FIELD_CHOICES}.` }
    if (ids.filter(x => x === BREAK).length > 1) return { error: TWO_BREAKS }
    if (!ids.some(isFieldId)) return { error: 'List at least one field.' }
    return { cmd: `statusline fields ${ids.join(' ')}` }
  }
  const key = SETUP_KEY[id as keyof typeof SETUP_KEY]
  const value = words(text).join(',') || 'none'
  const r = setSetupField(s.setup, key, value)
  return 'error' in r ? { error: r.error } : { cmd: `setup ${key} ${value}` }
}
