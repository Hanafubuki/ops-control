import { expect } from 'claude-code/testing'
import { fakeHost, test } from './kit.ts'
import { readTokens, TokenKeeper, tokenFile } from '../hooks/music/tokens.ts'

const PATH = tokenFile('/home/u/.claude')
const file = (over: Record<string, unknown> = {}) => JSON.stringify({ format: 1, clientId: 'c'.repeat(32), accessToken: 'at-1', refreshToken: 'rt-1', expiresAt: 3_600_000, scope: 's', connectedAt: 0, gen: 1, ...over })

test('the token file reads, and a newer or damaged one is refused', async () => {
  expect(PATH).toBe('/home/u/.claude/ops-control/spotify.json')
  expect(await readTokens(fakeHost({ files: { [PATH]: file() } }).host, PATH)).toMatchObject({ ok: true, tokens: { accessToken: 'at-1', gen: 1 } })
  expect(await readTokens(fakeHost().host, PATH)).toEqual({ ok: false, why: 'missing' })
  expect(await readTokens(fakeHost({ files: { [PATH]: file({ format: 2 }) } }).host, PATH)).toEqual({ ok: false, why: 'newer' })
  expect(await readTokens(fakeHost({ files: { [PATH]: '{' } }).host, PATH)).toEqual({ ok: false, why: 'damaged' })
  expect(await readTokens(fakeHost({ files: { [PATH]: file({ accessToken: 7 }) } }).host, PATH)).toEqual({ ok: false, why: 'damaged' })
})

test('a token far from expiry is used as is; in its last minute it refreshes through the helper', async () => {
  const { host, files } = fakeHost({ files: { [PATH]: file() } })
  const gens: number[] = []
  const keeper = new TokenKeeper(host, PATH, async gen => { gens.push(gen); files[PATH] = file({ accessToken: 'at-2', expiresAt: 7_200_000, gen: gen + 1 }); return 0 })
  await keeper.load()
  expect(await keeper.access(0)).toEqual({ token: 'at-1' })
  expect(await keeper.access(3_600_000 - 59_000)).toEqual({ token: 'at-2' })
  expect(gens).toEqual([1])
})

test('two callers share one refresh', async () => {
  const { host, files } = fakeHost({ files: { [PATH]: file({ expiresAt: 0 }) } })
  let calls = 0, release = () => {}
  const keeper = new TokenKeeper(host, PATH, gen => {
    calls++
    return new Promise(r => { release = () => { files[PATH] = file({ accessToken: 'at-2', gen: gen + 1 }); r(0) } })
  })
  await keeper.load()
  const a = keeper.access(1000), b = keeper.access(1000)
  release()
  expect(await Promise.all([a, b])).toEqual([{ token: 'at-2' }, { token: 'at-2' }])
  expect(calls).toBe(1)
})

test('a 401 refreshes an unexpired token once; a caller with the old token gets the new one', async () => {
  const { host, files } = fakeHost({ files: { [PATH]: file() } })
  const gens: number[] = []
  const keeper = new TokenKeeper(host, PATH, async gen => { gens.push(gen); files[PATH] = file({ accessToken: 'at-2', gen: gen + 1 }); return 0 })
  await keeper.load()
  expect(await keeper.access(0, 'at-1')).toEqual({ token: 'at-2' })
  expect(await keeper.access(0, 'at-1')).toEqual({ token: 'at-2' })
  expect(gens).toEqual([1])
})

test('exit 3 means Reconnect, unless another session already refreshed', async () => {
  const one = fakeHost({ files: { [PATH]: file({ expiresAt: 0 }) } })
  const lost = new TokenKeeper(one.host, PATH, async () => 3)
  await lost.load()
  expect(await lost.access(1000)).toEqual({ error: 'reconnect' })
  expect(lost.status()).toBe('reconnect')
  const two = fakeHost({ files: { [PATH]: file({ expiresAt: 0 }) } })
  const raced = new TokenKeeper(two.host, PATH, async gen => { two.files[PATH] = file({ accessToken: 'at-9', gen: gen + 1 }); return 3 })
  await raced.load()
  expect(await raced.access(1000)).toEqual({ token: 'at-9' })
  expect(raced.status()).toBe('ok')
})

test('a failed refresh keeps the old token until it expires, and is not Reconnect', async () => {
  const { host } = fakeHost({ files: { [PATH]: file({ expiresAt: 30_000 }) } })
  let calls = 0
  const keeper = new TokenKeeper(host, PATH, async () => { calls++; return 1 })
  await keeper.load()
  expect(await keeper.access(0)).toEqual({ token: 'at-1' })
  expect(await keeper.access(40_000)).toEqual({ error: 'failed' })
  expect(await keeper.access(0, 'at-1')).toEqual({ error: 'failed' })
  expect(keeper.status()).toBe('ok')
  expect(calls).toBe(3)
})

test('a refresher that rejects is a failed refresh, and the next run spawns the helper again', async () => {
  const { host } = fakeHost({ files: { [PATH]: file({ expiresAt: 30_000 }) } })
  let calls = 0
  const keeper = new TokenKeeper(host, PATH, async () => { calls++; throw new Error('spawn failed') })
  await keeper.load()
  expect(await keeper.access(40_000)).toEqual({ error: 'failed' })
  expect(await keeper.access(40_000)).toEqual({ error: 'failed' })
  expect(calls).toBe(2)
  expect(keeper.status()).toBe('ok')
})

test('a file that turns newer or damaged during a refresh is remembered, and the helper is not spawned again', async () => {
  for (const why of ['newer', 'damaged'] as const) {
    const { host, files } = fakeHost({ files: { [PATH]: file({ expiresAt: 0 }) } })
    let calls = 0
    const keeper = new TokenKeeper(host, PATH, async () => { calls++; files[PATH] = why === 'newer' ? file({ format: 2 }) : '{'; return 0 })
    await keeper.load()
    expect(await keeper.access(1000)).toEqual({ error: why })
    expect(keeper.status()).toBe(why)
    expect(await keeper.access(1000)).toEqual({ error: why })
    expect(calls).toBe(1)
  }
})

test('a newer token file is refused and never refreshed', async () => {
  const { host } = fakeHost({ files: { [PATH]: file({ format: 2 }) } })
  let calls = 0
  const keeper = new TokenKeeper(host, PATH, async () => { calls++; return 0 })
  expect(await keeper.load()).toEqual({ ok: false, why: 'newer' })
  expect(await keeper.access(0)).toEqual({ error: 'newer' })
  // expired and rejected tokens are the two reasons to refresh; a newer file must survive both
  expect(await keeper.access(10_000_000)).toEqual({ error: 'newer' })
  expect(await keeper.access(0, 'at-1')).toEqual({ error: 'newer' })
  expect(calls).toBe(0)
})
