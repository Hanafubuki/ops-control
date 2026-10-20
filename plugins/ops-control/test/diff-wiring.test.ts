import { test, expect, mock } from 'claude-code/testing'
import { fakeFs } from './kit.ts'

const PANE = { plugin: 'ops-control', surface: 'terminal', component: 'Pane', requestId: 'ops-control', props: { title: 'ops-control', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } } as const
const PATCH = ['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1 +1 @@', '-old', '+brand new line', ''].join('\n')

// A repo at /r whose HEAD, numstat and tracked files the test moves between steps.
function repo(on: Parameters<typeof fakeFs>[0]) {
  const git = { head: 'abc', numstat: '1\t1\tsrc/a.ts\0', tracked: '' }
  const ran: string[] = []
  fakeFs(on, {}, argv => {
    const a = argv.join(' ')
    ran.push(a)
    if (a.includes('rev-parse --show-toplevel')) return { exitCode: 0, stdout: `/r\n\n.git/index\n${git.head}\n` }
    if (a.endsWith('rev-parse HEAD')) return { exitCode: 0, stdout: git.head + '\n' }
    if (a.includes('--numstat')) return { exitCode: 0, stdout: git.numstat }
    if (a.includes('ls-files')) return { exitCode: 0, stdout: git.tracked }
    if (a.includes(' diff -U3 ')) return { exitCode: 0, stdout: PATCH }
  })
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.panes', async () => ({ value: [] }))
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('tool.call', async () => ({ result: {}, text: 'ok' }) as never)
  return { git, ran }
}
const EDIT = { tool: 'Edit', tool_use_id: 'e1', file_path: '/r/src/a.ts', old_string: 'old', new_string: 'brand new line' } as never
const diffs = (ran: string[]) => ran.filter(a => a.includes(' diff -U3 ')).length

test('the pane opens on Plan & context, and git diff runs only while the Diff tab shows', { timeoutMs: 20000 }, async ($, on) => {
  const { ran } = repo(on)
  const clock = mock.clock(on)
  mock.store(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  await clock.advance(10)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ text: /PLAN/ })).toBeDefined()
  await $.tool.call(EDIT)
  await clock.advance(10)
  expect(ran.some(a => a.includes('--numstat'))).toBe(true)
  expect(diffs(ran)).toBe(0)
  await ui.press({ key: 'tab-diff' })
  await clock.advance(10)
  await ui.redraw()
  expect(diffs(ran)).toBe(1)
  expect(await ui.find({ text: /\+brand new line/ })).toBeDefined()
  await $.tool.call({ ...(EDIT as object), tool_use_id: 'e2' } as never)
  await clock.advance(10)
  expect(diffs(ran)).toBe(2)
  await ui.press({ key: 'tab-agents' })
  await clock.advance(10)
  await $.tool.call({ ...(EDIT as object), tool_use_id: 'e3' } as never)
  await clock.advance(10)
  expect(diffs(ran)).toBe(2)
  await ui.unmount()
})

test('a commit empties the Diff tab of the committed file', { timeoutMs: 20000 }, async ($, on) => {
  const { git } = repo(on)
  const clock = mock.clock(on)
  mock.store(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
  await clock.advance(10)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab-diff' })
  await $.tool.call(EDIT)
  await clock.advance(10)
  await ui.redraw()
  expect(await ui.find({ text: /src\/a\.ts/ })).toBeDefined()
  // `git commit` through Bash: HEAD moves and the file now matches it
  git.head = 'def'; git.numstat = ''; git.tracked = 'src/a.ts\0'
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'git commit -am x' } as never)
  await clock.advance(10)
  await ui.redraw()
  expect(await ui.find({ text: /src\/a\.ts/ })).toBeUndefined()
  expect(await ui.find({ text: /Nothing changed yet/ })).toBeDefined()
  await ui.unmount()
})
