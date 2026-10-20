import { expect } from 'claude-code/testing'
import { fakeHost, test, type FakeRequest } from './kit.ts'
import { SpotifyClient, allPlaylists, readPlayer, skipTo } from '../hooks/music/spotify.ts'
import { TokenKeeper, tokenFile, type Refresher } from '../hooks/music/tokens.ts'
import { commandRequest, queueRequest } from '../hooks/music/webapi.ts'

const PATH = tokenFile('/home/u/.claude')
const file = (over: Record<string, unknown> = {}) => JSON.stringify({ format: 1, clientId: 'c'.repeat(32), accessToken: 'at-1', refreshToken: 'rt-1', expiresAt: 3_600_000, scope: '', connectedAt: 0, gen: 1, ...over })
const PLAYER = JSON.stringify({ device: { id: 'p', name: 'Pixel 9', type: 'Smartphone' }, is_playing: true, progress_ms: 1000, currently_playing_type: 'track', item: { type: 'track', uri: 'spotify:track:t', name: 'T', duration_ms: 9000, artists: [], album: { name: '' } } })
type Reply = { status: number; text?: string; headers?: Record<string, string> }

async function rig(reply: (req: FakeRequest) => Reply | Promise<Reply>, refresh: (files: Record<string, string>) => Refresher = () => async () => 0) {
  let now = 1000
  const kit = fakeHost({ files: { [PATH]: file() }, http: async req => { const r = await reply(req); return { status: r.status, text: r.text ?? '', headers: r.headers ?? {} } } })
  const keeper = new TokenKeeper(kit.host, PATH, refresh(kit.files))
  await keeper.load()
  return { ...kit, keeper, client: new SpotifyClient(kit.host, keeper, () => now), at: (t: number) => { now = t } }
}
const tick = () => new Promise<void>(res => { setTimeout(res, 0) })
const auth = (reqs: FakeRequest[]) => reqs.map(r => r.headers.Authorization)

test('a read carries the bearer token and is dated when the answer arrived', async () => {
  const r = await rig(() => ({ status: 200, text: PLAYER }))
  expect(await readPlayer(r.client)).toMatchObject({ ok: true, at: 1000, music: { readAt: 1000, source: 'api', track: { title: 'T' } } })
  expect(auth(r.requests)).toEqual(['Bearer at-1'])
})

test('204 is nothing active, not an error', async () => {
  const r = await rig(() => ({ status: 204 }))
  expect(await readPlayer(r.client)).toEqual({ ok: true, at: 1000 })
})

test('a 401 refreshes once and retries; a second 401 means Reconnect', async () => {
  const fresh = (files: Record<string, string>): Refresher => async gen => { files[PATH] = file({ accessToken: 'at-2', gen: gen + 1 }); return 0 }
  const once = await rig(req => (req.headers.Authorization === 'Bearer at-2' ? { status: 200, text: PLAYER } : { status: 401 }), fresh)
  expect((await readPlayer(once.client)).ok).toBe(true)
  expect(auth(once.requests)).toEqual(['Bearer at-1', 'Bearer at-2'])
  const twice = await rig(() => ({ status: 401 }), fresh)
  expect(await readPlayer(twice.client)).toEqual({ ok: false, error: { kind: 'reconnect' } })
  expect(twice.keeper.status()).toBe('reconnect')
})

test('429 waits for Retry-After before anything goes out again', async () => {
  const r = await rig(() => ({ status: 429, headers: { 'retry-after': '7' } }))
  expect(await readPlayer(r.client)).toEqual({ ok: false, error: { kind: 'rate', untilMs: 8000 } })
  r.at(7999)
  expect(await readPlayer(r.client)).toEqual({ ok: false, error: { kind: 'rate', untilMs: 8000 } })
  expect(r.requests).toHaveLength(1)
  r.at(8000)
  await readPlayer(r.client)
  expect(r.requests).toHaveLength(2)
})

test('a request still out blocks a second one to the same endpoint, not to another', async () => {
  let open = () => {}
  const gate = new Promise<void>(res => { open = res })
  const r = await rig(async req => { if (req.url.includes('/me/player?')) await gate; return { status: 200, text: req.url.includes('/me/player?') ? PLAYER : '{}' } })
  const first = readPlayer(r.client)
  expect(await readPlayer(r.client)).toEqual({ ok: false, error: { kind: 'busy' } })
  expect((await r.client.send({ method: 'GET', url: 'https://api.spotify.com/v1/me' })).ok).toBe(true)
  open()
  expect((await first).ok).toBe(true)
  expect((await readPlayer(r.client)).ok).toBe(true)
})

test('a network error is offline, and the next read goes out', async () => {
  const r = await rig(() => { throw new Error('ECONNRESET') })
  expect(await readPlayer(r.client)).toEqual({ ok: false, error: { kind: 'offline' } })
  expect(await readPlayer(r.client)).toEqual({ ok: false, error: { kind: 'offline' } })
  expect(r.requests).toHaveLength(2)
})

test('an endpoint stays busy after the 5 s offline until the engine request settles', async () => {
  let open = () => {}
  const gate = new Promise<void>(res => { open = res })
  const r = await rig(async () => { await gate; return { status: 200, text: PLAYER } })
  const first = readPlayer(r.client)
  await tick()
  r.expire()
  expect(await first).toEqual({ ok: false, error: { kind: 'offline' } })
  expect(await readPlayer(r.client)).toEqual({ ok: false, error: { kind: 'busy' } })
  expect(r.requests).toHaveLength(1)
  open()
  await tick()
  expect((await readPlayer(r.client)).ok).toBe(true)
  expect(r.requests).toHaveLength(2)
})

test('PREMIUM_REQUIRED turns premium off; another 403 does not', async () => {
  const reason = (s: string) => JSON.stringify({ error: { status: 403, message: 'x', reason: s } })
  const r = await rig(req => ({ status: 403, text: reason(req.url.endsWith('/next') ? 'PREMIUM_REQUIRED' : 'UNKNOWN') }))
  expect(await r.client.send(commandRequest({ cmd: 'seek', ms: 1 }, true)!)).toEqual({ ok: false, error: { kind: 'refused', reason: 'UNKNOWN', status: 403 } })
  expect(r.client.premium).toBe(true)
  expect(await r.client.send(commandRequest({ cmd: 'next' }, true)!)).toEqual({ ok: false, error: { kind: 'premium' } })
  expect(r.client.premium).toBe(false)
})

const QUEUE = (...ids: string[]) => JSON.stringify({ queue: ids.map(id => ({ type: 'track', uri: `spotify:track:${id}`, name: id, duration_ms: 1000, artists: [], album: { name: '' } })) })
const nexts = (reqs: FakeRequest[]) => reqs.filter(r => r.method === 'POST' && r.url.endsWith('/me/player/next')).length

test('a write with a body sends it as JSON', async () => {
  const r = await rig(() => ({ status: 204 }))
  await r.client.send(commandRequest({ cmd: 'transfer', deviceId: 'dk' }, false)!)
  expect(r.requests[0]).toMatchObject({ method: 'PUT', body: '{"device_ids":["dk"],"play":true}', headers: { Authorization: 'Bearer at-1', 'Content-Type': 'application/json' } })
  await readPlayer(r.client)
  expect(r.requests[1]!.headers['Content-Type']).toBeUndefined()
})

test('every playlist page, and no more than 20', async () => {
  const page = (n: number) => JSON.stringify({ items: [{ uri: `spotify:playlist:p${n}`, name: `P${n}`, owner: { id: 'a' }, items: { total: n } }], next: `https://api.spotify.com/v1/me/playlists?offset=${(n + 1) * 50}&limit=50` })
  const r = await rig(req => ({ status: 200, text: page(Number(/offset=(\d+)/.exec(req.url)?.[1] ?? 0) / 50) }))
  const got = await allPlaylists(r.client)
  expect(got.ok && got.items.map(p => p.uri)).toEqual(Array.from({ length: 20 }, (_, i) => `spotify:playlist:p${i}`))
  expect(r.requests).toHaveLength(20)
  expect(r.requests[1]!.url).toBe('https://api.spotify.com/v1/me/playlists?offset=50&limit=50')
})

test('a failed playlist page fails the list', async () => {
  const r = await rig(req => (req.url.includes('offset') ? { status: 503 } : { status: 200, text: JSON.stringify({ items: [], next: 'https://api.spotify.com/v1/me/playlists?offset=50&limit=50' }) }))
  expect(await allPlaylists(r.client)).toEqual({ ok: false, error: { kind: 'server', status: 503 } })
})

test('skipTo re-reads the queue and sends next once per track up to the target', async () => {
  const r = await rig(req => (req.url.includes('/queue') ? { status: 200, text: QUEUE('a', 'b', 'c') } : { status: 204 }))
  expect(await skipTo(r.client, 'spotify:track:c')).toEqual({ kind: 'done' })
  expect(nexts(r.requests)).toBe(3)
})

test('a track that left the queue skips nothing', async () => {
  const r = await rig(req => (req.url.includes('/queue') ? { status: 200, text: QUEUE('a') } : { status: 204 }))
  expect(await skipTo(r.client, 'spotify:track:c')).toEqual({ kind: 'gone' })
  expect(nexts(r.requests)).toBe(0)
})

test('skipTo stops at the first refusal', async () => {
  let n = 0
  const r = await rig(req => (req.url.includes('/queue') ? { status: 200, text: QUEUE('a', 'b', 'c') } : ++n === 2 ? { status: 403, text: '{"error":{"status":403,"reason":"RESTRICTION_VIOLATED"}}' } : { status: 204 }))
  expect(await skipTo(r.client, 'spotify:track:c')).toEqual({ kind: 'error', error: { kind: 'refused', reason: 'RESTRICTION_VIOLATED', status: 403 } })
  expect(nexts(r.requests)).toBe(2)
})

test('a queue read still out: skipTo says busy and skips nothing', async () => {
  const r = await rig(req => (req.url.includes('/queue') ? new Promise<never>(() => {}) : { status: 204 }))
  void r.client.send(queueRequest())
  await tick()
  expect(await skipTo(r.client, 'spotify:track:a')).toEqual({ kind: 'busy' })
  expect(nexts(r.requests)).toBe(0)
})

test('skipTo reaches the 20th track and sends nothing for the 21st', async () => {
  const ids = Array.from({ length: 30 }, (_, i) => 't' + i)
  const r = await rig(req => (req.url.includes('/queue') ? { status: 200, text: QUEUE(...ids) } : { status: 204 }))
  expect(await skipTo(r.client, 'spotify:track:t19')).toEqual({ kind: 'done' })
  expect(nexts(r.requests)).toBe(20)
  expect(await skipTo(r.client, 'spotify:track:t20')).toEqual({ kind: 'far' })
  expect(nexts(r.requests)).toBe(20)
})

test('an unparseable queue is a server error, not a skip', async () => {
  const r = await rig(() => ({ status: 200, text: '[]' }))
  expect(await skipTo(r.client, 'spotify:track:a')).toEqual({ kind: 'error', error: { kind: 'server', status: 200 } })
  expect(nexts(r.requests)).toBe(0)
})

test('a second skipTo during the first is busy and sends nothing', async () => {
  let open = () => {}
  const gate = new Promise<void>(res => { open = res })
  const r = await rig(async req => (req.url.includes('/queue') ? { status: 200, text: QUEUE('a', 'b') } : (await gate, { status: 204 })))
  const first = skipTo(r.client, 'spotify:track:b')
  await tick()
  expect(nexts(r.requests)).toBe(1)
  expect(await skipTo(r.client, 'spotify:track:a')).toEqual({ kind: 'busy' })
  expect(nexts(r.requests)).toBe(1)
  open()
  expect(await first).toEqual({ kind: 'done' })
  expect(nexts(r.requests)).toBe(2)
  expect(await skipTo(r.client, 'spotify:track:a')).toEqual({ kind: 'done' })
})
