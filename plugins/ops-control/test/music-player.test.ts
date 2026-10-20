import { expect } from 'claude-code/testing'
import { test } from './kit.ts'
import { apiDelay, capsOf, mergeMusic, routeOf, type Link } from '../hooks/music/player.ts'
import type { OpenMusic } from '../hooks/music/parse.ts'
import type { MusicCaps } from '../hooks/music/reader.ts'

const T1 = { id: '/com/spotify/track/t1', title: 'One', artist: 'A', album: 'X', durationMs: 200_000, uri: 'spotify:track:t1' }
const T2 = { ...T1, id: '/com/spotify/track/t2', title: 'Two', uri: 'spotify:track:t2' }
const apiT1 = { ...T1, id: 'spotify:track:t1' }
const desk = { id: 'd1', name: 'Desktop', type: 'Computer', isThisComputer: false }
const phone = { id: 'p1', name: 'Pixel 9', type: 'Smartphone', isThisComputer: false }
const local = (over: Partial<OpenMusic> = {}): OpenMusic => ({ status: 'open', track: T1, playing: true, ad: false, progressMs: 10_000, readAt: 1000, ...over })
const api = (over: Partial<OpenMusic> = {}): OpenMusic => ({ status: 'open', track: apiT1, playing: true, ad: false, progressMs: 9000, readAt: 1000, source: 'api', shuffle: true, repeat: 'context', volume: 0.5, device: desk, ...over })
const NEXT = { uri: 'spotify:track:n', title: 'Next', artist: 'B', durationMs: 1 }
const I = 3000

test('not connected: the local read as it is', () => {
  expect(mergeMusic(local(), undefined, undefined, 1000, I)).toEqual(local())
})

test('this computer active: track and progress from local; shuffle, repeat, volume, device, heart and Up next from the API', () => {
  const link: Link = { last: { at: 1000, music: api() }, liked: { uri: 'spotify:track:t1', on: true }, upNext: { uri: 'spotify:track:t1', item: NEXT } }
  expect(mergeMusic(local(), link, undefined, 1500, I)).toEqual({ ...local(), source: 'api', shuffle: true, repeat: 'context', volume: 0.5, device: { ...desk, isThisComputer: true }, liked: true, upNext: NEXT })
})

test('another device active: everything from the API, and a heart read for another track is not shown', () => {
  const two = { ...apiT1, id: 'spotify:track:t2', uri: 'spotify:track:t2', title: 'Two' }
  const link: Link = { last: { at: 1000, music: api({ device: phone, track: two }) }, liked: { uri: 'spotify:track:t1', on: true } }
  const m = mergeMusic(local({ playing: false }), link, undefined, 1500, I) as OpenMusic
  expect([m.track?.title, m.device?.name, m.liked, m.progressMs, m.readAt]).toEqual(['Two', 'Pixel 9', undefined, 9000, 1000])
})

test('the API lagging a local track change: a newer local read wins until the next API read', () => {
  const changed = local({ track: T2, readAt: 2000, progressMs: 0 })
  expect((mergeMusic(changed, { last: { at: 1000, music: api() } }, undefined, 2000, I) as OpenMusic).track?.title).toBe('Two')
  // the next API read still names another track on a Computer: another computer plays it
  expect((mergeMusic(changed, { last: { at: 2500, localUri: T2.uri, music: api() } }, undefined, 2500, I) as OpenMusic).track?.title).toBe('One')
})

test('another computer plays X while this app shows Y: the API state stays, however new the local read', () => {
  const x = { ...apiT1, id: 'spotify:track:x', uri: 'spotify:track:x', title: 'X' }
  const link: Link = { last: { at: 1000, localUri: T1.uri, music: api({ track: x }) } }
  const m = mergeMusic(local({ readAt: 1400 }), link, undefined, 1500, I) as OpenMusic
  expect([m.track?.title, m.device?.isThisComputer]).toEqual(['X', false])
})

test('204: local when it is open, else Nothing playing', () => {
  const link: Link = { last: { at: 1000 } }
  expect(mergeMusic(local(), link, undefined, 1500, I)).toEqual({ ...local(), source: 'api' })
  expect(mergeMusic({ status: 'closed' }, link, undefined, 1500, I)).toEqual({ status: 'open', playing: false, ad: false, progressMs: 0, readAt: 1500, source: 'api' })
})

test('an API read counts for two poll intervals', () => {
  const link: Link = { last: { at: 1000, music: api({ device: phone }) } }
  expect((mergeMusic(local(), link, undefined, 7000, I) as OpenMusic).source).toBe('api')
  expect((mergeMusic(local(), link, undefined, 7001, I) as OpenMusic).source).toBe('local')
  expect(mergeMusic({ status: 'closed' }, link, undefined, 7001, I)).toEqual({ status: 'closed' })
})

test('staleness is measured against the slower of the intervals then and now', () => {
  // read while polling every 15 s; the pane then opened and the interval shrank to 3 s
  const link: Link = { last: { at: 1000, intervalMs: 15_000, music: api({ device: phone }) } }
  expect((mergeMusic(local(), link, undefined, 9000, I) as OpenMusic).source).toBe('api')
  expect((mergeMusic(local(), link, undefined, 31_001, I) as OpenMusic).source).toBe('local')
})

test('a failing API falls back to local without moving the bar back, and recovers', () => {
  // the phone played this track at 60 s; then the API went quiet for more than two polls
  const onPhone: Link = { last: { at: 1000, music: api({ device: phone, progressMs: 60_000 }) } }
  const shown = mergeMusic(local({ playing: false }), onPhone, undefined, 1000, I)
  const fallen = mergeMusic(local({ playing: false, readAt: 8000 }), onPhone, shown, 8000, I) as OpenMusic
  expect(fallen.source).toBe('local')
  expect(fallen.progressMs).toBe(67_000)
  expect(fallen.liked).toBeUndefined()
  // the floor holds for as long as the fallback lasts
  const still = mergeMusic(local({ playing: false, readAt: 8500 }), onPhone, fallen, 8500, I) as OpenMusic
  expect([still.source, still.progressMs]).toEqual(['local', 67_000])
  // a local read at another position is a real seek back: followed
  const sought = mergeMusic(local({ playing: false, readAt: 8700, progressMs: 20_000 }), onPhone, still, 8700, I) as OpenMusic
  expect([sought.source, sought.progressMs, sought.held]).toEqual(['local', 20_000, undefined])
  const back = mergeMusic(local({ playing: false, readAt: 9000 }), { last: { at: 9000, music: api({ device: phone, progressMs: 68_000, readAt: 9000 }) } }, still, 9000, I) as OpenMusic
  expect([back.source, back.progressMs]).toEqual(['api', 68_000])
})

test('the routing table', () => {
  const here = mergeMusic(local(), { last: { at: 1000, music: api() } }, undefined, 1000, I)
  const there = mergeMusic(local(), { last: { at: 1000, music: api({ device: phone }) } }, undefined, 1000, I)
  const none = mergeMusic(local(), { last: { at: 1000 } }, undefined, 1000, I)
  const failing = mergeMusic(local(), { last: { at: 1000, music: api() } }, undefined, 99_000, I)
  const next = { cmd: 'next' } as const, like = { cmd: 'like', on: true } as const
  expect([routeOf(next, local(), true), routeOf(like, local(), true)]).toEqual(['local', 'none'])
  expect([routeOf(next, here, true), routeOf(like, here, true)]).toEqual(['apiThenLocal', 'api'])
  expect([routeOf(next, there, true), routeOf(like, there, true)]).toEqual(['api', 'api'])
  expect([routeOf(next, none, true), routeOf(like, none, true)]).toEqual(['local', 'none'])
  expect([routeOf(next, failing, true), routeOf(like, failing, true)]).toEqual(['local', 'none'])
  expect(routeOf({ cmd: 'raise' }, there, true)).toBe('local')
  // after PREMIUM_REQUIRED, transport is local for the session; liking still goes to the API
  expect([routeOf(next, there, false), routeOf({ cmd: 'seek', ms: 1 }, there, false), routeOf(like, there, false)]).toEqual(['local', 'local', 'api'])
})

test('the list commands go to the API whenever it answers, active device or not', () => {
  const there = mergeMusic(local(), { last: { at: 1000, music: api({ device: phone }) } }, undefined, 1000, I)
  const none = mergeMusic({ status: 'closed' }, { last: { at: 1000 } }, undefined, 1000, I)
  const failing = mergeMusic(local(), { last: { at: 1000, music: api() } }, undefined, 99_000, I)
  const cmds = [{ cmd: 'skipTo', uri: 'spotify:track:x' }, { cmd: 'play', uri: 'spotify:track:x' }, { cmd: 'playContext', uri: 'spotify:playlist:p' }, { cmd: 'transfer', deviceId: 'dk' }] as const
  for (const c of cmds) {
    expect([routeOf(c, there, true), routeOf(c, none, true), routeOf(c, failing, true), routeOf(c, local(), true), routeOf(c, there, false)]).toEqual(['api', 'api', 'none', 'none', 'api'])
  }
})

test('the API widens the controls while it runs the player', () => {
  const linux: MusicCaps = { repeat: [], shuffle: false, raise: true, volume: false }
  const there = mergeMusic(local(), { last: { at: 1000, music: api({ device: phone }) } }, undefined, 1000, I)
  expect(capsOf(there, linux, true)).toEqual({ repeat: ['off', 'context', 'track'], shuffle: true, raise: true, volume: true })
  expect(capsOf(there, linux, false)).toEqual(linux)
  expect(capsOf(local(), linux, true)).toEqual(linux)
})

test('the API is asked every 3 s while playing in sight, else every 15 s', () => {
  expect([apiDelay(true, true), apiDelay(true, false), apiDelay(false, true)]).toEqual([3000, 15_000, 15_000])
})
