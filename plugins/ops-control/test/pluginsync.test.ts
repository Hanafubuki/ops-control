import { expect } from 'claude-code/testing'
import { fakeHost, test } from './kit.ts'
import { changedOptions, syncPlugin, SEEN_KEY } from '../hooks/pluginsync.ts'

const base = { pack: 'classic', theme: 'classic', spinner: 'pack', pet: 'clawd', bubbles: 'on', statusline: 'activity,ctx,effort,5h,week', reducedMotion: false }

test('no snapshot changes nothing', () => {
  expect(changedOptions(undefined, base)).toEqual([])
})

test('equal values change nothing', () => {
  expect(changedOptions({ ...base }, { ...base })).toEqual([])
})

test('one changed value is returned with its new value', () => {
  expect(changedOptions({ ...base }, { ...base, pack: 'crt' })).toEqual([{ key: 'pack', value: 'crt' }])
})

test('whitespace and stray commas do not count, a real reorder does', () => {
  expect(changedOptions({ ...base }, { ...base, statusline: ' activity , ctx,effort,5h ,week,, ' })).toEqual([])
  expect(changedOptions({ ...base }, { ...base, pack: ' classic ' })).toEqual([])
  expect(changedOptions({ ...base }, { ...base, statusline: 'ctx, activity, effort, 5h, week' })).toEqual([{ key: 'statusline', value: 'ctx,activity,effort,5h,week' }])
})

test('several changes come back in a fixed order', () => {
  const r = changedOptions({ ...base }, { ...base, reducedMotion: true, pet: 'off', pack: 'crt' })
  expect(r).toEqual([{ key: 'pack', value: 'crt' }, { key: 'pet', value: 'off' }, { key: 'reducedMotion', value: true }])
})

const KNOWN = ['pack', 'theme', 'spinner', 'pet', 'bubbles', 'statusline', 'reducedMotion']
const { reducedMotion: _, ...withoutMotion } = base

test('a key the snapshot lists as unknown to the build that wrote it is not a change', () => {
  const older = { ...withoutMotion, keys: KNOWN.filter(k => k !== 'reducedMotion') }
  expect(changedOptions(older, { ...base, reducedMotion: true })).toEqual([])
  expect(changedOptions(older, { ...base, reducedMotion: true, pack: 'crt' })).toEqual([{ key: 'pack', value: 'crt' }])
})

test('a key the build knew but the host never passed applies on its first edit', () => {
  const had = { ...withoutMotion, keys: KNOWN }
  expect(changedOptions(had, { ...base, reducedMotion: true })).toEqual([{ key: 'reducedMotion', value: true }])
  // a snapshot from before keys were stored: the seven keys 1.0 knew
  expect(changedOptions(withoutMotion, { ...base, reducedMotion: true })).toEqual([{ key: 'reducedMotion', value: true }])
})

const run = (log: string[], errors: Record<string, string> = {}) => async (cmd: string) => {
  log.push(cmd)
  return errors[cmd] ?? ({ pack: 'Pack: ', theme: 'Theme: ', spinner: 'Spinner: ', pet: 'Pet: ', bubbles: 'Bubbles: ', motion: 'Motion: ', statusline: 'Status line fields: ' }[cmd.split(' ')[0]!]! + cmd.split(' ').slice(1).join(' '))
}

test('with no snapshot, the current values are written and nothing is applied', async () => {
  const { host, store } = fakeHost()
  const log: string[] = []
  expect(await syncPlugin(host, base, run(log))).toBeUndefined()
  expect(log).toEqual([])
  expect(store[SEEN_KEY]).toEqual({ ...base, keys: KNOWN })
})

test('a key added after the snapshot was written is recorded with its current value and applies nothing', async () => {
  const { host, store } = fakeHost()
  store[SEEN_KEY] = { ...withoutMotion, keys: KNOWN.filter(k => k !== 'reducedMotion') }
  const log: string[] = []
  expect(await syncPlugin(host, { ...base, reducedMotion: true }, run(log))).toBeUndefined()
  expect(log).toEqual([])
  expect(store[SEEN_KEY]).toEqual({ ...base, reducedMotion: true, keys: KNOWN })
  // once recorded, the next edit applies
  expect(await syncPlugin(host, { ...base, reducedMotion: false }, run(log))).toMatch(/motion full/)
})

test('a key the host never passed still applies when the user first sets it', async () => {
  const { host, store } = fakeHost()
  store[SEEN_KEY] = { ...withoutMotion, keys: KNOWN }
  const log: string[] = []
  await syncPlugin(host, { ...base, reducedMotion: true }, run(log))
  expect(log).toEqual(['motion reduced'])
})

test('a changed value is applied through its /ops command, saved, and announced once', async () => {
  const { host, store } = fakeHost()
  store[SEEN_KEY] = { ...base }
  const log: string[] = []
  const toast = await syncPlugin(host, { ...base, pack: 'crt', pet: 'off', reducedMotion: true, spinner: 'comet', bubbles: 'haiku', theme: 'aurora', statusline: 'cost, model' }, run(log))
  expect(log).toEqual(['pack crt', 'theme aurora', 'spinner comet', 'pet off', 'bubbles haiku', 'statusline fields cost model', 'motion reduced'])
  expect(toast).toBe('Applied from /plugin: pack crt, theme aurora, spinner comet, pet off, bubbles haiku, statusline cost,model, motion reduced.')
  expect(store[SEEN_KEY]).toEqual({ ...base, pack: 'crt', theme: 'aurora', spinner: 'comet', pet: 'off', bubbles: 'haiku', statusline: 'cost,model', reducedMotion: true, keys: KNOWN })
  const again: string[] = []
  expect(await syncPlugin(host, { ...base, pack: 'crt', pet: 'off', reducedMotion: true, spinner: 'comet', bubbles: 'haiku', theme: 'aurora', statusline: 'cost,model' }, run(again))).toBeUndefined()
  expect(again).toEqual([])
})

test('the spinner value "pack" and motion off map to their default commands', async () => {
  const { host, store } = fakeHost()
  store[SEEN_KEY] = { ...base, spinner: 'comet', reducedMotion: true }
  const log: string[] = []
  await syncPlugin(host, base, run(log))
  expect(log).toEqual(['spinner default', 'motion full'])
})

test('going back to the default theme or status line fields clears the saved choice instead of storing the default', async () => {
  const { host, store } = fakeHost()
  store[SEEN_KEY] = { ...base, theme: 'aurora', statusline: 'cost,model' }
  const log: string[] = []
  await syncPlugin(host, base, run(log))
  expect(log).toEqual(['theme default', 'statusline fields default'])
})

test('a pack change reapplies the unchanged non-default theme and spinner, and skips default ones', async () => {
  const { host, store } = fakeHost()
  store[SEEN_KEY] = { ...base, theme: 'dusk', spinner: 'comet' }
  const log: string[] = []
  const toast = await syncPlugin(host, { ...base, pack: 'crt', theme: 'dusk', spinner: 'comet' }, run(log))
  expect(log).toEqual(['pack crt', 'theme dusk', 'spinner comet'])
  expect(toast).toBe('Applied from /plugin: pack crt.')
  const only: string[] = []
  store[SEEN_KEY] = { ...base }
  await syncPlugin(host, { ...base, pack: 'cozy' }, run(only))
  expect(only).toEqual(['pack cozy'])
})

test('a command that fails is named in the toast and the value is still recorded', async () => {
  const { host, store } = fakeHost()
  store[SEEN_KEY] = { ...base }
  const log: string[] = []
  const toast = await syncPlugin(host, { ...base, pack: 'nope', pet: 'off' }, run(log, { 'pack nope': 'No pack named "nope".' }))
  expect(toast).toBe('Applied from /plugin: pet off. Not applied: pack nope: No pack named "nope".')
  expect((store[SEEN_KEY] as typeof base).pack).toBe('nope')
})

test('an empty value is recorded without running a command', async () => {
  const { host, store } = fakeHost()
  store[SEEN_KEY] = { ...base }
  const log: string[] = []
  expect(await syncPlugin(host, { ...base, pack: '' }, run(log))).toBeUndefined()
  expect(log).toEqual([])
})
