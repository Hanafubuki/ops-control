import { expect, mock } from 'claude-code/testing'
import { fakeFs, runOpsControl, test } from './kit.ts'
import { REFUSED_ABOVE_ENGINE, engineViolations } from './engine-tree.ts'
import { styleRow, type RowInput } from '../hooks/rows.tsx'
import { ROW_STYLES, resolveLook, type Look } from '../hooks/packs.ts'
import { PACKS } from '../hooks/packpresets.ts'

const ENGINE = { type: 'engine', ref: 0 }
const SAMPLE_PROPS = {
  flexDirection: 'row', flexGrow: 1, flexShrink: 1, flexWrap: 'wrap', alignItems: 'center', alignSelf: 'center', justifyContent: 'center', gap: 1, columnGap: 1, rowGap: 1,
  margin: 1, marginX: 1, marginY: 1, marginTop: 1, marginBottom: 1, marginLeft: 1, marginRight: 1,
  padding: 1, paddingX: 1, paddingY: 1, paddingTop: 1, paddingBottom: 1, paddingLeft: 1, paddingRight: 1,
  borderStyle: 'round', borderColor: '#ffffff', borderDimColor: true, backgroundColor: '#000000',
  width: 10, height: 2, minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', position: 'relative', top: 1, left: 1, right: 1, bottom: 1,
} as Record<string, unknown>

const TOOL = { tool_use_id: 'u1', tool: 'Read', input: { file_path: '/r/a.ts' }, isRunning: false, isErrored: false, isInterrupted: false }
const MESSAGE = { text: 'fix it', origin: { kind: 'composer' }, isExpanded: false }

// Keeps the helper's list honest: the real validator, one prop at a time.
// isRunning keeps ops-control's own rows out of the way so only the probe's tree is checked.
test('REFUSED_ABOVE_ENGINE is exactly what the engine refuses', async ($, on) => {
  fakeFs(on)
  mock.store(on)
  let tree: unknown
  on('ui.render', async () => tree as never)
  for (const [prop, value] of Object.entries(SAMPLE_PROPS)) {
    tree = { type: 'Box', props: { [prop]: value }, children: [ENGINE] }
    const refused = await $.ui.mount({ plugin: 'x', surface: 'terminal', component: 'ToolUse', requestId: 'u1', props: { ...TOOL, isRunning: true } as never }).then(ui => ui.unmount().then(() => false), () => true)
    expect([prop, refused]).toEqual([prop, (REFUSED_ABOVE_ENGINE as readonly string[]).includes(prop)])
  }
})

test('engineViolations sees a refused prop on any ancestor', async () => {
  const E = ENGINE
  expect(engineViolations({ type: 'Box', props: { minWidth: 0 }, children: [E] })).toHaveLength(1)
  expect(engineViolations({ type: 'Box', props: { overflow: 'hidden' }, children: [{ type: 'Box', props: {}, children: [E] }] })).toHaveLength(1)
  expect(engineViolations({ type: 'Box', props: { flexGrow: 1, flexShrink: 1, marginLeft: 1, borderStyle: 'round' }, children: [E] })).toEqual([])
  expect(engineViolations({ type: 'Box', props: { width: 3 }, children: ['x'] })).toEqual([])
  expect(engineViolations(E)).toEqual([])
})

const rowsFor = (): RowInput[] => [
  { site: 'ToolUse', tool: 'Read', input: { file_path: '/r/a.ts' }, isRunning: false, isErrored: false, isInterrupted: false },
  { site: 'ToolUse', tool: 'Bash', input: { command: 'ls' }, isRunning: true, isErrored: false, isInterrupted: false },
  { site: 'ToolUse', tool: 'Edit', input: {}, isRunning: false, isErrored: true, isInterrupted: false },
  { site: 'ToolUse', tool: 'Read', input: {}, isRunning: false, isErrored: false, isInterrupted: true },
  { site: 'ToolResult' },
  { site: 'UserMessage', text: 'hi', isExpanded: false, own: true },
  { site: 'UserMessage', text: 'hi', isExpanded: true, own: true },
  { site: 'UserMessage', text: 'hi', isExpanded: false, own: false },
  { site: 'AssistantMessage', isFirstOfReply: true },
  { site: 'AssistantMessage', isFirstOfReply: false },
]

test('no row style, site or pack puts a refused Box prop above the engine node', async () => {
  const els = { Box: 'Box', Text: 'Text' }
  let checked = 0
  for (const name of Object.keys(PACKS)) {
    const base = resolveLook({ colors: name, motion: name }, {}, {}).look
    for (const rows of ROW_STYLES) {
      const look: Look = { ...base, rows }
      for (const prefixCards of [false, true]) {
        for (const row of rowsFor()) {
          const tree = styleRow(els, look, row, ENGINE, { prefixCards })
          expect([name, rows, prefixCards, row.site, engineViolations(tree)]).toEqual([name, rows, prefixCards, row.site, []])
          checked++
        }
      }
    }
  }
  expect(checked).toBe(Object.keys(PACKS).length * ROW_STYLES.length * 2 * rowsFor().length)
})

// The engine's own validator over the whole hook: what the owner's session ran.
test('every pack draws every row site through the real validator', async ($, on) => {
  fakeFs(on)
  mock.store(on)
  on('ui.render', async () => ENGINE as never)
  on('ui.toast', async () => ({ value: undefined }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.panes', async () => ({ value: [] }))
  const mounts = [
    ...[{}, { isRunning: true }, { isErrored: true }, { isInterrupted: true }].map(o => ({ component: 'ToolUse', props: { ...TOOL, ...o } })),
    { component: 'ToolResult', props: { tool_use_id: 'u1', tool: 'Read', output: 'x', isErrored: false } },
    { component: 'UserMessage', props: MESSAGE },
    { component: 'UserMessage', props: { ...MESSAGE, isExpanded: true } },
    { component: 'AssistantMessage', props: { isFirstOfReply: true } },
    { component: 'AssistantMessage', props: { isFirstOfReply: false } },
  ]
  for (const pack of Object.keys(PACKS)) {
    await runOpsControl($, `pack ${pack}`)
    for (const m of mounts) {
      const ui = await $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: m.component as never, requestId: 'r1', props: m.props as never })
      await ui.unmount()
    }
  }
})
