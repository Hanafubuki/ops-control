import { test, expect } from 'claude-code/testing'
import { fakeHost } from './kit.ts'
import { appLabel, controlScript, parseSmtcLine, pickSession, scaleArt, sessionMusic, SmtcWatcher, PS, PS_PROBE, SMTC_ART, SMTC_HINT, WATCH_SCRIPT, type SmtcSession } from '../hooks/music/smtc.ts'
import { MusicReader, pickBackend } from '../hooks/music/reader.ts'
import { toBase64Url } from '../hooks/link.ts'

// What the watcher printed on a machine with a YouTube tab in Chrome and Telegram's empty session.
const CHROME = { app: 'Chrome', cur: true, st: 'Playing', ti: 'lock in and do the work, guys.', ar: 'livinobody', al: '', pos: 956014, start: 0, end: 11021301, upd: 1000, sh: null, rp: '', pp: true, nx: false, pv: false, sk: true, she: false, rpe: false }
const TELEGRAM = { app: 'TelegramMessengerLLP.TelegramDesktop_t4vj0pshhgkwm!Telegram.TelegramDesktop.Store', cur: false, st: 'Paused', ti: '', ar: '', al: '', pos: 0, start: 0, end: 0, upd: -11644473600000, sh: null, rp: '', pp: true, nx: false, pv: true, sk: false, she: false, rpe: false }
const SPOTIFY = { ...CHROME, app: 'Spotify.exe', cur: false, st: 'Paused', ti: 'Fembrook Dr', ar: 'Khary', al: 'uhhh 3', sh: false, rp: 'List', she: true, rpe: true }
const line = (s: object[]) => JSON.stringify({ k: 's', s })
const art = (key: string, w = 2, h = 2) => JSON.stringify({ k: 'a', key, w, h, rgb: toBase64Url(new Uint8Array(w * h * 3).fill(200)) })
// a spawn's end reaches the watcher on a later tick
const tick = () => new Promise<void>(r => setTimeout(() => r(), 0))
const sessions = (s: object[]) => (parseSmtcLine(line(s)) as { sessions: SmtcSession[] }).sessions

test('the scripts are plain single-quoted text: no double quote reaches the command line', () => {
  expect(WATCH_SCRIPT).not.toContain('"')
  expect(WATCH_SCRIPT).toContain('GlobalSystemMediaTransportControlsSessionManager')
  for (const cmd of [{ cmd: 'playpause' }, { cmd: 'next' }, { cmd: 'previous' }, { cmd: 'seek', ms: 1500 }, { cmd: 'shuffle', on: true }, { cmd: 'repeat', mode: 'track' }] as const) {
    const s = controlScript('Chrome', cmd)!
    expect(s).not.toContain('"')
    expect(s).toContain("SourceAppUserModelId -eq 'Chrome'")
  }
  expect(controlScript('Chrome', { cmd: 'seek', ms: 1500 })).toContain('TryChangePlaybackPositionAsync([long]15000000)')
  expect(controlScript('Chrome', { cmd: 'repeat', mode: 'context' })).toContain('TryChangeAutoRepeatModeAsync(2)')
  expect(controlScript('Chrome', { cmd: 'shuffle', on: false })).toContain('TryChangeShuffleActiveAsync($false)')
  // what Windows cannot do through a session, and an id that could leave the quotes, run nothing
  expect(controlScript('Chrome', { cmd: 'volume', level: 0.5 })).toBeUndefined()
  expect(controlScript('Chrome', { cmd: 'raise' })).toBeUndefined()
  for (const bad of ["a'b", 'a"b', 'a;b', 'a$b', '', 'x'.repeat(300)]) expect(controlScript(bad, { cmd: 'next' })).toBeUndefined()
  expect(PS_PROBE.slice(0, PS.length)).toEqual([...PS])
  expect(PS[0]).toBe('powershell.exe')
})

test('lines: sessions as a list or a lone object, a picture, a beat; anything else is nothing', () => {
  expect(sessions([CHROME, TELEGRAM]).map(s => [s.app, s.status, s.title])).toEqual([['Chrome', 'Playing', 'lock in and do the work, guys.'], [TELEGRAM.app, 'Paused', '']])
  expect((parseSmtcLine(JSON.stringify({ k: 's', s: CHROME })) as { sessions: unknown[] }).sessions).toHaveLength(1)
  expect(parseSmtcLine(JSON.stringify({ k: 's', s: [] }))).toEqual({ kind: 'sessions', sessions: [] })
  expect(parseSmtcLine('﻿' + line([CHROME]))).toMatchObject({ kind: 'sessions' })
  expect(sessions([SPOTIFY])[0]).toMatchObject({ shuffle: false, repeat: 'context', canShuffle: true, canRepeat: true })
  expect(parseSmtcLine(art('k'))).toMatchObject({ kind: 'art', key: 'k', art: { w: 2, h: 2 } })
  expect(parseSmtcLine(JSON.stringify({ k: 'a', key: 'k', w: 3, h: 3, rgb: toBase64Url(new Uint8Array(5)) }))).toBeUndefined()
  expect(parseSmtcLine('{"k":"h"}')).toEqual({ kind: 'beat' })
  for (const junk of ['', 'nope', '[]', '{"k":"z"}', 'Exception: boom']) expect(parseSmtcLine(junk)).toBeUndefined()
})

test('the session shown: what plays over what is paused, the one shown last, then Windows\' current, then Spotify', () => {
  const chrome = sessions([CHROME])[0]!, spotify = sessions([SPOTIFY])[0]!, telegram = sessions([TELEGRAM])[0]!
  expect(pickSession([telegram, spotify, chrome])!.app).toBe('Chrome')
  expect(pickSession([telegram])).toBeUndefined()
  expect(pickSession([{ ...chrome, status: 'Paused', current: false }, spotify])!.app).toBe('Spotify.exe')
  const edge = { ...chrome, app: 'MSEdge', current: false }
  expect(pickSession([edge, chrome])!.app).toBe('Chrome')
  // two tabs playing do not take turns
  expect(pickSession([edge, chrome], 'MSEdge')!.app).toBe('MSEdge')
})

test('app names: browsers, Spotify and packaged apps by a short name', () => {
  expect(['Chrome', 'MSEdge', '308046B0AF4A39CB', 'Spotify.exe', 'SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify', TELEGRAM.app, 'brave.exe', 'Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic'].map(appLabel))
    .toEqual(['Chrome', 'Edge', 'Firefox', 'Spotify', 'Spotify', 'Telegram', 'Brave', 'Media Player'])
  expect(appLabel('Contoso.Player_abcdefghijkl!App')).toBe('Player')
  expect(appLabel('foobar.exe')).toBe('foobar')
})

test('a session as music: the position moves on from its update while it plays, within the track', () => {
  const chrome = sessions([CHROME])[0]!
  expect(sessionMusic(chrome, 1000 + 60_000, true)).toEqual({
    status: 'open', playing: true, ad: false, readAt: 61_000, progressMs: 956014 + 60_000, app: 'Chrome',
    track: { id: 'smtc:Chrome|lock in and do the work, guys.|livinobody', title: 'lock in and do the work, guys.', artist: 'livinobody', album: '', durationMs: 11021301, artUrl: SMTC_ART + 'Chrome|lock in and do the work, guys.|livinobody' },
  })
  expect(sessionMusic({ ...chrome, status: 'Paused' }, 99_999_999, false)).toMatchObject({ playing: false, progressMs: 956014 })
  expect(sessionMusic(chrome, 99_999_999_999, false).progressMs).toBe(11021301)
  expect(sessionMusic(chrome, 0, false).track!.artUrl).toBeUndefined()
  expect(sessionMusic(sessions([SPOTIFY])[0]!, 0, false)).toMatchObject({ app: 'Spotify', shuffle: false, repeat: 'context' })
})

test('a picture scales to the side asked for, averaged', () => {
  const four = { w: 2, h: 2, rgb: new Uint8Array([0, 0, 0, 100, 100, 100, 200, 200, 200, 100, 100, 100]) }
  expect(Array.from(scaleArt(four, 1).rgb)).toEqual([100, 100, 100])
  const up = scaleArt(four, 4)
  expect([up.w, up.h, up.rgb.length]).toEqual([4, 4, 48])
  expect(Array.from(up.rgb.slice(0, 3))).toEqual([0, 0, 0])
})

test('the watcher: one process, its lines answer reads, pictures by key, and a change asks for a read', async () => {
  let changed = 0
  let emit: (s: 'stdout' | 'stderr', l: string) => void = () => {}
  let finish: (code: number | null) => void = () => {}
  const f = fakeHost({ spawns: (_argv, e) => { emit = e; return new Promise<number | null>(r => { finish = r }) } })
  const w = new SmtcWatcher(() => changed++)
  expect(w.music(0)).toBeUndefined()
  w.ensure(f.host, 0)
  w.ensure(f.host, 0)
  expect(f.spawned).toHaveLength(1)
  expect(f.spawned[0]!.startsWith('powershell.exe -NoLogo -NoProfile -NonInteractive -Command ')).toBe(true)
  emit('stderr', line([CHROME]))
  expect(w.music(0)).toBeUndefined()
  emit('stdout', line([TELEGRAM, CHROME]))
  emit('stdout', art('Chrome|lock in and do the work, guys.|livinobody'))
  emit('stdout', '{"k":"h"}')
  expect(changed).toBe(2)
  expect(w.music(1000)).toMatchObject({ status: 'open', app: 'Chrome', track: { artUrl: SMTC_ART + 'Chrome|lock in and do the work, guys.|livinobody' } })
  expect(w.current()!.app).toBe('Chrome')
  expect(w.art(SMTC_ART + 'Chrome|lock in and do the work, guys.|livinobody')).toMatchObject({ w: 2, h: 2 })
  expect(w.art('https://i.scdn.co/x')).toBeUndefined()
  emit('stdout', line([TELEGRAM]))
  expect(w.music(1000)).toEqual({ status: 'closed' })
  w.stop()
  expect(f.killed).toHaveLength(1)
  finish(0)
  await Promise.resolve()
  w.ensure(f.host, 0)
  expect(f.spawned).toHaveLength(1)
})

test('the watcher: one that ends after a full life starts again; three that fail before a word make it unsupported', async () => {
  const runs: ((code: number | null) => void)[] = []
  let emit: (s: 'stdout' | 'stderr', l: string) => void = () => {}
  const f = fakeHost({ spawns: (_argv, e) => { emit = e; return new Promise<number | null>(r => runs.push(r)) } })
  const w = new SmtcWatcher()
  // a full life: said what plays, lived past a minute
  w.ensure(f.host, Date.now() - 120_000)
  emit('stdout', line([CHROME]))
  runs[0]!(0)
  await tick()
  expect(f.spawned).toHaveLength(2)
  expect(w.music(0)).toMatchObject({ status: 'open' })
  // that one dies at once, never saying anything, and so do the next two
  runs[1]!(1)
  await tick()
  for (let i = 2; i < 4; i++) { w.ensure(f.host); runs[i]!(1); await tick() }
  expect(w.broken).toBe(true)
  w.ensure(f.host)
  expect(f.spawned).toHaveLength(4)
  // what it heard before stays; a watcher that never heard anything says why
  expect(w.music(0)).toMatchObject({ status: 'open' })
  const never = new SmtcWatcher()
  const g = fakeHost({ spawns: async () => 1 })
  for (let i = 0; i < 3; i++) { never.ensure(g.host); await tick() }
  expect(never.music(0)).toEqual({ status: 'unsupported', hint: SMTC_HINT })
})

test('backend: Windows PowerShell on Windows and under WSL; Linux elsewhere, and WSL without it falls back', async () => {
  const ps = { [PS_PROBE.join(' ')]: { exitCode: 0, stdout: '' } }
  const bus = { 'busctl --json=short --version': { exitCode: 0, stdout: 'systemd 255' } }
  expect(await pickBackend(fakeHost({ runs: ps }).host, 'windows')).toBe('smtc')
  expect(await pickBackend(fakeHost({ runs: { ...ps, ...bus } }).host, 'linux', true)).toBe('smtc')
  expect(await pickBackend(fakeHost({ runs: { ...ps, ...bus } }).host, 'linux')).toBe('busctl')
  expect(await pickBackend(fakeHost({ runs: bus }).host, 'linux', true)).toBe('busctl')
  expect(await pickBackend(fakeHost().host, 'windows')).toBeUndefined()
  const probe = fakeHost({ runs: ps })
  await pickBackend(probe.host, 'windows')
  expect(probe.timeouts).toEqual([10_000])
})

test('the smtc reader: reads from the watcher, caps from the session shown, controls name its app', async () => {
  let emit: (s: 'stdout' | 'stderr', l: string) => void = () => {}
  const f = fakeHost({ spawns: (_argv, e) => { emit = e; return new Promise<number | null>(() => {}) } })
  const r = new MusicReader('smtc', 'linux')
  expect(await r.read(f.host, 0)).toEqual({ status: 'closed' })
  emit('stdout', line([{ ...SPOTIFY, st: 'Playing', start: 2000 }]))
  expect(await r.read(f.host, 1000)).toMatchObject({ status: 'open', app: 'Spotify', track: { title: 'Fembrook Dr' } })
  expect(r.caps()).toEqual({ repeat: ['off', 'context', 'track'], shuffle: true, raise: false, volume: false, anyPlayer: true })
  const seek = r.argvFor({ cmd: 'seek', ms: 1000 })!
  expect(seek.slice(0, PS.length)).toEqual([...PS])
  // the bar counts from the track's start, Windows from its own timeline
  expect(seek.at(-1)).toContain('TryChangePlaybackPositionAsync([long]30000000)')
  expect(seek.at(-1)).toContain("-eq 'Spotify.exe'")
  await r.control(f.host, { cmd: 'playpause' })
  expect(f.ran.at(-1)).toContain('TryTogglePlayPauseAsync()')
  expect(f.timeouts.at(-1)).toBe(10_000)
  expect(r.argvFor({ cmd: 'volume', level: 1 })).toBeUndefined()
  r.stop()
  expect(f.killed).toHaveLength(1)
  // the other readers keep their caps, without anyPlayer
  expect(new MusicReader('busctl', 'linux').caps().anyPlayer).toBeUndefined()
})
