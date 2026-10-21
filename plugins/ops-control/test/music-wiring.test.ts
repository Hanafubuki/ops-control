import { expect, mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { fakeFs, test } from './kit.ts'
import { toBase64Url } from '../hooks/link.ts'

const ENGINE_ROW = { type: 'Text', props: {}, children: ['engine row'] } as RenderElement
const scroll = { offset: 0, bodyRows: 40 }
const PANE = { title: 'ops-control', isFocused: false, bodyColumns: 60, placement: 'dock', scroll, view: {} } as never
const walk = (n: any, out: any[] = []): any[] => { if (typeof n === 'string') out.push(n); else if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }
const petClient = (tree: any) => walk(tree).find(n => n?.type === 'Client' && String(n.props?.module).endsWith('client/pet.tsx'))
const text = (tree: any) => walk(tree).filter(n => typeof n === 'string').join(' ')
const mountPane = ($: any, surface = 'terminal') => $.ui.mount({ plugin: 'ops-control', surface, component: 'Pane', requestId: 'ops-control', props: PANE })

const DEST = 'org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player'
const BUS = `busctl --user --json=short get-property ${DEST} PlaybackStatus Metadata Position`
const PLAY_PAUSE = `busctl --user call ${DEST} PlayPause`
const PLAYING = ['{"type":"s","data":"Playing"}', '{"type":"a{sv}","data":{"mpris:trackid":{"type":"s","data":"/com/spotify/track/t"},"xesam:title":{"type":"s","data":"Song"},"mpris:length":{"type":"t","data":9000000}}}', '{"type":"x","data":1000000}'].join('\n')
const ok = (stdout = '') => ({ exitCode: 0, stdout })

function boot(on: any, files: Record<string, string>, answers: Record<string, { exitCode: number; stdout: string }>, paneShown = true, env: Record<string, string> = {}, store?: Record<string, unknown>) {
  const ran: string[] = [], toasts: string[] = []
  const fs = fakeFs(on, files, argv => { const k = argv.join(' '); ran.push(k); return answers[k] }, env)
  mock.store(on, store)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  on('ui.render', async () => ENGINE_ROW)
  on('ui.panes', async () => ({ value: [{ id: 'ops-control', isShown: paneShown, isPlaced: true }] }))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async (_$: unknown, e: any) => { toasts.push(e.text); return { value: undefined } as never })
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$: unknown, e: any) => ({ turnId: e.turnId }))
  on('tool.call', async () => ({ result: {}, text: '' }) as never)
  return { ...fs, ran, toasts }
}
const reads = (ran: string[]) => ran.filter(a => a === BUS).length

const LINUX_BUS = { 'uname -s': ok('Linux\n'), 'busctl --json=short --version': ok('systemd 258') }

test('Spotify playing: the Music tab shows the track, the pet dances, a press runs PlayPause', { timeoutMs: 20000 }, async ($, on) => {
  const { ran } = boot(on, {}, { ...LINUX_BUS, [BUS]: ok(PLAYING), [PLAY_PAUSE]: ok() })
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(50)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-music' })
  await clock.advance(50)
  const tree = await pane.drawn()
  expect(text(tree)).toContain('NOW PLAYING')
  expect(text(tree)).toContain('Song')
  expect(petClient(tree).props.props.input.music).toBe(true)
  await pane.press({ key: 'music-playpause' })
  await clock.advance(50)
  expect(ran).toContain(PLAY_PAUSE)
  await pane.unmount()
})

test('Spotify closed: the tab says so and the pet does not dance', { timeoutMs: 20000 }, async ($, on) => {
  boot(on, {}, { ...LINUX_BUS, [BUS]: { exitCode: 1, stdout: '' } })
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(50)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-music' })
  await clock.advance(50)
  const tree = await pane.drawn()
  expect(text(tree)).toContain("Open Spotify to see what's playing.")
  expect(petClient(tree).props.props.input.music).toBeFalsy()
  await pane.unmount()
})

test('a press during a read leaves one poll loop', { timeoutMs: 20000 }, async ($, on) => {
  const { ran } = boot(on, {}, { ...LINUX_BUS, [BUS]: ok(PLAYING), [PLAY_PAUSE]: ok() })
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(50)
  // the controls render only on the Music tab: open it, press twice, then leave it so the cadence is 2 s
  const p = await mountPane($)
  await p.press({ key: 'tab-music' })
  await clock.advance(50)
  await p.press({ key: 'music-playpause' })
  await p.press({ key: 'music-playpause' })
  await p.press({ key: 'tab-plan' })
  await clock.advance(50)
  const before = reads(ran)
  for (let i = 0; i < 20; i++) await clock.advance(1000)
  // one loop at 2 s is 10 reads in 20 s; two loops would be 20 or more
  expect(reads(ran) - before).toBeLessThanOrEqual(11)
  expect(reads(ran) - before).toBeGreaterThanOrEqual(9)
  await p.unmount()
})

test('the Music tab selected but the pane closed polls at the 2 s cadence', { timeoutMs: 20000 }, async ($, on) => {
  const { ran } = boot(on, {}, { ...LINUX_BUS, [BUS]: ok(PLAYING) }, false)
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(50)
  const p = await mountPane($)
  await p.press({ key: 'tab-music' })
  await clock.advance(50)
  const before = reads(ran)
  for (let i = 0; i < 20; i++) await clock.advance(1000)
  // 1 s cadence would be 20 reads in 20 s; 2 s is 10
  expect(reads(ran) - before).toBeLessThanOrEqual(11)
  expect(reads(ran) - before).toBeGreaterThanOrEqual(9)
  await p.unmount()
})

const DIR = '/fake/.claude/ops-control/instances'

test('a copy that is off never polls Spotify', { timeoutMs: 20000 }, async ($, on) => {
  const files = {
    '/fake/.claude/settings.json': '{}',
    '/elsewhere/ops-control/.claude-plugin/plugin.json': '{}',
    [`${DIR}/s1.aa.json`]: JSON.stringify({ root: '/elsewhere/ops-control', at: Date.now() - 1000 }),
  }
  const { ran } = boot(on, files, { ...LINUX_BUS, [BUS]: ok(PLAYING) })
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(20_000)
  expect(ran.filter(a => a.startsWith('busctl'))).toEqual([])
})

// Each test names its own cover, so no two tests share a cache key even if module state outlived a test.
const playingArt = (track: string, art: string) => ['{"type":"s","data":"Playing"}', `{"type":"a{sv}","data":{"mpris:trackid":{"type":"s","data":"/com/spotify/track/${track}"},"xesam:title":{"type":"s","data":"Song ${track}"},"mpris:length":{"type":"t","data":9000000},"mpris:artUrl":{"type":"s","data":"https://i.scdn.co/image/ab67616d0000b273${art}"}}}`, '{"type":"x","data":1000000}'].join('\n')
const artCmd = (art: string) => `/gi spotify-art --size 8 https://i.scdn.co/image/ab67616d00004851${art}`
const ART_OUT = JSON.stringify({ w: 8, h: 8, rgb: toBase64Url(Uint8Array.from({ length: 192 }, (_, i) => [16, 32, 48][i % 3]!)) })
const artRuns = (ran: string[]) => ran.filter(a => a.includes(' spotify-art ')).length
const seekClient = (tree: any) => walk(tree).find(n => n?.type === 'Client' && String(n.props?.module).endsWith('client/seekbar.tsx'))

test('the bar is the seek Client; its post seeks Spotify at the track it is in', async ($, on) => {
  const SEEK = `busctl --user call ${DEST} SetPosition ox /com/spotify/track/t 4000000`
  const { ran } = boot(on, {}, { ...LINUX_BUS, [BUS]: ok(PLAYING), [SEEK]: ok() })
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(50)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-music' })
  await clock.advance(50)
  const seek = seekClient(await pane.drawn())
  expect(seek.props.key).toBe('ops-control-seek')
  expect(seek.props.props).toMatchObject({ kind: 'progress', durationMs: 9000, playing: true })
  await pane.post({ kind: 'seek', ms: 4000 }, { in: 'ops-control-seek' })
  await clock.advance(50)
  expect(ran).toContain(SEEK)
  await pane.unmount()
})

test('a cover is fetched once through the helper and drawn as half-blocks', async ($, on) => {
  const { ran } = boot(on, { '/gi': '' }, { ...LINUX_BUS, [BUS]: ok(playingArt('t1', 'a1')), [artCmd('a1')]: ok(ART_OUT) }, true, { OPS_CONTROL_BIN: '/gi' })
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(50)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-music' })
  for (let i = 0; i < 5; i++) await clock.advance(1000)
  expect(text(await pane.drawn())).toContain('▀▀▀▀▀▀▀▀')
  expect(ran.filter(a => a === artCmd('a1'))).toHaveLength(1)
  await pane.unmount()
})

test('a cover that fails is fetched once', async ($, on) => {
  const { ran } = boot(on, { '/gi': '' }, { ...LINUX_BUS, [BUS]: ok(playingArt('t2', 'a2')), [artCmd('a2')]: { exitCode: 1, stdout: '' } }, true, { OPS_CONTROL_BIN: '/gi' })
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(50)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-music' })
  for (let i = 0; i < 10; i++) await clock.advance(1000)
  expect(ran.filter(a => a === artCmd('a2'))).toHaveLength(1)
  expect(text(await pane.drawn())).toContain('♪')
  await pane.unmount()
})

test('no helper binary: two tracks, no helper run and no toast', async ($, on) => {
  // no OPS_CONTROL_BIN and no installer/ in the plugin root; plugin.json is unreadable here, so the version is dev and ensureBinary gives up without downloading
  const answers = { ...LINUX_BUS, [BUS]: ok(playingArt('t3', 'a3')) }
  const { ran, toasts } = boot(on, {}, answers)
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(50)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-music' })
  for (let i = 0; i < 4; i++) await clock.advance(1000)
  answers[BUS] = ok(playingArt('t4', 'a4'))
  for (let i = 0; i < 4; i++) await clock.advance(1000)
  expect(text(await pane.drawn())).toContain('Song t4')
  expect(artRuns(ran)).toBe(0)
  expect(toasts.filter(t => t.includes('glowup-installer'))).toEqual([])
  await pane.unmount()
})

test('an old helper without spotify-art is given up on', async ($, on) => {
  // a build from before spotify-art hands it to cli.Parse, which refuses positional arguments and exits 2
  const answers = { ...LINUX_BUS, [BUS]: ok(playingArt('t5', 'a5')), [artCmd('a5')]: { exitCode: 2, stdout: '' }, [artCmd('a6')]: ok(ART_OUT) }
  const { ran } = boot(on, { '/gi': '' }, answers, true, { OPS_CONTROL_BIN: '/gi' })
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(50)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-music' })
  for (let i = 0; i < 4; i++) await clock.advance(1000)
  answers[BUS] = ok(playingArt('t6', 'a6'))
  for (let i = 0; i < 4; i++) await clock.advance(1000)
  expect(artRuns(ran)).toBe(1)
  await pane.unmount()
})

test('the cover waits for the Music tab', async ($, on) => {
  const { ran } = boot(on, { '/gi': '' }, { ...LINUX_BUS, [BUS]: ok(playingArt('t7', 'a7')), [artCmd('a7')]: ok(ART_OUT) }, true, { OPS_CONTROL_BIN: '/gi' })
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(50)
  const pane = await mountPane($)
  // the pane opens on Plan: Spotify is read, but no cover is fetched
  for (let i = 0; i < 12; i++) await clock.advance(1000)
  expect(ran).toContain(BUS)
  expect(artRuns(ran)).toBe(0)
  await pane.press({ key: 'tab-music' })
  for (let i = 0; i < 3; i++) await clock.advance(1000)
  expect(artRuns(ran)).toBe(1)
  await pane.unmount()
})

test('on Linux the extras read is shown but there is no shuffle button', async ($, on) => {
  const EXTRAS = `busctl --user --json=short get-property ${DEST} Shuffle LoopStatus Volume`
  const { ran } = boot(on, {}, { ...LINUX_BUS, [BUS]: ok(PLAYING), [EXTRAS]: ok('{"type":"b","data":true}\n{"type":"s","data":"None"}\n{"type":"d","data":1}') })
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(50)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-music' })
  await clock.advance(50)
  expect(ran).toContain(EXTRAS)
  expect(walk(await pane.drawn()).some(n => n?.props?.key === 'music-shuffle')).toBe(false)
  await pane.unmount()
})

// With no seek Client (VS Code, mobile) the static bar only moves when the pane redraws, so each read must.
test('surfaces without a seek Client redraw on every read; the terminal does not', async ($, on) => {
  // While the VS Code half runs, each read reports the track a second further on, so the static bar has something new
  // to draw. The hooks time the reads with Date.now(), which the mocked clock does not move: in the terminal half a
  // moving position would read as a seek, so it reports the same one, as a player read within the same instant does.
  const answers: Record<string, { exitCode: number; stdout: string }> = { ...LINUX_BUS }
  let moving = true, second = 1
  Object.defineProperty(answers, BUS, { enumerable: true, get: () => ok(PLAYING.replace('"data":9000000', '"data":600000000').replace('"data":1000000}', `"data":${(moving ? second++ : second) * 1000000}}`)) })
  const { ran } = boot(on, {}, answers)
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(50)
  const redrawn = async (surface: string) => {
    const pane = await mountPane($, surface)
    await pane.press({ key: 'tab-music' })
    await clock.advance(50)
    const before = JSON.stringify(await pane.drawn()), r0 = reads(ran)
    for (let i = 0; i < 4; i++) await clock.advance(1000)
    const out = { reads: reads(ran) - r0, changed: JSON.stringify(await pane.drawn()) !== before }
    await pane.unmount()
    return out
  }
  const vscode = await redrawn('vscode')
  moving = false
  const term = await redrawn('terminal')
  expect(vscode.reads).toBeGreaterThan(0)
  expect(vscode.changed).toBe(true)
  expect(term.reads).toBeGreaterThan(0)
  expect(term.changed).toBe(false)
})

test('pet.dance off: Spotify playing does not make the pet dance', async ($, on) => {
  boot(on, {}, { ...LINUX_BUS, [BUS]: ok(PLAYING) }, true, {}, { setup: { format: 4, pet: { sleepMs: 60000, dance: false } } })
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(50)
  const pane = await mountPane($)
  await pane.press({ key: 'tab-music' })
  await clock.advance(50)
  const tree = await pane.drawn()
  expect(text(tree)).toContain('Song')
  expect(petClient(tree).props.props.input.music).toBe(false)
  await pane.unmount()
})
