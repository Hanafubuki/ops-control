import { test, expect, mock } from 'claude-code/testing'
import { runOpsControl, fakeHost, fakeFs } from './kit.ts'
import { runCommand, type Ctl } from '../hooks/command.ts'
import { DEFAULT_FIELDS } from '../hooks/fields.ts'
import { DEFAULT_SETUP } from '../hooks/setup.ts'

const ctl = (colors = 'classic'): Ctl => ({
  current: () => 'classic', setTheme: async () => {}, togglePane: async () => '', setMotion: () => {}, confirm: async () => true,
  mix: () => ({ colors, motion: colors }), setMix: async () => [], pet: () => 'clawd', setPet: () => {}, setOutfit: () => {},
  bubbles: () => 'on', setBubbles: () => {}, reduced: () => false, openConfig: async () => 'ops-control config open (Esc closes it)', openConfigTui: async () => 'ops-control config is opening', openPlayer: async () => 'Music player open (Esc closes it)', spotify: async () => '', headless: async () => true,
  fields: () => DEFAULT_FIELDS, setFields: () => {}, setup: () => DEFAULT_SETUP, setSetup: () => {},
})

const HINT = 'In Konsole: Settings → Edit Current Profile → Appearance → pick "ops-control arcade".'

test('export konsole writes the scheme under the host data dir', async () => {
  const { host, files } = fakeHost()
  const out = await runCommand(host, 'export konsole', ctl('arcade'))
  const path = '/home/u/.local/share/konsole/ops-control-arcade.colorscheme'
  expect(out).toBe(`${path}\n${HINT}`)
  expect(files[path]).toContain('Description=ops-control arcade')
})

test('export konsole replaces an earlier file of the same name', async () => {
  const path = '/home/u/.local/share/konsole/ops-control-arcade.colorscheme'
  const { host, files } = fakeHost({ files: { [path]: 'old' } })
  await runCommand(host, 'export konsole', ctl('arcade'))
  expect(files[path]).toContain('[Background]')
})

test('export with no or an unknown target lists the targets', async () => {
  const { host, files } = fakeHost()
  for (const a of ['export', 'export nope']) expect(await runCommand(host, a, ctl())).toBe('Export targets: konsole')
  expect(Object.keys(files)).toEqual([])
})

// the session's own files: its instance guard and the Sidequest board's character
const notGuard = (p: string) => !p.includes('/ops-control/instances/') && !p.includes('/ops-control/board/')

// session.start is where register.tsx reads the env, so the engine boots first
const engine = async ($: any, on: any, env?: Record<string, string>) => {
  const fs = fakeFs(on, {}, undefined, env)
  mock.clock(on)
  mock.store(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: { cwd: string }) => ({ cwd: e.cwd }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
  on('session.id', async () => ({ value: 's1' }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  return fs
}

test('XDG_DATA_HOME wins over $HOME/.local/share through the engine', { timeoutMs: 20000 }, async ($, on) => {
  const { files } = await engine($, on, { XDG_DATA_HOME: '/xdg' })
  expect((await runOpsControl($, 'export konsole')).text).toContain('/xdg/konsole/ops-control-classic.colorscheme')
  expect(Object.keys(files).filter(notGuard)).toEqual(['/xdg/konsole/ops-control-classic.colorscheme'])
})

test('without XDG_DATA_HOME the file lands in $HOME/.local/share', { timeoutMs: 20000 }, async ($, on) => {
  const { files } = await engine($, on)
  await runOpsControl($, 'export konsole')
  expect(Object.keys(files).filter(notGuard)).toEqual(['/fake/.local/share/konsole/ops-control-classic.colorscheme'])
})

test('a relative XDG_DATA_HOME is ignored per the XDG spec', { timeoutMs: 20000 }, async ($, on) => {
  const { files } = await engine($, on, { XDG_DATA_HOME: 'rel/share' })
  await runOpsControl($, 'export konsole')
  expect(Object.keys(files).filter(notGuard)).toEqual(['/fake/.local/share/konsole/ops-control-classic.colorscheme'])
})

test('export konsole names the file after the theme override that is exported', async () => {
  const { host, files } = fakeHost()
  const c: Ctl = { ...ctl('arcade'), mix: () => ({ colors: 'arcade', motion: 'arcade', theme: 'dusk' }) }
  const out = await runCommand(host, 'export konsole', c)
  const path = '/home/u/.local/share/konsole/ops-control-dusk.colorscheme'
  expect(out).toContain(path)
  expect(files[path]).toContain('Description=ops-control dusk')
  expect(Object.keys(files)).toEqual([path])
})
