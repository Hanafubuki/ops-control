import { expect } from 'claude-code/testing'
import { test, fakeHost } from './kit.ts'
import { allowed, newLines, createRun, isLive, restoreUndo, saveUndo, scanRuns, snapshotOf, FRESH_MS, START_MS, PRUNE_MS } from '../hooks/remote.ts'
import { resolveLook, DEFAULT_MIX } from '../hooks/packs.ts'
import { DEFAULT_SETUP } from '../hooks/setup.ts'
import { DEFAULT_FIELDS } from '../hooks/fields.ts'
import { builtinPets } from '../hooks/petfile.ts'

test('the allowlist takes the TUI commands and refuses the rest', () => {
  for (const c of ['pack crt', 'spinner comet', 'spinner default', 'motion reduced', 'bubbles haiku', 'pet robot', 'color accent #112233', 'color reset accent', 'setup meter.warn 60', 'setup band combo,agents', 'statusline fields ctx cost']) expect(allowed(c)).toBe(true)
  for (const c of ['pack https://x.test/p.json', 'pack save mine', 'pet add /tmp/p.json', 'setup reset', 'statusline on', 'statusline restore', 'export konsole', 'import a.toml', 'config', 'theme aurora', 'color list', 'pack']) expect(allowed(c)).toBe(false)
  for (const c of ['statusline fields', 'statusline', 'setup', 'setup band', 'color', 'color accent', 'spinner', 'spinner a b', 'motion', 'bubbles', 'pet', 'pet a b', 'pack a b']) expect(allowed(c)).toBe(false)
})

test('pet takes every built-in name and off, and refuses names a file path could use', () => {
  for (const n of [...builtinPets(true, true), 'off']) expect(allowed(`pet ${n}`)).toBe(true)
  for (const c of ['pet ../x', 'pet /tmp/p.json', 'pet A', 'pet a.b', 'pet -x', 'pet add', 'pet list']) expect(allowed(c)).toBe(false)
})

test('newLines returns complete lines past the consumed count', () => {
  const text = '{"seq":1,"cmds":["pack crt"]}\n{"seq":2,"undo":true}\n'
  expect(newLines(text, 0)).toEqual({ lines: [{ seq: 1, cmds: ['pack crt'] }, { seq: 2, undo: true }], consumed: 2 })
  expect(newLines(text, 1)).toEqual({ lines: [{ seq: 2, undo: true }], consumed: 2 })
  expect(newLines(text, 2)).toEqual({ lines: [], consumed: 2 })
})

test('a last line without a newline waits', () => {
  expect(newLines('{"seq":1,"cmds":["pack crt"]}\n{"seq":2,"cm', 0)).toEqual({ lines: [{ seq: 1, cmds: ['pack crt'] }], consumed: 1 })
})

test('a line that does not parse is consumed as undefined', () => {
  expect(newLines('nope\n{"seq":"x"}\n{"seq":3,"cmds":[]}\n{"seq":4,"cmds":["pack crt"]}\n', 0))
    .toEqual({ lines: [undefined, undefined, undefined, { seq: 4, cmds: ['pack crt'] }], consumed: 4 })
})

test('undo writes stored keys back and deletes the ones that were absent', async () => {
  const { host, store } = fakeHost()
  store.mix = { colors: 'crt', motion: 'crt', theme: 'aurora', overrides: { accent: '#112233' } }
  const undo = await saveUndo(host)
  expect(undo.setup).toBeNull()
  store.mix = { colors: 'arcade', motion: 'arcade' }
  store.setup = { format: 1, band: [], tabs: ['plan'], meter: { warn: 50, danger: 80 }, bubbles: { moods: [], ms: 3000 }, pet: { sleepMs: 60000 } }
  store.statusline = ['ctx']
  await restoreUndo(host, undo)
  expect(store.mix).toEqual({ colors: 'crt', motion: 'crt', theme: 'aurora', overrides: { accent: '#112233' } })
  expect('setup' in store).toBe(false)
  expect('statusline' in store).toBe(false)
})

test('createRun writes owner and the undo point under the remote dir, owner first', async () => {
  const { host, files, store } = fakeHost()
  store.pet = 'robot'
  const order: string[] = []
  const write = host.writeFile
  host.writeFile = async (p, t) => { order.push(p.split('/').pop()!); await write(p, t) }
  const dir = await createRun(host, 's1', 'abc')
  expect(order).toEqual(['owner', 'undo.json'])
  expect(dir).toBe('/home/u/.claude/ops-control/remote/abc')
  expect(files[`${dir}/owner`]).toBe('s1')
  expect(JSON.parse(files[`${dir}/undo.json`]!).pet).toBe('robot')
})

test('a run is live while open is fresh, or for START_MS before open exists', () => {
  expect(isLive(1000, 0, 1000 + FRESH_MS - 1)).toBe(true)
  expect(isLive(1000, 0, 1000 + FRESH_MS + 1)).toBe(false)
  expect(isLive(undefined, 1000, 1000 + START_MS - 1)).toBe(true)
  expect(isLive(undefined, 1000, 1000 + START_MS + 1)).toBe(false)
  expect(isLive(undefined, undefined, 0)).toBe(false)
})

test('scanRuns finds this session\'s live run and day-old runs', async () => {
  const now = 10 * PRUNE_MS, R = '/home/u/.claude/ops-control/remote'
  const { host } = fakeHost({
    files: { [`${R}/mine/owner`]: 's1', [`${R}/mine/open`]: '', [`${R}/theirs/owner`]: 's2', [`${R}/theirs/open`]: '', [`${R}/old/owner`]: 's1' },
    mtimes: { [`${R}/mine/owner`]: now - 5000, [`${R}/mine/open`]: now - 1000, [`${R}/theirs/owner`]: now, [`${R}/theirs/open`]: now, [`${R}/old/owner`]: now - PRUNE_MS - 1 },
  })
  expect(await scanRuns(host, 's1', now)).toEqual({ live: [`${R}/mine`], stale: [`${R}/old`] })
})

test('scanRuns keeps a run that has owner and no open yet, and leaves a folder with no times alone', async () => {
  const now = 10 * PRUNE_MS, R = '/home/u/.claude/ops-control/remote'
  const { host } = fakeHost({
    files: { [`${R}/new/owner`]: 's1', [`${R}/half/undo.json`]: '{}' },
    mtimes: { [`${R}/new/owner`]: now - START_MS + 1000 },
  })
  expect(await scanRuns(host, 's1', now)).toEqual({ live: [`${R}/new`], stale: [] })
})

test('scanRuns with no remote dir finds nothing', async () => {
  expect(await scanRuns(fakeHost().host, 's1', 0)).toEqual({ live: [], stale: [] })
})

test('the snapshot carries state, look fields and the option lists', () => {
  const look = resolveLook(DEFAULT_MIX, {}, {}).look
  const s = snapshotOf({ packs: ['classic', 'crt'], mix: DEFAULT_MIX, colors: look.theme.colors, pet: 'clawd', shiny: false, egg: false, userPets: ['mochi'], bubbles: 'on', reduced: false, setup: DEFAULT_SETUP, fields: DEFAULT_FIELDS },
    look, { cursor: { seq: 2, lines: 3 }, version: '0.12.0', cwd: '/r', note: { text: 'Pack: crt', tone: 'ok' } })
  expect(s.format).toBe(1)
  expect(s.seq).toBe(2)
  expect(s.lines).toBe(3)
  expect(s.options.pets).toEqual(['clawd', 'robot', 'ghost', 'mochi', 'off'])
  expect(s.options.packs).toEqual(['classic', 'crt'])
  expect(s.look.border).toBe(look.border)
  expect(s.state.colors.accent).toBe(look.theme.colors.accent)
  expect(s.note).toEqual({ text: 'Pack: crt', tone: 'ok' })
  expect(s.options.fields.at(-1)).toBe('/')
})
