import { expect } from 'claude-code/testing'
import { runOpsControl, test } from './kit.ts'
import { AUTH, CLIENT, LINUX_BUS, PHONE, TOKENS, boot, item, method, mountPlayer, ok, path, start, text, tokens, walk, type Ans, type Boot, type Req } from './spotify-kit.ts'

const RECENT = JSON.stringify({ items: [
  { track: item('r1', 'Old One'), context: { type: 'playlist', uri: 'spotify:playlist:pl1' } },
  { track: item('r2', 'Old Two'), context: null },
] })
const page = (n: number, next?: string) => JSON.stringify({ items: [{ uri: `spotify:playlist:p${n}`, name: `List ${n}`, owner: { display_name: 'Ada' }, items: { total: n } }], next: next ?? null })
const DEVICES = JSON.stringify({ devices: [{ id: 'ph', name: 'Pixel 9', type: 'Smartphone', is_active: true }, { id: 'dk', name: 'Desktop', type: 'Computer', is_active: false }] })
const NO_DEVICE = JSON.stringify({ error: { status: 404, message: 'No active device found', reason: 'NO_ACTIVE_DEVICE' } })

// Spotify with lists behind it: three tracks queued, two recent, two pages of playlists, two devices. Writes answer 204.
function lists(over: (r: Req) => Ans | undefined = () => undefined, queue = () => ['n1', 'n2', 'n3']) {
  return (r: Req): Ans => {
    const hit = over(r)
    if (hit) return hit
    const p = path(r)
    if (p === '/me/player/queue') return { status: 200, text: JSON.stringify({ queue: queue().map(id => item(id, `Song ${id}`)) }) }
    if (p === '/me/player/recently-played') return { status: 200, text: RECENT }
    if (p === '/me/playlists') return { status: 200, text: r.url.includes('offset=50') ? page(2) : page(1, 'https://api.spotify.com/v1/me/playlists?offset=50&limit=50') }
    if (p === '/me/player/devices') return { status: 200, text: DEVICES }
    if (method(r) !== 'GET') return { status: 204 }
    return PHONE(r)
  }
}
const count = (reqs: Req[], p: string, m = 'GET') => reqs.filter(r => path(r) === p && method(r) === m).length
const select = (tree: any) => walk(tree).find(n => n?.props?.key === 'music-list')
const values = (tree: any) => select(tree)?.props.options.map((o: any) => o.value)
const body = (reqs: Req[], p: string) => reqs.filter(r => path(r) === p && method(r) === 'PUT').map(r => JSON.parse(r.init!.body!))
// opens the dialog connected and waits for its first list
async function open($: any, on: any, api = lists(), more: Boot = {}) {
  const s = boot(on, { files: { [TOKENS]: tokens() }, runs: LINUX_BUS, api, ...more })
  const clock = await start($, on)
  await runOpsControl($, 'music')
  const ui = await mountPlayer($)
  // the tab's own Up next read can hold the queue endpoint for a tick; the list's 5 s timer asks again
  for (let i = 0; i < 6; i++) await clock.advance(1000)
  return { s, clock, ui }
}

test('the dialog opens on Up next as a Select, and Up next reloads every 15 s while shown', async ($, on) => {
  const { s, clock, ui } = await open($, on)
  const tree = await ui.drawn()
  expect(values(tree)).toEqual(['0:spotify:track:n1', '1:spotify:track:n2', '2:spotify:track:n3'])
  expect(select(tree).props.options[0].label).toContain('Song n1')
  expect(walk(tree).find(n => n?.props?.key === 'list-queue').props.variant).toBe('primary')
  const before = count(s.reqs, '/me/player/queue')
  for (let i = 0; i < 16; i++) await clock.advance(1000)
  expect(count(s.reqs, '/me/player/queue')).toBeGreaterThan(before)
  expect(s.toasts).toEqual([])
  await ui.unmount()
})

test('each list loads when first shown; Playlists reads every page once per open', async ($, on) => {
  const { s, clock, ui } = await open($, on)
  expect(count(s.reqs, '/me/playlists')).toBe(0)
  await ui.press({ key: 'list-playlists' })
  await clock.advance(200)
  expect(values(await ui.drawn())).toEqual(['spotify:playlist:p1', 'spotify:playlist:p2'])
  expect(count(s.reqs, '/me/playlists')).toBe(2)
  await ui.press({ key: 'list-recent' })
  await clock.advance(200)
  expect(values(await ui.drawn())).toEqual(['0:spotify:track:r1', '1:spotify:track:r2'])
  await ui.press({ key: 'list-playlists' })
  for (let i = 0; i < 20; i++) await clock.advance(1000)
  expect(count(s.reqs, '/me/playlists')).toBe(2)
  await ui.unmount()
  // closing drops the lists: the next open starts on Up next and reads Playlists again.
  // /ops music toggles, so the first call closes the dialog through the mod's own ui.close hook.
  expect((await runOpsControl($, 'music')).text).toBe('Music player closed')
  await runOpsControl($, 'music')
  const again = await mountPlayer($)
  await again.press({ key: 'list-playlists' })
  await clock.advance(200)
  expect(count(s.reqs, '/me/playlists')).toBe(4)
  await again.unmount()
})

test('/clear drops the lists and keeps the connection', async ($, on) => {
  on('session.end', async (_$: unknown, e: any) => ({ sessionId: e.sessionId }))
  const { s, clock, ui } = await open($, on)
  await ui.press({ key: 'list-playlists' })
  await clock.advance(200)
  expect(count(s.reqs, '/me/playlists')).toBe(2)
  await $.session.end({ reason: 'clear', sessionId: 's1' } as never)
  await clock.advance(200)
  expect(walk(await ui.drawn()).find(n => n?.props?.key === 'list-queue').props.variant).toBe('primary')
  await ui.press({ key: 'list-playlists' })
  await clock.advance(200)
  expect(count(s.reqs, '/me/playlists')).toBe(4)
  expect(values(await ui.drawn())).toEqual(['spotify:playlist:p1', 'spotify:playlist:p2'])
  await ui.unmount()
})

test('Enter on Up next skips forward to that track', async ($, on) => {
  const { s, clock, ui } = await open($, on)
  const reads = count(s.reqs, '/me/player')
  await ui.select({ key: 'music-list', value: '2:spotify:track:n3' })
  await clock.advance(200)
  expect(count(s.reqs, '/me/player/next', 'POST')).toBe(3)
  expect(count(s.reqs, '/me/player')).toBeGreaterThan(reads)
  await ui.unmount()
})

test('a track that already left the queue says so and reloads', async ($, on) => {
  let queued = ['n1', 'n2', 'n3']
  const { s, clock, ui } = await open($, on, lists(undefined, () => queued))
  queued = ['n1']
  await ui.select({ key: 'music-list', value: '2:spotify:track:n3' })
  for (let i = 0; i < 6; i++) await clock.advance(1000)
  expect(count(s.reqs, '/me/player/next', 'POST')).toBe(0)
  const tree = await ui.drawn()
  expect(text(tree)).toContain('That track already left the queue.')
  expect(values(tree)).toEqual(['0:spotify:track:n1'])
  expect(s.toasts).toEqual([])
  await ui.unmount()
})

test('Enter on Up next while a queue read is out says so and skips nothing', async ($, on) => {
  let hang = false
  const { s, clock, ui } = await open($, on, lists(r => (hang && path(r) === '/me/player/queue' ? 'hang' : undefined)))
  hang = true
  // wait for the list's next reload: it hangs, holding the queue endpoint for its 5 s timeout
  const before = count(s.reqs, '/me/player/queue')
  for (let i = 0; i < 20 && count(s.reqs, '/me/player/queue') === before; i++) await clock.advance(1000)
  expect(count(s.reqs, '/me/player/queue')).toBe(before + 1)
  await ui.select({ key: 'music-list', value: '2:spotify:track:n3' })
  await clock.advance(200)
  expect(count(s.reqs, '/me/player/next', 'POST')).toBe(0)
  const tree = await ui.drawn()
  expect(text(tree)).toContain('Still reading the queue, try again.')
  // the reload keeps the rows on screen while it is out
  expect(values(tree)).toEqual(['0:spotify:track:n1', '1:spotify:track:n2', '2:spotify:track:n3'])
  expect(s.toasts).toEqual([])
  await ui.unmount()
})

test('Enter on Recent plays the track in its playlist, or alone', async ($, on) => {
  const { s, clock, ui } = await open($, on)
  await ui.press({ key: 'list-recent' })
  await clock.advance(200)
  await ui.select({ key: 'music-list', value: '0:spotify:track:r1' })
  await clock.advance(200)
  await ui.select({ key: 'music-list', value: '1:spotify:track:r2' })
  await clock.advance(200)
  expect(body(s.reqs, '/me/player/play')).toEqual([{ context_uri: 'spotify:playlist:pl1', offset: { uri: 'spotify:track:r1' } }, { uris: ['spotify:track:r2'] }])
  await ui.unmount()
})

test('Devices marks the active one; Enter moves playback there and reloads them', async ($, on) => {
  const { s, clock, ui } = await open($, on)
  await ui.press({ key: 'list-devices' })
  await clock.advance(200)
  const sel = select(await ui.drawn())
  expect('value' in sel.props).toBe(false)
  expect(sel.props.options[0].label).toMatch(/active$/)
  const before = count(s.reqs, '/me/player/devices')
  await ui.select({ key: 'music-list', value: 'dk' })
  await clock.advance(200)
  expect(body(s.reqs, '/me/player')).toEqual([{ device_ids: ['dk'], play: true }])
  expect(count(s.reqs, '/me/player/devices')).toBeGreaterThan(before)
  await ui.unmount()
})

test('a list press answered PREMIUM_REQUIRED says Premium is needed and runs nothing locally', async ($, on) => {
  const premium = JSON.stringify({ error: { status: 403, message: 'Premium required', reason: 'PREMIUM_REQUIRED' } })
  const { s, clock, ui } = await open($, on, lists(r => (path(r) === '/me/player/play' ? { status: 403, text: premium } : undefined)))
  await ui.press({ key: 'list-recent' })
  await clock.advance(200)
  const ran = s.ran.length
  await ui.select({ key: 'music-list', value: '1:spotify:track:r2' })
  await clock.advance(200)
  const t = text(await ui.drawn())
  expect(t).toContain('Spotify needs Premium for this.')
  expect(t).not.toContain('Spotify app on this computer')
  expect(s.ran.slice(ran).filter(k => k.includes('busctl --user call'))).toEqual([])
  await ui.unmount()
})

test('NO_ACTIVE_DEVICE opens Devices with a note',async ($, on) => {
  const { s, clock, ui } = await open($, on, lists(r => (path(r) === '/me/player/play' ? { status: 404, text: NO_DEVICE } : undefined)))
  await ui.press({ key: 'list-recent' })
  await clock.advance(200)
  await ui.select({ key: 'music-list', value: '1:spotify:track:r2' })
  await clock.advance(200)
  const tree = await ui.drawn()
  expect(walk(tree).find(n => n?.props?.key === 'list-devices').props.variant).toBe('primary')
  expect(text(tree)).toContain('Nothing is playing. Pick a device.')
  expect(values(tree)).toEqual(['ph', 'dk'])
  expect(s.toasts).toEqual([])
  await ui.unmount()
})

test('nothing active: the dialog opens on Devices', async ($, on) => {
  const { ui } = await open($, on, lists(r => (path(r) === '/me/player' && method(r) === 'GET' ? { status: 204 } : undefined)))
  const tree = await ui.drawn()
  expect(walk(tree).find(n => n?.props?.key === 'list-devices').props.variant).toBe('primary')
  expect(values(tree)).toEqual(['ph', 'dk'])
  await ui.unmount()
})

test('a list that fails says why in one dim line, without a toast', async ($, on) => {
  const { s, clock, ui } = await open($, on, lists(r => (path(r) === '/me/player/devices' ? { status: 503 } : undefined)))
  await ui.press({ key: 'list-devices' })
  await clock.advance(200)
  expect(text(await ui.drawn())).toContain('Spotify had a problem (503). ops-control tries again shortly.')
  expect(s.toasts).toEqual([])
  await ui.unmount()
})

test('Enter on Recent, Playlists or Devices failing on a 5xx, a 429 or no answer asks for another press inline', async ($, on) => {
  const again = 'Spotify is not answering right now. Try again.'
  const { s, clock, ui } = await open($, on, lists(r => {
    if (method(r) === 'GET') return undefined
    if (path(r) === '/me/player') return 'hang'
    return { status: path(r) === '/me/player/play' && r.init?.body?.includes('pl1') ? 503 : 429 }
  }))
  await ui.press({ key: 'list-recent' })
  await clock.advance(200)
  await ui.select({ key: 'music-list', value: '0:spotify:track:r1' })
  await clock.advance(200)
  expect(text(await ui.drawn())).toContain(again)
  expect(text(await ui.drawn())).not.toContain('tries again shortly')
  await ui.press({ key: 'list-devices' })
  await clock.advance(200)
  await ui.select({ key: 'music-list', value: 'dk' })
  await clock.advance(200)
  s.expire()
  await clock.advance(200)
  expect(text(await ui.drawn())).toContain(again)
  // last: the client holds every request for 5 s of wall-clock time after a 429, which the mock clock does not move
  await ui.press({ key: 'list-playlists' })
  await clock.advance(200)
  await ui.select({ key: 'music-list', value: 'spotify:playlist:p1' })
  await clock.advance(200)
  expect(text(await ui.drawn())).toContain(again)
  expect(s.toasts).toEqual([])
  await ui.unmount()
})

test('disconnecting and connecting again while a list load is out drops its late answer', async ($, on) => {
  const files: Record<string, string> = { [TOKENS]: tokens() }
  let hangRecent = true
  const s = boot(on, {
    files,
    runs: LINUX_BUS,
    run: k => { if (k === `/gi spotify-logout --file ${TOKENS}`) { delete files[TOKENS]; return ok() } },
    api: lists(r => (path(r) === '/me/player/recently-played' && hangRecent ? 'hang' : undefined)),
    spawn: async function* () { yield { stream: 'stdout', text: AUTH + '\n' }; files[TOKENS] = tokens(); return { code: 0, signal: null } },
  })
  const clock = await start($, on)
  await runOpsControl($, 'music')
  const ui = await mountPlayer($)
  for (let i = 0; i < 6; i++) await clock.advance(1000)
  await ui.press({ key: 'list-recent' })
  await clock.advance(200)
  expect(count(s.reqs, '/me/player/recently-played')).toBe(1)
  hangRecent = false
  await runOpsControl($, 'spotify disconnect')
  await runOpsControl($, 'spotify connect')
  await ui.input({ key: 'input-client-id', text: CLIENT, kind: 'submit' })
  await clock.advance(200)
  expect(walk(await ui.drawn()).find(n => n?.props?.key === 'list-queue').props.variant).toBe('primary')
  // the first connection's Recent read fails now; kept, its error would show instead of the rows
  s.expire()
  await clock.advance(200)
  await ui.press({ key: 'list-recent' })
  await clock.advance(200)
  const tree = await ui.drawn()
  expect(text(tree)).not.toContain('Spotify did not answer.')
  expect(values(tree)).toEqual(['0:spotify:track:r1', '1:spotify:track:r2'])
  await ui.unmount()
})

test('a 401 the refresh cannot fix during a list load drops the connection', async ($, on) => {
  const { clock, ui } = await open($, on, lists(r => (path(r) === '/me/player/recently-played' ? { status: 401 } : undefined)), {
    run: k => (k === `/gi spotify-refresh --file ${TOKENS} --if-gen 1` ? { exitCode: 3, stdout: '' } : undefined),
  })
  await ui.press({ key: 'list-recent' })
  await clock.advance(200)
  const tree = await ui.drawn()
  expect(text(tree)).toContain('Spotify needs you to connect again.')
  expect(walk(tree).some(n => n?.props?.key === 'list-recent')).toBe(false)
  await ui.unmount()
})

test('closing the dialog stops the list timer', async ($, on) => {
  const { s, clock, ui } = await open($, on)
  await ui.unmount()
  expect((await runOpsControl($, 'music')).text).toBe('Music player closed')
  const before = count(s.reqs, '/me/player/queue')
  for (let i = 0; i < 20; i++) await clock.advance(1000)
  expect(count(s.reqs, '/me/player/queue')).toBe(before)
})
