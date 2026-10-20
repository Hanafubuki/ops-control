import { test, expect } from 'claude-code/testing'
import { loadUserThemes, addTheme } from '../hooks/userthemes.ts'
import { resolveTheme } from '../hooks/themes.ts'
import { fakeHost } from './kit.ts'

const DIR = '/home/u/.claude/ops-control/themes'

test('loads json files; a broken one falls back with its reason', async () => {
  const { host } = fakeHost({ files: { [`${DIR}/mine.json`]: '{ // hi\n "name": "mine", "extends": "vaporwave" }', [`${DIR}/broken.json`]: '{', [`${DIR}/notes.txt`]: 'x' } })
  const user = await loadUserThemes(host)
  expect(Object.keys(user).sort()).toEqual(['broken', 'mine'])
  expect(resolveTheme('mine', user).error).toBeUndefined()
  expect(resolveTheme('broken', user).error).toContain('not valid JSON')
})

test('no theme directory means no user themes', async () => {
  expect(await loadUserThemes(fakeHost().host)).toEqual({})
})

test('theme add validates before saving', async () => {
  const { host, files } = fakeHost({ fetches: { 'https://x.dev/neon.json': '{"name":"neon","extends":"cyberpunk","colors":{"accent":"#00ffaa"}}', 'https://x.dev/bad.json': '{"name":"bad","colors":{"accent":"nope"}}' } })
  expect(await addTheme(host, 'https://x.dev/neon.json')).toContain('neon')
  expect(files[`${DIR}/neon.json`]).toBeDefined()
  expect(await addTheme(host, 'https://x.dev/bad.json')).toContain('#rrggbb')
  expect(files[`${DIR}/bad.json`]).toBeUndefined()
  expect(await addTheme(host, 'https://x.dev/missing.json')).toContain('404')
  expect(await addTheme(host, 'file:///etc/passwd')).toContain('https')
})

test('a failed download (offline, DNS) is reported, not thrown', async () => {
  const { host, files } = fakeHost()
  const offline = { ...host, fetchText: async () => { throw new Error('getaddrinfo ENOTFOUND x.dev') } }
  expect(await addTheme(offline, 'https://x.dev/t.json')).toBe('Could not download the theme: getaddrinfo ENOTFOUND x.dev')
  expect(Object.keys(files)).toEqual([])
})

test('a JSON error never echoes control bytes from the file', async () => {
  const body = '\u001b[2J\u001b]0;pwned\u0007' + 'x'.repeat(200)
  const { host } = fakeHost({ fetches: { 'https://x.dev/e.json': body }, files: { [`${DIR}/bad.json`]: body } })
  const added = await addTheme(host, 'https://x.dev/e.json')
  expect(added).toContain('not valid JSON')
  expect(/[\u0000-\u001f\u007f-\u009f]/.test(added)).toBe(false)
  expect(added.length).toBeLessThanOrEqual('not valid JSON: '.length + 40)
  const toast = resolveTheme('bad', await loadUserThemes(host)).error!
  expect(/[\u0000-\u001f\u007f-\u009f]/.test(toast)).toBe(false)
})

test('theme names are safe file names', async () => {
  const { host, files } = fakeHost({ fetches: { 'https://x.dev/t.json': '{"name":"../../evil"}' } })
  expect(await addTheme(host, 'https://x.dev/t.json')).toContain('name')
  expect(Object.keys(files)).toEqual([])
})

test('theme add rejects a file that is not a plain object', async () => {
  const fetches = { 'https://x.dev/null.json': 'null', 'https://x.dev/arr.json': '[]', 'https://x.dev/num.json': '5' }
  const { host, files } = fakeHost({ fetches })
  for (const u of Object.keys(fetches)) expect(await addTheme(host, u)).toContain('JSON object')
  expect(Object.keys(files)).toEqual([])
})

test('a new theme may extend an installed user theme', async () => {
  const { host, files } = fakeHost({
    files: { [`${DIR}/base.json`]: '{"name":"base","colors":{"accent":"#111111"}}' },
    fetches: { 'https://x.dev/kid.json': '{"name":"kid","extends":"base"}' },
  })
  expect(await addTheme(host, 'https://x.dev/kid.json')).toContain('Installed')
  expect(files[`${DIR}/kid.json`]).toBeDefined()
})

test('built-in names, including inherited ones, are handled', async () => {
  const { host, files } = fakeHost({ fetches: { 'https://x.dev/c.json': '{"name":"classic"}', 'https://x.dev/k.json': '{"name":"constructor"}' } })
  expect(await addTheme(host, 'https://x.dev/c.json')).toContain('built-in')
  expect(await addTheme(host, 'https://x.dev/k.json')).toContain('Installed')
  expect(files[`${DIR}/constructor.json`]).toBeDefined()
})

test('an oversize download is refused by the parser', async () => {
  const { host, files } = fakeHost({ fetches: { 'https://x.dev/big.json': '{"name":"big","pad":"' + 'é'.repeat(33000) + '"}' } })
  expect(await addTheme(host, 'https://x.dev/big.json')).toContain('over 65536 bytes')
  expect(Object.keys(files)).toEqual([])
})
