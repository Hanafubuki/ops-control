import { test, expect } from 'claude-code/testing'
import { pickPlayer, playerApp, parseBusctl, parseBusctlExtras, parsePlayerctl, parsePlayerctlExtras, parseOsascript, progressAt, sameMusic, extrapolate, type OpenMusic } from '../hooks/music/parse.ts'

// Captured from Spotify 1.2 on Linux, 2026-10-10.
const BUSCTL = [
  '{"type":"s","data":"Paused"}',
  '{"type":"a{sv}","data":{"mpris:trackid":{"type":"s","data":"/com/spotify/track/6UTrz4vab86upECRgbEMbM"},"mpris:length":{"type":"t","data":176959000},"mpris:artUrl":{"type":"s","data":"https://i.scdn.co/image/ab67616d0000b273e2c785ae4a47a8770589db72"},"xesam:album":{"type":"s","data":"uhhh 3"},"xesam:albumArtist":{"type":"as","data":["Khary"]},"xesam:artist":{"type":"as","data":["Khary"]},"xesam:autoRating":{"type":"d","data":2.800000000000000266454e-01},"xesam:discNumber":{"type":"i","data":1},"xesam:title":{"type":"s","data":"Fembrook Dr"},"xesam:trackNumber":{"type":"i","data":2},"xesam:url":{"type":"s","data":"https://open.spotify.com/track/6UTrz4vab86upECRgbEMbM"}}}',
  '{"type":"x","data":73827000}',
].join('\n')
const busctlWith = (status: string, meta: string, pos: number) =>
  [`{"type":"s","data":"${status}"}`, `{"type":"a{sv}","data":${meta}}`, `{"type":"x","data":${pos}}`].join('\n')

test('busctl: track, paused state and microseconds become ms', () => {
  expect(parseBusctl(BUSCTL, 5000)).toEqual({
    status: 'open', playing: false, ad: false, progressMs: 73827, readAt: 5000,
    track: { id: '/com/spotify/track/6UTrz4vab86upECRgbEMbM', title: 'Fembrook Dr', artist: 'Khary', album: 'uhhh 3', durationMs: 176959,
      artUrl: 'https://i.scdn.co/image/ab67616d0000b273e2c785ae4a47a8770589db72', url: 'https://open.spotify.com/track/6UTrz4vab86upECRgbEMbM', uri: 'spotify:track:6UTrz4vab86upECRgbEMbM' },
  })
})

test('busctl: ads, several artists, missing album and zero length', () => {
  const ad = parseBusctl(busctlWith('Playing', '{"mpris:trackid":{"type":"s","data":"/com/spotify/ad/123"},"xesam:title":{"type":"s","data":"Spotify"}}', 0), 1)!
  expect(ad.ad).toBe(true)
  expect(ad.playing).toBe(true)
  const multi = parseBusctl(busctlWith('Playing', '{"mpris:trackid":{"type":"s","data":"/com/spotify/episode/9"},"xesam:artist":{"type":"as","data":["A","B"]},"xesam:title":{"type":"s","data":"Ep"}}', 10), 1)!
  expect(multi.track).toEqual({ id: '/com/spotify/episode/9', title: 'Ep', artist: 'A, B', album: '', durationMs: 0, uri: 'spotify:episode:9' })
  expect(multi.ad).toBe(false)
})

test('busctl: an empty Metadata is open with no track; junk is a failure', () => {
  expect(parseBusctl(busctlWith('Stopped', '{}', 0), 1)).toEqual({ status: 'open', playing: false, ad: false, progressMs: 0, readAt: 1 })
  expect(parseBusctl('not json', 1)).toBeUndefined()
  expect(parseBusctl('{"type":"s","data":"Playing"}', 1)).toBeUndefined()
})

test('playerctl: tab-separated format line', () => {
  const line = ['Playing', '/com/spotify/track/x', 'Song', 'Artist A, Artist B', 'Album', '200000000', '1500000'].join('\t')
  expect(parsePlayerctl(line + '\n', 9)).toEqual({
    status: 'open', playing: true, ad: false, progressMs: 1500, readAt: 9,
    track: { id: '/com/spotify/track/x', title: 'Song', artist: 'Artist A, Artist B', album: 'Album', durationMs: 200000, uri: 'spotify:track:x' },
  })
  expect(parsePlayerctl('garbage', 9)).toBeUndefined()
})

test('osascript: running, closed, and a comma-decimal position', () => {
  const line = ['playing', 'spotify:track:abc', 'Song', 'Artist', 'Album', '200000', '73,8'].join('\t')
  expect(parseOsascript(line, 2)).toEqual({
    status: 'open', playing: true, ad: false, progressMs: 73800, readAt: 2,
    track: { id: 'spotify:track:abc', title: 'Song', artist: 'Artist', album: 'Album', durationMs: 200000, url: 'https://open.spotify.com/track/abc', uri: 'spotify:track:abc' },
  })
  expect(parseOsascript('closed\n', 2)).toEqual({ status: 'closed' })
  expect(parseOsascript('open\n', 2)).toEqual({ status: 'open', playing: false, ad: false, progressMs: 0, readAt: 2 })
  expect((parseOsascript(['playing', 'spotify:ad:1', '', '', '', '30000', '1.0'].join('\t'), 2) as OpenMusic).ad).toBe(true)
  expect(parseOsascript('', 2)).toBeUndefined()
})

test('progress runs on while playing, holds while paused, stops at the end', () => {
  const m: OpenMusic = { status: 'open', playing: true, ad: false, progressMs: 1000, readAt: 0, track: { id: 'x', title: 't', artist: 'a', album: '', durationMs: 5000 } }
  expect(progressAt(m, 1500)).toBe(2500)
  expect(progressAt(m, 99999)).toBe(5000)
  expect(progressAt({ ...m, playing: false }, 1500)).toBe(1000)
  expect(progressAt({ ...m, track: { ...m.track!, durationMs: 0 } }, 1500)).toBe(2500)
})

test('sameMusic ignores progress that matches the clock, notices a seek', () => {
  const a: OpenMusic = { status: 'open', playing: true, ad: false, progressMs: 1000, readAt: 0, track: { id: 'x', title: 't', artist: 'a', album: '', durationMs: 9000 } }
  expect(sameMusic(a, { ...a, progressMs: 3000, readAt: 2000 }, 2000)).toBe(true)
  expect(sameMusic(a, { ...a, progressMs: 7000, readAt: 2000 }, 2000)).toBe(false)
  expect(sameMusic(a, { ...a, playing: false }, 0)).toBe(false)
  expect(sameMusic(a, { status: 'closed' }, 0)).toBe(false)
  expect(sameMusic({ status: 'closed' }, { status: 'closed' }, 0)).toBe(true)
  expect(sameMusic(undefined, { status: 'closed' }, 0)).toBe(false)
})

// Captured from Spotify 1.2.74 on Linux, 2026-10-12: the metadata read, then the extras read.
const BUSCTL_1012 = [
  '{"type":"s","data":"Playing"}',
  '{"type":"a{sv}","data":{"mpris:trackid":{"type":"s","data":"/com/spotify/track/2ZZoBU3S2aNYSaU1dAtgcJ"},"mpris:length":{"type":"t","data":195741000},"mpris:artUrl":{"type":"s","data":"https://i.scdn.co/image/ab67616d0000b27304802a3a9e155e4eaed25520"},"xesam:album":{"type":"s","data":"VALORANT Sounds, Vol. 1"},"xesam:albumArtist":{"type":"as","data":["VALORANT"]},"xesam:artist":{"type":"as","data":["VALORANT"]},"xesam:autoRating":{"type":"d","data":6.700000000000000399680e-01},"xesam:discNumber":{"type":"i","data":1},"xesam:title":{"type":"s","data":"Ticking Away"},"xesam:trackNumber":{"type":"i","data":8},"xesam:url":{"type":"s","data":"https://open.spotify.com/track/2ZZoBU3S2aNYSaU1dAtgcJ"}}}',
  '{"type":"x","data":76464000}',
].join('\n')
const EXTRAS_1012 = ['{"type":"b","data":true}', '{"type":"s","data":"None"}', '{"type":"d","data":1.000000000000000000000e+00}'].join('\n')

test('busctl 1.2.74: the track carries its cover and link', () => {
  expect(parseBusctl(BUSCTL_1012, 7)!.track).toEqual({
    id: '/com/spotify/track/2ZZoBU3S2aNYSaU1dAtgcJ', title: 'Ticking Away', artist: 'VALORANT', album: 'VALORANT Sounds, Vol. 1', durationMs: 195741,
    artUrl: 'https://i.scdn.co/image/ab67616d0000b27304802a3a9e155e4eaed25520', url: 'https://open.spotify.com/track/2ZZoBU3S2aNYSaU1dAtgcJ', uri: 'spotify:track:2ZZoBU3S2aNYSaU1dAtgcJ',
  })
})

test('uri: MPRIS object paths map to spotify: URIs; osascript ids already are one; anything else has none', () => {
  const meta = (id: string) => busctlWith('Playing', `{"mpris:trackid":{"type":"s","data":"${id}"},"xesam:title":{"type":"s","data":"T"}}`, 0)
  expect(parseBusctl(meta('/com/spotify/track/abc'), 1)!.track!.uri).toBe('spotify:track:abc')
  expect(parseBusctl(meta('/com/spotify/ad/9'), 1)!.track!.uri).toBe('spotify:ad:9')
  expect(parseBusctl(meta('/org/mpris/MediaPlayer2/TrackList/NoTrack'), 1)!.track).not.toHaveProperty('uri')
  const osa = ['playing', 'spotify:episode:e1', 'Ep', 'Show', '', '1000', '0'].join('\t')
  expect((parseOsascript(osa, 1) as OpenMusic).track!.uri).toBe('spotify:episode:e1')
})

test('busctl extras: shuffle, LoopStatus as repeat, volume clamped; a short or wrong-typed read drops what it cannot use', () => {
  expect(parseBusctlExtras(EXTRAS_1012)).toEqual({ shuffle: true, repeat: 'off', volume: 1 })
  expect(parseBusctlExtras(['{"type":"b","data":false}', '{"type":"s","data":"Track"}', '{"type":"d","data":0.35}'].join('\n'))).toEqual({ shuffle: false, repeat: 'track', volume: 0.35 })
  expect(parseBusctlExtras(['{"type":"b","data":"x"}', '{"type":"s","data":"toString"}', '{"type":"d","data":3}'].join('\n'))).toEqual({ volume: 1 })
  expect(parseBusctlExtras('{"type":"b","data":true}')).toBeUndefined()
  expect(parseBusctlExtras('junk\njunk\njunk')).toEqual({})
})

test('playerctl: the 9-field line carries art and link; the 7-field line still parses; extras parse on their own', () => {
  const line = ['Playing', '/com/spotify/track/x', 'Song', 'A', 'Album', '200000000', '1500000', 'https://i.scdn.co/image/ab67616d0000b273ff', 'https://open.spotify.com/track/x'].join('\t')
  expect(parsePlayerctl(line + '\n', 9)!.track).toEqual({ id: '/com/spotify/track/x', title: 'Song', artist: 'A', album: 'Album', durationMs: 200000, artUrl: 'https://i.scdn.co/image/ab67616d0000b273ff', url: 'https://open.spotify.com/track/x', uri: 'spotify:track:x' })
  const empty = ['Playing', '/com/spotify/track/x', 'Song', 'A', 'Album', '200000000', '1500000', '', ''].join('\t')
  expect(parsePlayerctl(empty, 9)!.track).toEqual({ id: '/com/spotify/track/x', title: 'Song', artist: 'A', album: 'Album', durationMs: 200000, uri: 'spotify:track:x' })
  expect(parsePlayerctlExtras('true\tPlaylist\t0.500000\n')).toEqual({ shuffle: true, repeat: 'context', volume: 0.5 })
  expect(parsePlayerctlExtras('\t\t\n')).toEqual({})
  expect(parsePlayerctlExtras('true\n')).toBeUndefined()
})

test('osascript: the 11-field line has shuffling, repeating as context or off, volume out of 100, and artwork', () => {
  const line = ['playing', 'spotify:track:abc', 'Song', 'Artist', 'Album', '200000', '73,8', 'true', 'true', '40', 'https://i.scdn.co/image/ab67616d0000b273cc'].join('\t')
  expect(parseOsascript(line, 2)).toEqual({
    status: 'open', playing: true, ad: false, progressMs: 73800, readAt: 2, shuffle: true, repeat: 'context', volume: 0.4,
    track: { id: 'spotify:track:abc', title: 'Song', artist: 'Artist', album: 'Album', durationMs: 200000, artUrl: 'https://i.scdn.co/image/ab67616d0000b273cc', url: 'https://open.spotify.com/track/abc', uri: 'spotify:track:abc' },
  })
  // a field the AppleScript try blocks left empty stays absent
  const bare = ['paused', 'spotify:track:abc', 'Song', 'Artist', 'Album', '200000', '1.0', '', 'false', '', ''].join('\t')
  const m = parseOsascript(bare, 2) as OpenMusic
  expect([m.shuffle, m.repeat, m.volume, m.track!.artUrl]).toEqual([undefined, 'off', undefined, undefined])
})

test('extrapolate matches progressAt', () => {
  expect(extrapolate(1000, 0, 5000, true, 1500)).toBe(2500)
  expect(extrapolate(1000, 0, 5000, true, 99999)).toBe(5000)
  expect(extrapolate(1000, 0, 5000, false, 1500)).toBe(1000)
  expect(extrapolate(1000, 0, 0, true, 1500)).toBe(2500)
})

test('sameMusic notices shuffle, repeat and volume', () => {
  const a: OpenMusic = { status: 'open', playing: true, ad: false, progressMs: 0, readAt: 0, shuffle: false, repeat: 'off', volume: 0.5 }
  expect(sameMusic(a, { ...a }, 0)).toBe(true)
  expect(sameMusic(a, { ...a, shuffle: true }, 0)).toBe(false)
  expect(sameMusic(a, { ...a, repeat: 'track' }, 0)).toBe(false)
  expect(sameMusic(a, { ...a, volume: 0.6 }, 0)).toBe(false)
})

test('sameMusic sees the connected fields change', () => {
  const a: OpenMusic = { status: 'open', playing: true, ad: false, progressMs: 0, readAt: 0, track: { id: 't', title: 'T', artist: 'A', album: '', durationMs: 9000, uri: 'spotify:track:t' }, source: 'api' }
  expect(sameMusic(a, { ...a }, 0)).toBe(true)
  expect(sameMusic(a, { ...a, source: 'local' }, 0)).toBe(false)
  expect(sameMusic(a, { ...a, liked: true }, 0)).toBe(false)
  expect(sameMusic(a, { ...a, device: { id: 'd', name: 'Pixel 9', type: 'Smartphone', isThisComputer: false } }, 0)).toBe(false)
  expect(sameMusic(a, { ...a, upNext: { uri: 'spotify:track:n', title: 'N', artist: 'B', durationMs: 1 } }, 0)).toBe(false)
})

test('players are picked playing first, then paused; the last one shown keeps a tie, then Spotify', () => {
  const ps = [{ name: 'vlc', status: 'Paused' }, { name: 'spotify', status: 'Paused' }, { name: 'firefox', status: 'Stopped' }]
  expect(pickPlayer(ps)?.name).toBe('spotify')
  expect(pickPlayer(ps, 'vlc')?.name).toBe('vlc')
  expect(pickPlayer([...ps, { name: 'mpv', status: 'Playing' }], 'vlc')?.name).toBe('mpv')
  expect(pickPlayer([])).toBeUndefined()
  expect([playerApp('chromium.instance1234'), playerApp('org.mpris.MediaPlayer2.firefox.instance_1_23'), playerApp('mpv'), playerApp('elisa')]).toEqual(['Chromium', 'Firefox', 'mpv', 'Elisa'])
})
