import type { Host } from '../host.ts'
import { LOOP_STATUS, MEDIA_CONTROL_READ, OSA_READ, PLAYERCTL_EXTRAS_FORMAT, PLAYERCTL_FORMAT, PLAYERCTL_LIST_FORMAT, osaGuarded, parseBusString, parseBusctl, parseBusctlExtras, parseMediaControl, parseMprisNames, parseOsascript, parsePlayerctl, parsePlayerctlExtras, parsePlayerctlList, pickPlayer, playerApp, type Music, type MusicCmd, type OpenMusic, type Repeat } from './parse.ts'
import { PS, PS_PROBE, SmtcWatcher, controlScript } from './smtc.ts'
import type { Art } from './art.ts'

export type Platform = 'linux' | 'mac' | 'windows'
// smtc: Windows' media sessions, any app's (Spotify, a browser tab), on Windows and from WSL; nowplaying: macOS's
// Now Playing, any app's, through media-control (brew install media-control). busctl and playerctl read every
// MPRIS player (Spotify, a browser tab, VLC…) where the bus lists them.
export type Backend = 'busctl' | 'playerctl' | 'osascript' | 'smtc' | 'nowplaying'
// anyPlayer: the reader sees every app that plays, not Spotify alone
export type MusicCaps = { repeat: Repeat[]; shuffle: boolean; raise: boolean; volume: boolean; anyPlayer?: boolean }
export const LINUX_HINT = 'Music needs busctl (systemd) or playerctl to show here.'
export const WINDOWS_HINT = 'Connect Spotify to use the player on Windows.'
const RUN_MS = 2000
// Windows PowerShell takes a second or more to start, more the first time
const PS_MS = 10_000

const BUS_NAME = 'org.mpris.MediaPlayer2.spotify', BUS_PATH = '/org/mpris/MediaPlayer2', PLAYER = 'org.mpris.MediaPlayer2.Player'
const destOf = (name: string) => [name, BUS_PATH, PLAYER]
const busRead = (name: string) => ['busctl', '--user', '--json=short', 'get-property', ...destOf(name), 'PlaybackStatus', 'Metadata', 'Position']
// get-property fails as a whole when one property is missing, so these are a second call the track does not depend on
const busExtras = (name: string) => ['busctl', '--user', '--json=short', 'get-property', ...destOf(name), 'Shuffle', 'LoopStatus', 'Volume']
export const BUS_EXTRAS = busExtras(BUS_NAME)
// the players on the bus, and one's state; a bus that cannot list them leaves the reader on Spotify alone
export const BUS_LIST = ['busctl', '--user', '--json=short', 'call', 'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'ListNames']
const busStatus = (name: string) => ['busctl', '--user', '--json=short', 'get-property', ...destOf(name), 'PlaybackStatus']
const busIdentity = (name: string) => ['busctl', '--user', '--json=short', 'get-property', name, BUS_PATH, 'org.mpris.MediaPlayer2', 'Identity']
const pctl = (player: string) => ['playerctl', `--player=${player}`]
const PCTL = pctl('spotify')
export const PCTL_EXTRAS = [...PCTL, 'metadata', '--format', PLAYERCTL_EXTRAS_FORMAT]
export const PCTL_LIST = ['playerctl', '-a', 'metadata', '--format', PLAYERCTL_LIST_FORMAT]
// players asked for their state each read: a busy desktop has a handful
const MAX_PLAYERS = 8
const BUS_CMD = { playpause: 'PlayPause', next: 'Next', previous: 'Previous' } as const
const PCTL_CMD = { playpause: 'play-pause', next: 'next', previous: 'previous' } as const
const OSA_CMD = { playpause: 'playpause', next: 'next track', previous: 'previous track' } as const
const NOW_CMD = { playpause: 'toggle-play-pause', next: 'next-track', previous: 'previous-track' } as const
const NOW_REPEAT: Record<Repeat, string> = { off: 'off', context: 'playlist', track: 'track' }
// media-control reads Now Playing through a helper of its own; the first read takes a moment
const NOW_MS = 5000

const works = (host: Host, argv: readonly string[], ms = RUN_MS) => host.run(argv, undefined, ms).then(r => r.exitCode === 0, () => false)
const secs = (ms: number) => (Math.max(0, ms) / 1000).toFixed(3)
const unit = (v: number) => Math.min(1, Math.max(0, v))

// wsl: Linux under WSL, where the apps that play (a browser, Spotify) are Windows ones and its own bus has none
export async function pickBackend(host: Host, platform: Platform, wsl = false): Promise<Backend | undefined> {
  // media-control sees every app's media; without it, Spotify through AppleScript
  if (platform === 'mac') return (await works(host, ['media-control', 'test'], NOW_MS)) ? 'nowplaying' : 'osascript'
  if ((platform === 'windows' || wsl) && await works(host, PS_PROBE, PS_MS)) return 'smtc'
  if (platform === 'windows') return undefined
  // busctl --json needs systemd 240; older builds pass a plain --version but fail every read.
  if (await works(host, ['busctl', '--json=short', '--version'])) return 'busctl'
  if (await works(host, ['playerctl', '--version'])) return 'playerctl'
  return undefined
}

export class MusicReader {
  private fails = 0
  private last: Music = { status: 'closed' }
  private smtc?: SmtcWatcher
  // the MPRIS player shown (a bus name for busctl, a player name for playerctl), and whether the bus lists players
  private bus = BUS_NAME
  private player = 'spotify'
  private listed = false
  private identities = new Map<string, string>()
  // changed: the smtc watcher heard a change, so the next read need not wait for the poll
  constructor(private backend: Backend | undefined, private platform: Platform, changed?: () => void) {
    if (backend === 'smtc') this.smtc = new SmtcWatcher(changed)
  }

  async read(host: Host, now: number): Promise<Music> {
    if (!this.backend) return { status: 'unsupported', hint: this.platform === 'windows' ? WINDOWS_HINT : LINUX_HINT }
    if (this.smtc) {
      // the watcher answers from what it last printed; until its first line the last state stays
      this.smtc.ensure(host, now)
      const m = this.smtc.music(now)
      if (m) this.last = m
      return this.last
    }
    let got: Music | undefined
    try { got = await this.once(host, now) } catch { got = undefined }
    if (got) { this.fails = 0; this.last = got; return got }
    // one slow or garbled read is noise; two in a row means the player is gone
    if (++this.fails >= 2) this.last = { status: 'closed' }
    return this.last
  }

  // undefined is a failed read; a closed player is a successful read of 'closed'
  private async once(host: Host, now: number): Promise<Music | undefined> {
    if (this.backend === 'busctl') {
      if (!(await this.pickBus(host))) return { status: 'closed' }
      const r = await host.run(busRead(this.bus), undefined, RUN_MS)
      if (r.exitCode !== 0) return { status: 'closed' }
      const m = parseBusctl(r.stdout, now)
      if (!m) return undefined
      const x = await host.run(busExtras(this.bus), undefined, RUN_MS).catch(() => undefined)
      return this.named({ ...m, ...(x?.exitCode === 0 ? parseBusctlExtras(x.stdout) : undefined) }, /spotify/i.test(this.bus) ? '' : await this.identity(host))
    }
    if (this.backend === 'playerctl') {
      if (!(await this.pickPlayerctl(host))) return { status: 'closed' }
      const r = await host.run([...pctl(this.player), 'metadata', '--format', PLAYERCTL_FORMAT], undefined, RUN_MS)
      if (r.exitCode !== 0) return { status: 'closed' }
      const m = parsePlayerctl(r.stdout, now)
      if (!m) return undefined
      const x = await host.run([...pctl(this.player), 'metadata', '--format', PLAYERCTL_EXTRAS_FORMAT], undefined, RUN_MS).catch(() => undefined)
      return this.named({ ...m, ...(x?.exitCode === 0 ? parsePlayerctlExtras(x.stdout) : undefined) }, playerApp(this.player))
    }
    if (this.backend === 'nowplaying') {
      const r = await host.run(MEDIA_CONTROL_READ, undefined, NOW_MS)
      return r.exitCode !== 0 ? undefined : parseMediaControl(r.stdout, now)
    }
    const r = await host.run(['osascript', '-e', OSA_READ], undefined, RUN_MS)
    return r.exitCode !== 0 ? undefined : parseOsascript(r.stdout, now)
  }

  // The player to read: false when the bus lists players and none is there. A bus that cannot list keeps Spotify.
  private async pickBus(host: Host): Promise<boolean> {
    const list = await host.run(BUS_LIST, undefined, RUN_MS).catch(() => undefined)
    if (list?.exitCode !== 0) { this.bus = BUS_NAME; return true }
    this.listed = true
    const names = parseMprisNames(list.stdout).slice(0, MAX_PLAYERS)
    if (!names.length) return false
    const players = await Promise.all(names.map(async name => {
      const r = await host.run(busStatus(name), undefined, RUN_MS).catch(() => undefined)
      return { name, status: (r?.exitCode === 0 ? parseBusString(r.stdout) : undefined) ?? '' }
    }))
    const p = pickPlayer(players.filter(x => x.status), this.bus)
    if (!p) return false
    this.bus = p.name
    return true
  }

  private async pickPlayerctl(host: Host): Promise<boolean> {
    const list = await host.run(PCTL_LIST, undefined, RUN_MS).catch(() => undefined)
    if (list?.exitCode !== 0) { this.player = 'spotify'; return true }
    this.listed = true
    const p = pickPlayer(parsePlayerctlList(list.stdout).slice(0, MAX_PLAYERS), this.player)
    if (!p) return false
    this.player = p.name
    return true
  }

  // The app's own name for itself (MPRIS Identity: "Google Chrome", "Mozilla Firefox"), asked once per player.
  private async identity(host: Host): Promise<string> {
    const known = this.identities.get(this.bus)
    if (known !== undefined) return known
    const r = await host.run(busIdentity(this.bus), undefined, RUN_MS).catch(() => undefined)
    const name = (r?.exitCode === 0 ? parseBusString(r.stdout) : undefined) || playerApp(this.bus)
    this.identities.set(this.bus, name)
    return name
  }

  // Spotify reads as it always has; another player carries its app's name for the header.
  private named(m: OpenMusic, app: string): OpenMusic {
    return /spotify/i.test(this.backend === 'busctl' ? this.bus : this.player) ? m : { ...m, app }
  }

  caps(): MusicCaps {
    if (this.smtc) {
      // what the session shown says it takes; Windows has no per-app volume here and cannot raise the app
      const s = this.smtc.current()
      return { repeat: s?.canRepeat ? ['off', 'context', 'track'] : [], shuffle: s?.canShuffle === true, raise: false, volume: false, anyPlayer: true }
    }
    if (this.backend === 'nowplaying') return { repeat: ['off', 'context', 'track'], shuffle: true, raise: false, volume: false, anyPlayer: true }
    // Spotify's Linux client ignores LoopStatus and Shuffle-on writes over MPRIS, and 1.2.74 ignored a Volume write (seen while paused), so busctl and playerctl offer none of them.
    const mac = this.backend === 'osascript'
    return { repeat: mac ? ['off', 'context'] : [], shuffle: mac, raise: this.backend === 'busctl' || this.backend === 'osascript', volume: mac, ...(this.listed && { anyPlayer: true }) }
  }

  // MPRIS SetPosition names the track it seeks in; it is the one the last read saw.
  private trackId(): string | undefined {
    return this.last.status === 'open' ? this.last.track?.id : undefined
  }

  argvFor(c: MusicCmd): string[] | undefined {
    if (this.smtc) {
      const s = this.smtc.current()
      if (!s) return undefined
      // the bar counts from the track's start; Windows seeks on its own timeline
      const script = controlScript(s.app, c.cmd === 'seek' ? { cmd: 'seek', ms: c.ms + s.startMs } : c)
      return script ? [...PS, script] : undefined
    }
    if (this.backend === 'busctl') {
      const dest = destOf(this.bus)
      const set = (prop: string, sig: string, v: string) => ['busctl', '--user', 'set-property', ...dest, prop, sig, v]
      switch (c.cmd) {
        case 'playpause': case 'next': case 'previous': return ['busctl', '--user', 'call', ...dest, BUS_CMD[c.cmd]]
        case 'raise': return ['busctl', '--user', 'call', this.bus, BUS_PATH, 'org.mpris.MediaPlayer2', 'Raise']
        case 'seek': { const id = this.trackId(); return id?.startsWith('/') ? ['busctl', '--user', 'call', ...dest, 'SetPosition', 'ox', id, String(Math.round(Math.max(0, c.ms) * 1000))] : undefined }
        case 'shuffle': return set('Shuffle', 'b', String(c.on))
        case 'repeat': return set('LoopStatus', 's', LOOP_STATUS[c.mode])
        case 'volume': return set('Volume', 'd', unit(c.level).toFixed(2))
      }
    }
    if (this.backend === 'playerctl') {
      const p = pctl(this.player)
      switch (c.cmd) {
        case 'playpause': case 'next': case 'previous': return [...p, PCTL_CMD[c.cmd]]
        case 'raise': return undefined
        case 'seek': return [...p, 'position', secs(c.ms)]
        case 'shuffle': return [...p, 'shuffle', c.on ? 'On' : 'Off']
        case 'repeat': return [...p, 'loop', LOOP_STATUS[c.mode]]
        case 'volume': return [...p, 'volume', unit(c.level).toFixed(2)]
      }
    }
    if (this.backend === 'nowplaying') {
      switch (c.cmd) {
        case 'playpause': case 'next': case 'previous': return ['media-control', NOW_CMD[c.cmd]]
        case 'seek': return ['media-control', 'seek', secs(c.ms)]
        case 'shuffle': return ['media-control', 'shuffle', c.on ? 'tracks' : 'off']
        case 'repeat': return ['media-control', 'repeat', NOW_REPEAT[c.mode]]
        default: return undefined
      }
    }
    if (this.backend === 'osascript') {
      const verb = c.cmd === 'playpause' || c.cmd === 'next' || c.cmd === 'previous' ? OSA_CMD[c.cmd]
        : c.cmd === 'raise' ? 'activate'
        : c.cmd === 'seek' ? `set player position to ${secs(c.ms)}`
        : c.cmd === 'shuffle' ? `set shuffling to ${c.on}`
        : c.cmd === 'repeat' ? `set repeating to ${c.mode !== 'off'}`
        : c.cmd === 'volume' ? `set sound volume to ${Math.round(unit(c.level) * 100)}`
        : undefined
      if (!verb) return undefined
      return ['osascript', '-e', `if application "Spotify" is running then run script ${osaGuarded(`tell application "Spotify" to ${verb}`)}`]
    }
    return undefined
  }

  async control(host: Host, cmd: MusicCmd): Promise<void> {
    const argv = this.argvFor(cmd)
    if (argv) await host.run(argv, undefined, this.smtc ? PS_MS : this.backend === 'nowplaying' ? NOW_MS : RUN_MS).catch(() => undefined)
  }

  // a cover the smtc watcher read, by the artUrl the track carries
  art(url: string): Art | undefined { return this.smtc?.art(url) }

  // ends the smtc watcher; the other backends hold nothing open
  stop() { this.smtc?.stop() }
}
