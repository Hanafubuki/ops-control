import { expect, mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { fakeFs, test } from './kit.ts'
import { toBase64Url } from '../hooks/link.ts'
import { PS_PROBE } from '../hooks/music/smtc.ts'

// Under WSL ops-control reads Windows' media sessions through one PowerShell watcher: a YouTube tab in Chrome shows
// in the Music tab with the app's name and the video's picture, and play/pause runs on that session.
const ENGINE_ROW = { type: 'Text', props: {}, children: ['engine row'] } as RenderElement
const PANE = { title: 'ops-control', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as never
const walk = (n: any, out: any[] = []): any[] => { if (typeof n === 'string') out.push(n); else if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }
const text = (tree: any) => walk(tree).filter(n => typeof n === 'string').join(' ')
const KEY = 'Chrome|lock in and do the work, guys.|livinobody'
const CHROME = { app: 'Chrome', cur: true, st: 'Playing', ti: 'lock in and do the work, guys.', ar: 'livinobody', al: '', pos: 1000, start: 0, end: 11021301, upd: 0, sh: null, rp: '', pp: true, nx: false, pv: false, sk: true, she: false, rpe: false }
const SESSIONS = JSON.stringify({ k: 's', s: [CHROME] })
const ART = JSON.stringify({ k: 'a', key: KEY, w: 32, h: 32, rgb: toBase64Url(new Uint8Array(32 * 32 * 3).fill(120)) })

function boot(on: any, lines: string[], probe = true) {
  const ran: string[] = [], spawned: string[][] = []
  const answers: Record<string, { exitCode: number; stdout: string }> = { 'uname -s': { exitCode: 0, stdout: 'Linux\n' }, 'busctl --json=short --version': { exitCode: 0, stdout: 'systemd 255' } }
  if (probe) answers[PS_PROBE.join(' ')] = { exitCode: 0, stdout: '' }
  // with PowerShell there, every control run of it succeeds; without it, none does
  fakeFs(on, {}, argv => { const k = argv.join(' '); ran.push(k); return answers[k] ?? (probe && argv[0] === 'powershell.exe' ? { exitCode: 0, stdout: '' } : undefined) }, { WSL_DISTRO_NAME: 'Ubuntu' })
  mock.store(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  on('ui.render', async () => ENGINE_ROW)
  on('ui.panes', async () => ({ value: [{ id: 'ops-control', isShown: true, isPlaced: true }] }))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('process.spawn', async function* (_$: unknown, e: any) {
    spawned.push(e.argv)
    if (e.argv[0] !== 'powershell.exe') return { value: { code: 127, signal: null } }
    yield { stream: 'stdout', text: lines.join('\n') + '\n' }
    return { value: { code: 0, signal: null } }
  } as never)
  return { ran, spawned }
}

test('WSL: a YouTube tab in Chrome is what the Music tab shows, named by its app, with its picture as the cover', async ($, on) => {
  const { ran, spawned } = boot(on, [SESSIONS, ART])
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(50)
  expect(ran).toContain(PS_PROBE.join(' '))
  expect(spawned[0]!.slice(0, 5)).toEqual(['powershell.exe', '-NoLogo', '-NoProfile', '-NonInteractive', '-Command'])
  // the Linux bus is never read under WSL when Windows answers
  expect(ran.some(a => a.startsWith('busctl --user'))).toBe(false)
  const pane = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'Pane', requestId: 'ops-control', props: PANE })
  await pane.press({ key: 'tab-music' })
  for (let i = 0; i < 3; i++) await clock.advance(1000)
  const shown = text(await pane.drawn())
  expect(shown).toContain('NOW PLAYING')
  expect(shown).toContain('Chrome')
  expect(shown).toContain('lock in and do the work, guys.')
  expect(shown).toContain('livinobody')
  // the cover is the picture Windows gave, drawn as half-blocks with no helper and no download
  expect(shown).toContain('▀▀▀▀▀▀▀▀')
  expect(ran.some(a => a.includes('spotify-art'))).toBe(false)
  await pane.press({ key: 'music-playpause' })
  await clock.advance(50)
  expect(ran.some(a => a.startsWith('powershell.exe') && a.includes("SourceAppUserModelId -eq 'Chrome'") && a.includes('TryTogglePlayPauseAsync()'))).toBe(true)
  await pane.unmount()
})

test('WSL, nothing playing anywhere: the tab says so without naming Spotify alone', async ($, on) => {
  boot(on, [JSON.stringify({ k: 's', s: [] })])
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(50)
  const pane = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'Pane', requestId: 'ops-control', props: PANE })
  await pane.press({ key: 'tab-music' })
  await clock.advance(1000)
  const shown = text(await pane.drawn())
  expect(shown).toContain('Nothing playing in Spotify or a browser.')
  expect(shown).not.toContain('Spotify  ─')
  await pane.unmount()
})

test('WSL without Windows PowerShell keeps the Linux reader', async ($, on) => {
  const { ran, spawned } = boot(on, [SESSIONS], false)
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.advance(1000)
  expect(spawned).toHaveLength(0)
  expect(ran.some(a => a.startsWith('busctl --user'))).toBe(true)
})
