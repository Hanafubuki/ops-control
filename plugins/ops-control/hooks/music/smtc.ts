// What any app on Windows is playing (a YouTube tab in Chrome or Edge, Spotify, a media player), read from the
// system's media sessions, the ones the volume flyout and the media keys use. On WSL as on Windows itself it runs
// Windows PowerShell, which reaches them; PowerShell 7 does not.
//
// One PowerShell process watches and prints a JSON line when something changes; it ends itself after a few
// minutes or when nobody reads its output, and the next read starts another. Play, skip and seek are a run each.
// The scripts are plain text on the command line, single-quoted throughout: Windows quotes an argument with ".
import type { Host, Spawned } from '../host.ts'
import { fromBase64Url } from '../link.ts'
import type { Art } from './art.ts'
import type { MusicCmd, OpenMusic, Repeat } from './parse.ts'

export const PS = ['powershell.exe', '-NoLogo', '-NoProfile', '-NonInteractive', '-Command'] as const
export const PS_PROBE = [...PS, 'exit 0']
export const SMTC_HINT = 'Windows did not say what is playing.'
// a cover the watcher read, by its session's key
export const SMTC_ART = 'smtc-art:'
// the side, in pixels, of the square the watcher cuts from a session's picture
export const ART_SIDE = 32

const PRELUDE = [
  "$ErrorActionPreference = 'Stop'",
  // UTF-8 without a byte order mark, whatever the console's code page: titles are any language
  '$out = New-Object System.IO.StreamWriter -ArgumentList ([Console]::OpenStandardOutput()), (New-Object System.Text.UTF8Encoding -ArgumentList $false)',
  '$out.AutoFlush = $true',
  'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
  "$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]",
  'function Await($op, [Type]$type) { $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); if ($task.Wait(3000)) { $task.Result } else { $null } }',
  '$MgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]',
  '$mgr = Await ($MgrType::RequestAsync()) $MgrType',
]

// The picture as RGB bytes, the centre square scaled to ART_SIDE: the format art.ts reads.
const ART_FN = [
  'function Art($props) { try {',
  'if ($null -eq $props.Thumbnail) { return $null };',
  '$ras = Await ($props.Thumbnail.OpenReadAsync()) $StreamType; if ($null -eq $ras) { return $null };',
  // the stream comes back as a bare COM object PowerShell cannot call into; the extension method, invoked by
  // reflection, takes it as the interface it is
  "$st = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStream', [Type[]]@($RasType)).Invoke($null, @($ras)); $bmp = New-Object System.Drawing.Bitmap -ArgumentList $st;",
  `$side = [Math]::Min($bmp.Width, $bmp.Height); $n = ${ART_SIDE}; $small = New-Object System.Drawing.Bitmap -ArgumentList $n, $n;`,
  '$g = [System.Drawing.Graphics]::FromImage($small); $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;',
  '$g.DrawImage($bmp, (New-Object System.Drawing.Rectangle -ArgumentList 0, 0, $n, $n), (New-Object System.Drawing.Rectangle -ArgumentList ([int](($bmp.Width - $side) / 2)), ([int](($bmp.Height - $side) / 2)), $side, $side), [System.Drawing.GraphicsUnit]::Pixel); $g.Dispose();',
  '$bytes = New-Object byte[] ($n * $n * 3); $k = 0;',
  'for ($y = 0; $y -lt $n; $y++) { for ($x = 0; $x -lt $n; $x++) { $px = $small.GetPixel($x, $y); $bytes[$k] = $px.R; $bytes[$k + 1] = $px.G; $bytes[$k + 2] = $px.B; $k += 3 } };',
  "$small.Dispose(); $bmp.Dispose(); $st.Dispose(); [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')",
  '} catch { $null } }',
].join(' ')

// k s: the sessions, printed when they change; k a: a session's picture, once per track; k h: a beat every 5 s,
// so a reader that went away is noticed (the write fails and the script stops).
export const WATCH_SCRIPT = [
  ...PRELUDE,
  'Add-Type -AssemblyName System.Drawing',
  '$PropType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media.Control,ContentType=WindowsRuntime]',
  '$StreamType = [Windows.Storage.Streams.IRandomAccessStreamWithContentType,Windows.Storage.Streams,ContentType=WindowsRuntime]',
  '$RasType = [Windows.Storage.Streams.IRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]',
  ART_FN,
  "$arts = @{}; $last = ''; $beat = [DateTime]::UtcNow; $until = [DateTime]::UtcNow.AddMinutes(5)",
  [
    'while ([DateTime]::UtcNow -lt $until) {',
    "$cur = $mgr.GetCurrentSession(); $curId = ''; if ($null -ne $cur) { $curId = $cur.SourceAppUserModelId };",
    '$list = @(foreach ($s in $mgr.GetSessions()) {',
    '$props = Await ($s.TryGetMediaPropertiesAsync()) $PropType; if ($null -eq $props) { continue };',
    '$info = $s.GetPlaybackInfo(); $tl = $s.GetTimelineProperties(); $ctl = $info.Controls; $app = $s.SourceAppUserModelId;',
    "$key = $app + '|' + $props.Title + '|' + $props.Artist;",
    `if ($props.Title -and -not $arts.ContainsKey($key)) { $arts[$key] = 1; $a = Art $props; if ($a) { $out.WriteLine((ConvertTo-Json -Compress -InputObject ([ordered]@{ k = 'a'; key = $key; w = ${ART_SIDE}; h = ${ART_SIDE}; rgb = $a }))) } };`,
    '[ordered]@{ app = $app; cur = ($app -eq $curId); st = [string]$info.PlaybackStatus; ti = $props.Title; ar = $props.Artist; al = $props.AlbumTitle;',
    'pos = [long]$tl.Position.TotalMilliseconds; start = [long]$tl.StartTime.TotalMilliseconds; end = [long]$tl.EndTime.TotalMilliseconds; upd = $tl.LastUpdatedTime.ToUnixTimeMilliseconds();',
    'sh = $info.IsShuffleActive; rp = [string]$info.AutoRepeatMode; pp = $ctl.IsPlayPauseToggleEnabled; nx = $ctl.IsNextEnabled; pv = $ctl.IsPreviousEnabled;',
    'sk = $ctl.IsPlaybackPositionEnabled; she = $ctl.IsShuffleEnabled; rpe = $ctl.IsRepeatEnabled }',
    '});',
    "$json = ConvertTo-Json -Compress -Depth 4 -InputObject ([ordered]@{ k = 's'; s = $list });",
    'if ($json -ne $last) { $out.WriteLine($json); $last = $json; $beat = [DateTime]::UtcNow }',
    "elseif (([DateTime]::UtcNow - $beat).TotalSeconds -ge 5) { $out.WriteLine((ConvertTo-Json -Compress -InputObject ([ordered]@{ k = 'h' }))); $beat = [DateTime]::UtcNow };",
    'Start-Sleep -Milliseconds 1000',
    '}',
  ].join(' '),
].join('; ')

// An app id goes into a single-quoted PowerShell string: ids are letters, digits and . _ - ! + and spaces, and
// anything else is refused rather than escaped.
const SAFE_APP = /^[\w.!+\- ]{1,200}$/
const REPEAT_MODE: Record<Repeat, number> = { off: 0, track: 1, context: 2 }

export function controlScript(app: string, cmd: MusicCmd): string | undefined {
  if (!SAFE_APP.test(app)) return undefined
  const call = cmd.cmd === 'playpause' ? 'TryTogglePlayPauseAsync()'
    : cmd.cmd === 'next' ? 'TrySkipNextAsync()'
    : cmd.cmd === 'previous' ? 'TrySkipPreviousAsync()'
    // in 100 ns ticks
    : cmd.cmd === 'seek' ? `TryChangePlaybackPositionAsync([long]${Math.round(Math.max(0, cmd.ms)) * 10_000})`
    : cmd.cmd === 'shuffle' ? `TryChangeShuffleActiveAsync($${cmd.on ? 'true' : 'false'})`
    : cmd.cmd === 'repeat' ? `TryChangeAutoRepeatModeAsync(${REPEAT_MODE[cmd.mode]})`
    : undefined
  if (!call) return undefined
  return [
    ...PRELUDE,
    `$s = @($mgr.GetSessions() | Where-Object { $_.SourceAppUserModelId -eq '${app}' })[0]`,
    'if ($null -eq $s) { exit 3 }',
    `if (Await ($s.${call}) ([bool])) { exit 0 } else { exit 4 }`,
  ].join('; ')
}

export type SmtcSession = {
  app: string; current: boolean; status: string; title: string; artist: string; album: string
  posMs: number; startMs: number; endMs: number; updatedAt: number
  shuffle?: boolean; repeat?: Repeat
  canPlayPause: boolean; canNext: boolean; canPrevious: boolean; canSeek: boolean; canShuffle: boolean; canRepeat: boolean
}
export type SmtcLine = { kind: 'sessions'; sessions: SmtcSession[] } | { kind: 'art'; key: string; art: Art } | { kind: 'beat' }

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const REPEAT: Record<string, Repeat> = { None: 'off', Track: 'track', List: 'context' }

function readSession(raw: unknown): SmtcSession[] {
  if (!raw || typeof raw !== 'object') return []
  const o = raw as Record<string, unknown>
  const app = str(o.app)
  if (!app) return []
  const repeat = REPEAT[str(o.rp)]
  return [{
    app, current: o.cur === true, status: str(o.st), title: str(o.ti).trim(), artist: str(o.ar).trim(), album: str(o.al).trim(),
    posMs: num(o.pos), startMs: num(o.start), endMs: num(o.end), updatedAt: num(o.upd),
    ...(typeof o.sh === 'boolean' && { shuffle: o.sh }), ...(repeat && { repeat }),
    canPlayPause: o.pp === true, canNext: o.nx === true, canPrevious: o.pv === true, canSeek: o.sk === true, canShuffle: o.she === true, canRepeat: o.rpe === true,
  }]
}

export function parseSmtcLine(line: string): SmtcLine | undefined {
  let o: unknown
  try { o = JSON.parse(line.replace(/^﻿/, '')) } catch { return undefined }
  if (!o || typeof o !== 'object') return undefined
  const r = o as Record<string, unknown>
  if (r.k === 'h') return { kind: 'beat' }
  if (r.k === 's') return { kind: 'sessions', sessions: (Array.isArray(r.s) ? r.s : r.s ? [r.s] : []).flatMap(readSession) }
  if (r.k === 'a') {
    const key = str(r.key), w = r.w, h = r.h
    if (!key || typeof r.rgb !== 'string' || !Number.isInteger(w) || !Number.isInteger(h) || (w as number) <= 0 || (h as number) <= 0) return undefined
    let rgb: Uint8Array
    try { rgb = fromBase64Url(r.rgb) } catch { return undefined }
    return rgb.length === (w as number) * (h as number) * 3 ? { kind: 'art', key, art: { w: w as number, h: h as number, rgb } } : undefined
  }
  return undefined
}

export const sessionKey = (s: Pick<SmtcSession, 'app' | 'title' | 'artist'>) => `${s.app}|${s.title}|${s.artist}`

// What to show of several: what plays over what is paused; among those, the one shown last (two tabs playing
// do not take turns), then the one Windows calls current (the media keys' target), then Spotify. A session with
// no title (an app that registered and never played) is nothing.
export function pickSession(list: readonly SmtcSession[], keep?: string): SmtcSession | undefined {
  const named = list.filter(s => s.title && s.status !== 'Closed')
  const playing = named.filter(s => s.status === 'Playing')
  const pool = playing.length ? playing : named
  return pool.find(s => s.app === keep) ?? pool.find(s => s.current) ?? pool.find(s => /spotify/i.test(s.app)) ?? pool[0]
}

// Windows names an app by its model id: an exe name, a packaged app's family!entry, or a hash (Firefox's).
const APPS: [RegExp, string][] = [
  [/spotify/i, 'Spotify'], [/msedge/i, 'Edge'], [/chrome/i, 'Chrome'], [/firefox|^308046B0AF4A39CB$/i, 'Firefox'],
  [/brave/i, 'Brave'], [/opera/i, 'Opera'], [/vivaldi/i, 'Vivaldi'], [/zunemusic|zunevideo|media\s*player/i, 'Media Player'],
  [/vlc/i, 'VLC'], [/applemusic|itunes/i, 'Apple Music'], [/tidal/i, 'TIDAL'], [/deezer/i, 'Deezer'], [/amazon/i, 'Amazon Music'],
  [/telegram/i, 'Telegram'], [/discord/i, 'Discord'],
]
export function appLabel(app: string): string {
  const known = APPS.find(([re]) => re.test(app))
  if (known) return known[1]
  const base = app.split('!')[0]!.replace(/_[a-z0-9]{10,}$/i, '').replace(/\.exe$/i, '')
  return base.split(/[.\\/]/).filter(Boolean).pop() || app
}

export function sessionMusic(s: SmtcSession, now: number, hasArt: boolean): OpenMusic {
  const playing = s.status === 'Playing'
  const durationMs = Math.max(0, s.endMs - s.startMs)
  // the position is as of the session's last update; while it plays it has moved on since
  const at = s.posMs - s.startMs + (playing && s.updatedAt > 0 ? Math.max(0, now - s.updatedAt) : 0)
  const key = sessionKey(s)
  return {
    status: 'open', playing, ad: false, readAt: now,
    progressMs: Math.round(Math.max(0, durationMs ? Math.min(at, durationMs) : at)),
    app: appLabel(s.app),
    track: { id: `smtc:${key}`, title: s.title, artist: s.artist, album: s.album, durationMs, ...(hasArt && { artUrl: SMTC_ART + key }) },
    ...(s.canShuffle && s.shuffle !== undefined && { shuffle: s.shuffle }),
    ...(s.canRepeat && s.repeat && { repeat: s.repeat }),
  }
}

// Box-filtered to a square of `size`, the side the pane or the dialog draws a cover at.
export function scaleArt(a: Art, size: number): Art {
  const n = Math.max(1, Math.round(size)), rgb = new Uint8Array(n * n * 3)
  for (let y = 0; y < n; y++) {
    const y0 = Math.floor(y * a.h / n), y1 = Math.max(y0 + 1, Math.floor((y + 1) * a.h / n))
    for (let x = 0; x < n; x++) {
      const x0 = Math.floor(x * a.w / n), x1 = Math.max(x0 + 1, Math.floor((x + 1) * a.w / n))
      let r = 0, g = 0, b = 0, k = 0
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = (yy * a.w + xx) * 3
        r += a.rgb[i]!; g += a.rgb[i + 1]!; b += a.rgb[i + 2]!; k++
      }
      const o = (y * n + x) * 3
      rgb[o] = Math.round(r / k); rgb[o + 1] = Math.round(g / k); rgb[o + 2] = Math.round(b / k)
    }
  }
  return { w: n, h: n, rgb }
}

const TRIES = 3
// A watcher that lived this long ended on its own clock and is started again at once; a shorter life is a failure.
const FULL_LIFE_MS = 60_000
const MAX_ARTS = 24

export class SmtcWatcher {
  private child?: Spawned
  private gen = 0
  private sessions: SmtcSession[] = []
  private arts = new Map<string, Art>()
  private heard = false
  private fails = 0
  private shown?: SmtcSession
  private stopped = false

  // changed: called when what plays, or a picture, came in, so the reader can be asked at once
  constructor(private changed?: () => void) {}

  get broken() { return this.fails >= TRIES }

  ensure(host: Host, now = Date.now()) {
    if (this.child || this.broken || this.stopped) return
    const gen = ++this.gen
    let said = false
    const child = host.spawn([...PS, WATCH_SCRIPT], (stream, line) => {
      if (stream !== 'stdout' || gen !== this.gen) return
      if (this.take(line)) said = true
    })
    this.child = child
    // a short life is a failure even when it printed: a watcher that keeps dying is not started on every read
    const ended = () => {
      if (gen !== this.gen) return
      this.child = undefined
      if (!said || Date.now() - now < FULL_LIFE_MS) { this.fails++; return }
      this.fails = 0
      if (!this.stopped) this.ensure(host)
    }
    child.done.then(ended, ended)
  }

  // true for a line that said what plays
  private take(line: string): boolean {
    const l = parseSmtcLine(line)
    if (!l || l.kind === 'beat') return false
    if (l.kind === 'art') {
      this.arts.delete(l.key)
      this.arts.set(l.key, l.art)
      if (this.arts.size > MAX_ARTS) this.arts.delete(this.arts.keys().next().value!)
      this.changed?.()
      return false
    }
    this.sessions = l.sessions
    this.heard = true
    this.changed?.()
    return true
  }

  // undefined until the first answer; unsupported once the watcher keeps failing before it says anything
  music(now: number): OpenMusic | { status: 'closed' } | { status: 'unsupported'; hint: string } | undefined {
    if (!this.heard) return this.broken ? { status: 'unsupported', hint: SMTC_HINT } : undefined
    const s = pickSession(this.sessions, this.shown?.app)
    this.shown = s
    return s ? sessionMusic(s, now, this.arts.has(sessionKey(s))) : { status: 'closed' }
  }

  current(): SmtcSession | undefined { return this.shown }

  art(url: string): Art | undefined {
    return url.startsWith(SMTC_ART) ? this.arts.get(url.slice(SMTC_ART.length)) : undefined
  }

  stop() {
    this.stopped = true
    this.gen++
    const c = this.child
    this.child = undefined
    c?.kill()
  }
}
