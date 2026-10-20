import { expect, mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { runOpsControl, fakeFs, test } from './kit.ts'
import { USAGE } from '../hooks/command.ts'
import { decodeLink } from '../hooks/link.ts'
import { PACKS } from '../hooks/packpresets.ts'
import { resolveLook, DEFAULT_MIX } from '../hooks/packs.ts'

const setup = (on: any, surfaces: string[] = ['terminal'], files: Record<string, string> = {}) => {
  fakeFs(on, files)
  mock.store(on)
  const opens: any[] = [], copies: string[] = [], closes: any[] = [], copyResult: { value: unknown } = { value: { isCopied: true } }
  on('ui.open', async (_$: unknown, e: unknown) => { opens.push(e); return { value: { isPlaced: true } } as never })
  on('ui.close', async (_$: unknown, e: unknown) => { closes.push(e); return { value: undefined } as never })
  on('ui.copy', async (_$: unknown, e: any) => { copies.push(e.text); if (copyResult.value instanceof Error) throw copyResult.value; return copyResult as never })
  on('ui.panes', async () => ({ value: [] }))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine'] }) as RenderElement)
  on('session.surfaces', async () => ({ value: surfaces }) as never)
  on('session.id', async () => ({ value: 's1' }))
  return { opens, copies, closes, copyResult }
}
const mountConfig = ($: any, surface = 'terminal') => $.ui.mount({ plugin: 'ops-control', surface, component: 'Pane', requestId: 'ops-control-config', props: { title: 'ops-control config', isFocused: true, bodyColumns: 90, placement: 'inline', scroll: { offset: 0, bodyRows: 40 }, view: {} } })

test('/ops config opens the focused config pane and asks nothing', async ($, on) => {
  const s = setup(on)
  const out = await runOpsControl($, 'config pane')
  expect(s.opens.map(o => o.id)).toEqual(['ops-control-config'])
  expect(s.opens[0].focus).toBe(true)
  expect(s.opens[0].closeOnEscape).toBe(true)
  expect(out.text).toContain('Esc closes it')
})

test('a headless /ops config prints the usage', async ($, on) => {
  setup(on, [])
  expect((await runOpsControl($, 'config')).text).toBe(USAGE)
})

test('Enter on Pack applies the next pack through the pack command', async ($, on) => {
  setup(on)
  await runOpsControl($, 'config pane')
  const ui = await mountConfig($)
  await ui.press({ key: 'cycle-pack' })
  expect((await runOpsControl($, 'pack list')).text).toMatch(/● \S+/)
  expect((await runOpsControl($, 'pack list')).text).not.toContain('● classic')
  await ui.unmount()
})

test('a submitted hex sets the override; a bad one leaves it and says why', async ($, on) => {
  setup(on)
  await runOpsControl($, 'config pane')
  const ui = await mountConfig($)
  await ui.input({ key: 'input-color:accent', text: '112233', kind: 'submit' })
  expect((await runOpsControl($, 'color list')).text).toContain('● accent #112233')
  await ui.input({ key: 'input-color:accent', text: 'blue', kind: 'submit' })
  expect((await runOpsControl($, 'color list')).text).toContain('● accent #112233')
  expect(await ui.find({ text: /is not a color/ })).toBeDefined()
  await ui.unmount()
})

test('submitting a field unchanged runs nothing and draws no note', async ($, on) => {
  setup(on)
  await runOpsControl($, 'config pane')
  const ui = await mountConfig($)
  const accent = resolveLook(DEFAULT_MIX, {}, {}).look.theme.colors.accent
  await ui.input({ key: 'input-color:accent', text: accent, kind: 'submit' })
  expect(await ui.find({ type: 'Text', text: /^Color accent/ })).toBeUndefined()
  expect((await runOpsControl($, 'color list')).text).toContain('○ accent')
  await ui.unmount()
})

test('tabs typed in a new order reorder the main pane', async ($, on) => {
  setup(on)
  await runOpsControl($, 'config pane')
  const ui = await mountConfig($)
  await ui.input({ key: 'input-tabs', text: 'plan, diff', kind: 'submit' })
  expect((await runOpsControl($, 'setup')).text).toContain('tabs           plan, diff')
  await ui.unmount()
})

test('a setup change names its own setting in the note, not the first row', async ($, on) => {
  setup(on)
  await runOpsControl($, 'config pane')
  const ui = await mountConfig($)
  await ui.input({ key: 'input-tabs', text: 'plan, diff', kind: 'submit' })
  const note = await ui.find({ type: 'Text', text: /plan, diff/ })
  expect(note).toBeDefined()
  expect(String(note!.children.join(''))).not.toMatch(/^band/)
  expect(String(note!.children.join(''))).toMatch(/^tabs/)
  await ui.unmount()
})

test('a pack deleted after the pane opened shows the error and the pane keeps drawing', async ($, on) => {
  const files = { '/fake/.claude/ops-control/packs/zzz.json': JSON.stringify({ format: 1, name: 'zzz', colors: { meters: 'dither' } }) }
  setup(on, ['terminal'], files)
  // the config dir the pack is read from is set at session start
  mock.clock(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  expect((await runOpsControl($, 'pack zzz')).text).toBe('Pack: zzz')
  // the last built-in is followed by zzz in the cycle
  await runOpsControl($, `pack ${Object.keys(PACKS).at(-1)}`)
  await runOpsControl($, 'config pane')
  delete (files as Record<string, string>)['/fake/.claude/ops-control/packs/zzz.json']
  const ui = await mountConfig($)
  const last = Object.keys(PACKS).at(-1)!
  const fail = resolveLook({ colors: last, motion: last }, {}, {}).look.theme.colors.fail
  await ui.press({ key: 'cycle-pack' })
  const note = await ui.find({ type: 'Text', text: /no pack named "zzz"/ })
  expect(note?.props.color).toBe(fail)
  expect(await ui.find({ key: 'cycle-pack' })).toBeDefined()
  await ui.unmount()
})

const PETS = '/fake/.claude/ops-control/pets'
const petJson = (name: string) => JSON.stringify({ format: 1, name, palette: { A: '#abcdef' }, animations: { idle: [{ ms: 400, px: Array(12).fill('A'.repeat(24)) }] } })
const petSetup = async ($: any, on: any, files: Record<string, string>) => {
  setup(on, ['terminal'], files)
  mock.clock(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
}

test('the Pet row skips a pet file that does not load', async ($, on) => {
  await petSetup($, on, { [`${PETS}/broken.json`]: '{"format":1', [`${PETS}/mochi.json`]: petJson('mochi') })
  await runOpsControl($, 'config pane')
  const ui = await mountConfig($)
  await ui.press({ key: 'cycle-pet' })
  await ui.press({ key: 'cycle-pet' })
  await ui.press({ key: 'cycle-pet' })
  expect((await runOpsControl($, 'pet list')).text).toContain('● mochi')
  await ui.unmount()
})

test('a pet deleted after the pane opened is refused once, then dropped from the Pet row', async ($, on) => {
  const files = { [`${PETS}/mochi.json`]: petJson('mochi') }
  await petSetup($, on, files)
  await runOpsControl($, 'pet ghost')
  await runOpsControl($, 'config pane')
  const ui = await mountConfig($)
  delete (files as Record<string, string>)[`${PETS}/mochi.json`]
  await ui.press({ key: 'cycle-pet' })
  expect((await runOpsControl($, 'pet list')).text).toContain('● ghost')
  await ui.press({ key: 'cycle-pet' })
  expect((await runOpsControl($, 'pet list')).text).toContain('● off')
  await ui.unmount()
})

test('Done closes the config pane only', async ($, on) => {
  const s = setup(on)
  await runOpsControl($, 'config pane')
  const ui = await mountConfig($)
  await ui.press({ key: 'done' })
  expect(s.closes.map(c => c.id)).toEqual(['ops-control-config'])
  await ui.unmount()
})

test('the meter cycle runs both of its commands', async ($, on) => {
  setup(on)
  await runOpsControl($, 'config pane')
  const ui = await mountConfig($)
  await ui.press({ key: 'cycle-meter' })
  const text = (await runOpsControl($, 'setup')).text!
  expect(text).toContain('meter.warn     60')
  expect(text).toContain('meter.danger   85')
  await ui.unmount()
})

test('/ops config output is no longer drawn as a card', async ($, on) => {
  setup(on)
  const text = (await runOpsControl($, 'config pane')).text!
  const ui = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'CommandOutput', props: { command: 'ops', args: 'config', text, isErrored: false } })
  expect(await ui.find({ text: 'engine' })).toBeDefined()
  await ui.unmount()
})

const answer = (on: any, a: 'Yes' | 'No') => on('tool.call', async (_$: unknown, e: any) => e.tool === 'AskUserQuestion'
  ? { result: { questions: [], answers: { [e.questions[0].question]: a } }, text: a } as never
  : { result: {}, text: '' } as never)

test('Reset asks, then clears color overrides and the setup', async ($, on) => {
  setup(on)
  answer(on, 'Yes')
  await runOpsControl($, 'color accent #112233')
  await runOpsControl($, 'setup tabs plan')
  await runOpsControl($, 'config pane')
  const ui = await mountConfig($)
  await ui.press({ key: 'reset' })
  expect((await runOpsControl($, 'color list')).text).not.toContain('● accent')
  expect((await runOpsControl($, 'setup')).text).toContain('tabs           plan, context, guardrails, agents, diff, music')
  expect(await ui.find({ text: /back to their defaults/ })).toBeDefined()
  await ui.unmount()
})

test('Reset with only a setup change still resets it', async ($, on) => {
  setup(on)
  answer(on, 'Yes')
  await runOpsControl($, 'setup tabs plan')
  await runOpsControl($, 'config pane')
  const ui = await mountConfig($)
  await ui.press({ key: 'reset' })
  expect((await runOpsControl($, 'setup')).text).toContain('tabs           plan, context, guardrails, agents, diff, music')
  expect(await ui.find({ text: /back to their defaults/ })).toBeDefined()
  await ui.unmount()
})

test('Reset with only a color override still resets it', async ($, on) => {
  setup(on)
  answer(on, 'Yes')
  await runOpsControl($, 'color accent #112233')
  await runOpsControl($, 'config pane')
  const ui = await mountConfig($)
  await ui.press({ key: 'reset' })
  expect((await runOpsControl($, 'color list')).text).not.toContain('● accent')
  await ui.unmount()
})

test('Reset answered No changes nothing', async ($, on) => {
  setup(on)
  answer(on, 'No')
  await runOpsControl($, 'color accent #112233')
  await runOpsControl($, 'setup tabs plan')
  await runOpsControl($, 'config pane')
  const ui = await mountConfig($)
  await ui.press({ key: 'reset' })
  expect((await runOpsControl($, 'color list')).text).toContain('● accent #112233')
  expect((await runOpsControl($, 'setup')).text).toContain('tabs           plan')
  await ui.unmount()
})

test('Copy studio link copies the whole link, not a clipped one', async ($, on) => {
  // The link reaches about 1.2k here and cannot pass 2048: pack names stop at 40 characters and the setup is small.
  const s = setup(on)
  await runOpsControl($, 'pack arcade')
  const roles = ['accent', 'text', 'dim', 'faint', 'read', 'edit', 'shell', 'agent', 'pass', 'fail', 'panel', 'addBg', 'delBg', 'sel']
  for (const role of roles) await runOpsControl($, `color ${role} #123456`)
  await runOpsControl($, 'config pane')
  const ui = await mountConfig($)
  await ui.press({ key: 'copy-link' })
  expect(s.copies).toHaveLength(1)
  expect(s.copies[0]!.length).toBeGreaterThan(1000)
  expect(s.copies[0]).toMatch(/^https:\/\/glowup\.khimani\.dev\/studio#v=1&p=[A-Za-z0-9_-]+&s=[A-Za-z0-9_-]+$/)
  expect(await ui.find({ text: /copied/ })).toBeDefined()
  await ui.unmount()
})

test('the copied studio link names a built-in pack my-<pack>, since /ops pack refuses built-in names', async ($, on) => {
  const s = setup(on)
  await runOpsControl($, 'pack arcade')
  await runOpsControl($, 'config pane')
  const ui = await mountConfig($)
  await ui.press({ key: 'copy-link' })
  expect((decodeLink(s.copies[0]!).parts.pack as { name: string }).name).toBe('my-arcade')
  await ui.unmount()
})

test('a copy that throws is reported as an error, not success', async ($, on) => {
  const s = setup(on)
  s.copyResult.value = new Error('clipboard blocked')
  await runOpsControl($, 'config pane')
  const ui = await mountConfig($)
  await ui.press({ key: 'copy-link' })
  expect(await ui.find({ text: /Could not copy the studio link: \S/ })).toBeDefined()
  expect(await ui.find({ text: /Studio link copied/ })).toBeUndefined()
  await ui.unmount()
})

test('a copy that did not happen says why instead of claiming success', async ($, on) => {
  const s = setup(on)
  s.copyResult.value = { isCopied: false, reason: 'no-clipboard' }
  await runOpsControl($, 'config pane')
  const ui = await mountConfig($)
  await ui.press({ key: 'copy-link' })
  expect(await ui.find({ text: /Could not copy the studio link: no-clipboard/ })).toBeDefined()
  expect(await ui.find({ text: /Studio link copied/ })).toBeUndefined()
  await ui.unmount()
})
