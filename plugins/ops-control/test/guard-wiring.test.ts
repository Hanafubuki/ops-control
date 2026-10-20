import { expect, mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { fakeFs, test } from './kit.ts'

declare function setTimeout(fn: (value: unknown) => void, ms: number): unknown
const scroll = { offset: 0, bodyRows: 10 }
const BAND = { hasSurvey: false, isWorking: true, maxRows: 6, bodyColumns: 100, scroll, view: {} }
const DIR = '/fake/.claude/ops-control/instances'
const CACHE = '/fake/.claude/plugins/cache/ops-control/ops-control/0.2.2'

function boot(on: Parameters<typeof fakeFs>[0], files: Record<string, string>, id = 's1') {
  const fs = fakeFs(on, { '/fake/.claude/settings.json': '{}', '/elsewhere/ops-control/.claude-plugin/plugin.json': '{}', [`${CACHE}/.claude-plugin/plugin.json`]: '{}', ...files })
  mock.store(on)
  const toasts: string[] = []
  const registered: string[] = []
  on('command.register', async (_$, e) => { registered.push((e as { name: string }).name); return { value: undefined } as never })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async (_$, e) => { toasts.push(e.text); return { value: undefined } as never })
  on('ui.panes', async () => ({ value: [] }))
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine'] }) as RenderElement)
  let current = id
  on('session.id', async () => ({ value: current }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('tool.call', async () => ({ result: {}, text: '' }) as never)
  return { ...fs, toasts, registered, setId: (v: string) => { current = v } }
}

const entry = (root: string, at: number) => JSON.stringify({ root, at })

test('a second copy registered first makes this one pass through and say so once', async ($, on) => {
  const { files, toasts, registered, writes } = boot(on, { [`${DIR}/s1.aa.json`]: entry('/elsewhere/ops-control', Date.now() - 1000) })
  mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await new Promise(r => setTimeout(r, 400))
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toContain('ops-control is loaded twice')
  expect(toasts[0]).toContain('this copy is off. Disable one: claude plugin disable ops-control@ops-control')
  expect(registered).toEqual([])
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ text: /CONTEXT/ })).toBeUndefined()
  await ui.unmount()
  expect(Object.keys(files).filter(f => f.includes('/ops-control/status/'))).toEqual([])
  expect(files['/fake/.claude/settings.json']).toBe('{}')
  expect(writes.filter(p => !p.startsWith(DIR))).toEqual([])
})

test('an entry left by a copy whose folder is gone does not turn this one off', async ($, on) => {
  const { toasts, registered } = boot(on, { [`${DIR}/s1.aa.json`]: entry('/elsewhere/removed-checkout', Date.now() - 1000) })
  mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  await new Promise(r => setTimeout(r, 400))
  expect(toasts).toEqual([])
  expect(registered).toEqual(['ops', 'opspin', 'opspinclear', 'opstask'])
})

test('a losing copy ignores session.measure', async ($, on) => {
  const { files, writes } = boot(on, { [`${DIR}/s1.aa.json`]: entry('/elsewhere/ops-control', Date.now() - 1000) })
  const clock = mock.clock(on)
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const before = writes.length
  await $.session.measure({ context: { window: 1000, percent: 10 }, rateLimits: [{ kind: 'five_hour', percentUsed: 42 }], changed: ['rateLimits'] } as never)
  await clock.advance(10)
  expect(writes.length).toBe(before)
  expect(Object.keys(files).filter(f => f.includes('/ops-control/status/'))).toEqual([])
})

test('an installed copy registered first loses to this dev copy, which keeps drawing', async ($, on) => {
  const { toasts, registered } = boot(on, { [`${DIR}/s1.aa.json`]: entry(CACHE, Date.now() - 1000) })
  mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  expect(toasts).toEqual([])
  expect(registered).toEqual(['ops', 'opspin', 'opspinclear', 'opstask'])
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ text: /CONTEXT/ })).toBeDefined()
  await ui.unmount()
})

test('a single copy is unaffected, and session end removes its entry', async ($, on) => {
  const { files, toasts, registered } = boot(on, {})
  mock.clock(on)
  on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  expect(toasts).toEqual([])
  expect(registered).toEqual(['ops', 'opspin', 'opspinclear', 'opstask'])
  expect(Object.keys(files).filter(f => f.startsWith(DIR))).toHaveLength(1)
  await $.session.end({ reason: 'exit', sessionId: 's1' } as never)
})

const mineWrites = (writes: string[]) => writes.filter(p => p.startsWith(DIR)).length

test('the active copy refreshes its entry once a minute, with one timer however often it starts', async ($, on) => {
  const { writes } = boot(on, {})
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  const before = mineWrites(writes)
  await clock.advance(60_000)
  expect(mineWrites(writes)).toBe(before + 1)
  await clock.advance(120_000)
  expect(mineWrites(writes)).toBe(before + 3)
})

test('a copy that registers late and sorts first turns this one off at the next turn, once', async ($, on) => {
  const { files, toasts, writes } = boot(on, {})
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  expect(toasts).toEqual([])
  files[`${DIR}/s1.bb.json`] = entry('/elsewhere/ops-control', Date.now() - 10_000)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.turn.start({ text: 'again', turnId: 't2' })
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toContain('ops-control is loaded twice')
  const ui = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ text: /CONTEXT/ })).toBeUndefined()
  await ui.unmount()
  const seen = mineWrites(writes)
  await clock.advance(180_000)
  expect(mineWrites(writes)).toBe(seen)
})

test('going off cancels a pending plan reload', async ($, on) => {
  const { files } = boot(on, {})
  const clock = mock.clock(on)
  let reads = 0
  Object.defineProperty(files, '/fake/.claude/tasks/r/1.json', { enumerable: true, configurable: true, get: () => { reads++; return '{"id":"1","subject":"a","status":"pending"}' } })
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  await clock.advance(10)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  reads = 0
  await $.tool.call({ tool: 'TaskUpdate', tool_use_id: 'u1', taskId: '1', status: 'pending' } as never)
  files[`${DIR}/s1.bb.json`] = entry('/elsewhere/ops-control', Date.now() - 10_000)
  await $.turn.start({ text: 'again', turnId: 't2' })
  await clock.advance(400)
  expect(reads).toBe(0)
})

test('after /clear the copy registers under the new id, and a copy that got there first still wins', async ($, on) => {
  const { files, toasts, setId } = boot(on, {})
  mock.clock(on)
  on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  setId('s2')
  await $.session.end({ reason: 'clear', sessionId: 's1' } as never)
  files[`${DIR}/s2.bb.json`] = entry('/elsewhere/ops-control', Date.now() - 10_000)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  expect(Object.keys(files).filter(f => f.startsWith(`${DIR}/s2.`))).toHaveLength(2)
  expect(toasts).toHaveLength(1)
})

test('after /clear with no other copy, this one registers under the new id and stays active', async ($, on) => {
  const { files, toasts, setId } = boot(on, {})
  mock.clock(on)
  on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  setId('s2')
  await $.session.end({ reason: 'clear', sessionId: 's1' } as never)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  expect(Object.keys(files).filter(f => f.startsWith(`${DIR}/s2.`))).toHaveLength(1)
  expect(toasts).toEqual([])
  const ui = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ text: /CONTEXT/ })).toBeDefined()
  await ui.unmount()
})

test('a winning copy whose store has no backup still writes status files when settings point at ops-control', async ($, on) => {
  const { files } = boot(on, {
    '/fake/.claude/settings.json': JSON.stringify({ statusLine: { type: 'command', command: `sh '/fake/.claude/ops-control/statusline.sh'` } }),
  })
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await clock.settle()
  expect(Object.keys(files).filter(f => f.startsWith('/fake/.claude/ops-control/status/'))).toEqual(['/fake/.claude/ops-control/status/s1'])
})

test('a session id with path characters is cut down before it reaches a file name', async ($, on) => {
  const { files } = boot(on, {}, '../../x y')
  mock.clock(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  const made = Object.keys(files).filter(f => f.startsWith(DIR))
  expect(made).toHaveLength(1)
  expect(made[0]).toMatch(/^\/fake\/\.claude\/ops-control\/instances\/xy\.[0-9a-f]+\.json$/)
})
