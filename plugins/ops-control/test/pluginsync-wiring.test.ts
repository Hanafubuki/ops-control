import { expect, mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { fakeFs, runOpsControl, test } from './kit.ts'

const OPTS = { pack: 'classic', theme: 'classic', spinner: 'pack', pet: 'clawd', bubbles: 'on', statusline: 'activity,ctx,effort,5h,week', reducedMotion: false }
const CACHE = '/fake/.claude/plugins/cache/ops-control/ops-control'

function boot(on: Parameters<typeof fakeFs>[0], files: Record<string, string> = {}, seed: Record<string, unknown> = {}) {
  const fs = fakeFs(on, { '/fake/.claude/settings.json': '{}', ...files })
  mock.store(on, seed)
  const toasts: string[] = []
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async (_$, e) => { toasts.push(e.text); return { value: undefined } as never })
  on('ui.panes', async () => ({ value: [] }))
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine'] }) as RenderElement)
  on('session.id', async () => ({ value: 's1' }))
  on('session.surfaces', async () => ({ value: ['terminal'] }) as never)
  return { ...fs, toasts }
}
const start = ($: any, interactive = false) => $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: interactive })

test('the first session records /plugin values and applies nothing', async ($, on) => {
  const { toasts } = boot(on)
  mock.clock(on)
  await start($)
  expect(toasts).toEqual([])
  expect((await runOpsControl($, 'pet list')).text).toContain('● clawd')
})

test('a /plugin edit made since the last session is applied as the saved choice, and says so', { options: { ...OPTS, pack: 'crt', pet: 'off' } }, async ($, on) => {
  const { toasts } = boot(on, {}, { 'plugin-seen': { ...OPTS } })
  mock.clock(on)
  await start($)
  expect(toasts).toEqual(['Applied from /plugin: pack crt, pet off.'])
  expect((await runOpsControl($, 'pet list')).text).toContain('● off')
  expect((await runOpsControl($, 'pack list')).text).toContain('● crt')
  await start($)
  expect(toasts).toHaveLength(1)
})

test('a /ops command after a /plugin edit wins at the next start', { options: { ...OPTS, pet: 'off' } }, async ($, on) => {
  boot(on, {}, { 'plugin-seen': { ...OPTS } })
  mock.clock(on)
  await start($)
  await runOpsControl($, 'pet clawd')
  await start($)
  expect((await runOpsControl($, 'pet list')).text).toContain('● clawd')
})

test('an unknown pack in /plugin is reported and not retried', { options: { ...OPTS, pack: 'nope' } }, async ($, on) => {
  const { toasts } = boot(on, {}, { 'plugin-seen': { ...OPTS } })
  mock.clock(on)
  await start($)
  const told = () => toasts.filter(t => t.startsWith('Not applied'))
  expect(told()).toEqual(['Not applied: pack nope: pack "nope" colors: no pack named "nope"'])
  await start($)
  expect(told()).toHaveLength(1)
})

test('a first run with no snapshot keeps the saved mix, pet and bubbles that differ from /plugin', { options: { ...OPTS, pack: 'crt', pet: 'clawd', bubbles: 'on' } }, async ($, on) => {
  const { toasts } = boot(on, {}, { mix: { colors: 'arcade', motion: 'arcade', theme: 'dusk' }, pet: 'off', bubbles: 'off' })
  mock.clock(on)
  await start($)
  expect(toasts.filter(t => t.includes('/plugin'))).toEqual([])
  expect((await runOpsControl($, 'pack list')).text).toContain('custom mix: colors arcade, motion arcade, theme dusk')
  expect((await runOpsControl($, 'pet list')).text).toContain('● off')
  expect((await runOpsControl($, 'bubbles')).text).toContain('Bubbles: off')
})

test('setting the theme back to classic in /plugin brings the pack\'s own colors back', { options: { ...OPTS, pack: 'arcade', theme: 'classic' } }, async ($, on) => {
  boot(on, {}, { 'plugin-seen': { ...OPTS, pack: 'arcade', theme: 'dusk' }, mix: { colors: 'arcade', motion: 'arcade', theme: 'dusk' }, theme: 'dusk' })
  mock.clock(on)
  await start($)
  expect((await runOpsControl($, 'pack list')).text).toContain('● arcade')
  expect((await runOpsControl($, 'pack list')).text).not.toContain('custom mix')
})

test('a pack change in /plugin keeps the /plugin theme and spinner on top of the new pack', { options: { ...OPTS, pack: 'crt', theme: 'dusk', spinner: 'comet' } }, async ($, on) => {
  boot(on, {}, { 'plugin-seen': { ...OPTS, theme: 'dusk', spinner: 'comet' }, mix: { colors: 'classic', motion: 'classic', theme: 'dusk', spinner: 'comet' } })
  mock.clock(on)
  await start($)
  expect((await runOpsControl($, 'pack list')).text).toContain('custom mix: colors crt, motion crt, theme dusk, spinner comet')
})

test('a dev copy shows no older-copy toast even when another folder is recorded', async ($, on) => {
  const installed = JSON.stringify({ plugins: { 'ops-control@ops-control': [{ scope: 'user', installPath: `${CACHE}/9.9.9`, version: '9.9.9' }] } })
  const { toasts } = boot(on, { '/fake/.claude/plugins/installed_plugins.json': installed })
  const clock = mock.clock(on)
  await start($, true)
  await clock.advance(120_000)
  expect(toasts.filter(t => t.includes('is installed'))).toEqual([])
})
