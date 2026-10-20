import { test, expect } from 'claude-code/testing'
import { loadUserPacks, addPack, savePack } from '../hooks/userpacks.ts'
import { resolveLook } from '../hooks/packs.ts'
import { fakeHost } from './kit.ts'

const DIR = '/home/u/.claude/ops-control/packs'
const NEON = '{"format":1,"name":"neon","extends":"arcade","colors":{"palette":{"accent":"#00ffaa"}}}'

test('loads pack files; a broken one keeps its error', async () => {
  const { host } = fakeHost({ files: { [`${DIR}/mine.json`]: '{ // hi\n "format": 1, "name": "mine" }', [`${DIR}/broken.json`]: '{', [`${DIR}/notes.txt`]: 'x' } })
  const user = await loadUserPacks(host)
  expect(Object.keys(user).sort()).toEqual(['broken', 'mine'])
  expect(resolveLook({ colors: 'broken', motion: 'mine' }, user, {}).errors.join()).toContain('not valid JSON')
})

test('addPack: https only, validated, built-in names refused, no silent overwrite', async () => {
  const { host, files } = fakeHost({ fetches: { 'https://x.dev/neon.json': NEON, 'https://x.dev/crt.json': '{"format":1,"name":"crt"}', 'https://x.dev/bad.json': '{"format":1,"name":"bad","colors":{"rows":5}}' } })
  expect((await addPack(host, 'http://x.dev/neon.json', false)).message).toContain('https://')
  expect(await addPack(host, 'https://x.dev/neon.json', false)).toEqual({ name: 'neon', message: expect.stringContaining('neon') })
  expect(files[`${DIR}/neon.json`]).toBe(NEON)
  expect((await addPack(host, 'https://x.dev/neon.json', false)).message).toContain('--force')
  expect((await addPack(host, 'https://x.dev/neon.json', true)).name).toBe('neon')
  expect((await addPack(host, 'https://x.dev/crt.json', true)).message).toContain('built-in')
  expect((await addPack(host, 'https://x.dev/bad.json', false)).message).toContain('rows')
  expect(files[`${DIR}/bad.json`]).toBeUndefined()
})

test('addPack installs a pack that names a spinner this build lacks', async () => {
  const body = '{"format":1,"name":"later","motion":{"spinner":"hologram"}}'
  const { host, files } = fakeHost({ fetches: { 'https://x.dev/later.json': body } })
  expect((await addPack(host, 'https://x.dev/later.json', false)).name).toBe('later')
  expect(files[`${DIR}/later.json`]).toBe(body)
})

test('addPack installs a pack with a key this build does not know, and hands back one notice for it', async () => {
  const body = '{"format":1,"name":"later","colors":{"hologram":true}}'
  const { host, files } = fakeHost({ fetches: { 'https://x.dev/later.json': body } })
  const r = await addPack(host, 'https://x.dev/later.json', false)
  expect(r.name).toBe('later')
  expect(r.notices).toEqual(['pack "later": unknown key "colors.hologram" skipped'])
  expect(files[`${DIR}/later.json`]).toBe(body)
})

test('loadUserPacks echoes fs errors without control characters', async () => {
  const { host } = fakeHost({ files: { [`${DIR}/a.json`]: '{}' } })
  host.readFile = async () => { throw new Error('bad\u001b[2J path') }
  const user = await loadUserPacks(host)
  expect((user.a as Error).message).not.toContain('\u001b')
  host.readFile = async () => { throw new Error('x'.repeat(100)) }
  expect(((await loadUserPacks(host)).a as Error).message).toHaveLength(100)
})

test('addPack refuses a body over 64 KB before parsing', async () => {
  const { host } = fakeHost({ fetches: { 'https://x.dev/big.json': '{"format":1,"name":"big","description":"' + 'a'.repeat(70_000) + '"}' } })
  expect((await addPack(host, 'https://x.dev/big.json', false)).message).toContain('64 KB')
})

test('savePack writes a file that loads back; refuses unsafe and built-in names', async () => {
  const { host, files } = fakeHost()
  expect(await savePack(host, { format: 1, name: 'mine', motion: { spinner: 'comet' } })).toContain('mine')
  expect(JSON.parse(files[`${DIR}/mine.json`]!).motion.spinner).toBe('comet')
  expect(await savePack(host, { format: 1, name: 'mine' })).toContain('--force')
  expect(await savePack(host, { format: 1, name: 'Bad Name' })).toContain('lowercase')
  expect(await savePack(host, { format: 1, name: 'arcade' })).toContain('built-in')
})
