// JSX-free and engine-free: Spotify Web API requests as data, and its answers parsed into the shared Music shapes.
import type { Device, MusicCmd, OpenMusic, QueueItem, Repeat, Track } from './parse.ts'

export const API = 'https://api.spotify.com/v1'
// body is JSON; SpotifyClient sends it with its content type
export type ApiRequest = { method: 'GET' | 'PUT' | 'POST' | 'DELETE'; url: string; body?: string }

// Without additional_types=episode, a podcast episode comes back as item: null.
export const playerRequest = (): ApiRequest => ({ method: 'GET', url: `${API}/me/player?additional_types=episode` })
export const queueRequest = (): ApiRequest => ({ method: 'GET', url: `${API}/me/player/queue?additional_types=episode` })
export const meRequest = (): ApiRequest => ({ method: 'GET', url: `${API}/me` })
// /me/tracks was removed in February 2026; /me/library takes spotify: URIs
export const likedRequest = (uri: string): ApiRequest => ({ method: 'GET', url: `${API}/me/library/contains?uris=${encodeURIComponent(uri)}` })
export const likeRequest = (uri: string, on: boolean): ApiRequest => ({ method: on ? 'PUT' : 'DELETE', url: `${API}/me/library?uris=${encodeURIComponent(uri)}` })
export const recentRequest = (): ApiRequest => ({ method: 'GET', url: `${API}/me/player/recently-played?limit=20` })
// next is the URL a page names for the one after it, already checked by parsePlaylists
export const playlistsRequest = (next?: string): ApiRequest => ({ method: 'GET', url: next ?? `${API}/me/playlists?limit=50` })
export const devicesRequest = (): ApiRequest => ({ method: 'GET', url: `${API}/me/player/devices` })

const unit = (v: number) => Math.min(1, Math.max(0, v))

// The write a transport command makes; playing picks pause or play. like goes through likeRequest, skipTo through spotify.ts's skipTo, and raise is local only.
export function commandRequest(c: MusicCmd, playing: boolean): ApiRequest | undefined {
  switch (c.cmd) {
    case 'playpause': return { method: 'PUT', url: `${API}/me/player/${playing ? 'pause' : 'play'}` }
    case 'next': return { method: 'POST', url: `${API}/me/player/next` }
    case 'previous': return { method: 'POST', url: `${API}/me/player/previous` }
    case 'seek': return { method: 'PUT', url: `${API}/me/player/seek?position_ms=${Math.max(0, Math.round(c.ms))}` }
    case 'shuffle': return { method: 'PUT', url: `${API}/me/player/shuffle?state=${c.on}` }
    case 'repeat': return { method: 'PUT', url: `${API}/me/player/repeat?state=${c.mode}` }
    case 'volume': return { method: 'PUT', url: `${API}/me/player/volume?volume_percent=${Math.round(unit(c.level) * 100)}` }
    case 'play': return { method: 'PUT', url: `${API}/me/player/play`, body: JSON.stringify({ uris: [c.uri] }) }
    case 'playContext': return { method: 'PUT', url: `${API}/me/player/play`, body: JSON.stringify({ context_uri: c.uri, ...(c.offset && { offset: { uri: c.offset } }) }) }
    // play: true starts it there; without it Spotify moves playback paused
    case 'transfer': return { method: 'PUT', url: `${API}/me/player`, body: JSON.stringify({ device_ids: [c.deviceId], play: true }) }
    default: return undefined
  }
}

// A minute early, so a token never expires between the check and Spotify reading it.
export const needsRefresh = (expiresAt: number, now: number) => expiresAt - now < 60_000

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : undefined)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const json = (text: string): unknown => { try { return JSON.parse(text) } catch { return undefined } }
const REPEATS: readonly unknown[] = ['off', 'context', 'track']

// The narrowest picture with a known width: the cover helper shrinks it to 20 px at most.
function smallest(images: unknown): string | undefined {
  const all = Array.isArray(images) ? images.map(obj).filter((i): i is Obj => !!i && typeof i.url === 'string') : []
  const sized = all.filter(i => num(i.width) > 0).sort((a, b) => num(a.width) - num(b.width))
  return str((sized[0] ?? all[0])?.url) || undefined
}

// A track or an episode; the API names both by spotify: URI, which is also the id here.
function trackOf(v: unknown): Track | undefined {
  const it = obj(v), uri = str(it?.uri)
  if (!it || !uri) return undefined
  const episode = it.type === 'episode', album = obj(it.album), show = obj(it.show)
  const artist = episode ? str(show?.name) : (Array.isArray(it.artists) ? it.artists : []).map(a => str(obj(a)?.name)).filter(Boolean).join(', ')
  const artUrl = smallest(episode ? it.images ?? show?.images : album?.images)
  const url = str(obj(it.external_urls)?.spotify)
  return { id: uri, title: str(it.name), artist, album: episode ? '' : str(album?.name), durationMs: Math.max(0, Math.round(num(it.duration_ms))), uri, ...(artUrl && { artUrl }), ...(url && { url }) }
}

// GET /me/player's 200 body. readAt is when the answer arrived, not Spotify's timestamp,
// so another device's clock cannot move the bar.
export function parsePlayer(text: string, readAt: number): OpenMusic | undefined {
  const o = obj(json(text))
  if (!o) return undefined
  const d = obj(o.device)
  const device: Device | undefined = d && str(d.name) ? { id: str(d.id), name: str(d.name), type: str(d.type), isThisComputer: false } : undefined
  const track = trackOf(o.item)
  const volume = d && typeof d.volume_percent === 'number' && d.supports_volume !== false ? unit(d.volume_percent / 100) : undefined
  return {
    status: 'open', playing: o.is_playing === true, ad: o.currently_playing_type === 'ad', progressMs: Math.max(0, Math.round(num(o.progress_ms))), readAt, source: 'api',
    ...(track && { track }),
    ...(typeof o.shuffle_state === 'boolean' && { shuffle: o.shuffle_state }),
    ...(REPEATS.includes(o.repeat_state) && { repeat: o.repeat_state as Repeat }),
    ...(volume !== undefined && { volume }),
    ...(device && { device }),
  }
}

export function parseQueue(text: string): QueueItem[] | undefined {
  const q = obj(json(text))?.queue
  if (!Array.isArray(q)) return undefined
  return q.map(trackOf).filter((t): t is Track => !!t).map(t => ({ uri: t.uri!, title: t.title, artist: t.artist, durationMs: t.durationMs }))
}

export function parseLiked(text: string): boolean | undefined {
  const a = json(text)
  return Array.isArray(a) && typeof a[0] === 'boolean' ? a[0] : undefined
}

export function parseMe(text: string): string | undefined {
  const o = obj(json(text))
  return str(o?.display_name) || str(o?.id) || undefined
}

export type RecentItem = QueueItem & { contextUri?: string }
export function parseRecent(text: string): RecentItem[] | undefined {
  const items = obj(json(text))?.items
  if (!Array.isArray(items)) return undefined
  return items.flatMap((v): RecentItem[] => {
    const o = obj(v), t = trackOf(o?.track)
    // a local file has no Web API representation: play and the queue cannot address it
    if (!t || t.uri!.startsWith('spotify:local:')) return []
    const ctx = str(obj(o?.context)?.uri)
    return [{ uri: t.uri!, title: t.title, artist: t.artist, durationMs: t.durationMs, ...(ctx && { contextUri: ctx }) }]
  })
}

export type PlaylistItem = { uri: string; name: string; owner: string; tracks: number }
// next is kept only on Spotify's own API host over https: the bearer token goes wherever it points.
export function parsePlaylists(text: string): { items: PlaylistItem[]; next?: string } | undefined {
  const o = obj(json(text))
  if (!o || !Array.isArray(o.items)) return undefined
  const items = o.items.flatMap((v): PlaylistItem[] => {
    const p = obj(v), uri = str(p?.uri)
    if (!p || !uri) return []
    const owner = obj(p.owner)
    // Spotify renamed the playlist's tracks field to items in 2026; either may come back
    return [{ uri, name: str(p.name), owner: str(owner?.display_name) || str(owner?.id), tracks: num(obj(p.items)?.total ?? obj(p.tracks)?.total) }]
  })
  const next = str(o.next)
  return { items, ...(next.startsWith(`${API}/`) && { next }) }
}

export type DeviceItem = { id: string; name: string; type: string; active: boolean }
// A restricted device has no id and cannot take playback, so it is left out.
export function parseDevices(text: string): DeviceItem[] | undefined {
  const d = obj(json(text))?.devices
  if (!Array.isArray(d)) return undefined
  return d.flatMap((v): DeviceItem[] => {
    const o = obj(v), id = str(o?.id)
    return o && id ? [{ id, name: str(o.name), type: str(o.type), active: o.is_active === true }] : []
  })
}

export type ApiError =
  // a network error, or no answer within the 5 s timeout
  | { kind: 'offline' }
  // the same endpoint still has a request out
  | { kind: 'busy' }
  // a 429: nothing goes out before untilMs
  | { kind: 'rate'; untilMs: number }
  // a 401 after a refresh, or the refresh token refused: the person must connect again
  | { kind: 'reconnect' }
  | { kind: 'premium' }
  | { kind: 'noDevice' }
  | { kind: 'refused'; reason: string; status: number }
  | { kind: 'server'; status: number }

// Spotify's error.reason tells PREMIUM_REQUIRED and NO_ACTIVE_DEVICE from other 403s and 404s.
export function apiError(status: number, text: string, headers: Record<string, string>, now: number): ApiError {
  if (status === 429) {
    const s = Number(headers['retry-after'])
    return { kind: 'rate', untilMs: now + (Number.isFinite(s) && s > 0 ? s : 5) * 1000 }
  }
  if (status >= 500) return { kind: 'server', status }
  if (status === 401) return { kind: 'reconnect' }
  const reason = str(obj(obj(json(text))?.error)?.reason)
  if (status === 403 && reason === 'PREMIUM_REQUIRED') return { kind: 'premium' }
  if (status === 404 && reason === 'NO_ACTIVE_DEVICE') return { kind: 'noDevice' }
  return { kind: 'refused', reason: reason || String(status), status }
}
