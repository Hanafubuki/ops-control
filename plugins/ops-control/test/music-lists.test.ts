import { expect } from 'claude-code/testing'
import { test } from './kit.ts'
import { EMPTY, deviceRows, expire, initialLists, listError, loadingFrom, needsLoad, playlistRows, pressError, queueRows, recentRows, rowsOf, skipText, type ListRow, type ListState } from '../hooks/music/lists.ts'

const row = (v: string): ListRow => ({ value: v, title: v, detail: '', right: '', cmd: { cmd: 'play', uri: v } })
const ready = (at: number, forUri?: string): ListState => ({ status: 'ready', rows: [row('a')], at, ...(forUri && { forUri }) })

test('the dialog opens on Up next, or on Devices when nothing is active', () => {
  expect(initialLists().shown).toBe('queue')
  expect(initialLists({ status: 'open', playing: false, ad: false, progressMs: 0, readAt: 0, source: 'api' }).shown).toBe('devices')
  expect(initialLists({ status: 'open', playing: false, ad: false, progressMs: 0, readAt: 0, source: 'api', device: { id: 'd', name: 'D', type: 'Computer', isThisComputer: true } }).shown).toBe('queue')
  expect(Object.values(initialLists().byId).every(s => s.status === 'idle')).toBe(true)
})

test('the reload rules', () => {
  const T = 'spotify:track:t', U = 'spotify:track:u'
  for (const id of ['queue', 'recent', 'playlists', 'devices'] as const) {
    expect(needsLoad(id, { status: 'idle' }, 0, T)).toBe(true)
    expect(needsLoad(id, { status: 'loading', rows: [] }, 99_999, U)).toBe(false)
  }
  // Up next: on a track change, and every 15 s
  expect([needsLoad('queue', ready(0, T), 14_999, T), needsLoad('queue', ready(0, T), 15_000, T), needsLoad('queue', ready(0, T), 1, U)]).toEqual([false, true, true])
  // Recent: on a track change only
  expect([needsLoad('recent', ready(0, T), 99_999, T), needsLoad('recent', ready(0, T), 1, U)]).toEqual([false, true])
  // Playlists: once per dialog open
  expect([needsLoad('playlists', ready(0, T), 99_999, U)]).toEqual([false])
  // Devices: every 15 s, and whenever expire marks them
  expect([needsLoad('devices', ready(0, T), 14_999, U), needsLoad('devices', ready(0, T), 15_000, T)]).toEqual([false, true])
  const l = { ...initialLists(), byId: { ...initialLists().byId, devices: ready(10_000) } }
  expect(needsLoad('devices', expire(l, 'devices').byId.devices, 10_001, T)).toBe(true)
  // a failed list is tried again after 15 s, whichever it is
  const failed: ListState = { status: 'error', rows: [], reason: 'x', at: 0, forUri: T }
  expect([needsLoad('playlists', failed, 14_999, T), needsLoad('playlists', failed, 15_000, T)]).toEqual([false, true])
})

test('a reload keeps the rows; an error keeps them too', () => {
  expect(loadingFrom(ready(0))).toEqual({ status: 'loading', rows: [row('a')] })
  expect(loadingFrom({ status: 'idle' })).toEqual({ status: 'loading', rows: [] })
  expect(rowsOf({ status: 'error', rows: [row('b')], reason: 'x', at: 0 })).toEqual([row('b')])
  expect(rowsOf({ status: 'idle' })).toEqual([])
})

test('Up next rows skip to their track, at most 20, each value unique', () => {
  const q = Array.from({ length: 25 }, (_, i) => ({ uri: i < 2 ? 'spotify:track:same' : `spotify:track:t${i}`, title: `T${i}`, artist: 'A', durationMs: 61_000 }))
  const rows = queueRows(q)
  expect(rows).toHaveLength(20)
  expect(rows[0]).toEqual({ value: '0:spotify:track:same', title: 'T0', detail: 'A', right: '1:01', cmd: { cmd: 'skipTo', uri: 'spotify:track:same' } })
  expect(new Set(rows.map(r => r.value)).size).toBe(20)
})

test('Recent plays in an album or playlist context, else the track alone', () => {
  const t = { title: 'T', artist: 'A', durationMs: 1000 }
  const rows = recentRows([
    { ...t, uri: 'spotify:track:a', contextUri: 'spotify:playlist:p' },
    { ...t, uri: 'spotify:track:b', contextUri: 'spotify:album:x' },
    { ...t, uri: 'spotify:track:c', contextUri: 'spotify:artist:y' },
    { ...t, uri: 'spotify:track:d' },
    { ...t, uri: 'spotify:track:d' },
  ])
  expect(rows.map(r => r.cmd)).toEqual([
    { cmd: 'playContext', uri: 'spotify:playlist:p', offset: 'spotify:track:a' },
    { cmd: 'playContext', uri: 'spotify:album:x', offset: 'spotify:track:b' },
    { cmd: 'play', uri: 'spotify:track:c' },
    { cmd: 'play', uri: 'spotify:track:d' },
    { cmd: 'play', uri: 'spotify:track:d' },
  ])
  expect(rows.map(r => r.value)).toEqual(['0:spotify:track:a', '1:spotify:track:b', '2:spotify:track:c', '3:spotify:track:d', '4:spotify:track:d'])
})

test('playlists start their context; devices take playback and mark the active one', () => {
  expect(playlistRows([{ uri: 'spotify:playlist:p', name: 'Focus', owner: 'Ada', tracks: 1 }, { uri: 'spotify:playlist:p', name: 'Dup', owner: 'Ada', tracks: 2 }, { uri: 'spotify:playlist:q', name: 'Q', owner: 'Bo', tracks: 12 }])).toEqual([
    { value: 'spotify:playlist:p', title: 'Focus', detail: 'Ada', right: '1 track', cmd: { cmd: 'playContext', uri: 'spotify:playlist:p' } },
    { value: 'spotify:playlist:q', title: 'Q', detail: 'Bo', right: '12 tracks', cmd: { cmd: 'playContext', uri: 'spotify:playlist:q' } },
  ])
  expect(deviceRows([{ id: 'ph', name: 'Pixel 9', type: 'Smartphone', active: true }, { id: 'dk', name: 'Desktop', type: 'Computer', active: false }])).toEqual([
    { value: 'ph', title: 'Pixel 9', detail: 'Smartphone', right: 'active', cmd: { cmd: 'transfer', deviceId: 'ph' }, active: true },
    { value: 'dk', title: 'Desktop', detail: 'Computer', right: '', cmd: { cmd: 'transfer', deviceId: 'dk' } },
  ])
})

test('what an empty or failed list says', () => {
  expect(EMPTY).toEqual({ queue: 'Nothing queued.', recent: 'Nothing played yet.', playlists: 'No playlists yet.', devices: 'No devices. Open Spotify on one.' })
  expect(listError({ kind: 'offline' })).toBe('Spotify did not answer. ops-control tries again shortly.')
  expect(listError({ kind: 'server', status: 503 })).toBe('Spotify had a problem (503). ops-control tries again shortly.')
  expect(listError({ kind: 'refused', reason: 'UNKNOWN', status: 403 })).toBe('Spotify refused the list (UNKNOWN).')
  expect(listError({ kind: 'refused', reason: 'Bearer at-1 was rejected', status: 400 })).toBe('Spotify refused the list (400).')
  expect(listError({ kind: 'rate', untilMs: 1 })).toBe('Spotify asked ops-control to slow down. ops-control tries again shortly.')
  expect(listError({ kind: 'reconnect' })).toBe('Spotify needs you to connect again. Run /ops spotify connect.')
  expect(listError({ kind: 'noDevice' })).toBe('No device is playing. Pick one in the Devices list.')
  expect(listError({ kind: 'busy' })).toBe('Spotify did not answer. ops-control tries again shortly.')
})

test('a failed row press asks for another press, not a retry', () => {
  const again = 'Spotify is not answering right now. Try again.'
  for (const e of [{ kind: 'offline' }, { kind: 'server', status: 503 }, { kind: 'rate', untilMs: 1 }, { kind: 'busy' }] as const) {
    expect(pressError(e)).toBe(again)
    expect(listError(e)).toContain('tries again shortly')
  }
  expect(pressError({ kind: 'refused', reason: 'UNKNOWN', status: 403 })).toBe(listError({ kind: 'refused', reason: 'UNKNOWN', status: 403 }))
  expect(pressError({ kind: 'premium' })).toBe(listError({ kind: 'premium' }))
})

test('what a skip that did not land says', () => {
  expect(skipText({ kind: 'far' })).toBe('That track is too far down the queue.')
  expect(skipText({ kind: 'busy' })).toBe('Still reading the queue, try again.')
  expect(skipText({ kind: 'gone' })).toBe('That track already left the queue.')
  expect(skipText({ kind: 'error', error: { kind: 'server', status: 502 } })).toBe('Spotify is not answering right now. Try again.')
  expect(skipText({ kind: 'error', error: { kind: 'noDevice' } })).toBe(listError({ kind: 'noDevice' }))
  expect(skipText({ kind: 'done' })).toBe('')
})
