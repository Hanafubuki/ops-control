// The music wiring rig: the engine's fs, process, ui and http answered from memory, so no test reaches Spotify, a browser or the real config directory.
import { mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { fakeFs } from './kit.ts'

export const DEST = 'org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player'
export const BUS = `busctl --user --json=short get-property ${DEST} PlaybackStatus Metadata Position`
export const ok = (stdout = '') => ({ exitCode: 0, stdout })
export const LINUX_BUS = { 'uname -s': ok('Linux\n'), 'busctl --json=short --version': ok('systemd 258') }
export const walk = (n: any, out: any[] = []): any[] => { if (typeof n === 'string') out.push(n); else if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }
export const text = (tree: any) => walk(tree).filter(n => typeof n === 'string').join(' ')
export const PANE_PROPS = (bodyRows = 40) => ({ title: 'ops-control', isFocused: true, bodyColumns: 88, placement: 'dock', scroll: { offset: 0, bodyRows }, view: {} }) as never
export const TOKENS = '/fake/.claude/ops-control/spotify.json'
// Each login has its own paste file, named with a per-session random tag, so a test reads it off the helper's argv.
export const pasteOf = (s: { spawned: string[] }, n = 1) => s.spawned[n - 1]?.match(/--paste-file (\S+)/)?.[1] ?? ''
export const LOGIN = (n = 1) => new RegExp(`^/gi spotify-login --client-id ${CLIENT} --out ${TOKENS} --paste-file /fake/\\.claude/ops-control/spotify-paste-\\w+-${n}$`)
export const CLIENT = '0123456789abcdef0123456789abcdef'
export const AUTH = 'https://accounts.spotify.com/authorize?client_id=0123&state=st'
export const tokens = (over: Record<string, unknown> = {}) => JSON.stringify({ format: 1, clientId: CLIENT, accessToken: 'at-1', refreshToken: 'rt-1', expiresAt: Date.now() + 3_600_000, scope: '', connectedAt: 0, gen: 1, ...over })
export const item = (id: string, name: string) => ({ type: 'track', uri: `spotify:track:${id}`, name, duration_ms: 200000, artists: [{ name: 'Artist' }], album: { name: 'Album', images: [] }, external_urls: { spotify: `https://open.spotify.com/track/${id}` } })
const onPhone = JSON.stringify({ device: { id: 'ph', name: 'Pixel 9', type: 'Smartphone', volume_percent: 40 }, shuffle_state: false, repeat_state: 'off', progress_ms: 30000, is_playing: true, currently_playing_type: 'track', item: item('p', 'Phone Song') })

export type Req = { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }
// hang: no answer until the test calls expire(), as an engine request that outlives its 5 s timeout
export type Ans = { status: number; text?: string } | 'hang'
export const path = (r: Req) => r.url.replace('https://api.spotify.com/v1', '').split('?')[0]
export const method = (r: Req) => r.init?.method ?? 'GET'
// Spotify as ops-control meets it: a phone playing, the track liked, one track queued, the account named Ada.
export const PHONE = (r: Req): Ans => {
  const p = path(r)
  if (p === '/me/player' && method(r) === 'GET') return { status: 200, text: onPhone }
  if (p === '/me/library/contains') return { status: 200, text: '[true]' }
  if (p === '/me/player/queue') return { status: 200, text: JSON.stringify({ queue: [item('n', 'Next Song')] }) }
  if (p === '/me') return { status: 200, text: '{"display_name":"Ada"}' }
  return { status: 204 }
}
type Chunk = { stream: 'stdout' | 'stderr'; text: string }
export type Boot = {
  files?: Record<string, string>
  runs?: Record<string, { exitCode: number; stdout: string }>
  // a promise holds the command until it settles, for a test that acts while one is out
  run?: (argv: string) => { exitCode: number; stdout: string } | undefined | Promise<{ exitCode: number; stdout: string } | undefined>
  api?: (r: Req) => Ans
  env?: Record<string, string>
  spawn?: (argv: string[]) => AsyncGenerator<Chunk, { code: number | null; signal: null }>
  // what ui.copy answers; an Error makes it throw. Read at each copy, so a test can change it mid-run.
  copy?: { value: unknown }
}

// panes: what $.ui.panes() answers, edited by the test as the engine would move them. files is the object the
// test passed, so a test can change it while the session runs. Set failOpen on the result to refuse that pane id.
// `mv from to` moves the file, as the paste file's atomic write needs; `rm -rf path` removes it.
export function boot(on: any, o: Boot = {}) {
  const copy = o.copy ?? { value: { isCopied: true } }
  const hung = new Set<() => void>()
  const s = {
    ran: [] as string[], reqs: [] as Req[], spawned: [] as string[], opens: [] as any[], closes: [] as any[], copies: [] as string[], toasts: [] as string[],
    panes: [] as { id: string; isShown: boolean; isFocused: boolean; isPlaced: boolean }[],
    files: Object.assign(o.files ?? {}, { '/gi': '' }),
    failOpen: '',
    // fails every hung request, as the engine's request finally ending
    expire: () => { for (const f of hung) f(); hung.clear() },
  }
  fakeFs(on, s.files, async argv => {
    const k = argv.join(' ')
    s.ran.push(k)
    const given = (await o.run?.(k)) ?? o.runs?.[k]
    if (given) return given
    if (argv[0] === 'mv' && argv.length === 3 && argv[1]! in s.files) { s.files[argv[2]!] = s.files[argv[1]!]!; delete s.files[argv[1]!]; return ok() }
    if (argv[0] === 'rm' && argv[1] === '-rf' && argv.length === 3) { delete s.files[argv[2]!]; return ok() }
  }, { OPS_CONTROL_BIN: '/gi', ...o.env })
  mock.store(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine'] }) as RenderElement)
  on('ui.panes', async () => ({ value: s.panes.map(p => ({ ...p, title: p.id })) }) as never)
  on('ui.open', async (_$: unknown, e: any) => {
    s.opens.push(e)
    if (e.id === s.failOpen) throw new Error('no room')
    for (const p of s.panes) p.isShown = false
    const p = s.panes.find(x => x.id === e.id)
    if (p) p.isShown = true; else s.panes.push({ id: e.id, isShown: true, isFocused: !!e.focus, isPlaced: true })
    return { value: { isPlaced: true } } as never
  })
  on('ui.close', async (_$: unknown, e: any) => {
    s.closes.push(e)
    const i = s.panes.findIndex(p => p.id === e.id)
    if (i >= 0) s.panes.splice(i, 1)
    return { value: undefined } as never
  })
  on('ui.copy', async (_$: unknown, e: any) => { s.copies.push(e.text); if (copy.value instanceof Error) throw copy.value; return copy as never })
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async (_$: unknown, e: any) => { s.toasts.push(e.text); return { value: undefined } as never })
  on('session.id', async () => ({ value: 's1' }))
  on('session.surfaces', async () => ({ value: ['terminal'] }) as never)
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('http.fetch', async (_$: unknown, e: Req) => {
    s.reqs.push(e)
    const a = (o.api ?? PHONE)(e)
    if (a === 'hang') return new Promise((_, reject) => { hung.add(() => reject(new Error('network down'))) })
    return { value: { ok: a.status < 300, status: a.status, headers: {}, text: a.text ?? '' } } as never
  })
  on('process.spawn', async function* (_$: unknown, e: any) {
    s.spawned.push(e.argv.join(' '))
    if (!o.spawn) return { value: { code: 127, signal: null } }
    return { value: yield* o.spawn(e.argv) }
  } as never)
  return s
}
export const start = async ($: any, on: any) => {
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(50)
  return clock
}
export const mountPane = ($: any) => $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'Pane', requestId: 'ops-control', props: PANE_PROPS() })
export const mountPlayer = ($: any, bodyRows = 24, surface = 'terminal') => $.ui.mount({ plugin: 'ops-control', surface, component: 'Pane', requestId: 'ops-control-music', props: { ...(PANE_PROPS(bodyRows) as object), title: 'Music' } })
