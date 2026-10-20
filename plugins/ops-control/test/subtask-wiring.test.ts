import { expect, mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { fakeFs, test } from './kit.ts'

const PANE = { plugin: 'ops-control', surface: 'terminal', component: 'Pane', requestId: 'ops-control', props: { title: 'ops-control', isFocused: false, bodyColumns: 72, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} } } as const

test('a fork /subtask dispatches, with no Agent call, is listed in the Agents tab until it ends', async ($, on) => {
  fakeFs(on)
  mock.clock(on)
  on('ui.panes', async () => ({ value: [] }))
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine'] }) as RenderElement)
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.complete', async () => ({ text: '' }) as never)
  on('agent.spawn', async () => ({ model: 'm', agentId: 'fork-1' }))
  await $.agent.spawn({ tool_use_id: '', prompt: 'make /opspin', description: 'create-a-command', subagentType: 'fork', background: true } as never)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-agents' })
  expect(await ui.find({ text: /1 running/ })).toBeDefined()
  expect(await ui.find({ text: /create-a-command/ })).toBeDefined()
  await $.turn.complete({ reason: 'answer', answer: 'done', durationMs: 10, isAborted: false, turnId: 'f', agentId: 'fork-1' } as never)
  await ui.redraw()
  expect(await ui.find({ text: /1 done/ })).toBeDefined()
  await ui.unmount()
})
