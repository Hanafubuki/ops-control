import { test, expect } from 'claude-code/testing'
import { registerCopy, touchCopy, decide, unregisterCopy, safeId, pruneStatus, INSTANCES_DIR } from '../hooks/instances.ts'
import { writeStatusFile } from '../hooks/statusline.ts'
import { fakeHost as bareHost } from './kit.ts'

const CACHE = '/home/u/.claude/plugins/cache/ops-control/ops-control/0.2.2'
const NEWER = '/home/u/.claude/plugins/cache/ops-control/ops-control/0.3.1'
const DEV = '/home/u/Projects/ops-control'
// An entry whose folder is gone does not count, so the folders these tests name exist.
const LIVE = [CACHE, NEWER, DEV, '/home/u/.claude/plugins/cache/ops-control2/ops-control/0.2.2', '/home/u/.claude/plugins/cache/x/ops-control/1', '/home/u/other-dev']
const fakeHost = (o: Parameters<typeof bareHost>[0] = {}) => bareHost({ ...o, files: { ...Object.fromEntries(LIVE.map(r => [`${r}/.claude-plugin/plugin.json`, '{}'])), ...o.files } })
const NOW = 1_000_000_000_000
const DIR = INSTANCES_DIR('/home/u/.claude')

test('a single copy is active', async () => {
  const { host } = fakeHost()
  await registerCopy(host, 's1', CACHE, NOW)
  expect(await decide(host, 's1', CACHE, NOW)).toEqual({ active: true, winner: CACHE })
})

test('a copy that sees no entry at all still stays active', async () => {
  const { host } = fakeHost()
  expect((await decide(host, 's1', CACHE, NOW)).active).toBe(true)
})

test('a dev copy wins over an installed copy whichever registered first', async () => {
  for (const [first, second] of [[CACHE, DEV], [DEV, CACHE]] as const) {
    const { host } = fakeHost()
    await registerCopy(host, 's1', first, NOW)
    await registerCopy(host, 's1', second, NOW + 5)
    expect(await decide(host, 's1', DEV, NOW + 5)).toEqual({ active: true, winner: DEV })
    expect((await decide(host, 's1', CACHE, NOW + 5)).active).toBe(false)
  }
})

test('between two installed copies the first registered wins', async () => {
  const other = '/home/u/.claude/plugins/cache/ops-control2/ops-control/0.2.2'
  const { host } = fakeHost()
  await registerCopy(host, 's1', other, NOW)
  await registerCopy(host, 's1', CACHE, NOW + 5)
  expect([(await decide(host, 's1', other, NOW + 9)).active, (await decide(host, 's1', CACHE, NOW + 9)).active]).toEqual([true, false])
})

test('copies that start in the same millisecond still leave exactly one active', async () => {
  for (const roots of [[CACHE, '/home/u/.claude/plugins/cache/x/ops-control/1'], [DEV, '/home/u/other-dev']]) {
    const { host } = fakeHost()
    await Promise.all(roots.map(r => registerCopy(host, 's1', r, NOW)))
    const active = await Promise.all(roots.map(async r => (await decide(host, 's1', r, NOW)).active))
    expect(active.filter(Boolean)).toHaveLength(1)
  }
})

test('another session\'s entries do not count', async () => {
  const { host } = fakeHost()
  await registerCopy(host, 's0', DEV, NOW)
  await registerCopy(host, 's1', CACHE, NOW + 1)
  expect((await decide(host, 's1', CACHE, NOW + 1)).active).toBe(true)
})

test('session end removes the copy\'s entry; an entry over a day old is pruned at the next start', async () => {
  const { host, files, ran } = fakeHost()
  files[`${DIR}/old.1.json`] = JSON.stringify({ root: DEV, at: NOW - 2 * 86_400_000 })
  files[`${DIR}/bad.2.json`] = 'not json'
  files[`${DIR}/new.3.json`] = JSON.stringify({ root: DEV, at: NOW - 1000 })
  await registerCopy(host, 's1', CACHE, NOW)
  expect(ran).toContain(`rm -f ${DIR}/old.1.json`)
  expect(ran).toContain(`rm -f ${DIR}/bad.2.json`)
  expect(ran.some(r => r.includes('new.3'))).toBe(false)
  await unregisterCopy(host, 's1', CACHE)
  expect(ran.filter(r => r.startsWith('rm -f ') && r.includes('/s1.'))).toHaveLength(1)
})

test('an entry over a day old never wins a session', async () => {
  const { host, files } = fakeHost()
  files[`${DIR}/s1.9.json`] = JSON.stringify({ root: DEV, at: NOW - 2 * 86_400_000 })
  await registerCopy(host, 's1', CACHE, NOW)
  expect((await decide(host, 's1', CACHE, NOW)).active).toBe(true)
})

test('a dev entry that stopped refreshing for over 3 minutes does not beat a live installed copy', async () => {
  const { host, files } = fakeHost()
  files[`${DIR}/s1.9.json`] = JSON.stringify({ root: DEV, at: NOW - 10 * 60_000, seen: NOW - 5 * 60_000 })
  await registerCopy(host, 's1', CACHE, NOW)
  expect(await decide(host, 's1', CACHE, NOW)).toEqual({ active: true, winner: CACHE })
})

test('a fresh dev entry still wins, and an entry without a refresh stamp ages by its registration time', async () => {
  const { host, files } = fakeHost()
  files[`${DIR}/s1.9.json`] = JSON.stringify({ root: DEV, at: NOW - 10 * 60_000, seen: NOW - 60_000 })
  await registerCopy(host, 's1', CACHE, NOW)
  expect((await decide(host, 's1', CACHE, NOW)).active).toBe(false)
  files[`${DIR}/s1.9.json`] = JSON.stringify({ root: DEV, at: NOW - 10 * 60_000 })
  expect((await decide(host, 's1', CACHE, NOW)).active).toBe(true)
})

test('touchCopy refreshes the stamp and keeps the registration time that orders copies', async () => {
  const other = '/home/u/.claude/plugins/cache/ops-control2/ops-control/0.2.2'
  const { host } = fakeHost()
  await registerCopy(host, 's1', CACHE, NOW)
  await registerCopy(host, 's1', other, NOW + 5)
  await touchCopy(host, 's1', other, NOW + 4 * 60_000)
  await touchCopy(host, 's1', CACHE, NOW + 4 * 60_000)
  expect((await decide(host, 's1', CACHE, NOW + 4 * 60_000)).active).toBe(true)
  expect((await decide(host, 's1', other, NOW + 4 * 60_000)).active).toBe(false)
})

test('a config dir with a trailing or doubled slash still tells installed from dev', async () => {
  for (const dir of ['/home/u/.claude/', '/home/u//.claude']) {
    const { host } = fakeHost()
    const h = { ...host, configDir: dir }
    await registerCopy(h, 's1', CACHE, NOW)
    await registerCopy(h, 's1', DEV, NOW + 5)
    expect((await decide(h, 's1', DEV, NOW + 5)).active).toBe(true)
    expect((await decide(h, 's1', `${CACHE}/`, NOW + 5)).active).toBe(false)
  }
})

test('an updated installed copy replaces the old version instead of counting as a second copy', async () => {
  const { host, files } = fakeHost()
  await registerCopy(host, 's1', CACHE, NOW)
  await registerCopy(host, 's1', NEWER, NOW + 5_000)
  expect(Object.keys(files).filter(f => f.startsWith(DIR))).toHaveLength(1)
  expect(await decide(host, 's1', NEWER, NOW + 6_000)).toEqual({ active: true, winner: NEWER })
})

test('a fresh entry the old version wrote under its own file name does not count against the new version', async () => {
  const { host, files, ran } = fakeHost()
  files[`${DIR}/s1.9.json`] = JSON.stringify({ root: CACHE, at: NOW - 30_000, seen: NOW - 30_000 })
  await registerCopy(host, 's1', NEWER, NOW)
  expect(ran).toContain(`rm -f ${DIR}/s1.9.json`)
  files[`${DIR}/s1.9.json`] = JSON.stringify({ root: CACHE, at: NOW - 30_000, seen: NOW - 30_000 })
  expect(await decide(host, 's1', NEWER, NOW)).toEqual({ active: true, winner: NEWER })
})

test('an entry whose folder no longer exists is ignored, even a fresh one', async () => {
  const { host, files } = fakeHost()
  const gone = '/home/u/.claude/plugins/cache/other/ops-control/0.1.0'
  files[`${DIR}/s1.7.json`] = JSON.stringify({ root: gone, at: NOW - 1000, seen: NOW - 1000 })
  await registerCopy(host, 's1', CACHE, NOW)
  expect(await decide(host, 's1', CACHE, NOW)).toEqual({ active: true, winner: CACHE })
})

test('a dev copy still wins over the updated installed copy', async () => {
  const { host } = fakeHost()
  await registerCopy(host, 's1', CACHE, NOW)
  await registerCopy(host, 's1', NEWER, NOW + 5)
  await registerCopy(host, 's1', DEV, NOW + 9)
  expect(await decide(host, 's1', DEV, NOW + 10)).toEqual({ active: true, winner: DEV })
  expect((await decide(host, 's1', NEWER, NOW + 10)).active).toBe(false)
})

test('session ids keep only letters, digits and dashes', () => {
  expect(safeId('ab-12')).toBe('ab-12')
  expect(safeId('../../etc/x y;`')).toBe('etcxy')
})

test('the status file name is the cleaned id, and an id with nothing left writes nothing', async () => {
  const { host, files } = bareHost()
  await writeStatusFile(host, '../../evil', 'x')
  await writeStatusFile(host, '///', 'y')
  expect(Object.keys(files)).toEqual(['/home/u/.claude/ops-control/status/evil'])
})

test('status files older than 7 days are deleted', async () => {
  const { host, ran } = fakeHost()
  await pruneStatus(host, '/home/u/.claude/ops-control/status')
  expect(ran).toEqual(['find /home/u/.claude/ops-control/status -type f -mtime +7 -delete'])
})
