import { test, expect } from 'claude-code/testing'
import { TranscriptReader, projectFolder, readTranscript } from '../hooks/backfill.ts'
import { backfill, initialRequests, loadSaved, saved, startTurn, submit, type Request } from '../hooks/requests.ts'

// Transcript lines in the shapes Claude Code writes them, at seconds from the epoch.
const ts = (s: number) => new Date(s * 1000).toISOString()
const human = (s: number, text: string) => JSON.stringify({ type: 'user', timestamp: ts(s), origin: { kind: 'human' }, message: { role: 'user', content: text } })
const said = (s: number, ...content: object[]) => JSON.stringify({ type: 'assistant', timestamp: ts(s), message: { role: 'assistant', content } })
const text = (t: string) => ({ type: 'text', text: t })
const use = (id: string, name: string, input: object) => ({ type: 'tool_use', id, name, input })
const result = (s: number, id: string, content: string, extra: object = {}, isError = false) =>
  JSON.stringify({ type: 'user', timestamp: ts(s), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] }, ...extra })
const took = (s: number, ms: number) => JSON.stringify({ type: 'system', subtype: 'turn_duration', timestamp: ts(s), durationMs: ms })
const queued = (s: number, prompt: string, kind = 'human') => JSON.stringify({ type: 'attachment', timestamp: ts(s), attachment: { type: 'queued_command', prompt, origin: { kind } } })

test('a transcript reads back as the requests ops-control would have listed: work, milestones, answer and follow-ups', () => {
  const rs = readTranscript([
    human(10, 'fix the login bug'),
    said(11, text('Looking.'), use('m1', 'mcp__project-sentinel__milestones', { objective: 'Fix the login', milestones: [{ title: 'Find it', status: 'completed' }, { title: 'Patch it', status: 'in_progress' }] })),
    result(11, 'm1', 'Recorded.'),
    said(12, use('e1', 'Edit', { file_path: '/p/auth.ts', old_string: 'a', new_string: 'b\nc' })),
    result(12, 'e1', 'ok'),
    said(13, use('w1', 'Write', { file_path: '/p/new.ts', content: 'x' })),
    result(13, 'w1', 'ok', { toolUseResult: { type: 'create' } }),
    said(14, use('b1', 'Bash', { command: 'git commit -m fix' })),
    result(14, 'b1', 'ok'),
    said(20, text('Fixed the token refresh.\n\nShould I add a regression test?')),
    took(20, 9000),
    'not json',
  ].join('\n'))
  expect(rs).toHaveLength(1)
  expect(rs[0]).toMatchObject({
    n: 1, text: 'fix the login bug', status: 'completed', at: 10_000, objective: 'Fix the login', commandCount: 1, commits: 1,
    files: [{ path: '/p/auth.ts', how: 'edit', add: 2, del: 1 }, { path: '/p/new.ts', how: 'new' }],
    turns: [{ answer: 'Fixed the token refresh.\n\nShould I add a regression test?', reason: 'answer', durationMs: 9000, endedAt: 20_000 }],
    followUps: { questions: ['Should I add a regression test?'] },
  })
  expect(rs[0]!.milestones.map(m => m.status)).toEqual(['completed', 'in_progress'])
})

test('a prompt sent during a turn is taken into it; a notification\'s turn is more work for the latest request', () => {
  const rs = readTranscript([
    human(10, 'build the report'),
    said(11, use('b1', 'Bash', { command: 'make report' })),
    queued(12, 'and add a chart'),
    result(13, 'b1', 'ok'),
    said(14, text('Both done.')),
    took(15, 5000),
    queued(30, '<task-notification>done</task-notification>', 'task-notification'),
    said(31, use('b2', 'Bash', { command: 'ls' })),
    result(31, 'b2', 'ok'),
    said(32, text('The background job finished.')),
    took(32, 2000),
  ].join('\n'))
  expect(rs.map(r => r.text)).toEqual(['build the report', 'and add a chart'])
  expect(rs[1]).toMatchObject({ status: 'completed', foldedInto: rs[0]!.id })
  // the notification's turn counts for the latest request that ran
  expect(rs[1]!.commandCount).toBe(1)
  expect(rs[1]!.turns.at(-1)!.answer).toBe('The background job finished.')
})

test('an interruption cuts the turn off; a slash command no turn came of is no request; plugin and meta rows are not prompts', () => {
  const rs = readTranscript([
    JSON.stringify({ type: 'user', timestamp: ts(1), origin: { kind: 'plugin', name: 'x' }, message: { content: 'The plugin sent a message' } }),
    JSON.stringify({ type: 'user', timestamp: ts(2), isMeta: true, origin: { kind: 'human' }, message: { content: 'Base directory for this skill' } }),
    human(3, '<command-name>/reload-plugins</command-name>\n<command-args></command-args>'),
    human(10, 'long job'),
    said(11, text('Starting.'), use('b1', 'Bash', { command: 'sleep 100' })),
    JSON.stringify({ type: 'user', timestamp: ts(20), message: { content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] } }),
    human(30, '<command-name>/review</command-name>\n<command-args>main</command-args>'),
    said(31, text('Reviewed.')),
  ].join('\n'))
  expect(rs.map(r => [r.text, r.status])).toEqual([['long job', 'interrupted'], ['/review main', 'completed']])
  expect(rs[1]!.command).toBe(true)
})

test('the task list as the calls left it gives the tasks their titles and statuses', () => {
  const reader = new TranscriptReader()
  for (const l of [
    human(1, 'plan it'),
    said(2, use('c1', 'TaskCreate', { subject: 'Write the parser' })),
    result(2, 'c1', 'Task #7 created', { toolUseResult: { task: { id: '7' } } }),
    said(3, use('u1', 'TaskUpdate', { taskId: '7', status: 'completed' })),
    result(3, 'u1', 'ok'),
    said(4, text('Planned.')),
  ]) reader.line(l)
  expect(reader.requests()[0]!.tasks).toEqual([{ id: '7', title: 'Write the parser', status: 'completed' }])
})

test('backfill puts what came before the list first, renumbers, skips prompts the list has, and marks the list filled', () => {
  const older = readTranscript([human(10, 'first'), said(11, text('one')), took(11, 1000), human(20, 'second'), said(21, text('two')), took(21, 1000), human(30, 'third')].join('\n'))
  let { rs } = submit(initialRequests(), { text: 'third', at: 30_000 })
  rs = startTurn(rs, { turnId: 't9', text: 'third', at: 30_000 })
  const filled = backfill(rs, older)
  expect(filled.list.map(r => [r.n, r.text])).toEqual([[1, 'first'], [2, 'second'], [3, 'third']])
  expect(filled.list[2]!.id).toBe(rs.list[0]!.id)
  expect(filled.list[0]!.id).toMatch(/^b1-/)
  expect(filled.list[0]!.turnIds[0]).toMatch(/^backfill:/)
  expect(filled).toMatchObject({ seq: 3, filled: true, active: rs.list[0]!.id })
  // the next prompt numbers after them
  expect(submit(filled, { text: 'fourth', at: 40_000 }).rs.list.at(-1)!.n).toBe(4)
  // nothing to add still marks the list filled, and the mark survives a save
  const none = backfill(initialRequests(), [])
  expect(none.filled).toBe(true)
  expect(loadSaved(JSON.parse(JSON.stringify(saved(none)))).filled).toBe(true)
  expect(loadSaved(JSON.parse(JSON.stringify(saved(initialRequests())))).filled).toBeUndefined()
})

test('a folded request backfilled points at its host\'s new id', () => {
  const older = readTranscript([human(10, 'build'), queued(12, 'and chart'), said(13, text('Both.')), took(13, 3000)].join('\n'))
  const filled = backfill(initialRequests(), older)
  expect(filled.list[1]!.foldedInto).toBe(filled.list[0]!.id)
  expect(filled.list[1]!.queuedIn).toMatch(/^backfill:/)
})

test('a project folder is the directory with every other character a dash', () => {
  expect(projectFolder('/mnt/c/Users/me/Documents/Prognolite/Keys')).toBe('-mnt-c-Users-me-Documents-Prognolite-Keys')
  expect(projectFolder('C:\\Users\\me\\my.proj')).toBe('C--Users-me-my-proj')
})

// Requests read from a transcript are plain requests: nothing else in them is assumed.
export type _Check = Request
