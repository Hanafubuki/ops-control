import { test, expect } from 'claude-code/testing'
import { fakeHost } from './kit.ts'
import { MusicReader, pickBackend, LINUX_HINT, WINDOWS_HINT } from '../hooks/music/reader.ts'
import type { Host } from '../hooks/host.ts'

const BUS = 'busctl --user --json=short get-property org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player PlaybackStatus Metadata Position'
const PLAYING = ['{"type":"s","data":"Playing"}', '{"type":"a{sv}","data":{"mpris:trackid":{"type":"s","data":"/com/spotify/track/t"},"xesam:title":{"type":"s","data":"S"},"mpris:length":{"type":"t","data":9000000}}}', '{"type":"x","data":1000000}'].join('\n')

test('backend: busctl first, then playerctl, osascript on mac, none on windows', async () => {
  expect(await pickBackend(fakeHost({ runs: { 'busctl --json=short --version': { exitCode: 0, stdout: 'systemd 258' } } }).host, 'linux')).toBe('busctl')
  // systemd older than 240 answers --version but rejects --json
  expect(await pickBackend(fakeHost({ runs: { 'busctl --version': { exitCode: 0, stdout: 'systemd 237' }, 'playerctl --version': { exitCode: 0, stdout: 'v2.4.1' } } }).host, 'linux')).toBe('playerctl')
  expect(await pickBackend(fakeHost({ runs: { 'playerctl --version': { exitCode: 0, stdout: 'v2.4.1' } } }).host, 'linux')).toBe('playerctl')
  expect(await pickBackend(fakeHost().host, 'linux')).toBeUndefined()
  expect(await pickBackend(fakeHost().host, 'mac')).toBe('osascript')
  expect(await pickBackend(fakeHost().host, 'windows')).toBeUndefined()
})

test('no backend reads as unsupported with the platform hint', async () => {
  expect(await new MusicReader(undefined, 'linux').read(fakeHost().host, 0)).toEqual({ status: 'unsupported', hint: LINUX_HINT })
  expect(await new MusicReader(undefined, 'windows').read(fakeHost().host, 0)).toEqual({ status: 'unsupported', hint: WINDOWS_HINT })
})

test('busctl: playing, then Spotify closes (non-zero exit is closed, not a failure), then reopens', async () => {
  const f = fakeHost({ runs: { [BUS]: { exitCode: 0, stdout: PLAYING } } })
  const r = new MusicReader('busctl', 'linux')
  expect((await r.read(f.host, 0)).status).toBe('open')
  expect(f.timeouts.at(-1)).toBe(2000)
  const closed = fakeHost()
  expect(await r.read(closed.host, 1)).toEqual({ status: 'closed' })
  expect((await r.read(f.host, 2)).status).toBe('open')
})

test('one failed read keeps the last state, two clear it, a good read resets the count', async () => {
  const good = fakeHost({ runs: { [BUS]: { exitCode: 0, stdout: PLAYING } } }).host
  const junk = fakeHost({ runs: { [BUS]: { exitCode: 0, stdout: 'junk' } } }).host
  const hang: Host = { ...good, run: async () => { throw new Error('timed out') } }
  const r = new MusicReader('busctl', 'linux')
  const first = await r.read(good, 0)
  expect(await r.read(hang, 1)).toEqual(first)
  expect(await r.read(junk, 2)).toEqual({ status: 'closed' })
  await r.read(good, 3)
  expect((await r.read(hang, 4)).status).toBe('open')
})

test('controls run the backend command with the 2 s timeout', async () => {
  const f = fakeHost()
  await new MusicReader('busctl', 'linux').control(f.host, { cmd: 'playpause' })
  await new MusicReader('playerctl', 'linux').control(f.host, { cmd: 'next' })
  await new MusicReader('osascript', 'mac').control(f.host, { cmd: 'previous' })
  expect(f.ran).toEqual([
    'busctl --user call org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player PlayPause',
    'playerctl --player=spotify next',
    'osascript -e if application "Spotify" is running then run script "tell application \\"Spotify\\" to previous track"',
  ])
  expect(f.timeouts).toEqual([2000, 2000, 2000])
})

test('osascript control argv for each command runs the tell only inside the guarded run script', async () => {
  for (const [cmd, verb] of [['playpause', 'playpause'], ['next', 'next track'], ['previous', 'previous track']] as const) {
    const f = fakeHost()
    await new MusicReader('osascript', 'mac').control(f.host, { cmd })
    expect(f.ran).toEqual([`osascript -e if application "Spotify" is running then run script "tell application \\"Spotify\\" to ${verb}"`])
  }
})

test('osascript read script checks is running before any tell, and the tell is compiled only by run script', async () => {
  const f = fakeHost()
  await new MusicReader('osascript', 'mac').read(f.host, 0)
  const script = f.ran[0]!
  const running = script.indexOf('is running'), run = script.indexOf('run script')
  expect(running).toBeGreaterThan(-1)
  expect(running).toBeLessThan(run)
  expect(run).toBeLessThan(script.indexOf('tell application'))
  // the only tell sits inside the quoted run script argument
  expect(script.slice(0, run)).not.toContain('tell application')
  expect(script).toContain('on error')
})

test('osascript: a non-zero exit is a failed read, not closed', async () => {
  const good = fakeHost({ runs: {} }).host
  const ok: Host = { ...good, run: async () => ({ exitCode: 0, stdout: ['playing', 'id', 'T', 'A', 'B', '1000', '1.0'].join('\t') }) as never }
  const bad: Host = { ...good, run: async () => ({ exitCode: 1, stdout: '' }) as never }
  const r = new MusicReader('osascript', 'mac')
  const first = await r.read(ok, 0)
  expect(first.status).toBe('open')
  expect(await r.read(bad, 1)).toEqual(first)
  expect(await r.read(bad, 2)).toEqual({ status: 'closed' })
})

const DEST = 'org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player'
const EXTRAS = `busctl --user --json=short get-property ${DEST} Shuffle LoopStatus Volume`
const EXTRAS_OUT = ['{"type":"b","data":true}', '{"type":"s","data":"Playlist"}', '{"type":"d","data":0.5}'].join('\n')

test('busctl: shuffle, repeat and volume come from a second read', async () => {
  const f = fakeHost({ runs: { [BUS]: { exitCode: 0, stdout: PLAYING }, [EXTRAS]: { exitCode: 0, stdout: EXTRAS_OUT } } })
  const m = await new MusicReader('busctl', 'linux').read(f.host, 0)
  expect(m).toMatchObject({ status: 'open', shuffle: true, repeat: 'context', volume: 0.5 })
  // the bus is asked for its players first; one that cannot list them leaves Spotify
  expect(f.ran).toEqual(['busctl --user --json=short call org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus ListNames', BUS, EXTRAS])
})

test('busctl: a failing extras call keeps the track and hides the extras', async () => {
  // a Spotify without one of the properties prints what it has and exits 1
  const f = fakeHost({ runs: { [BUS]: { exitCode: 0, stdout: PLAYING }, [EXTRAS]: { exitCode: 1, stdout: '{"type":"b","data":true}' } } })
  const m = await new MusicReader('busctl', 'linux').read(f.host, 0)
  expect(m.status).toBe('open')
  expect(m).not.toHaveProperty('shuffle')
  const r = new MusicReader('busctl', 'linux')
  const hang = { ...f.host, run: async (argv: readonly string[]) => { if (argv.join(' ') === EXTRAS) throw new Error('timed out'); if (argv.includes('ListNames')) return { exitCode: 1, stdout: '', stderr: '' }; return { exitCode: 0, stdout: PLAYING, stderr: '' } } }
  expect((await r.read(hang, 1)).status).toBe('open')
})

test('playerctl: the extras read is its own call', async () => {
  const META = 'playerctl --player=spotify metadata --format {{status}}\t{{mpris:trackid}}\t{{xesam:title}}\t{{xesam:artist}}\t{{xesam:album}}\t{{mpris:length}}\t{{position}}\t{{mpris:artUrl}}\t{{xesam:url}}'
  const PX = 'playerctl --player=spotify metadata --format {{shuffle}}\t{{loop}}\t{{volume}}'
  const f = fakeHost({ runs: { [META]: { exitCode: 0, stdout: ['Playing', '/com/spotify/track/x', 'S', 'A', 'B', '9000000', '0', '', ''].join('\t') }, [PX]: { exitCode: 0, stdout: 'false\tTrack\t0.25' } } })
  expect(await new MusicReader('playerctl', 'linux').read(f.host, 0)).toMatchObject({ status: 'open', shuffle: false, repeat: 'track', volume: 0.25 })
})

test('command argv on each backend', async () => {
  const bus = new MusicReader('busctl', 'linux')
  await bus.read(fakeHost({ runs: { [BUS]: { exitCode: 0, stdout: PLAYING } } }).host, 0)
  expect(bus.argvFor({ cmd: 'seek', ms: 4000 })).toEqual(['busctl', '--user', 'call', ...DEST.split(' '), 'SetPosition', 'ox', '/com/spotify/track/t', '4000000'])
  expect(bus.argvFor({ cmd: 'shuffle', on: false })).toEqual(['busctl', '--user', 'set-property', ...DEST.split(' '), 'Shuffle', 'b', 'false'])
  expect(bus.argvFor({ cmd: 'repeat', mode: 'track' })).toEqual(['busctl', '--user', 'set-property', ...DEST.split(' '), 'LoopStatus', 's', 'Track'])
  expect(bus.argvFor({ cmd: 'volume', level: 1.4 })).toEqual(['busctl', '--user', 'set-property', ...DEST.split(' '), 'Volume', 'd', '1.00'])
  expect(bus.argvFor({ cmd: 'raise' })).toEqual(['busctl', '--user', 'call', 'org.mpris.MediaPlayer2.spotify', '/org/mpris/MediaPlayer2', 'org.mpris.MediaPlayer2', 'Raise'])

  const pc = new MusicReader('playerctl', 'linux')
  expect(pc.argvFor({ cmd: 'seek', ms: 73800 })).toEqual(['playerctl', '--player=spotify', 'position', '73.800'])
  expect(pc.argvFor({ cmd: 'shuffle', on: true })).toEqual(['playerctl', '--player=spotify', 'shuffle', 'On'])
  expect(pc.argvFor({ cmd: 'repeat', mode: 'context' })).toEqual(['playerctl', '--player=spotify', 'loop', 'Playlist'])
  expect(pc.argvFor({ cmd: 'volume', level: 0.3 })).toEqual(['playerctl', '--player=spotify', 'volume', '0.30'])
  expect(pc.argvFor({ cmd: 'raise' })).toBeUndefined()

  const osa = new MusicReader('osascript', 'mac')
  const tell = (s: string) => ['osascript', '-e', `if application "Spotify" is running then run script "tell application \\"Spotify\\" to ${s}"`]
  expect(osa.argvFor({ cmd: 'seek', ms: 73800 })).toEqual(tell('set player position to 73.800'))
  expect(osa.argvFor({ cmd: 'shuffle', on: true })).toEqual(tell('set shuffling to true'))
  expect(osa.argvFor({ cmd: 'repeat', mode: 'off' })).toEqual(tell('set repeating to false'))
  expect(osa.argvFor({ cmd: 'volume', level: 0.42 })).toEqual(tell('set sound volume to 42'))
  expect(osa.argvFor({ cmd: 'raise' })).toEqual(tell('activate'))
})

test('busctl seek before any read has no track to name and runs nothing', async () => {
  const f = fakeHost()
  await new MusicReader('busctl', 'linux').control(f.host, { cmd: 'seek', ms: 1000 })
  expect(f.ran).toEqual([])
})

test('caps: no repeat or shuffle over MPRIS; AppleScript has both; playerctl cannot raise', () => {
  expect(new MusicReader('busctl', 'linux').caps()).toEqual({ repeat: [], shuffle: false, raise: true, volume: false })
  expect(new MusicReader('playerctl', 'linux').caps()).toEqual({ repeat: [], shuffle: false, raise: false, volume: false })
  expect(new MusicReader('osascript', 'mac').caps()).toEqual({ repeat: ['off', 'context'], shuffle: true, raise: true, volume: true })
})

// ---- any player ----
const LIST = 'busctl --user --json=short call org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus ListNames'
const status = (name: string) => `busctl --user --json=short get-property ${name} /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player PlaybackStatus`
const CHROME = 'org.mpris.MediaPlayer2.chromium.instance4242'
const TAB = ['{"type":"s","data":"Playing"}', '{"type":"a{sv}","data":{"mpris:trackid":{"type":"o","data":"/org/chromium/MediaPlayer2/TrackList/1"},"xesam:title":{"type":"s","data":"Lofi beats"},"xesam:artist":{"type":"as","data":["Lofi Girl"]},"mpris:length":{"type":"x","data":60000000}}}', '{"type":"x","data":2000000}'].join('\n')

test('busctl: any MPRIS player shows; the one playing wins over a paused Spotify, named by its Identity', async () => {
  const runs = {
    [LIST]: { exitCode: 0, stdout: `{"type":"as","data":[["org.freedesktop.DBus","org.mpris.MediaPlayer2.spotify","${CHROME}",":1.42"]]}` },
    [status('org.mpris.MediaPlayer2.spotify')]: { exitCode: 0, stdout: '{"type":"s","data":"Paused"}' },
    [status(CHROME)]: { exitCode: 0, stdout: '{"type":"s","data":"Playing"}' },
    [`busctl --user --json=short get-property ${CHROME} /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player PlaybackStatus Metadata Position`]: { exitCode: 0, stdout: TAB },
    [`busctl --user --json=short get-property ${CHROME} /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2 Identity`]: { exitCode: 0, stdout: '{"type":"s","data":"Chromium"}' },
  }
  const f = fakeHost({ runs })
  const r = new MusicReader('busctl', 'linux')
  expect(await r.read(f.host, 0)).toMatchObject({ status: 'open', playing: true, app: 'Chromium', track: { title: 'Lofi beats', artist: 'Lofi Girl', durationMs: 60000 } })
  expect(r.caps().anyPlayer).toBe(true)
  // its controls go to it, not to Spotify
  expect(r.argvFor({ cmd: 'playpause' })).toEqual(['busctl', '--user', 'call', CHROME, '/org/mpris/MediaPlayer2', 'org.mpris.MediaPlayer2.Player', 'PlayPause'])
  expect(r.argvFor({ cmd: 'seek', ms: 5000 })).toEqual(['busctl', '--user', 'call', CHROME, '/org/mpris/MediaPlayer2', 'org.mpris.MediaPlayer2.Player', 'SetPosition', 'ox', '/org/chromium/MediaPlayer2/TrackList/1', '5000000'])
  // the Identity is asked once per player
  await r.read(f.host, 1)
  expect(f.ran.filter(a => a.endsWith('Identity'))).toHaveLength(1)
  // nothing on the bus plays or pauses: closed
  const none = fakeHost({ runs: { [LIST]: { exitCode: 0, stdout: '{"type":"as","data":[["org.freedesktop.DBus"]]}' } } })
  expect(await new MusicReader('busctl', 'linux').read(none.host, 0)).toEqual({ status: 'closed' })
})

test('playerctl: every player is listed in one call; the one playing is read and named', async () => {
  const META = 'playerctl --player=firefox.instance_1_23 metadata --format {{status}}\t{{mpris:trackid}}\t{{xesam:title}}\t{{xesam:artist}}\t{{xesam:album}}\t{{mpris:length}}\t{{position}}\t{{mpris:artUrl}}\t{{xesam:url}}'
  const f = fakeHost({ runs: {
    'playerctl -a metadata --format {{playerName}}\t{{status}}': { exitCode: 0, stdout: 'spotify\tPaused\nfirefox.instance_1_23\tPlaying\n' },
    [META]: { exitCode: 0, stdout: 'Playing\t/org/mpris/MediaPlayer2/firefox\tA talk\tSomeone\t\t600000000\t1000000\t\t\n' },
  } })
  const r = new MusicReader('playerctl', 'linux')
  expect(await r.read(f.host, 0)).toMatchObject({ status: 'open', app: 'Firefox', track: { title: 'A talk' } })
  expect(r.argvFor({ cmd: 'next' })).toEqual(['playerctl', '--player=firefox.instance_1_23', 'next'])
})

test('macOS with media-control: Now Playing of any app, times in µs, its commands; without it, AppleScript', async () => {
  const yes = fakeHost({ runs: { 'media-control test': { exitCode: 0, stdout: '' } } })
  expect(await pickBackend(yes.host, 'mac')).toBe('nowplaying')
  expect(await pickBackend(fakeHost().host, 'mac')).toBe('osascript')
  const json = JSON.stringify({ bundleIdentifier: 'com.google.Chrome', playing: true, title: 'Talk', artist: 'Channel', durationMicros: 300_000_000, elapsedTimeMicros: 10_000_000, timestampEpochMicros: 1_000_000 * 1000, shuffleMode: 1, repeatMode: 3 })
  const f = fakeHost({ runs: { 'media-control get --micros --no-artwork': { exitCode: 0, stdout: json } } })
  const r = new MusicReader('nowplaying', 'mac')
  // read 2 s after the timestamp: the position carries on
  expect(await r.read(f.host, 1_002_000)).toMatchObject({ status: 'open', playing: true, app: 'Chrome', progressMs: 12000, shuffle: false, repeat: 'context', track: { title: 'Talk', artist: 'Channel', durationMs: 300000 } })
  expect(r.caps()).toEqual({ repeat: ['off', 'context', 'track'], shuffle: true, raise: false, volume: false, anyPlayer: true })
  expect([r.argvFor({ cmd: 'playpause' }), r.argvFor({ cmd: 'next' }), r.argvFor({ cmd: 'seek', ms: 73800 }), r.argvFor({ cmd: 'repeat', mode: 'track' }), r.argvFor({ cmd: 'raise' })])
    .toEqual([['media-control', 'toggle-play-pause'], ['media-control', 'next-track'], ['media-control', 'seek', '73.800'], ['media-control', 'repeat', 'track'], undefined])
  const idle = fakeHost({ runs: { 'media-control get --micros --no-artwork': { exitCode: 0, stdout: 'null\n' } } })
  expect(await new MusicReader('nowplaying', 'mac').read(idle.host, 0)).toEqual({ status: 'closed' })
})
