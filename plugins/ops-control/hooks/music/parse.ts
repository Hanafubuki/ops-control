// JSX-free and engine-free: parsers only, so they test on recorded output.
export type Repeat = 'off' | 'context' | 'track'
export type Track = { id: string; title: string; artist: string; album: string; durationMs: number; artUrl?: string; url?: string; uri?: string }
export type Device = { id: string; name: string; type: string; isThisComputer: boolean }
export type QueueItem = { uri: string; title: string; artist: string; durationMs: number }
// shuffle, repeat and volume (0..1) are absent when the player did not report them, and their controls hide.
// source, device, liked and upNext are set only while Spotify is connected: source is api while the Web API
// answered within two polls, local while ops-control falls back to the app on this computer.
export type OpenMusic = {
  status: 'open'; track?: Track; playing: boolean; ad: boolean; progressMs: number; readAt: number; shuffle?: boolean; repeat?: Repeat; volume?: number
  source?: 'api' | 'local'; device?: Device; liked?: boolean; upNext?: QueueItem
  // set with source local when progressMs was raised above the local read's own position: that raw position
  held?: number
  // the app playing, where the reader sees more than Spotify (Windows' media sessions): Spotify, Chrome, Edge…
  app?: string
}
export type Music = { status: 'closed' } | { status: 'unsupported'; hint: string } | OpenMusic
export type MusicCmd =
  | { cmd: 'playpause' | 'next' | 'previous' | 'raise' }
  | { cmd: 'seek'; ms: number }
  | { cmd: 'shuffle'; on: boolean }
  | { cmd: 'repeat'; mode: Repeat }
  | { cmd: 'volume'; level: number }
  | { cmd: 'like'; on: boolean }
  | { cmd: 'skipTo'; uri: string }
  | { cmd: 'play'; uri: string }
  // offset starts the context at that track, so what follows it is what followed it when it last played
  | { cmd: 'playContext'; uri: string; offset?: string }
  | { cmd: 'transfer'; deviceId: string }
export type Extras = Pick<OpenMusic, 'shuffle' | 'repeat' | 'volume'>

const isAd = (id: string) => id.startsWith('/com/spotify/ad/') || id.startsWith('spotify:ad:')
// A seek shows up as a read that disagrees with the extrapolated position by more than this.
export const SEEK_MS = 1500
// MPRIS names a track by object path; the Web API and AppleScript by spotify: URI
const uriOf = (id: string) => {
  const m = /^\/com\/spotify\/(track|episode|ad)\/([A-Za-z0-9]+)$/.exec(id)
  return m ? `spotify:${m[1]}:${m[2]}` : /^spotify:[a-z]+:[A-Za-z0-9]+$/.test(id) ? id : undefined
}
// MPRIS LoopStatus; context is Spotify's word for repeating the playlist or album
const LOOP: Record<string, Repeat> = { None: 'off', Playlist: 'context', Track: 'track' }
export const LOOP_STATUS: Record<Repeat, string> = { off: 'None', context: 'Playlist', track: 'Track' }
const unit = (v: number) => Math.min(1, Math.max(0, v))

function open(status: string, id: string, title: string, artist: string, album: string, durationMs: number, progressMs: number, readAt: number, links: { artUrl?: string; url?: string } = {}): OpenMusic {
  const base: OpenMusic = { status: 'open', playing: status.toLowerCase() === 'playing', ad: isAd(id), progressMs: Math.max(0, Math.round(progressMs)), readAt }
  if (!id && !title) return base
  const uri = uriOf(id)
  return { ...base, track: { id, title, artist, album, durationMs: Math.max(0, Math.round(durationMs)), ...(links.artUrl && { artUrl: links.artUrl }), ...(links.url && { url: links.url }), ...(uri && { uri }) } }
}

// Each value the player left out stays absent, so one unsupported property hides one control.
function extrasOf(shuffle: unknown, loop: unknown, volume: unknown): Extras {
  const sh = shuffle === true || shuffle === 'true' ? true : shuffle === false || shuffle === 'false' ? false : undefined
  const rp = typeof loop === 'string' && Object.hasOwn(LOOP, loop) ? LOOP[loop] : undefined
  const vo = typeof volume === 'number' ? volume : typeof volume === 'string' && volume.trim() !== '' ? Number(volume) : NaN
  return { ...(sh !== undefined && { shuffle: sh }), ...(rp && { repeat: rp }), ...(Number.isFinite(vo) && { volume: unit(vo) }) }
}

const jsonLines = (stdout: string) => stdout.trim().split('\n').map(l => { try { return JSON.parse(l) as { data?: unknown } } catch { return undefined } })

// busctl get-property with PlaybackStatus Metadata Position prints one JSON value per line; MPRIS times are µs.
export function parseBusctl(stdout: string, readAt: number): OpenMusic | undefined {
  const vals = jsonLines(stdout)
  if (vals.length !== 3 || vals.some(v => !v || typeof v !== 'object')) return undefined
  const [status, meta, pos] = vals as { data?: unknown }[]
  if (typeof status!.data !== 'string' || !meta!.data || typeof meta!.data !== 'object') return undefined
  const md = meta!.data as Record<string, { data?: unknown } | undefined>
  const str = (k: string) => (typeof md[k]?.data === 'string' ? md[k]!.data as string : '')
  const list = (k: string) => (Array.isArray(md[k]?.data) ? (md[k]!.data as unknown[]).filter(x => typeof x === 'string').join(', ') : str(k))
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  return open(status!.data, str('mpris:trackid'), str('xesam:title'), list('xesam:artist'), str('xesam:album'), num(md['mpris:length']?.data) / 1000, num(pos!.data) / 1000, readAt,
    { artUrl: str('mpris:artUrl'), url: str('xesam:url') })
}

// The second read, of Shuffle LoopStatus Volume: undefined unless it printed all three lines.
export function parseBusctlExtras(stdout: string): Extras | undefined {
  const vals = jsonLines(stdout)
  if (vals.length !== 3) return undefined
  return extrasOf(vals[0]?.data, vals[1]?.data, vals[2]?.data)
}

export const PLAYERCTL_FORMAT = ['{{status}}', '{{mpris:trackid}}', '{{xesam:title}}', '{{xesam:artist}}', '{{xesam:album}}', '{{mpris:length}}', '{{position}}', '{{mpris:artUrl}}', '{{xesam:url}}'].join('\t')
// Its own call: a playerctl that does not know one of these must not fail the metadata read.
export const PLAYERCTL_EXTRAS_FORMAT = '{{shuffle}}\t{{loop}}\t{{volume}}'

export function parsePlayerctl(stdout: string, readAt: number): OpenMusic | undefined {
  const f = stdout.replace(/\n$/, '').split('\t')
  if (f.length !== 7 && f.length !== 9) return undefined
  return open(f[0]!, f[1]!, f[2]!, f[3]!, f[4]!, (Number(f[5]) || 0) / 1000, (Number(f[6]) || 0) / 1000, readAt, { artUrl: f[7], url: f[8] })
}

export function parsePlayerctlExtras(stdout: string): Extras | undefined {
  const f = stdout.replace(/\n$/, '').split('\t')
  return f.length === 3 ? extrasOf(f[0], f[1], f[2]) : undefined
}

// AppleScript compiles every `tell application "Spotify"` in a script before it runs, which launches
// the app or, with Spotify not installed, shows a "Where is Spotify?" chooser. Keeping the tell inside
// `run script` defers that compilation until the `is running` check has passed.
export const osaGuarded = (inner: string) => `"${inner.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`

// Spotify's duration is ms, its player position seconds; a comma-decimal locale prints "73,8".
// The last four fields sit in try blocks: a Spotify without one of them leaves it empty, not the read failed.
export const OSA_READ = [
  'if application "Spotify" is running then',
  `  return run script ${osaGuarded([
    'tell application "Spotify"',
    '  try',
    '    set t to current track',
    '  on error',
    '    return "open"',
    '  end try',
    '  set sh to ""',
    '  set rp to ""',
    '  set vo to ""',
    '  set au to ""',
    '  try',
    '    set sh to (shuffling as string)',
    '  end try',
    '  try',
    '    set rp to (repeating as string)',
    '  end try',
    '  try',
    '    set vo to (sound volume as string)',
    '  end try',
    '  try',
    '    set au to (artwork url of t)',
    '  end try',
    '  return (player state as string) & tab & (id of t) & tab & (name of t) & tab & (artist of t) & tab & (album of t) & tab & (duration of t) & tab & (player position as string) & tab & sh & tab & rp & tab & vo & tab & au',
    'end tell',
  ].join('\n'))}`,
  'end if',
  'return "closed"',
].join('\n')

const trackUrl = (id: string) => { const m = /^spotify:track:([A-Za-z0-9]+)$/.exec(id); return m ? `https://open.spotify.com/track/${m[1]}` : undefined }

export function parseOsascript(stdout: string, readAt: number): Music | undefined {
  const s = stdout.replace(/\n$/, '')
  if (s === 'closed') return { status: 'closed' }
  if (s === 'open') return { status: 'open', playing: false, ad: false, progressMs: 0, readAt }
  const f = s.split('\t')
  if (f.length !== 7 && f.length !== 11) return undefined
  const m = open(f[0]!, f[1]!, f[2]!, f[3]!, f[4]!, Number(f[5]) || 0, (Number(f[6]!.replace(',', '.')) || 0) * 1000, readAt, { artUrl: f[10], url: trackUrl(f[1]!) })
  if (f.length === 7) return m
  // AppleScript repeat is on or off; on repeats the context
  const rp = f[8] === 'true' ? 'context' : f[8] === 'false' ? 'off' : undefined
  return { ...m, ...extrasOf(f[7], undefined, f[9] === '' ? '' : String(Number(f[9]) / 100)), ...(rp && { repeat: rp }) }
}

export function extrapolate(progressMs: number, readAt: number, durationMs: number, playing: boolean, now: number): number {
  const at = playing ? progressMs + Math.max(0, now - readAt) : progressMs
  return durationMs > 0 ? Math.min(at, durationMs) : at
}

export const progressAt = (m: OpenMusic, now: number): number => extrapolate(m.progressMs, m.readAt, m.track?.durationMs ?? 0, m.playing, now)

// True when a redraw would show nothing new: same state and track, and progress where the clock put it.
export function sameMusic(a: Music | undefined, b: Music, now: number): boolean {
  if (!a || a.status !== b.status) return false
  if (a.status === 'unsupported') return b.status === 'unsupported' && a.hint === b.hint
  if (a.status === 'closed' || b.status !== 'open') return true
  const o = a as OpenMusic
  return o.playing === b.playing && o.ad === b.ad && o.shuffle === b.shuffle && o.repeat === b.repeat && o.volume === b.volume && o.app === b.app
    && o.source === b.source && o.liked === b.liked && o.upNext?.uri === b.upNext?.uri && JSON.stringify(o.device) === JSON.stringify(b.device)
    && JSON.stringify(o.track) === JSON.stringify(b.track) && Math.abs(progressAt(o, now) - progressAt(b, now)) <= SEEK_MS
}

// ---- any player, not Spotify alone ----

// busctl's ListNames answer: the MPRIS players among the bus names, in the order the bus gave them.
export function parseMprisNames(stdout: string): string[] {
  try {
    const o = JSON.parse(stdout) as { data?: unknown }
    const names = Array.isArray(o.data) && Array.isArray(o.data[0]) ? o.data[0] as unknown[] : []
    return names.filter((n): n is string => typeof n === 'string' && n.startsWith('org.mpris.MediaPlayer2.'))
  } catch { return [] }
}

// A single string property read with busctl get-property --json=short: {"type":"s","data":"Playing"}.
export function parseBusString(stdout: string): string | undefined {
  try { const o = JSON.parse(stdout.trim()) as { data?: unknown }; return typeof o.data === 'string' ? o.data : undefined } catch { return undefined }
}

export const PLAYERCTL_LIST_FORMAT = '{{playerName}}\t{{status}}'
// playerctl -a metadata with the list format: one line per player, name and status.
export function parsePlayerctlList(stdout: string): { name: string; status: string }[] {
  return stdout.split('\n').flatMap(l => {
    const [name, status] = l.split('\t')
    return name?.trim() && status !== undefined ? [{ name: name.trim(), status: status.trim() }] : []
  })
}

// Which player to show: one playing, else one paused, else the first. Among equals the one shown last stays, then
// Spotify; so a paused browser tab does not take the place of the song playing.
export function pickPlayer<T extends { name: string; status: string }>(players: readonly T[], last?: string): T | undefined {
  const rank = (p: T) => (/^playing$/i.test(p.status) ? 0 : /^paused$/i.test(p.status) ? 1 : 2)
  const tie = (p: T) => (p.name === last ? 0 : /spotify/i.test(p.name) ? 1 : 2)
  return [...players].sort((a, b) => rank(a) - rank(b) || tie(a) - tie(b))[0]
}

// A player's name as people say it: chromium.instance1234 is Chromium, org.mpris.MediaPlayer2.firefox Firefox.
export function playerApp(name: string): string {
  const base = name.replace(/^org\.mpris\.MediaPlayer2\./, '').replace(/\.instance_?\d+(_\d+)?$/, '').split('.')[0]!
  const known: Record<string, string> = { spotify: 'Spotify', chromium: 'Chromium', chrome: 'Chrome', firefox: 'Firefox', brave: 'Brave', vlc: 'VLC', mpv: 'mpv', edge: 'Edge', msedge: 'Edge', vivaldi: 'Vivaldi', rhythmbox: 'Rhythmbox', elisa: 'Elisa', strawberry: 'Strawberry', plasma_browser_integration: 'Browser' }
  return known[base.toLowerCase()] ?? (base ? base[0]!.toUpperCase() + base.slice(1) : name)
}

// macOS Now Playing through media-control (brew install media-control): `get --micros --no-artwork` prints one
// JSON object, or null with nothing playing. Times are µs; elapsedTime holds at timestamp, not now.
export const MEDIA_CONTROL_READ = ['media-control', 'get', '--micros', '--no-artwork']
const BUNDLE_APP: Record<string, string> = {
  'com.spotify.client': 'Spotify', 'com.apple.Music': 'Music', 'com.apple.podcasts': 'Podcasts', 'com.apple.TV': 'TV', 'com.apple.Safari': 'Safari',
  'com.google.Chrome': 'Chrome', 'org.mozilla.firefox': 'Firefox', 'com.microsoft.edgemac': 'Edge', 'com.brave.Browser': 'Brave', 'company.thebrowser.Browser': 'Arc',
  'com.operasoftware.Opera': 'Opera', 'com.vivaldi.Vivaldi': 'Vivaldi', 'com.colliderli.iina': 'IINA', 'org.videolan.vlc': 'VLC',
}
export const bundleApp = (id: string) => BUNDLE_APP[id] ?? (id.split('.').at(-1) ?? id).replace(/^./, c => c.toUpperCase())

export function parseMediaControl(stdout: string, readAt: number): Music | undefined {
  const s = stdout.trim()
  if (s === 'null' || s === '') return { status: 'closed' }
  let o: Record<string, unknown>
  try { o = JSON.parse(s) as Record<string, unknown> } catch { return undefined }
  if (!o || typeof o !== 'object') return undefined
  const str = (k: string) => (typeof o[k] === 'string' ? o[k] as string : '')
  const num = (k: string) => (typeof o[k] === 'number' && Number.isFinite(o[k]) ? o[k] as number : 0)
  const playing = o.playing === true
  // the position at timestamp, carried on to the read when playing
  const at = num('timestampEpochMicros') / 1000, held = num('elapsedTimeMicros') / 1000
  const progress = playing && at > 0 && at <= readAt ? held + (readAt - at) : held
  const app = bundleApp(str('parentApplicationBundleIdentifier') || str('bundleIdentifier'))
  const id = str('contentItemIdentifier') || str('uniqueIdentifier') || `${str('title')}\t${str('artist')}`
  const m = open(playing ? 'playing' : 'paused', id, str('title'), str('artist'), str('album'), num('durationMicros') / 1000, progress, readAt)
  const shuffle = num('shuffleMode'), repeat = num('repeatMode')
  return {
    ...m, ...(app && { app }), ad: o.isAdvertisement === true,
    ...(shuffle > 0 && { shuffle: shuffle > 1 }), ...(repeat > 0 && { repeat: repeat === 2 ? 'track' as const : repeat === 3 ? 'context' as const : 'off' as const }),
  }
}
