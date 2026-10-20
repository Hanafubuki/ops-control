// The Music dialog's body. Engine-free: register.tsx resolves the elements and builds the Clients.
import type { Model } from './model.ts'
import type { Theme } from './themes.ts'
import { fit, renderSegs, visibleLength, type Seg } from './layout.tsx'
import { progressAt, type Music, type MusicCmd } from './music/parse.ts'
import { EMPTY, LISTS, rowsOf, type ListId, type ListRow, type ListState } from './music/lists.ts'
import { barRow, type SeekBarProps } from './music/seek.ts'
import { coverPlaceholder } from './music/art.ts'
import type { MusicCaps } from './music/reader.ts'
import { ANY_PLAYER_CLOSED, musicControls, upNextLine } from './pane.tsx'

export const PLAYER_ID = 'ops-control-music'
export const PASTE_INPUT = 'input-paste'
// The dock grants about 88 columns and inline 13 to 20 rows, so these fit the grants seen, not the 110x24 asked for.
const LEFT_COLS = 30, SIDE_MIN = 80, GAP = 2
// On macOS the left column under a 20x10 cover needs about 20 rows: cover, gap, three track rows, the seek and
// volume bars, the controls margin and up to three wrapped button rows.
export const playerCoverSize = (bodyRows: number): 0 | 8 | 20 => (bodyRows >= 20 ? 20 : bodyRows >= 10 ? 8 : 0)
export const CONNECT_PITCH = ['Connect Spotify to see your queue, recent tracks, playlists and devices.', 'Needs Spotify Premium and a free developer app.'] as const
export const DASHBOARD_URL = 'https://developer.spotify.com/dashboard'
// Registered without a port: Spotify then accepts the helper's loopback redirect on any port.
export const REDIRECT_URI = 'http://127.0.0.1/callback'
export const CONNECT_STEPS = [`Open ${DASHBOARD_URL} and create an app.`, 'Tick "Web API".', `Add the redirect URI ${REDIRECT_URI}.`, 'Paste the Client ID below.'] as const

// The right column: the pitch, the connect flow's two steps, and the resting states it ends in.
export type AccountView =
  | { step: 'pitch' }
  | { step: 'steps'; error?: string }
  | { step: 'waiting'; authUrl?: string; notice?: string }
  | { step: 'connected'; name?: string; lists?: { shown: ListId; state: ListState } }
  | { step: 'reconnect' }
  | { step: 'refused'; text: string }
type Els = { Box: any; Text: any; Button: any; Input?: any; Select?: any }

export type PlayerNote = { text: string; tone: 'ok' | 'error' }
export type PlayerView = { width: number; bodyRows: number; cover?: Seg[][]; caps?: MusicCaps; note?: PlayerNote; account?: AccountView }
export type PlayerExtra = {
  onMusic: (cmd: MusicCmd) => void; onCopy: (url: string) => void; seek?: (props: SeekBarProps) => unknown; volume?: (props: SeekBarProps) => unknown
  onConnect?: () => void; onClientId?: (id: string) => void; onPaste?: (text: string) => void; onCancel?: () => void
  onList?: (id: ListId) => void; onPick?: (value: string) => void
}

// State, note and account lines wrap, since a 30-column left column truncates "Open Spotify to see what's playing."
const wrapped = (els: Els, text: string, color: string, key: string) => <els.Box key={key}><els.Text color={color} wrap="wrap">{text}</els.Text></els.Box>

export function renderPlayer(els: Els, m: Model, t: Theme, v: PlayerView, now: number, extra: PlayerExtra) {
  const { Box, Text, Button } = els
  const c = t.colors, s = m.music ?? { status: 'closed' as const }
  const side = v.width >= SIDE_MIN
  const lw = side ? LEFT_COLS : v.width
  const row = (segs: Seg[], key: string) => renderSegs(els, fit(segs, lw), key)
  const left: unknown[] = []
  if (s.status === 'unsupported') left.push(wrapped(els, s.hint, c.dim, 'state'))
  else if (s.status === 'closed') left.push(wrapped(els, v.caps?.anyPlayer ? ANY_PLAYER_CLOSED : "Open Spotify to see what's playing.", c.dim, 'state'))
  else if (s.ad) left.push(wrapped(els, 'Ad', c.dim, 'state'))
  else if (!s.track) left.push(wrapped(els, 'Nothing playing.', c.dim, 'state'))
  else {
    const track = s.track, size = playerCoverSize(v.bodyRows)
    if (size > 0) {
      ;(v.cover ?? coverPlaceholder(size, size / 2, c.accent)).forEach((r, i) => left.push(renderSegs(els, r, 'cover' + i)))
      left.push(renderSegs(els, [], 'cover-gap'))
    }
    const heart: Seg[] = s.liked === undefined ? [] : [{ text: ' ' + (s.liked ? '♥' : '♡'), color: s.liked ? c.accent : c.dim }]
    left.push(row([...fit([{ text: track.title, color: c.text, bold: true }], lw - (heart.length ? 2 : 0)), ...heart], 'title'))
    if (track.artist) left.push(row([{ text: track.artist, color: c.dim }], 'artist'))
    if (track.album) left.push(row([{ text: track.album, color: c.dim }], 'album'))
    const colors = { text: c.text, accent: c.accent, faint: c.faint, dim: c.dim }
    const seek: SeekBarProps = { kind: 'progress', cols: lw, progressMs: s.progressMs, readAt: s.readAt, durationMs: track.durationMs, playing: s.playing, colors }
    left.push(extra.seek ? <Box key="seek" flexDirection="row">{extra.seek(seek) as any}</Box> : renderSegs(els, barRow(seek, lw, progressAt(s, now)), 'seek'))
    if (v.caps?.volume && s.volume !== undefined) {
      const vol: SeekBarProps = { kind: 'volume', cols: lw, level: s.volume, colors }
      left.push(extra.volume ? <Box key="volume" flexDirection="row">{extra.volume(vol) as any}</Box> : renderSegs(els, barRow(vol, lw, s.volume), 'volume'))
    }
    const buttons = musicControls(s, v.caps).map(b => <Button key={'music-' + b.key} label={b.label} hotkey={b.hotkey} plain dimColor={b.on === false} onPress={() => extra.onMusic(b.cmd)} />)
    if (v.caps?.raise) buttons.push(<Button key="music-raise" label="Open Spotify" hotkey="o" plain onPress={() => extra.onMusic({ cmd: 'raise' })} />)
    if (track.url) { const url = track.url; buttons.push(<Button key="music-copy" label="Copy link" hotkey="c" plain onPress={() => extra.onCopy(url)} />) }
    // wraps at the column's width, so a narrow column takes two rows of buttons rather than overflowing
    left.push(<Box key="controls" flexDirection="row" flexWrap="wrap" columnGap={2} width={lw} marginTop={1}>{buttons}</Box>)
  }
  if (v.note) left.push(wrapped(els, v.note.text, v.note.tone === 'error' ? c.fail : c.dim, 'note'))
  const rw = side ? Math.max(1, v.width - LEFT_COLS - GAP) : v.width
  const right = (
    <Box key="right" flexDirection="column" width={rw} marginTop={side ? 0 : 1}>
      {accountRows(els, t, v.account ?? { step: 'pitch' }, s, extra, rw) as any}
    </Box>
  )
  return (
    <Box flexDirection={side ? 'row' : 'column'} columnGap={side ? GAP : 0} width={v.width}>
      <Box key="left" flexDirection="column" width={lw}>{left as any}</Box>
      {right}
    </Box>
  )
}

function accountRows(els: Els, t: Theme, a: AccountView, s: Music, extra: PlayerExtra, w: number): unknown[] {
  const { Box, Text, Button, Input } = els, c = t.colors
  // keyed wrap-* so the row-width tests leave it out, as they do the pitch
  const line = (text: string, key: string, color: string = c.dim) => wrapped(els, text, color, 'wrap-' + key)
  const button = (key: string, label: string, hotkey: string, onPress: () => void) => <Button key={key} label={label} hotkey={hotkey} plain onPress={onPress} />
  const connect = (label: string) => <Box key="connect-row" marginTop={1}>{button('connect', label, 'k', () => extra.onConnect?.())}</Box>
  switch (a.step) {
    case 'pitch':
      return [...CONNECT_PITCH.map((l, i) => <Box key={'pitch' + i}><Text color={i === 0 ? c.text : c.dim} wrap="wrap">{l}</Text></Box>), ...(extra.onConnect ? [connect('Connect')] : [])]
    case 'steps':
      return [
        line('Connect Spotify', 'title', c.text),
        ...CONNECT_STEPS.map((l, i) => line(`${i + 1}. ${l}`, 'step' + i)),
        <Box key="copy-row" flexDirection="row" flexWrap="wrap" columnGap={2}>
          {button('copy-dashboard', 'Copy dashboard link', 'd', () => extra.onCopy(DASHBOARD_URL))}
          {button('copy-redirect', 'Copy redirect URI', 'u', () => extra.onCopy(REDIRECT_URI))}
        </Box>,
        Input
          ? <Input key="input-client-id" autoFocus label="Client ID" value="" submitLabel="connect" onSubmit={(v: string) => extra.onClientId?.(v)} />
          : line('Run /ops spotify connect in a terminal to paste it.', 'no-input'),
        ...(a.error ? [line(a.error, 'error', c.fail)] : []),
      ]
    case 'waiting': {
      const url = a.authUrl
      return [
        line('Waiting for the browser…', 'title', c.text),
        ...(url ? [line(url, 'auth')] : []),
        // The engine's ring holds a place in element order, so the address's button arriving later goes below the
        // field: above it, the ring would slide off the field onto the button.
        ...(Input ? [<Input key={PASTE_INPUT} autoFocus label="Or paste the address the browser ended on" value="" submitLabel="send" onSubmit={(v: string) => extra.onPaste?.(v)} />] : []),
        ...(url ? [<Box key="copy-auth-row">{button('copy-auth', 'Copy address', 'w', () => extra.onCopy(url))}</Box>] : []),
        ...(a.notice ? [line(a.notice, 'notice', c.fail)] : []),
        <Box key="cancel-row">{button('connect-cancel', 'Cancel', 'x', () => extra.onCancel?.())}</Box>,
      ]
    }
    case 'connected': {
      const o = s.status === 'open' ? s : undefined
      const device = o?.device ? [line(`on: ${o.device.name}${o.device.isThisComputer ? ' (this computer)' : ''}`, 'device')] : []
      if (a.lists) return [...listRows(els, t, a.lists, w, extra), ...device]
      return [
        line(a.name ? `Connected as ${a.name}.` : 'Connected.', 'name', c.text),
        ...(o?.upNext ? [line(upNextLine(o.upNext), 'next')] : []),
        ...device,
        line('/ops spotify disconnect stops it.', 'disconnect'),
      ]
    }
    case 'reconnect':
      return [line('Spotify needs you to connect again.', 'reconnect', c.text), connect('Connect again')]
    case 'refused':
      return [line(a.text, 'refused', c.fail)]
  }
}

// One row as a fixed-width label, since a Select option is one string: the title gives way first,
// the detail takes at most 40%, and the right column (a length, a count, "active") is dropped only when nothing else fits.
export function listLabel(r: ListRow, w: number): string {
  const len = (s: string) => visibleLength([{ text: s, color: '' }])
  const pad = (s: string, n: number) => {
    const f = fit([{ text: s, color: '' }], n)
    return f.map(x => x.text).join('') + ' '.repeat(Math.max(0, n - visibleLength(f)))
  }
  const right = r.right && w >= len(r.right) + 8 ? ' ' + r.right : ''
  const room = w - len(right)
  const detailW = r.detail ? Math.min(len(r.detail), Math.floor(room * 0.4)) : 0
  const titleW = room - (detailW > 0 ? detailW + 2 : 0)
  return pad(r.title, titleW) + (detailW > 0 ? '  ' + pad(r.detail, detailW) : '') + right
}

function listRows(els: Els, t: Theme, v: { shown: ListId; state: ListState }, w: number, extra: PlayerExtra): unknown[] {
  const { Box, Button, Select } = els, c = t.colors
  // Loading…, empty and error lines wrap like the state and note lines, keyed wrap-* so the row-width tests skip them;
  // only the Select-less rows are fixed-width labels
  const say = (text: string, key: string) => wrapped(els, text, c.dim, 'wrap-' + key)
  const tabs = (
    <Box key="list-tabs" flexDirection="row" flexWrap="wrap" columnGap={2}>
      {LISTS.map(([id, label], i) => <Button key={'list-' + id} label={label} hotkey={String(i + 1)} {...(id === v.shown && { variant: 'primary' })} onPress={() => extra.onList?.(id)} />)}
    </Box>
  )
  const st = v.state, rows = rowsOf(st)
  const body: unknown[] = []
  // Loading… only before the first rows: a reload keeps what is on screen
  if (st.status === 'idle' || (st.status === 'loading' && rows.length === 0)) body.push(say('Loading…', 'list-loading'))
  else if (rows.length === 0) body.push(say(st.status === 'error' ? st.reason : EMPTY[v.shown], st.status === 'error' ? 'list-error' : 'list-empty'))
  else if (!Select) rows.forEach((r, i) => body.push(renderSegs(els, fit([{ text: listLabel(r, w), color: c.dim }], w), 'list-row' + i)))
  else {
    // no autoFocus: an Enter pressed on opening would start playback
    // no value either: the engine may treat a controlled value as a selection, and on Devices that would transfer with play: true
    // keyed by list: a tab switch mounts a fresh Select, so the old cursor index does not carry over
    body.push(<Box key={'list-box-' + v.shown}><Select key="music-list" options={rows.map(r => ({ value: r.value, label: listLabel(r, Math.max(1, w - 2)) }))} onSelect={(value: string) => extra.onPick?.(value)} /></Box>)
  }
  if (st.status === 'error' && rows.length > 0) body.push(say(st.reason, 'list-error'))
  return [tabs, renderSegs(els, [{ text: '─'.repeat(Math.max(0, w)), color: c.faint }], 'list-rule'), ...body]
}
