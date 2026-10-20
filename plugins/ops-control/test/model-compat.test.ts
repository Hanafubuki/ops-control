import { expect, mock } from 'claude-code/testing'
import { fakeFs, test } from './kit.ts'
import { tabRows, statusRows, TABS } from '../hooks/pane.tsx'
import { bandSegments } from '../hooks/band.tsx'
import { initialModel, normalizeModel, type Model } from '../hooks/model.ts'
import { resolveTheme } from '../hooks/themes.ts'

const T = resolveTheme('classic', {}).theme
// What v0.3.0 stored: no ctxHistory, ctxSampledAt, ctxPeak or compactions.
const V030 = (() => {
  const { ctxHistory: _h, ctxSampledAt: _s, ctxPeak: _p, compactions: _c, ...old } = initialModel()
  return { ...old, working: true, ctxPercent: 40, files: [{ path: '/r/a.ts', add: 1, del: 0, how: 'edit', at: 1 }] } as unknown as Model
})()

test('a v0.3.0 model renders every tab, compact or not, and the band', async () => {
  for (const [id] of TABS) for (const compact of [false, true]) for (const width of [30, 54, 100]) {
    expect(() => tabRows(V030, T, { tab: id }, width, compact, 0)).not.toThrow()
  }
  expect(() => statusRows(V030, T, 60, 0)).not.toThrow()
  expect(() => bandSegments(V030, T, 100)).not.toThrow()
})

test('normalizeModel fills the fields a stored model lacks and keeps the rest', async () => {
  const m = normalizeModel(V030)
  expect([m.ctxHistory, m.ctxPeak, m.compactions]).toEqual([[], 0, 0])
  expect([m.working, m.ctxPercent, m.files]).toEqual([true, 40, V030.files])
  expect(normalizeModel(undefined)).toEqual(initialModel())
  const withRead = { ...V030, files: [...V030.files, { path: '/r/b.ts', add: 0, del: 0, how: 'read', at: 0 }] }
  expect(normalizeModel(withRead).files).toEqual(V030.files)
  expect(normalizeModel({ ...V030, ctxHistory: 'x', agents: null, plan: {} })).toMatchObject({ ctxHistory: [], agents: [], plan: [] })
  const full = { ...initialModel(), ctxHistory: [1, 2], ctxPeak: 2, compactions: 1 }
  expect(normalizeModel(full)).toEqual(full)
})

const PANE_ARGS = { plugin: 'ops-control', surface: 'terminal', component: 'Pane', requestId: 'ops-control', props: { title: 'ops-control', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } } as const
const BAND_ARGS = { plugin: 'ops-control', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: true, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} } } as const

test('a pane and band snapshot written by 0.3.0 draw without throwing', async ($, on) => {
  fakeFs(on)
  mock.store(on)
  const mem = new Map<string, unknown>([
    ['ops-control/pane', { model: V030, view: { tab: 'plan' }, at: 1 }],
    ['ops-control/band', { model: V030, at: 1 }],
  ])
  on('state.get', async (_$: unknown, e: any) => ({ value: { value: mem.get(`${e.plugin}/${e.key}`), version: 1 } }) as never)
  on('state.set', async (_$: unknown, e: any) => { mem.set(`${e.plugin}/${e.key}`, e.value); return { value: { isSet: true, version: 1 } } as never })
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine'] }) as never)
  on('ui.panes', async () => ({ value: [] }))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$: unknown, e: any) => ({ turnId: e.turnId }))
  mock.clock(on)
  const pane = await $.ui.mount(PANE_ARGS)
  // its Plan tab now holds the plan alone
  expect(await pane.find({ text: /PLAN/ })).toBeDefined()
  await pane.unmount()
  const band = await $.ui.mount(BAND_ARGS)
  // the work bar reads the old model's context
  expect(await band.find({ text: /CONTEXT/ })).toBeDefined()
  await band.unmount()
})
