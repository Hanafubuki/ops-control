// The Web API client: the bearer token, one refresh and retry on a 401, Retry-After, and one request per endpoint in flight.
import type { Host } from '../host.ts'
import type { OpenMusic } from './parse.ts'
import type { TokenKeeper } from './tokens.ts'
import { apiError, commandRequest, parsePlayer, parsePlaylists, parseQueue, playerRequest, playlistsRequest, queueRequest, type ApiError, type ApiRequest, type PlaylistItem } from './webapi.ts'

export const API_TIMEOUT_MS = 5000
export type ApiAnswer = { ok: true; status: number; text: string; at: number } | { ok: false; error: ApiError }

export class SpotifyClient {
  private inFlight = new Set<string>()
  private until = 0
  // false once a write answered PREMIUM_REQUIRED: transport then goes through the local app for the session
  premium = true
  // set for the whole of a skipTo: a second one would read a queue the first is still consuming
  skipping = false
  constructor(private host: Host, private keeper: TokenKeeper, private now: () => number) {}

  async send(r: ApiRequest): Promise<ApiAnswer> {
    if (this.now() < this.until) return { ok: false, error: { kind: 'rate', untilMs: this.until } }
    const key = `${r.method} ${r.url.split('?')[0]}`
    if (this.inFlight.has(key)) return { ok: false, error: { kind: 'busy' } }
    this.inFlight.add(key)
    // The key is held until the engine's request ends, not until the answer: Host.fetch rejects at the timeout but
    // cannot abort it, and a dead endpoint would otherwise get a new request every 5 s without bound.
    let open = 1
    const hold = () => { open++; let done = false; return () => { if (!done && !--open) this.inFlight.delete(key); done = true } }
    try { return await this.authorized(r, hold) } finally { if (!--open) this.inFlight.delete(key) }
  }

  private async authorized(r: ApiRequest, hold: () => () => void): Promise<ApiAnswer> {
    const first = await this.keeper.access(this.now())
    if ('error' in first) return { ok: false, error: first.error === 'failed' ? { kind: 'offline' } : { kind: 'reconnect' } }
    let res = await this.fetch(r, first.token, hold())
    if (res?.status === 401) {
      const again = await this.keeper.access(this.now(), first.token)
      if ('error' in again) return { ok: false, error: again.error === 'failed' ? { kind: 'offline' } : { kind: 'reconnect' } }
      res = await this.fetch(r, again.token, hold())
    }
    if (!res) return { ok: false, error: { kind: 'offline' } }
    if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status, text: res.text, at: this.now() }
    const error = apiError(res.status, res.text, res.headers, this.now())
    if (error.kind === 'rate') this.until = error.untilMs
    if (error.kind === 'premium') this.premium = false
    if (error.kind === 'reconnect') this.keeper.lost()
    return { ok: false, error }
  }

  private fetch(r: ApiRequest, token: string, onSettled: () => void) {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, ...(r.body !== undefined && { 'Content-Type': 'application/json' }) }
    return this.host.fetch(r.url, { method: r.method, headers, ...(r.body !== undefined && { body: r.body }), timeoutMs: API_TIMEOUT_MS, onSettled }).catch(() => undefined)
  }
}

// music absent is a 204: nothing is active on any device.
export type PlayerRead = { ok: true; at: number; music?: OpenMusic } | { ok: false; error: ApiError }
export async function readPlayer(c: SpotifyClient): Promise<PlayerRead> {
  const a = await c.send(playerRequest())
  if (!a.ok) return a
  if (a.status === 204 || !a.text.trim()) return { ok: true, at: a.at }
  const music = parsePlayer(a.text, a.at)
  return music ? { ok: true, at: a.at, music } : { ok: false, error: { kind: 'server', status: a.status } }
}

export const SKIP_MAX = 20
// 20 pages of 50: past a thousand playlists the list stops rather than polling on
export const PLAYLIST_PAGES = 20

export async function allPlaylists(c: SpotifyClient): Promise<{ ok: true; items: PlaylistItem[] } | { ok: false; error: ApiError }> {
  const items: PlaylistItem[] = []
  let next: string | undefined
  for (let page = 0; page < PLAYLIST_PAGES; page++) {
    const a = await c.send(playlistsRequest(next))
    if (!a.ok) return a
    const p = parsePlaylists(a.text)
    if (!p) return { ok: false, error: { kind: 'server', status: a.status } }
    items.push(...p.items)
    if (!p.next) break
    next = p.next
  }
  return { ok: true, items }
}

// busy: another skipTo or queue read was still out, so nothing was skipped; far: the target is SKIP_MAX or more down
export type SkipResult = { kind: 'done' } | { kind: 'gone' } | { kind: 'far' } | { kind: 'busy' } | { kind: 'error'; error: ApiError }
// The Web API cannot jump within the queue, only skip: so skipTo carries the target's URI, not an index,
// re-reads the queue (it may have moved since the list was drawn) and sends next until the target plays.
export async function skipTo(c: SpotifyClient, uri: string): Promise<SkipResult> {
  if (c.skipping) return { kind: 'busy' }
  c.skipping = true
  try {
    const q = await c.send(queueRequest())
    if (!q.ok) return q.error.kind === 'busy' ? { kind: 'busy' } : { kind: 'error', error: q.error }
    const queue = parseQueue(q.text)
    if (!queue) return { kind: 'error', error: { kind: 'server', status: q.status } }
    const at = queue.findIndex(t => t.uri === uri)
    if (at < 0) return { kind: 'gone' }
    // a capped run would stop on some other track
    if (at >= SKIP_MAX) return { kind: 'far' }
    const next = commandRequest({ cmd: 'next' }, true)!
    for (let i = 0; i <= at; i++) {
      // awaited one by one: Spotify applies them in order, and a refusal (an ad, a restriction) stops the rest
      const r = await c.send(next)
      if (!r.ok) return { kind: 'error', error: r.error }
    }
    return { kind: 'done' }
  } finally { c.skipping = false }
}
