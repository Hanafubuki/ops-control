import { test, expect } from 'claude-code/testing'
import { renderPlayer, playerCoverSize, listLabel, CONNECT_PITCH, type PlayerView } from '../hooks/musicplayer.tsx'
import { initialModel, type Model } from '../hooks/model.ts'
import { resolveTheme } from '../hooks/themes.ts'
import { visibleLength } from '../hooks/layout.tsx'
import type { Music } from '../hooks/music/parse.ts'
import type { MusicCaps } from '../hooks/music/reader.ts'

const T = resolveTheme('classic', {}).theme
const els = { Box: 'Box', Text: 'Text', Button: 'Button' }
const walk = (n: any, out: any[] = []): any[] => {
  if (typeof n === 'string') out.push(n)
  else if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) }
  return out
}
// each Seg row Box (children all Texts), as the text it shows; the pitch, state, note and account lines wrap, so their Boxes are left out
const rows = (tree: any) => walk(tree).filter(n => n?.type === 'Box' && !/^(pitch|state|note|wrap-)/.test(String(n.props?.key)) && (n.children ?? []).length > 0 && n.children.every((c: any) => c?.type === 'Text'))
  .map(n => walk(n).filter(x => typeof x === 'string').join(''))
const keys = (tree: any) => walk(tree).map(n => n?.props?.key).filter(Boolean)
const text = (tree: any) => walk(tree).filter(n => typeof n === 'string').join(' ')
const cells = (s: string) => visibleLength([{ text: s, color: '' }])

const MAC: MusicCaps = { repeat: ['off', 'context'], shuffle: true, raise: true, volume: true }
const LINUX: MusicCaps = { repeat: [], shuffle: false, raise: true, volume: false }
const PCTL: MusicCaps = { repeat: [], shuffle: false, raise: false, volume: false }
const track = { id: '/com/spotify/track/t', title: 'BACK 2 THE BASICS', artist: 'Double A-Ron', album: 'Commercial Break 2', durationMs: 174_000, url: 'https://open.spotify.com/track/t' }
const playing = (over: Partial<Extract<Music, { status: 'open' }>> = {}): Model => ({
  ...initialModel(),
  music: { status: 'open', track, playing: true, ad: false, progressMs: 60_000, readAt: 0, shuffle: false, repeat: 'off', volume: 0.5, ...over },
})
const view = (over: Partial<PlayerView> = {}): PlayerView => ({ width: 88, bodyRows: 24, caps: MAC, ...over })
const extra = { onMusic: () => {}, onCopy: () => {} }

test('the cover follows the rows granted', () => {
  expect(playerCoverSize(24)).toBe(20)
  expect(playerCoverSize(20)).toBe(20)
  expect(playerCoverSize(19)).toBe(8)
  expect(playerCoverSize(18)).toBe(8)
  expect(playerCoverSize(10)).toBe(8)
  expect(playerCoverSize(9)).toBe(0)
})

test('a full grant draws the 20x10 placeholder, the track, both bars and every control', () => {
  const tree = renderPlayer(els, playing(), T, view(), 0, extra)
  const r = rows(tree)
  // the placeholder is 10 rows of 20 cells, with the note on its second row
  expect(r.filter(l => cells(l) === 20 && l.trim() === '♪')).toHaveLength(1)
  expect(text(tree)).toContain('BACK 2 THE BASICS')
  expect(text(tree)).toContain('Double A-Ron')
  expect(r.some(l => l.startsWith('▶ 1:00 '))).toBe(true)
  expect(r.some(l => l.startsWith('vol '))).toBe(true)
  expect(keys(tree)).toEqual(expect.arrayContaining(['music-previous', 'music-playpause', 'music-next', 'music-shuffle', 'music-repeat', 'music-raise', 'music-copy']))
})

test('a short grant shrinks the cover to 8x4, and a very short one drops it', () => {
  const small = rows(renderPlayer(els, playing(), T, view({ bodyRows: 13 }), 0, extra))
  expect(small.filter(l => cells(l) === 8 && l.trim() === '♪')).toHaveLength(1)
  const none = rows(renderPlayer(els, playing(), T, view({ bodyRows: 9 }), 0, extra))
  expect(none.some(l => l.includes('♪'))).toBe(false)
})

test('a cover given is drawn in place of the placeholder', () => {
  const cover = Array.from({ length: 10 }, () => [{ text: '▀'.repeat(20), color: '#102030', bg: '#405060' }])
  const r = rows(renderPlayer(els, playing(), T, view({ cover }), 0, extra))
  expect(r.filter(l => l === '▀'.repeat(20))).toHaveLength(10)
})

test('controls follow the player caps and the track link', () => {
  const linux = keys(renderPlayer(els, playing(), T, view({ caps: LINUX }), 0, extra))
  expect(linux).not.toContain('music-shuffle')
  expect(linux).toContain('music-raise')
  expect(rows(renderPlayer(els, playing(), T, view({ caps: LINUX }), 0, extra)).some(l => l.startsWith('vol '))).toBe(false)
  const pctl = keys(renderPlayer(els, playing(), T, view({ caps: PCTL }), 0, extra))
  expect(pctl).not.toContain('music-raise')
  const noLink = keys(renderPlayer(els, playing({ track: { ...track, url: undefined } }), T, view(), 0, extra))
  expect(noLink).not.toContain('music-copy')
})

test('each non-playing state draws one line and no controls', () => {
  const states: [Music, string][] = [
    [{ status: 'closed' }, "Open Spotify to see what's playing."],
    [{ status: 'unsupported', hint: 'Spotify shows here on Linux and macOS.' }, 'Spotify shows here on Linux and macOS.'],
    [{ status: 'open', playing: true, ad: true, progressMs: 0, readAt: 0 }, 'Ad'],
    [{ status: 'open', playing: false, ad: false, progressMs: 0, readAt: 0 }, 'Nothing playing.'],
  ]
  for (const [music, line] of states) {
    const tree = renderPlayer(els, { ...initialModel(), music }, T, view(), 0, extra)
    expect(text(tree)).toContain(line)
    expect(walk(tree).find(n => n?.type === 'Text' && n.children?.[0] === line).props.wrap).toBe('wrap')
    expect(keys(tree).filter(k => String(k).startsWith('music-'))).toEqual([])
    expect(text(tree)).toContain(CONNECT_PITCH[0]!)
  }
})

test('no row is wider than the grant', () => {
  for (let width = 30; width <= 120; width += 7) {
    for (const bodyRows of [9, 13, 24]) {
      const r = rows(renderPlayer(els, playing({ track: { ...track, title: 'A title far longer than any column could hold, by design' } }), T, view({ width, bodyRows }), 0, extra))
      for (const l of r) expect(cells(l)).toBeLessThanOrEqual(width)
    }
  }
})

test('side by side from 80 columns, stacked below', () => {
  const side = renderPlayer(els, playing(), T, view({ width: 80 }), 0, extra) as any
  expect(side.props.flexDirection).toBe('row')
  const stacked = renderPlayer(els, playing(), T, view({ width: 79 }), 0, extra) as any
  expect(stacked.props.flexDirection).toBe('column')
})

test('the seek and volume builders replace the static bars', () => {
  const seen: string[] = []
  const tree = renderPlayer(els, playing(), T, view(), 0, { ...extra, seek: p => { seen.push(p.kind); return 'SEEK' }, volume: p => { seen.push(p.kind); return 'VOL' } })
  expect(seen).toEqual(['progress', 'volume'])
  expect(walk(tree)).toContain('SEEK')
  expect(walk(tree)).toContain('VOL')
})

test('a press reaches onMusic and onCopy', () => {
  const cmds: unknown[] = [], copied: string[] = []
  const tree = renderPlayer(els, playing(), T, view(), 0, { onMusic: c => cmds.push(c), onCopy: u => copied.push(u) })
  const btn = (k: string) => walk(tree).find(n => n?.props?.key === k)
  btn('music-raise').onPress({})
  btn('music-copy').onPress({})
  btn('music-playpause').onPress({})
  expect(cmds).toEqual([{ cmd: 'raise' }, { cmd: 'playpause' }])
  expect(copied).toEqual([track.url])
})

test('a note shows under the player in its tone', () => {
  const tree = renderPlayer(els, playing(), T, view({ note: { text: 'Could not copy the link: no clipboard', tone: 'error' } }), 0, extra)
  const n = walk(tree).find(x => x?.type === 'Text' && x.children?.[0] === 'Could not copy the link: no clipboard')
  expect(n.props.color).toBe(T.colors.fail)
  expect(n.props.wrap).toBe('wrap')
})

const find = (tree: any, key: string) => walk(tree).find(n => n?.props?.key === key)
const elsI = { ...els, Input: 'Input' }

test('the heart sits after the title and l toggles it, only when the like state is known', () => {
  const liked = renderPlayer(els, playing({ liked: true }), T, view(), 0, extra)
  expect(rows(liked).find(l => l.startsWith('BACK 2 THE BASICS'))).toMatch(/ ♥$/)
  expect(find(liked, 'music-like').props.hotkey).toBe('l')
  const cmds: unknown[] = []
  find(renderPlayer(els, playing({ liked: false }), T, view(), 0, { ...extra, onMusic: c => cmds.push(c) }), 'music-like').onPress({})
  expect(cmds).toEqual([{ cmd: 'like', on: true }])
  expect(find(renderPlayer(els, playing(), T, view(), 0, extra), 'music-like')).toBeUndefined()
})

test('the right column walks the connect steps', () => {
  const seen: string[] = []
  const ex = { ...extra, onConnect: () => seen.push('connect'), onClientId: (id: string) => seen.push('id:' + id), onPaste: (t: string) => seen.push('paste:' + t), onCancel: () => seen.push('cancel'), onCopy: (u: string) => seen.push('copy:' + u) }
  find(renderPlayer(elsI, playing(), T, view(), 0, ex), 'connect').onPress({})
  const steps = renderPlayer(elsI, playing(), T, view({ account: { step: 'steps', error: 'A Client ID is 32 hex characters.' } }), 0, ex)
  expect(text(steps)).toContain('3. Add the redirect URI http://127.0.0.1/callback.')
  expect(text(steps)).toContain('A Client ID is 32 hex characters.')
  find(steps, 'copy-dashboard').onPress({})
  find(steps, 'copy-redirect').onPress({})
  find(steps, 'input-client-id').onEvent({ kind: 'submit', value: 'abc' })
  const waiting = renderPlayer(elsI, playing(), T, view({ account: { step: 'waiting', authUrl: 'https://accounts.spotify.com/authorize?x=1', notice: 'That address is not from this login.' } }), 0, ex)
  expect(text(waiting)).toContain('Waiting for the browser…')
  expect(text(waiting)).toContain('That address is not from this login.')
  expect(find(waiting, 'input-paste').props.label).toBe('Or paste the address the browser ended on')
  // the engine's Tab ring never reached these fields, so they take the keyboard when their step shows
  expect(find(steps, 'input-client-id').props.autoFocus).toBe(true)
  expect(find(waiting, 'input-paste').props.autoFocus).toBe(true)
  for (const account of [{ step: 'pitch' }, { step: 'reconnect' }, { step: 'connected', name: 'Ada' }] as const) {
    const t = renderPlayer(elsI, playing(), T, view({ account }), 0, ex)
    expect(find(t, 'input-client-id')).toBeUndefined()
    expect(find(t, 'input-paste')).toBeUndefined()
  }
  // the engine's ring holds a place in element order: the address's button, drawn once the helper prints it, comes
  // after the field, so the field keeps the ring
  const order = walk(waiting).map(n => n?.props?.key).filter(k => ['input-paste', 'copy-auth', 'connect-cancel'].includes(k))
  expect(order).toEqual(['input-paste', 'copy-auth', 'connect-cancel'])
  find(waiting, 'copy-auth').onPress({})
  find(waiting, 'input-paste').onEvent({ kind: 'submit', value: 'http://127.0.0.1:5/callback?code=c&state=s' })
  find(waiting, 'connect-cancel').onPress({})
  expect(seen).toEqual(['connect', 'copy:https://developer.spotify.com/dashboard', 'copy:http://127.0.0.1/callback', 'id:abc', 'copy:https://accounts.spotify.com/authorize?x=1', 'paste:http://127.0.0.1:5/callback?code=c&state=s', 'cancel'])
  // a surface without Input says where to paste instead
  expect(find(renderPlayer(els, playing(), T, view({ account: { step: 'steps' } }), 0, ex), 'input-client-id')).toBeUndefined()
})

test('connected shows the account, Up next and the device; Reconnect and a refused file say so', () => {
  const m = playing({ source: 'api', upNext: { uri: 'spotify:track:n', title: 'Next One', artist: 'Someone', durationMs: 1 }, device: { id: 'd', name: 'Desktop', type: 'Computer', isThisComputer: true } })
  const t = text(renderPlayer(els, m, T, view({ account: { step: 'connected', name: 'Ada' } }), 0, extra))
  expect(t).toContain('Connected as Ada.')
  expect(t).toContain('Up next: Next One — Someone')
  expect(t).toContain('on: Desktop (this computer)')
  const again: string[] = []
  const re = renderPlayer(els, playing(), T, view({ account: { step: 'reconnect' } }), 0, { ...extra, onConnect: () => again.push('k') })
  expect(text(re)).toContain('Spotify needs you to connect again.')
  find(re, 'connect').onPress({})
  expect(again).toEqual(['k'])
  expect(text(renderPlayer(els, playing(), T, view({ account: { step: 'refused', text: 'spotify.json was saved by a newer ops-control.' } }), 0, extra))).toContain('newer ops-control')
})

test('every account line wraps, so none runs past the right column', () => {
  const ex = { ...extra, onConnect: () => {} }
  const accounts = [{ step: 'pitch' }, { step: 'steps', error: 'A Client ID is 32 hex characters.' }, { step: 'waiting', authUrl: 'https://accounts.spotify.com/authorize?' + 'x'.repeat(200), notice: 'n' }, { step: 'connected', name: 'Ada' }, { step: 'reconnect' }, { step: 'refused', text: 'r' }] as const
  for (const width of [30, 60, 88]) {
    for (const account of accounts) {
      const texts = walk(find(renderPlayer(elsI, playing(), T, view({ width, account }), 0, ex), 'right')).filter(n => n?.type === 'Text')
      expect(texts.length).toBeGreaterThan(0)
      for (const n of texts) expect(n.props.wrap).toBe('wrap')
    }
  }
})

const elsS = { ...els, Select: 'Select' }
const lrow = (i: number, over: object = {}) => ({ value: `${i}:spotify:track:t${i}`, title: `Track ${i}`, detail: 'Artist', right: '3:12', cmd: { cmd: 'skipTo', uri: `spotify:track:t${i}` }, ...over }) as const
const listed = (shown: 'queue' | 'recent' | 'playlists' | 'devices', state: any) => view({ account: { step: 'connected', name: 'Ada', lists: { shown, state } } })

test('connected with lists: four list buttons on 1-4, the shown one primary, the rows as one Select', () => {
  const picked: string[] = [], lists: string[] = []
  const ex = { ...extra, onPick: (v: string) => picked.push(v), onList: (id: string) => lists.push(id) }
  const tree = renderPlayer(elsS, playing({ source: 'api', device: { id: 'd', name: 'Desktop', type: 'Computer', isThisComputer: true } }), T, listed('queue', { status: 'ready', rows: [lrow(0), lrow(1)], at: 0 }), 0, ex)
  const tabs = ['list-queue', 'list-recent', 'list-playlists', 'list-devices'].map(k => find(tree, k))
  expect(tabs.map(b => [b.props.label, b.props.hotkey, b.props.variant])).toEqual([['Up next', '1', 'primary'], ['Recent', '2', undefined], ['Playlists', '3', undefined], ['Devices', '4', undefined]])
  const sel = find(tree, 'music-list')
  expect(sel.type).toBe('Select')
  expect(sel.props.options.map((o: any) => o.value)).toEqual(['0:spotify:track:t0', '1:spotify:track:t1'])
  expect(sel.props.autoFocus).toBeUndefined()
  // drawing and focusing dispatch nothing; only a pick does
  expect(picked).toEqual([])
  sel.onEvent({ value: '1:spotify:track:t1' })
  tabs[3].onPress({})
  expect([picked, lists]).toEqual([['1:spotify:track:t1'], ['devices']])
  expect(text(tree)).toContain('on: Desktop (this computer)')
})

test('Loading…, an empty list, and an error line', () => {
  const t = (shown: any, state: any) => text(renderPlayer(elsS, playing({ source: 'api' }), T, listed(shown, state), 0, extra))
  expect(t('queue', { status: 'idle' })).toContain('Loading…')
  expect(t('queue', { status: 'loading', rows: [] })).toContain('Loading…')
  expect(t('queue', { status: 'ready', rows: [], at: 0 })).toContain('Nothing queued.')
  expect(t('devices', { status: 'error', rows: [], reason: 'Spotify had a problem (503). ops-control tries again shortly.', at: 0 })).toContain('Spotify had a problem (503)')
  // a reload in flight keeps the rows; a failed one keeps them and adds the reason
  const reloading = renderPlayer(elsS, playing({ source: 'api' }), T, listed('queue', { status: 'loading', rows: [lrow(0)] }), 0, extra)
  expect(text(reloading)).not.toContain('Loading…')
  expect(find(reloading, 'music-list')).toBeDefined()
  const failed = renderPlayer(elsS, playing({ source: 'api' }), T, listed('queue', { status: 'error', rows: [lrow(0)], reason: 'Spotify did not answer. ops-control tries again shortly.', at: 0 }), 0, extra)
  expect(find(failed, 'music-list')).toBeDefined()
  const reason = walk(failed).find(n => n?.type === 'Text' && n.children?.[0] === 'Spotify did not answer. ops-control tries again shortly.')
  // wraps rather than clipping its tail at 80-87 columns
  expect([reason.props.color, reason.props.wrap]).toEqual([T.colors.dim, 'wrap'])
})

test('Devices marks the active one on its row and gives the Select no value', () => {
  const rows = [lrow(0, { value: 'ph', right: 'active', active: true, cmd: { cmd: 'transfer', deviceId: 'ph' } }), lrow(1, { value: 'dk', right: '', cmd: { cmd: 'transfer', deviceId: 'dk' } })]
  const sel = find(renderPlayer(elsS, playing({ source: 'api' }), T, listed('devices', { status: 'ready', rows, at: 0 }), 0, extra), 'music-list')
  expect('value' in sel.props).toBe(false)
  expect(JSON.stringify(sel.props.options)).toContain('active')
})

test('each list mounts its own Select, so a tab switch keeps no cursor', () => {
  const st = { status: 'ready', rows: [lrow(0)], at: 0 }
  const wrapperKey = (shown: any) => {
    const tree = renderPlayer(elsS, playing({ source: 'api' }), T, listed(shown, st), 0, extra)
    expect(find(tree, 'music-list')).toBeDefined()
    return walk(tree).find(n => String(n?.props?.key).startsWith('list-box-'))?.props.key
  }
  expect([wrapperKey('queue'), wrapperKey('recent')]).toEqual(['list-box-queue', 'list-box-recent'])
})

test('without a Select the rows draw as text', () => {
  const tree = renderPlayer(els, playing({ source: 'api' }), T, listed('queue', { status: 'ready', rows: [lrow(0)], at: 0 }), 0, extra)
  expect(find(tree, 'music-list')).toBeUndefined()
  expect(text(tree)).toContain('Track 0')
})

test('a row label fits its width: the title gives way first, the right column stays', () => {
  for (const w of [12, 30, 56]) expect(cells(listLabel(lrow(0, { title: 'A title far longer than any column', detail: 'An artist with a long name' }), w))).toBe(w)
  expect(listLabel(lrow(0), 40)).toMatch(/^Track 0 +Artist +3:12$/)
  expect(listLabel(lrow(0, { right: 'active' }), 40).endsWith(' active')).toBe(true)
})

test('no list row is wider than the grant', () => {
  for (const width of [30, 60, 79, 88, 120]) {
    for (const state of [{ status: 'idle' }, { status: 'ready', rows: [lrow(0, { title: 'x'.repeat(200) })], at: 0 }, { status: 'error', rows: [], reason: 'y'.repeat(200), at: 0 }]) {
      const tree = renderPlayer(elsS, playing({ source: 'api' }), T, { ...listed('queue', state), width }, 0, extra)
      for (const l of rows(tree)) expect(cells(l)).toBeLessThanOrEqual(width)
      // the Select's rows are its option labels, which rows() cannot see
      const rw = width >= 80 ? width - 32 : width
      for (const o of find(tree, 'music-list')?.props.options ?? []) expect(cells(o.label)).toBeLessThanOrEqual(rw - 2)
    }
  }
})

test('no two buttons in the dialog share a hotkey', () => {
  const ex = { ...extra, onConnect: () => {} }
  const accounts = [{ step: 'pitch' }, { step: 'steps' }, { step: 'waiting', authUrl: 'https://accounts.spotify.com/authorize?x=1' }, { step: 'reconnect' }, { step: 'connected', name: 'Ada', lists: { shown: 'queue', state: { status: 'ready', rows: [lrow(0)], at: 0 } } }] as PlayerView['account'][]
  for (const account of accounts) {
    const tree = renderPlayer({ ...elsI, Select: 'Select' }, playing({ source: 'api' }), T, view({ account }), 0, ex)
    const hot = walk(tree).filter(n => n?.type === 'Button' && n.props.hotkey).map(n => n.props.hotkey)
    expect(new Set(hot).size).toBe(hot.length)
    // MAC caps (raise) and a track with a url put o and c in the left column
    expect(hot).toEqual(expect.arrayContaining(['o', 'c']))
  }
})
