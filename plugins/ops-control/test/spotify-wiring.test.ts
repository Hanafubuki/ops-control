import { expect } from 'claude-code/testing'
import { runOpsControl, test } from './kit.ts'
import { AUTH, BUS, CLIENT, DEST, LINUX_BUS, LOGIN, PHONE, TOKENS, boot, item, method, mountPane, mountPlayer, ok, path, pasteOf, start, text, tokens, walk, type Req } from './spotify-kit.ts'
import { hostOf } from '../hooks/register.tsx'

const NEXT = `busctl --user call ${DEST} Next`
const localRead = (id: string, title: string) => ['{"type":"s","data":"Playing"}', `{"type":"a{sv}","data":{"mpris:trackid":{"type":"s","data":"/com/spotify/track/${id}"},"xesam:title":{"type":"s","data":"${title}"},"mpris:length":{"type":"t","data":200000000}}}`, '{"type":"x","data":1000000}'].join('\n')
const REFRESH = `/gi spotify-refresh --file ${TOKENS} --if-gen 1`
const LOGOUT = `/gi spotify-logout --file ${TOKENS}`
const PREMIUM = JSON.stringify({ error: { status: 403, message: 'Player command failed: Premium required', reason: 'PREMIUM_REQUIRED' } })
const players = (reqs: Req[]) => reqs.filter(r => path(r) === '/me/player' && method(r) === 'GET').length
const musicTab = async ($: any, s: ReturnType<typeof boot>, clock: any) => {
  s.panes.push({ id: 'ops-control', isShown: true, isFocused: false, isPlaced: true })
  const pane = await mountPane($)
  await pane.press({ key: 'tab-music' })
  for (let i = 0; i < 3; i++) await clock.advance(1000)
  return pane
}

test('connected: the tab shows the phone, its heart and Up next, asked with the bearer token', async ($, on) => {
  const s = boot(on, { files: { [TOKENS]: tokens() }, runs: { ...LINUX_BUS, [BUS]: { exitCode: 1, stdout: '' } } })
  const clock = await start($, on)
  const pane = await musicTab($, s, clock)
  const t = text(await pane.drawn())
  expect(t).toContain('Phone Song')
  expect(t).toContain('♥')
  expect(t).toContain('Up next: Next Song — Artist')
  expect(t).toContain('Spotify')
  const read = s.reqs.find(r => path(r) === '/me/player')!
  expect(read.url).toBe('https://api.spotify.com/v1/me/player?additional_types=episode')
  expect(read.init?.headers?.Authorization).toBe('Bearer at-1')
  expect(s.reqs.some(r => r.url.includes('/me/tracks'))).toBe(false)
  await pane.unmount()
})

test('l likes the track: PUT /me/library, and the heart fills', async ($, on) => {
  const s = boot(on, { files: { [TOKENS]: tokens() }, runs: LINUX_BUS, api: r => (path(r) === '/me/library/contains' ? { status: 200, text: '[false]' } : path(r) === '/me/library' ? { status: 200 } : PHONE(r)) })
  const clock = await start($, on)
  const pane = await musicTab($, s, clock)
  expect(text(await pane.drawn())).toContain('♡')
  await pane.press({ key: 'music-like' })
  await clock.advance(100)
  const put = s.reqs.find(r => path(r) === '/me/library')!
  expect([method(put), put.url]).toEqual(['PUT', 'https://api.spotify.com/v1/me/library?uris=spotify%3Atrack%3Ap'])
  expect(text(await pane.drawn())).toContain('♥')
  await pane.unmount()
})

test('an expired token refreshes through the helper once, and every request carries the new one', async ($, on) => {
  const files: Record<string, string> = { [TOKENS]: tokens({ expiresAt: 0 }) }
  const s = boot(on, { files, runs: LINUX_BUS, run: k => { if (k === REFRESH) { files[TOKENS] = tokens({ accessToken: 'at-2', gen: 2 }); return ok() } } })
  const clock = await start($, on)
  await clock.advance(1000)
  expect(s.ran.filter(k => k.includes('spotify-refresh'))).toEqual([REFRESH])
  expect(s.reqs.length).toBeGreaterThan(0)
  expect(s.reqs.every(r => r.init?.headers?.Authorization === 'Bearer at-2')).toBe(true)
})

test('a refused refresh is Reconnect: local only, no heart, and both the command and the dialog say so', async ($, on) => {
  const s = boot(on, { files: { [TOKENS]: tokens({ expiresAt: 0 }) }, runs: { ...LINUX_BUS, [BUS]: ok(localRead('l', 'Local Song')) }, run: k => (k === REFRESH ? { exitCode: 3, stdout: '' } : undefined) })
  const clock = await start($, on)
  const pane = await musicTab($, s, clock)
  const t = text(await pane.drawn())
  expect(t).toContain('Local Song')
  // the box below the player draws the context meter in hearts
  expect(t.split('╰')[0]).not.toMatch(/[♥♡]/)
  expect((await runOpsControl($, 'spotify')).text).toBe('Spotify needs you to connect again: /ops spotify connect.')
  await pane.unmount()
  await runOpsControl($, 'music')
  const ui = await mountPlayer($)
  expect(text(await ui.drawn())).toContain('Spotify needs you to connect again.')
  await ui.unmount()
})

test('a hung API request keeps the last good read up and does not pile up', async ($, on) => {
  let reads = 0
  const s = boot(on, { files: { [TOKENS]: tokens() }, runs: { ...LINUX_BUS, [BUS]: ok(localRead('l', 'Local Song')) }, api: r => (path(r) === '/me/player' && method(r) === 'GET' ? (reads++ === 0 ? PHONE(r) : 'hang') : PHONE(r)) })
  const clock = await start($, on)
  // the first read answers; coming into sight asks again, and that read hangs
  const pane = await musicTab($, s, clock)
  expect(text(await pane.drawn())).toContain('Phone Song')
  expect(players(s.reqs)).toBe(2)
  // the 5 s timeout gives up on the answer, but the request is still out, so no poll sends another
  for (let i = 0; i < 26; i++) await clock.advance(1000)
  expect(players(s.reqs)).toBe(2)
  // A timed-out read leaves the good one up while it is fresh, with no toast. When it goes stale the local app shows
  // (test/music-player.test.ts): the merge reads Date.now(), which mock.clock does not move, and the engine's is read-only.
  expect(text(await pane.drawn())).toContain('Phone Song')
  // once the engine's request ends, the next poll asks again
  s.expire()
  for (let i = 0; i < 16; i++) await clock.advance(1000)
  expect(players(s.reqs)).toBe(3)
  expect(s.toasts).toEqual([])
  await pane.unmount()
})

test('a local track change asks the API at once', async ($, on) => {
  const runs = { ...LINUX_BUS, [BUS]: ok(localRead('a', 'A')) }
  const s = boot(on, { files: { [TOKENS]: tokens() }, runs })
  const clock = await start($, on)
  await clock.advance(3000)
  const before = players(s.reqs)
  runs[BUS] = ok(localRead('b', 'B'))
  await clock.advance(2500)
  expect(players(s.reqs)).toBe(before + 1)
})

test('another computer playing X while the app here shows Y stays on X across local polls', async ($, on) => {
  const desk = JSON.stringify({ device: { id: 'dk', name: 'Desk', type: 'Computer', volume_percent: 50 }, is_playing: true, currently_playing_type: 'track', progress_ms: 1000, item: item('x', 'Desk Song') })
  const s = boot(on, { files: { [TOKENS]: tokens() }, runs: { ...LINUX_BUS, [BUS]: ok(localRead('y', 'Here Song')) }, api: r => (path(r) === '/me/player' && method(r) === 'GET' ? { status: 200, text: desk } : PHONE(r)) })
  const clock = await start($, on)
  const pane = await musicTab($, s, clock)
  for (let i = 0; i < 3; i++) {
    await clock.advance(1000)
    const t = text(await pane.drawn())
    expect(t).toContain('Desk Song')
    expect(t).not.toContain('Here Song')
  }
  await pane.unmount()
})

test('PREMIUM_REQUIRED says so once and moves transport to local', async ($, on) => {
  const s = boot(on, { files: { [TOKENS]: tokens() }, runs: { ...LINUX_BUS, [BUS]: ok(localRead('l', 'Local Song')), [NEXT]: ok() }, api: r => (path(r) === '/me/player/next' ? { status: 403, text: PREMIUM } : PHONE(r)) })
  const clock = await start($, on)
  const pane = await musicTab($, s, clock)
  await pane.press({ key: 'music-next' })
  await clock.advance(100)
  expect(s.toasts).toEqual([expect.stringContaining('needs Premium')])
  expect(s.ran.filter(k => k === NEXT)).toHaveLength(1)
  await pane.press({ key: 'music-next' })
  await clock.advance(100)
  expect(s.reqs.filter(r => path(r) === '/me/player/next')).toHaveLength(1)
  expect(s.ran.filter(k => k === NEXT)).toHaveLength(2)
  expect(s.toasts).toHaveLength(1)
  await pane.unmount()
})

test('a refusal toasts with the dialog closed and shows inside it when open, never with what Spotify sent', async ($, on) => {
  const body = JSON.stringify({ error: { status: 404, message: 'Bearer at-1', reason: 'NO_ACTIVE_DEVICE' } })
  const odd = JSON.stringify({ error: { status: 400, message: 'Bearer at-1 rt-1', reason: 'at-1' } })
  let next = body
  const s = boot(on, { files: { [TOKENS]: tokens() }, runs: LINUX_BUS, api: r => (path(r) === '/me/player/next' ? { status: next === body ? 404 : 400, text: next } : PHONE(r)) })
  const clock = await start($, on)
  const pane = await musicTab($, s, clock)
  await pane.press({ key: 'music-next' })
  await clock.advance(100)
  next = odd
  await pane.press({ key: 'music-next' })
  await clock.advance(100)
  expect(s.toasts).toEqual(['Nothing is playing. Pick a device.', 'Spotify refused that right now.'])
  await pane.unmount()
  await runOpsControl($, 'music')
  const ui = await mountPlayer($)
  await ui.press({ key: 'music-next' })
  await clock.advance(100)
  const t = text(await ui.drawn())
  expect(t).toContain('Spotify refused that right now.')
  expect(t).not.toContain('at-1')
  expect(s.toasts).toHaveLength(2)
  await ui.unmount()
})

test('/ops spotify connect: the Client ID starts the helper, its address shows, and exit 0 connects', async ($, on) => {
  let exit = (_code: number) => {}
  const exited = new Promise<number>(r => { exit = r })
  const files: Record<string, string> = {}
  const s = boot(on, { files, runs: LINUX_BUS, spawn: async function* () { yield { stream: 'stdout', text: AUTH + '\n' }; return { code: await exited, signal: null } } })
  const clock = await start($, on)
  expect((await runOpsControl($, 'spotify connect')).text).toBe('Music player open (Esc closes it)')
  const ui = await mountPlayer($)
  expect(text(await ui.drawn())).toContain('Add the redirect URI http://127.0.0.1/callback.')
  await ui.input({ key: 'input-client-id', text: ` ${CLIENT.toUpperCase()} `, kind: 'submit' })
  await clock.advance(100)
  expect(s.spawned).toEqual([expect.stringMatching(LOGIN())])
  const waiting = text(await ui.drawn())
  expect(waiting).toContain('Waiting for the browser…')
  expect(waiting).toContain(AUTH)
  files[TOKENS] = tokens()
  exit(0)
  await clock.advance(200)
  // connected: the right column is the lists now
  expect(walk(await ui.drawn()).some(n => n?.props?.key === 'list-queue')).toBe(true)
  expect(s.toasts).toEqual([])
  await ui.unmount()
})

test('a login that fails shows the helper\'s last line in the dialog', async ($, on) => {
  const s = boot(on, { runs: LINUX_BUS, spawn: async function* () {
    yield { stream: 'stdout', text: AUTH + '\n' }
    yield { stream: 'stderr', text: 'Spotify said: access_denied\n' }
    return { code: 1, signal: null }
  } })
  const clock = await start($, on)
  await runOpsControl($, 'spotify connect')
  const ui = await mountPlayer($)
  await ui.input({ key: 'input-client-id', text: CLIENT, kind: 'submit' })
  await clock.advance(200)
  const t = text(await ui.drawn())
  expect(t).toContain('Paste the Client ID below.')
  expect(t).toContain('Spotify said: access_denied')
  expect(s.toasts).toEqual([])
  await ui.unmount()
})

test('a Client ID that is not 32 hex characters is refused in the dialog', async ($, on) => {
  const s = boot(on, { runs: LINUX_BUS })
  const clock = await start($, on)
  await runOpsControl($, 'spotify connect')
  const ui = await mountPlayer($)
  await ui.input({ key: 'input-client-id', text: 'nope', kind: 'submit' })
  await clock.advance(50)
  expect(text(await ui.drawn())).toContain('A Client ID is 32 hex characters')
  expect(s.spawned).toEqual([])
  await ui.unmount()
})

test('/ops spotify connect with the player open keeps it open at the steps; /ops music still closes it', async ($, on) => {
  const s = boot(on, { runs: LINUX_BUS })
  await start($, on)
  expect((await runOpsControl($, 'music')).text).toBe('Music player open (Esc closes it)')
  expect((await runOpsControl($, 'spotify connect')).text).toBe('Music player open (Esc closes it)')
  expect(s.closes).toEqual([])
  expect(s.panes.find(p => p.id === 'ops-control-music')?.isShown).toBe(true)
  const ui = await mountPlayer($)
  expect(text(await ui.drawn())).toContain('Paste the Client ID below.')
  await ui.unmount()
  expect((await runOpsControl($, 'music')).text).toBe('Music player closed')
})

test('a pasted address goes to the paste file whole, and a refused one says why', async ($, on) => {
  let refuse = () => {}, exit = (_code: number) => {}
  const refused = new Promise<void>(r => { refuse = r }), exited = new Promise<number>(r => { exit = r })
  const files: Record<string, string> = {}
  const s = boot(on, { files, runs: LINUX_BUS, spawn: async function* () {
    yield { stream: 'stdout', text: AUTH + '\n' }
    await refused
    yield { stream: 'stdout', text: 'That address is not from this login. Paste the address the browser shows after you agree.\n' }
    return { code: await exited, signal: null }
  } })
  const clock = await start($, on)
  await runOpsControl($, 'spotify connect')
  const ui = await mountPlayer($)
  await ui.input({ key: 'input-client-id', text: CLIENT, kind: 'submit' })
  await clock.advance(100)
  await ui.input({ key: 'input-paste', text: '  http://127.0.0.1:5/callback?code=c&state=wrong \n', kind: 'submit' })
  await clock.advance(50)
  const paste = pasteOf(s)
  expect(files[paste]).toBe('http://127.0.0.1:5/callback?code=c&state=wrong')
  // written beside it and renamed over it, so the helper never reads half an address
  expect(s.ran).toContain(`mv ${paste}.tmp ${paste}`)
  expect(Object.keys(files).filter(f => f.startsWith(paste + '.'))).toEqual([])
  refuse()
  await clock.advance(100)
  expect(text(await ui.drawn())).toContain('That address is not from this login.')
  exit(1)
  await clock.advance(100)
  expect(files[paste]).toBeUndefined()
  await ui.unmount()
})

test('a cancelled login\'s paste file is removed, and the next login\'s paste goes to its own file', async ($, on) => {
  let exit = (_code: number) => {}
  const exited = new Promise<number>(r => { exit = r })
  const files: Record<string, string> = {}
  const s = boot(on, { files, runs: LINUX_BUS, spawn: async function* () {
    yield { stream: 'stdout', text: AUTH + '\n' }
    return { code: await exited, signal: null }
  } })
  const clock = await start($, on)
  await runOpsControl($, 'spotify connect')
  const ui = await mountPlayer($)
  await ui.input({ key: 'input-client-id', text: CLIENT, kind: 'submit' })
  await clock.advance(100)
  await ui.input({ key: 'input-paste', text: 'http://127.0.0.1:5/callback?code=old', kind: 'submit' })
  await clock.advance(50)
  const first = pasteOf(s, 1)
  expect(files[first]).toBeDefined()
  await runOpsControl($, 'spotify connect')
  await clock.advance(50)
  expect(files[first]).toBeUndefined()
  await ui.input({ key: 'input-client-id', text: CLIENT, kind: 'submit' })
  await clock.advance(100)
  const second = pasteOf(s, 2)
  expect(second).not.toBe(first)
  await ui.input({ key: 'input-paste', text: 'http://127.0.0.1:5/callback?code=new', kind: 'submit' })
  await clock.advance(50)
  expect(files[second]).toBe('http://127.0.0.1:5/callback?code=new')
  expect(files[first]).toBeUndefined()
  exit(1)
  await ui.unmount()
})

test('a paste whose move fails leaves no .tmp file behind', async ($, on) => {
  let exit = (_code: number) => {}
  const exited = new Promise<number>(r => { exit = r })
  const files: Record<string, string> = {}
  const s = boot(on, { files, runs: LINUX_BUS, run: k => (/^mv \S+\.tmp \S+$/.test(k) ? { exitCode: 1, stdout: '' } : undefined), spawn: async function* () {
    yield { stream: 'stdout', text: AUTH + '\n' }
    return { code: await exited, signal: null }
  } })
  const clock = await start($, on)
  await runOpsControl($, 'spotify connect')
  const ui = await mountPlayer($)
  await ui.input({ key: 'input-client-id', text: CLIENT, kind: 'submit' })
  await clock.advance(100)
  await ui.input({ key: 'input-paste', text: 'http://127.0.0.1:5/callback?code=c', kind: 'submit' })
  await clock.advance(50)
  const paste = pasteOf(s)
  expect(s.ran).toContain(`mv ${paste}.tmp ${paste}`)
  expect(files[paste + '.tmp']).toBeUndefined()
  expect(text(await ui.drawn())).toContain('Could not hand the address to the login.')
  exit(1)
  await ui.unmount()
})

const PLAYPAUSE = `busctl --user call ${DEST} PlayPause`
// this computer plays, so transport takes the API first and the local app second
const onThisComputer = async ($: any, on: any, answer: { status: number }) => {
  const desk = JSON.stringify({ device: { id: 'dk', name: 'Desk', type: 'Computer', volume_percent: 50 }, is_playing: true, currently_playing_type: 'track', progress_ms: 1000, item: item('l', 'Local Song') })
  const s = boot(on, { files: { [TOKENS]: tokens() }, runs: { ...LINUX_BUS, [BUS]: ok(localRead('l', 'Local Song')), [NEXT]: ok(), [PLAYPAUSE]: ok() }, api: r => (path(r) === '/me/player/next' || path(r) === '/me/player/pause' ? answer : path(r) === '/me/player' && method(r) === 'GET' ? { status: 200, text: desk } : PHONE(r)) })
  const clock = await start($, on)
  return { s, clock, pane: await musicTab($, s, clock) }
}

test('a 5xx on next or pause sends nothing to the local app, since the write may have landed', async ($, on) => {
  const { s, clock, pane } = await onThisComputer($, on, { status: 503 })
  await pane.press({ key: 'music-next' })
  await clock.advance(100)
  await pane.press({ key: 'music-playpause' })
  await clock.advance(100)
  expect(s.reqs.filter(r => path(r) === '/me/player/pause')).toHaveLength(1)
  expect(s.ran.filter(k => k === NEXT || k === PLAYPAUSE)).toEqual([])
  expect(s.toasts).toEqual(['Spotify is not answering right now. Try again.', 'Spotify is not answering right now. Try again.'])
  await pane.unmount()
})

test('a 429 on next falls back to the local app, since Spotify did nothing', async ($, on) => {
  const { s, clock, pane } = await onThisComputer($, on, { status: 429 })
  await pane.press({ key: 'music-next' })
  await clock.advance(100)
  expect(s.ran.filter(k => k === NEXT)).toHaveLength(1)
  await pane.unmount()
})

test('a write answering 5xx to another device says so instead of staying silent', async ($, on) => {
  const s = boot(on, { files: { [TOKENS]: tokens() }, runs: LINUX_BUS, api: r => (path(r) === '/me/player/next' ? { status: 503 } : PHONE(r)) })
  const clock = await start($, on)
  const pane = await musicTab($, s, clock)
  await pane.press({ key: 'music-next' })
  await clock.advance(100)
  expect(s.toasts).toEqual(['Spotify is not answering right now. Try again.'])
  await pane.unmount()
})

test('a token file found newer mid-session keeps its own message after a 401', async ($, on) => {
  const files: Record<string, string> = { [TOKENS]: tokens() }
  const s = boot(on, { files, runs: LINUX_BUS, api: r => (path(r) === '/me/player/next' ? { status: 401 } : PHONE(r)), run: k => (k === REFRESH ? { exitCode: 3, stdout: '' } : undefined) })
  const clock = await start($, on)
  const pane = await musicTab($, s, clock)
  files[TOKENS] = tokens({ format: 99 })
  await pane.press({ key: 'music-next' })
  await clock.advance(100)
  await pane.unmount()
  await runOpsControl($, 'music')
  const ui = await mountPlayer($)
  const t = text(await ui.drawn())
  expect(t).toContain('saved by a newer ops-control')
  expect(t).not.toContain('connect again')
  await ui.unmount()
})

test('Cancel goes back to the steps, and the helper ending afterwards shows nothing', async ($, on) => {
  let exit = (_code: number) => {}
  const exited = new Promise<number>(r => { exit = r })
  boot(on, { runs: LINUX_BUS, spawn: async function* () {
    yield { stream: 'stdout', text: AUTH + '\n' }
    const code = await exited
    yield { stream: 'stderr', text: 'timed out waiting for the browser\n' }
    return { code, signal: null }
  } })
  const clock = await start($, on)
  await runOpsControl($, 'spotify connect')
  const ui = await mountPlayer($)
  await ui.input({ key: 'input-client-id', text: CLIENT, kind: 'submit' })
  await clock.advance(100)
  await ui.press({ key: 'connect-cancel' })
  await clock.advance(50)
  expect(text(await ui.drawn())).toContain('Paste the Client ID below.')
  exit(1)
  await clock.advance(100)
  expect(text(await ui.drawn())).not.toContain('timed out')
  await ui.unmount()
})

test('/ops spotify disconnect runs spotify-logout and goes back to the app on this computer', async ($, on) => {
  const files: Record<string, string> = { [TOKENS]: tokens() }
  const s = boot(on, { files, runs: LINUX_BUS, run: k => { if (k === LOGOUT) { delete files[TOKENS]; return ok() } } })
  await start($, on)
  expect((await runOpsControl($, 'spotify')).text).toContain('connected with Client ID 01234567…')
  expect((await runOpsControl($, 'spotify disconnect')).text).toBe('Disconnected. ops-control uses the Spotify app on this computer again.')
  expect(s.ran).toContain(LOGOUT)
  expect((await runOpsControl($, 'spotify')).text).toContain('the app on this computer')
})

test('a newer token file stays local and says so', async ($, on) => {
  const s = boot(on, { files: { [TOKENS]: tokens({ format: 2 }) }, runs: LINUX_BUS })
  const clock = await start($, on)
  await clock.advance(1000)
  expect(s.reqs).toEqual([])
  expect((await runOpsControl($, 'spotify')).text).toContain('newer ops-control')
  expect((await runOpsControl($, 'spotify connect')).text).toContain('newer ops-control')
  expect(s.opens).toEqual([])
  expect(s.ran.some(k => k.includes('spotify-refresh'))).toBe(false)
})

test('a token file a newer ops-control writes while the steps show is not logged in over', async ($, on) => {
  const files: Record<string, string> = {}
  const s = boot(on, { files, runs: LINUX_BUS })
  const clock = await start($, on)
  await runOpsControl($, 'spotify connect')
  const ui = await mountPlayer($)
  files[TOKENS] = tokens({ format: 2 })
  await ui.input({ key: 'input-client-id', text: CLIENT, kind: 'submit' })
  await clock.advance(100)
  expect(s.spawned).toEqual([])
  expect(text(await ui.drawn())).toContain('newer ops-control')
  await ui.unmount()
})

test('closing the dialog while the login looks up its helper stops it before it starts', async ($, on) => {
  let ui: any
  const s = boot(on, { runs: LINUX_BUS, run: async k => {
    // the helper lookup is the slow step (a download); the person closes the dialog meanwhile
    if (k === 'uname -m') { await runOpsControl($, 'music'); return ok('x86_64') }
  }, spawn: async function* () { yield { stream: 'stdout', text: AUTH + '\n' }; return { code: 0, signal: null } } })
  const clock = await start($, on)
  await runOpsControl($, 'spotify connect')
  ui = await mountPlayer($)
  await ui.input({ key: 'input-client-id', text: CLIENT, kind: 'submit' })
  await clock.advance(100)
  expect(s.closes.map((c: any) => c.id)).toEqual(['ops-control-music'])
  expect(s.spawned).toEqual([])
  await ui.unmount()
})

test('a second Client ID submitted while the first looks up its helper starts one login', async ($, on) => {
  let ui: any, second = true, exit = (_code: number) => {}
  const exited = new Promise<number>(r => { exit = r })
  const s = boot(on, { runs: LINUX_BUS, run: async k => {
    if (k === 'uname -m' && second) { second = false; void ui.input({ key: 'input-client-id', text: CLIENT, kind: 'submit' }) }
    if (k === 'uname -m') return ok('x86_64')
  }, spawn: async function* () { yield { stream: 'stdout', text: AUTH + '\n' }; return { code: await exited, signal: null } } })
  const clock = await start($, on)
  await runOpsControl($, 'spotify connect')
  ui = await mountPlayer($)
  await ui.input({ key: 'input-client-id', text: CLIENT, kind: 'submit' })
  for (let i = 0; i < 3; i++) await clock.advance(100)
  // the superseded submit had claimed login 1 before it was cancelled
  expect(s.spawned).toEqual([expect.stringMatching(LOGIN(2))])
  expect(text(await ui.drawn())).toContain('Waiting for the browser…')
  exit(1)
  await ui.unmount()
})

test('/ops spotify connect during a waiting login stops it, so its exit cannot connect', async ($, on) => {
  let exit = (_code: number) => {}
  const exited = new Promise<number>(r => { exit = r })
  const s = boot(on, { runs: LINUX_BUS, spawn: async function* () { yield { stream: 'stdout', text: AUTH + '\n' }; return { code: await exited, signal: null } } })
  const clock = await start($, on)
  await runOpsControl($, 'spotify connect')
  const ui = await mountPlayer($)
  await ui.input({ key: 'input-client-id', text: CLIENT, kind: 'submit' })
  await clock.advance(100)
  expect(text(await ui.drawn())).toContain('Waiting for the browser…')
  expect((await runOpsControl($, 'spotify connect')).text).toBe('Music player open (Esc closes it)')
  expect(text(await ui.drawn())).toContain('Paste the Client ID below.')
  exit(0)
  await clock.advance(200)
  expect(text(await ui.drawn())).toContain('Paste the Client ID below.')
  expect(s.reqs).toEqual([])
  await ui.unmount()
})

test('a damaged token file stays local, says so, is never refreshed, and connect may replace it', async ($, on) => {
  const s = boot(on, { files: { [TOKENS]: '{"format":1,' }, runs: LINUX_BUS })
  const clock = await start($, on)
  await clock.advance(1000)
  expect(s.reqs).toEqual([])
  expect((await runOpsControl($, 'spotify')).text).toBe(`${TOKENS} is damaged. /ops spotify disconnect removes it; then connect again.`)
  await runOpsControl($, 'music')
  let ui = await mountPlayer($)
  expect(text(await ui.drawn())).toContain(`${TOKENS} is damaged.`)
  await ui.unmount()
  expect((await runOpsControl($, 'spotify connect')).text).toBe('Music player open (Esc closes it)')
  ui = await mountPlayer($)
  await ui.input({ key: 'input-client-id', text: CLIENT, kind: 'submit' })
  await clock.advance(100)
  expect(s.spawned).toEqual([expect.stringMatching(LOGIN())])
  expect(s.ran.some(k => k.includes('spotify-refresh'))).toBe(false)
  await ui.unmount()
})

test('Windows without a connection says to connect', async ($, on) => {
  const s = boot(on, { env: { OS: 'Windows_NT' } })
  const clock = await start($, on)
  const pane = await musicTab($, s, clock)
  expect(text(await pane.drawn())).toContain('Connect Spotify to use the player on Windows.')
  await pane.unmount()
})

test('Windows: no local player, but a connected session gets the API player', async ($, on) => {
  const s = boot(on, { files: { [TOKENS]: tokens() }, env: { OS: 'Windows_NT' } })
  const clock = await start($, on)
  const pane = await musicTab($, s, clock)
  expect(text(await pane.drawn())).toContain('Phone Song')
  await pane.unmount()
})

// The test's $ has no process noun, and a test hook's $ reaches the real host beneath the mocks, so hostOf gets a $
// holding only process.spawn, shaped as the engine's HookStream: its result settles at the end and rejects when closed early.
type Piece = { stream: 'stdout' | 'stderr'; text: string }
function spawnOnly(gen: AsyncGenerator<Piece, { code: number | null; signal: null }>) {
  let settle = (_r: unknown) => {}, fail = (_e: unknown) => {}
  const result = new Promise((a, b) => { settle = a; fail = b })
  result.catch(() => {})
  const stream = (async function* () {
    let ended = false
    try { const r = yield* gen; ended = true; settle(r); return r } finally { if (!ended) fail(new Error('closed')) }
  })()
  return { process: { spawn: () => Object.assign(stream, { result }) } } as never
}

test('hostOf spawn: an onLine that throws rejects done and ends the child', async () => {
  let ended = false
  const $ = spawnOnly((async function* () {
    try { yield { stream: 'stdout', text: 'one\n' } as Piece; yield { stream: 'stdout', text: 'two\n' } as Piece; return { code: 0, signal: null } } finally { ended = true }
  })())
  const seen: string[] = []
  const child = hostOf($).spawn(['/gi', 'x'], (_s, l) => { seen.push(l); throw new Error('bad line') })
  expect(await child.done.then(v => `resolved ${v}`, (e: Error) => e.message)).toBe('bad line')
  expect(seen).toEqual(['one'])
  expect(ended).toBe(true)
})

test('hostOf spawn: output held mid-line when it is killed is never delivered', async () => {
  let go = () => {}
  const gate = new Promise<void>(r => { go = r })
  const $ = spawnOnly((async function* () {
    yield { stream: 'stdout', text: 'whole\npart' } as Piece
    await gate
    yield { stream: 'stdout', text: 'ial\n' } as Piece
    return { code: 0, signal: null }
  })())
  const seen: string[] = []
  const child = hostOf($).spawn(['/gi', 'x'], (_s, l) => { seen.push(l) })
  await new Promise<void>(r => setTimeout(() => r(), 10))
  child.kill()
  go()
  expect(await child.done).toBeNull()
  expect(seen).toEqual(['whole'])
})
