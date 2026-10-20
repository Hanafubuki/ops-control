// The Spotify token file. Only glowup-installer writes it (spotify-login, -refresh and -logout), so its mode
// stays 0600; this side reads it and asks the helper for a refresh.
import type { Host } from '../host.ts'
import { needsRefresh } from './webapi.ts'

export const TOKENS_FORMAT = 1
export type Tokens = { format: number; clientId: string; accessToken: string; refreshToken: string; expiresAt: number; scope: string; connectedAt: number; gen: number }
export type TokenRead = { ok: true; tokens: Tokens } | { ok: false; why: 'missing' | 'newer' | 'damaged' }
export const tokenFile = (configDir: string) => `${configDir}/ops-control/spotify.json`
// spotify-login polls this for an address pasted into the dialog. One file per login: a cancelled login's helper
// lives on for minutes and would otherwise consume the next login's address. session is random per ops-control process,
// since the engine exposes no pid and two sessions (or a crashed one's helper) must not share a name.
export const pasteFile = (configDir: string, session: string, seq: number) => `${configDir}/ops-control/spotify-paste-${session}-${seq}`

export async function readTokens(host: Host, path: string): Promise<TokenRead> {
  let text: string
  try { text = await host.readFile(path) } catch { return { ok: false, why: 'missing' } }
  let o: Record<string, unknown>
  try { o = JSON.parse(text) } catch { return { ok: false, why: 'damaged' } }
  if (!o || typeof o !== 'object') return { ok: false, why: 'damaged' }
  // spotify-login writes over whatever file is there, so connect's refusal of a newer file lives here; spotify-refresh refuses one itself.
  if (typeof o.format === 'number' && o.format > TOKENS_FORMAT) return { ok: false, why: 'newer' }
  const s = (v: unknown): v is string => typeof v === 'string' && v !== ''
  const n = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  if (o.format !== TOKENS_FORMAT || !s(o.clientId) || !s(o.accessToken) || !s(o.refreshToken) || !n(o.expiresAt)) return { ok: false, why: 'damaged' }
  return { ok: true, tokens: { format: TOKENS_FORMAT, clientId: o.clientId, accessToken: o.accessToken, refreshToken: o.refreshToken, expiresAt: o.expiresAt, scope: typeof o.scope === 'string' ? o.scope : '', connectedAt: n(o.connectedAt) ? o.connectedAt : 0, gen: n(o.gen) ? o.gen : 0 } }
}

// Runs `spotify-refresh --if-gen gen` and resolves its exit code: 0 refreshed (by this run or a racing one), 3 refused.
export type Refresher = (gen: number) => Promise<number>
export type Access = { token: string } | { error: 'none' | 'newer' | 'damaged' | 'reconnect' | 'failed' }

export class TokenKeeper {
  private tokens: Tokens | undefined
  private state: 'ok' | 'none' | 'newer' | 'damaged' | 'reconnect' = 'none'
  private flight: Promise<Access> | undefined
  constructor(private host: Host, readonly path: string, private refresher: Refresher) {}

  async load(): Promise<TokenRead> {
    const r = await readTokens(this.host, this.path)
    this.tokens = r.ok ? r.tokens : undefined
    this.state = r.ok ? 'ok' : r.why === 'missing' ? 'none' : r.why
    return r
  }
  status() { return this.state }
  // Spotify answered 401 to a token that was just refreshed. A newer or damaged file found meanwhile keeps its own state.
  lost() { if (this.state === 'ok') this.state = 'reconnect' }

  // A token to send. It refreshes first in the token's last minute, or when rejected is the token Spotify just answered 401 to.
  async access(now: number, rejected?: string): Promise<Access> {
    const t = this.tokens
    if (this.state !== 'ok' || !t) return { error: this.state === 'ok' ? 'none' : this.state }
    const stale = rejected === undefined ? needsRefresh(t.expiresAt, now) : rejected === t.accessToken
    if (!stale) return { token: t.accessToken }
    // one refresh at a time in this session: callers that arrive meanwhile wait for the same one
    this.flight ??= this.refresh(t, now, rejected !== undefined).finally(() => { this.flight = undefined })
    return this.flight
  }

  private async refresh(t: Tokens, now: number, rejected: boolean): Promise<Access> {
    const code = await this.refresher(t.gen).catch(() => 1)
    // The helper is the only writer, so the file is the truth, even after exit 3: a racing session may have refreshed first.
    const again = await readTokens(this.host, this.path)
    if (again.ok && again.tokens.gen !== t.gen) { this.tokens = again.tokens; return { token: again.tokens.accessToken } }
    // replaced by a newer ops-control's file, or damaged, while the helper ran: stop spawning it
    if (!again.ok && again.why !== 'missing') { this.state = again.why; return { error: again.why } }
    if (code === 3) { this.state = 'reconnect'; return { error: 'reconnect' } }
    // offline, or the helper failed: the old token while it lasts, unless Spotify already refused it
    return !rejected && t.expiresAt > now ? { token: t.accessToken } : { error: 'failed' }
  }
}
