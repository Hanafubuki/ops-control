// The Music dialog's four lists: what each holds, when it reloads, and what Enter on a row sends.
// JSX-free and engine-free, so the rules test on plain data.
import type { Music, MusicCmd, QueueItem } from './parse.ts'
import type { ApiError, DeviceItem, PlaylistItem, RecentItem } from './webapi.ts'
import type { SkipResult } from './spotify.ts'
import { mmss } from './seek.ts'

export type ListId = 'queue' | 'recent' | 'playlists' | 'devices'
export const LISTS: readonly (readonly [ListId, string])[] = [['queue', 'Up next'], ['recent', 'Recent'], ['playlists', 'Playlists'], ['devices', 'Devices']]
// value is the Select option's value, unique within its list; cmd is what Enter on the row sends
export type ListRow = { value: string; title: string; detail: string; right: string; cmd: MusicCmd; active?: boolean }
// Rows survive a reload and a failed one, so the 15 s refresh never blanks a list.
// forUri is the track playing when the list loaded: Up next and Recent reload when it changes.
export type ListState =
  | { status: 'idle' }
  | { status: 'loading'; rows: ListRow[] }
  | { status: 'ready'; rows: ListRow[]; at: number; forUri?: string }
  | { status: 'error'; rows: ListRow[]; reason: string; at: number; forUri?: string }
export type Lists = { shown: ListId; byId: Record<ListId, ListState> }

export const LIST_MAX = 20
export const RELOAD_MS = 15_000
export const EMPTY: Record<ListId, string> = { queue: 'Nothing queued.', recent: 'Nothing played yet.', playlists: 'No playlists yet.', devices: 'No devices. Open Spotify on one.' }
const IDLE: ListState = { status: 'idle' }

// With nothing active anywhere (a 204) the dialog opens on Devices, the one list that can start playback somewhere.
export function initialLists(m?: Music): Lists {
  const none = m?.status === 'open' && m.source === 'api' && !m.device
  return { shown: none ? 'devices' : 'queue', byId: { queue: IDLE, recent: IDLE, playlists: IDLE, devices: IDLE } }
}

// Asked only for the list on screen. Closing the dialog resets every list, so "once per open" is "once".
export function needsLoad(id: ListId, s: ListState, now: number, trackUri: string | undefined): boolean {
  if (s.status === 'idle') return true
  if (s.status === 'loading') return false
  const aged = now - s.at >= RELOAD_MS
  if (s.status === 'error') return aged
  switch (id) {
    case 'queue': return s.forUri !== trackUri || aged
    case 'recent': return s.forUri !== trackUri
    case 'playlists': return false
    case 'devices': return aged
  }
}

export const rowsOf = (s: ListState): ListRow[] => (s.status === 'idle' ? [] : s.rows)
export const loadingFrom = (s: ListState): ListState => ({ status: 'loading', rows: rowsOf(s) })
// Due at the next check: Devices each time they are shown and after a transfer, Up next after a skip.
// -Infinity, not 0: the engine's clock in tests starts at 0, where at: 0 would not be 15 s old.
export function expire(l: Lists, id: ListId): Lists {
  const s = l.byId[id]
  return s.status === 'ready' || s.status === 'error' ? { ...l, byId: { ...l.byId, [id]: { ...s, at: -Infinity } } } : l
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
// Spotify takes an offset into albums and playlists only; an artist, show or Liked Songs context plays the track alone.
const offsetable = (uri: string) => /^spotify:(album|playlist):/.test(uri)

// The same track can be queued or played twice, so the index keeps each value unique; commands still go by URI.
export const queueRows = (q: QueueItem[]): ListRow[] => q.slice(0, LIST_MAX).map((t, i) => ({ value: `${i}:${t.uri}`, title: t.title, detail: t.artist, right: mmss(t.durationMs), cmd: { cmd: 'skipTo', uri: t.uri } }))

export const recentRows = (r: RecentItem[]): ListRow[] => r.slice(0, LIST_MAX).map((t, i) => ({
  value: `${i}:${t.uri}`, title: t.title, detail: t.artist, right: mmss(t.durationMs),
  cmd: t.contextUri && offsetable(t.contextUri) ? { cmd: 'playContext', uri: t.contextUri, offset: t.uri } : { cmd: 'play', uri: t.uri },
}))

export const playlistRows = (p: PlaylistItem[]): ListRow[] => p
  .filter((x, i) => p.findIndex(y => y.uri === x.uri) === i)
  .map(x => ({ value: x.uri, title: x.name, detail: x.owner, right: plural(x.tracks, 'track'), cmd: { cmd: 'playContext', uri: x.uri } }))

export const deviceRows = (d: DeviceItem[]): ListRow[] => d.map(x => ({ value: x.id, title: x.name, detail: x.type, right: x.active ? 'active' : '', cmd: { cmd: 'transfer', deviceId: x.id }, ...(x.active && { active: true }) }))

export function listError(e: ApiError): string {
  switch (e.kind) {
    case 'server': return `Spotify had a problem (${e.status}). ops-control tries again shortly.`
    // reason is Spotify's own text; only a bare code like NO_ACTIVE_DEVICE is shown
    case 'refused': return `Spotify refused the list (${/^[A-Z_]{1,40}$/.test(e.reason) ? e.reason : e.status}).`
    case 'rate': return 'Spotify asked ops-control to slow down. ops-control tries again shortly.'
    case 'reconnect': return 'Spotify needs you to connect again. Run /ops spotify connect.'
    case 'noDevice': return 'No device is playing. Pick one in the Devices list.'
    case 'premium': return 'Spotify needs Premium for this list.'
    default: return 'Spotify did not answer. ops-control tries again shortly.'
  }
}

// A pressed row is not retried, unlike a list load (15 s), so the transient failures ask the user to press again.
export function pressError(e: ApiError): string {
  switch (e.kind) {
    case 'server': case 'rate': case 'busy': case 'offline': return 'Spotify is not answering right now. Try again.'
    default: return listError(e)
  }
}

export function skipText(r: SkipResult): string {
  switch (r.kind) {
    case 'done': return ''
    case 'gone': return 'That track already left the queue.'
    case 'far': return 'That track is too far down the queue.'
    case 'busy': return 'Still reading the queue, try again.'
    case 'error': return pressError(r.error)
  }
}
