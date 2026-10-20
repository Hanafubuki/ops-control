import { expect, mock } from 'claude-code/testing'
import { proposedBoardName, workPrompt } from '../hooks/opstask.ts'
import { fakeFs, test } from './kit.ts'

const CATS = [{ id: 'general', name: 'General fallback', description: 'Use only when nothing fits.' }, { id: 'coding.easy', name: 'Easy', description: 'Obvious edits.' }]

test('workPrompt asks Claude to do the work, then file it in SQ-1 format on the right board', () => {
  const p = workPrompt('write the manual steps', 'importers', CATS)
  expect(p).toContain('Do the request below yourself now')
  expect(p).toContain('mcp__plugin_sidequest_board__add on the "importers" board')
  expect(p).toContain('## Background')
  expect(p).toContain('  - coding.easy: Obvious edits.')
  expect(p).toContain('<request>\nwrite the manual steps\n</request>')
  expect(workPrompt('x', undefined, [])).toContain("this folder's board")
})

const text = (v: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(v) }] })
const AT = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } } as const

// A board answering from the session's folder unless `here` is false; prompts Claude gets land in `submitted`.
function boot(on: Parameters<typeof fakeFs>[0], o: { here?: boolean; pick?: string; boards?: boolean } = {}) {
  fakeFs(on)
  mock.store(on)
  const clock = mock.clock(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.panes', async () => ({ value: [] }))
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['engine'] }) as never)
  on('session.id', async () => ({ value: 's1' }))
  on('session.cwd', async () => ({ value: '/fake/my-app' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  const calls: { tool: string; args: any }[] = []
  on('mcp.call', async (_$, e: any) => {
    calls.push({ tool: e.tool, args: e.args })
    if (e.tool === 'category_list' && !e.args.project && o.here === false) return { value: { isError: true, content: [{ type: 'text', text: 'not a project root: /x is not a git repository root' }] } } as never
    if (e.tool === 'category_list') return { value: text({ categories: CATS }) } as never
    if (e.tool === 'projects') return { value: text({ projects: o.boards === false ? [] : [{ name: 'importers', slug: 'importers-1', lastActivity: '2026-10-20' }] }) } as never
    if (e.tool === 'board_config') return { value: text({ ok: true, project: `${e.args.name}-1`, name: e.args.name }) } as never
    if (e.tool === 'add') return { value: text({ ok: true, ticket: { ref: 'SQ-7' } }) } as never
    return { value: { isError: true, content: [] } } as never
  })
  const submitted: string[] = []
  on('prompt.submit', async (_$, e: any) => { submitted.push(e.text); return { text: e.text } as never })
  on('ui.toast', async () => ({ value: undefined }) as never)
  const asked: string[] = []
  const offered: string[][] = []
  on('tool.call', async (_$, e) => {
    if (e.tool !== 'AskUserQuestion') return { result: {}, text: '' } as never
    const question = (e as unknown as { questions: { question: string; options: { label: string }[] }[] }).questions[0]!
    const q = question.question
    asked.push(q)
    offered.push(question.options.map(option => option.label))
    return { result: { questions: [], answers: { [q]: o.pick ?? 'importers' } }, text: o.pick ?? 'importers' } as never
  })
  return { calls, submitted, asked, offered, clock }
}

test('/opstask hands the request to Claude on this folder\'s board and files nothing itself', async ($, on) => {
  const { calls, submitted, clock } = boot(on)
  await $.session.start({ cwd: '/fake/proj', surface: 'terminal', isInteractive: false })
  const r = await $.command.run({ command: 'opstask', args: 'summarize all the changes', ...AT })
  expect(JSON.stringify(r)).toMatch(/Claude works on it next/)
  await clock.advance(100)
  expect(submitted).toHaveLength(1)
  expect(submitted[0]).toContain('summarize all the changes')
  expect(submitted[0]).toContain("this folder's board")
  expect(calls.some(c => c.tool === 'add')).toBe(false)
})

test('/opstask outside a board asks which one, and names it to Claude', async ($, on) => {
  const { submitted, asked, clock } = boot(on, { here: false })
  await $.session.start({ cwd: '/fake/proj', surface: 'terminal', isInteractive: false })
  const r = await $.command.run({ command: 'opstask', args: 'summarize all the changes', ...AT })
  expect(asked).toHaveLength(1)
  expect(JSON.stringify(r)).toMatch(/on importers/)
  await clock.advance(100)
  expect(submitted[0]).toContain('project: "importers"')
})

test('/opstask starts nothing when the board question is cancelled', async ($, on) => {
  const { submitted } = boot(on, { here: false, pick: 'Cancel' })
  await $.session.start({ cwd: '/fake/proj', surface: 'terminal', isInteractive: false })
  const r = await $.command.run({ command: 'opstask', args: 'anything', ...AT })
  expect(JSON.stringify(r)).toMatch(/Not filed/)
  expect(submitted).toEqual([])
})

test('/opstask with no request only says how to use it', async ($, on) => {
  const { calls } = boot(on)
  await $.session.start({ cwd: '/fake/proj', surface: 'terminal', isInteractive: false })
  const r = await $.command.run({ command: 'opstask', args: '  ', ...AT })
  expect(JSON.stringify(r)).toMatch(/Usage: \/opstask/)
  expect(calls).toEqual([])
})

test('proposedBoardName is the folder name', () => {
  expect(proposedBoardName('/home/me/code/my-app')).toBe('my-app')
  expect(proposedBoardName('C:\\work\\api-core\\')).toBe('api-core')
})

test('/opstask outside a board asks what to do, offering to create one named after the folder first', async ($, on) => {
  const { offered, asked } = boot(on, { here: false, pick: 'Cancel' })
  await $.session.start({ cwd: '/fake/my-app', surface: 'terminal', isInteractive: false })
  await $.command.run({ command: 'opstask', args: 'anything', ...AT })
  expect(asked[0]).toBe('This folder has no Sidequest board. What should we do?')
  expect(offered[0]).toEqual(['Create board "my-app"', 'importers', 'Cancel'])
})

test('/opstask creates the proposed board on the session folder and files there', async ($, on) => {
  const { calls, submitted, clock } = boot(on, { here: false, pick: 'Create board "my-app"' })
  await $.session.start({ cwd: '/fake/my-app', surface: 'terminal', isInteractive: false })
  const r = await $.command.run({ command: 'opstask', args: 'summarize all the changes', ...AT })
  expect(calls.find(c => c.tool === 'board_config')?.args).toEqual({ project: '/fake/my-app', name: 'my-app' })
  expect(JSON.stringify(r)).toMatch(/on my-app/)
  await clock.advance(100)
  expect(submitted[0]).toContain('project: "my-app"')
})

test('/opstask creates a board with a name typed under Other', async ($, on) => {
  const { calls } = boot(on, { here: false, pick: 'backend-ops' })
  await $.session.start({ cwd: '/fake/my-app', surface: 'terminal', isInteractive: false })
  const r = await $.command.run({ command: 'opstask', args: 'anything', ...AT })
  expect(calls.find(c => c.tool === 'board_config')?.args).toEqual({ project: '/fake/my-app', name: 'backend-ops' })
  expect(JSON.stringify(r)).toMatch(/on backend-ops/)
})

test('/opstask still asks when no board is registered at all', async ($, on) => {
  const { offered } = boot(on, { here: false, boards: false, pick: 'Cancel' })
  await $.session.start({ cwd: '/fake/my-app', surface: 'terminal', isInteractive: false })
  const r = await $.command.run({ command: 'opstask', args: 'anything', ...AT })
  expect(offered[0]).toEqual(['Create board "my-app"', 'Cancel'])
  expect(JSON.stringify(r)).toMatch(/Not filed/)
})
