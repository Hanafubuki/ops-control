import { expect, mock } from 'claude-code/testing'
import { runPin } from '../hooks/opspin.tsx'
import { DEFAULT_MIX, resolveLook } from '../hooks/packs.ts'
import { fakeFs, test } from './kit.ts'

const walk = (n: any, out: any[] = []): any[] => { if (typeof n === 'string') out.push(n); else if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }
const textOf = (n: any) => walk(n).filter(x => typeof x === 'string').join('')
const keyOf = (n: any) => n.props?.key ?? n.key

test('runPin pins, lists, removes and clears', () => {
  let r = runPin([], '  check  the deploy ')
  expect(r).toEqual({ pins: ['check the deploy'], text: 'Pinned #1.' })
  r = runPin(r.pins, 'second one')
  expect(runPin(r.pins, '').text).toBe('1 · check the deploy\n2 · second one')
  expect(runPin(r.pins, 'remove 1')).toEqual({ pins: ['second one'], text: 'Unpinned #1.' })
  expect(runPin(r.pins, 'remove 9').text).toBe('No pin #9.')
  expect(runPin(r.pins, 'clear').pins).toEqual([])
  expect(runPin([], 'list').text).toMatch(/No pins/)
})

const scroll = { offset: 0, bodyRows: 6 }
const BAND = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll, view: {} }

function boot(on: Parameters<typeof fakeFs>[0]) {
  fakeFs(on)
  const store: Record<string, unknown> = {}
  on('store.get', async (_$, e: any) => ({ value: store[e.key] }) as never)
  on('store.set', async (_$, e: any) => { store[e.key] = e.value; return { value: undefined } as never })
  on('store.delete', async (_$, e: any) => { delete store[e.key]; return { value: undefined } as never })
  on('store.keys', async () => ({ value: Object.keys(store) }) as never)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.panes', async () => ({ value: [] }))
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine'] }) as never)
  mock.clock(on)
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  return store
}
const AT = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } } as const

test('/opspin pins a note over the prompt, kept in the store for the session', async ($, on) => {
  boot(on)
  await $.session.start({ cwd: '/fake/proj', surface: 'terminal', isInteractive: true })
  const r = await $.command.run({ command: 'opspin', args: 'ship the release notes', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect(JSON.stringify(r)).toMatch(/Pinned #1/)
  const ui = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ text: /ship the release notes/ })).toBeDefined()
  await $.command.run({ command: 'opspin', args: 'clear', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  await ui.redraw()
  expect(await ui.find({ text: /ship the release notes/ })).toBeUndefined()
  await ui.unmount()
})

test('the pins sit in one box in the pack border, padded, each row fitted inside it', async ($, on) => {
  boot(on)
  await $.session.start({ cwd: '/fake/proj', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'opspin', args: 'ship the release notes', ...AT })
  await $.command.run({ command: 'opspin', args: 'x'.repeat(200), ...AT })
  const ui = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  const box = walk(await ui.drawn()).find(n => keyOf(n) === 'opspin')
  const { look } = resolveLook(DEFAULT_MIX, {}, {})
  expect(box.props).toMatchObject({ borderStyle: look.border, borderColor: look.borderColor, paddingX: 1, width: 100 })
  const rows = walk(box).filter(n => /^opspin-\d+$/.test(keyOf(n) ?? '')).map(textOf)
  expect(rows[0]).toBe('▍ 1 ship the release notes')
  // 100 columns less the border and a cell of padding on each side
  expect(rows[1]).toHaveLength(96)
  expect(rows[1]).toMatch(/^▍ 2 x+…$/)
  await ui.unmount()
})

test('/opspinclear unpins every note and empties the stored list', async ($, on) => {
  const store = boot(on)
  await $.session.start({ cwd: '/fake/proj', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'opspin', args: 'first', ...AT })
  await $.command.run({ command: 'opspin', args: 'second', ...AT })
  const ui = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ text: /second/ })).toBeDefined()
  const r = await $.command.run({ command: 'opspinclear', args: '', ...AT })
  expect(JSON.stringify(r)).toMatch(/Unpinned 2\./)
  await ui.redraw()
  expect(walk(await ui.drawn()).find(n => keyOf(n) === 'opspin')).toBeUndefined()
  expect(store['opspin:s1']).toEqual([])
  expect(JSON.stringify(await $.command.run({ command: 'opspinclear', args: '', ...AT }))).toMatch(/No pins\./)
  await ui.unmount()
})
