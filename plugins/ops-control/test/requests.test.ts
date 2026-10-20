import { test, expect } from 'claude-code/testing'
import {
  adopt, agentBind, agentStart, asksOfYou, currentMilestone, drop, endTurn, foldIn, hasQueued, initialRequests, loadSaved, normalizeRequests,
  openIssues, readMilestones, requestTitle, retext, saved, settleQueued, startTurn, submit, toolEnd, unstarted, withinSize, workedMs, MAX_REQUESTS, type Requests,
} from '../hooks/requests.ts'

const ask = (rs: Requests, text: string, at = 0, extra: { turnId?: string; command?: boolean } = {}) => submit(rs, { text, at, ...extra })
const end = (rs: Requests, turnId: string, answer = 'Done.', reason: 'answer' | 'aborted' | 'error' | 'refusal' = 'answer', durationMs = 5000) =>
  endTurn(rs, { turnId, answer, reason, durationMs, at: 9000 })
const tool = (rs: Requests, tool: string, input: Record<string, unknown>, extra: Partial<{ agentId: string; isError: boolean; text: string; resultTaskId: string; writeType: 'create' | 'update' }> = {}) =>
  toolEnd(rs, { tool, toolUseId: 'u' + Math.random(), input, isError: false, text: '', ...extra })

test('a prompt is waiting until its turn starts, works while it runs and is done with the answer when it ends', () => {
  let { rs, id } = ask(initialRequests(), 'fix the login bug\nin auth.ts', 100)
  expect(rs.list[0]).toMatchObject({ id, n: 1, status: 'pending', text: 'fix the login bug\nin auth.ts' })
  expect(requestTitle(rs.list[0]!)).toBe('fix the login bug')
  rs = startTurn(rs, { turnId: 't1', text: 'fix the login bug\nin auth.ts', at: 1000 })
  expect(rs.list[0]).toMatchObject({ status: 'in_progress', startedAt: 1000, turnIds: ['t1'] })
  expect(rs).toMatchObject({ turnId: 't1', turnAt: 1000, active: id })
  expect(workedMs(rs.list[0]!, rs, 4000)).toBe(3000)
  rs = end(rs, 't1', 'Fixed the refresh race.')
  expect(rs.list[0]).toMatchObject({ status: 'completed', endedAt: 9000, turns: [{ answer: 'Fixed the refresh race.', reason: 'answer', durationMs: 5000 }] })
  expect(rs.turnId).toBeUndefined()
  expect(workedMs(rs.list[0]!, rs, 99_000)).toBe(5000)
})

test('an interrupted turn leaves its request interrupted, an error or refusal stopped', () => {
  for (const [reason, status] of [['aborted', 'interrupted'], ['error', 'failed'], ['refusal', 'failed']] as const) {
    let { rs } = ask(initialRequests(), 'go')
    rs = end(startTurn(rs, { turnId: 't', text: 'go', at: 0 }), 't', 'Should I…?', reason)
    expect(rs.list[0]!.status).toBe(status)
    // an answer cut short is not what the person was left with
    expect(rs.list[0]!.followUps).toBeUndefined()
  }
})

test('ids hold the time, numbers count up, and the list keeps the newest MAX_REQUESTS', () => {
  let rs = initialRequests()
  for (let i = 0; i < MAX_REQUESTS + 5; i++) rs = ask(rs, 'p' + i, i).rs
  expect(rs.list).toHaveLength(MAX_REQUESTS)
  expect(rs.list[0]!.n).toBe(6)
  expect(rs.list.at(-1)).toMatchObject({ n: MAX_REQUESTS + 5, id: `r${MAX_REQUESTS + 5}-${(MAX_REQUESTS + 4).toString(36)}` })
  expect(new Set(rs.list.map(r => r.id)).size).toBe(MAX_REQUESTS)
})

test('a prompt typed during a turn waits; its own turn takes it by its text', () => {
  let rs = startTurn(ask(initialRequests(), 'first').rs, { turnId: 't1', text: 'first', at: 0 })
  rs = ask(rs, 'second', 10, { turnId: 't1' }).rs
  expect(rs.list[1]).toMatchObject({ status: 'pending', queuedIn: 't1' })
  expect(hasQueued(rs)).toBe(true)
  rs = end(rs, 't1')
  rs = startTurn(rs, { turnId: 't2', text: 'second', at: 20 })
  expect(rs.list[1]).toMatchObject({ status: 'in_progress', turnIds: ['t2'] })
  expect(rs.list[1]!.foldedInto).toBeUndefined()
  expect(rs.list[0]!.status).toBe('completed')
})

test('a prompt delivered into the running turn is answered by it, with the request that turn works for', () => {
  let { rs, id: first } = ask(initialRequests(), 'build the pane')
  rs = startTurn(rs, { turnId: 't1', text: 'build the pane', at: 0 })
  rs = ask(rs, 'also add a Context tab', 5, { turnId: 't1' }).rs
  rs = foldIn(rs, '<system-reminder>The user sent: also add a Context tab</system-reminder>', 6)
  expect(rs.list[1]).toMatchObject({ status: 'in_progress', foldedInto: first, turnIds: ['t1'] })
  rs = end(rs, 't1', 'Both done.')
  expect(rs.list.map(r => [r.status, r.turns[0]?.answer])).toEqual([['completed', 'Both done.'], ['completed', 'Both done.']])
  // no turn running: nothing is folded
  expect(foldIn(ask(rs, 'x', 7, { turnId: 't1' }).rs, 'x', 8).list.at(-1)!.status).toBe('pending')
})

test('a queued prompt no turn of its own took was taken in by the turn it was typed in', () => {
  let { rs, id: first } = ask(initialRequests(), 'one')
  rs = startTurn(rs, { turnId: 't1', text: 'one', at: 0 })
  rs = ask(rs, 'two', 5, { turnId: 't1' }).rs
  rs = end(rs, 't1', 'One and two done.')
  // the idle check after the turn
  const settled = settleQueued(rs)
  expect(settled.list[1]).toMatchObject({ status: 'completed', foldedInto: first, turns: [{ answer: 'One and two done.' }] })
  // or the next turn, which carries other text
  const next = startTurn(rs, { turnId: 't2', text: 'three', at: 50 })
  expect(next.list[1]).toMatchObject({ status: 'completed', foldedInto: first })
})

test('a slash command is taken by the turn it starts, whose text is the command\'s own', () => {
  let { rs, id } = ask(initialRequests(), '/code-review high', 0, { command: true })
  rs = startTurn(rs, { turnId: 't1', text: 'Review the current diff for correctness bugs…', at: 1 })
  expect(rs.list[0]).toMatchObject({ id, status: 'in_progress', command: true })
  // a command that answers by itself never starts a turn: still waiting with nothing running
  const local = ask(initialRequests(), '/config', 0, { command: true })
  expect(unstarted(local.rs, local.id)).toBe(true)
  expect(drop(local.rs, local.id).list).toEqual([])
})

test('a turn that takes no prompt is more work for the latest request', () => {
  let rs = end(startTurn(ask(initialRequests(), 'run the tests in the background').rs, { turnId: 't1', text: 'run the tests in the background', at: 0 }), 't1', 'Started.')
  rs = startTurn(rs, { turnId: 't2', text: '<task-notification>tests finished</task-notification>', at: 100 })
  expect(rs.list[0]).toMatchObject({ status: 'in_progress', turnIds: ['t1', 't2'] })
  rs = tool(rs, 'Bash', { command: 'npm test' }, { text: 'Tests: 3 passed' })
  rs = end(rs, 't2', 'All 3 pass.', 'answer', 2000)
  expect(rs.list[0]!.turns.map(t => t.answer)).toEqual(['Started.', 'All 3 pass.'])
  expect(workedMs(rs.list[0]!, rs, 0)).toBe(7000)
  expect(rs.list[0]!.commandCount).toBe(1)
  // with no request at all there is nothing to work for
  expect(startTurn(initialRequests(), { turnId: 't', text: 'hello', at: 0 }).active).toBeUndefined()
})

test('a rewritten prompt still finds its turn, and keeps the text the turn carried', () => {
  let { rs, id } = ask(initialRequests(), 'my key is sk-123')
  rs = retext(rs, id, 'my key is ****')
  rs = startTurn(rs, { turnId: 't', text: 'my key is ****', at: 0 })
  expect(rs.list[0]).toMatchObject({ text: 'my key is ****', status: 'in_progress' })
  // a text changed below without the request knowing: the oldest prompt typed while idle
  const other = startTurn(ask(initialRequests(), 'secret abc').rs, { turnId: 't', text: 'secret ***', at: 0 })
  expect(other.list[0]!.status).toBe('in_progress')
})

test('tool calls add up: files, commands, commits, tests, agents and tasks', () => {
  let rs = startTurn(ask(initialRequests(), 'do it').rs, { turnId: 't', text: 'do it', at: 0 })
  rs = tool(rs, 'Edit', { file_path: '/r/a.ts', old_string: 'a\nb', new_string: 'a\nb\nc\nd' })
  rs = tool(rs, 'Edit', { file_path: '/r/a.ts', old_string: 'x', new_string: 'y' })
  rs = tool(rs, 'Write', { file_path: '/r/notes.md', content: 'one\ntwo\n' }, { writeType: 'create' })
  rs = tool(rs, 'Edit', { file_path: '/r/broken.ts', old_string: 'x', new_string: 'y' }, { isError: true })
  rs = tool(rs, 'Bash', { command: 'git commit -m "fix"\n' })
  rs = tool(rs, 'Bash', { command: 'npx vitest run' }, { text: 'Tests  4 passed (4)', isError: false })
  rs = tool(rs, 'Agent', { description: 'find callers', subagent_type: 'Explore' })
  rs = tool(rs, 'TaskCreate', { subject: 'Write the fix' }, { resultTaskId: '7' })
  const r = rs.list[0]!
  expect(r.files).toEqual([{ path: '/r/a.ts', how: 'edit', add: 5, del: 3 }, { path: '/r/notes.md', how: 'new', add: 2, del: 0 }])
  expect(r.commands).toEqual(['git commit -m "fix"', 'npx vitest run'])
  expect([r.commandCount, r.commits, r.tools]).toEqual([2, 1, 8])
  expect(r.test).toMatchObject({ passed: true })
  expect(r.agents).toEqual([{ name: 'Explore', task: 'find callers' }])
  expect(r.tasks).toEqual([{ id: '7', title: 'Write the fix', status: 'pending' }])
})

test('a subagent\'s edits count for the request that started it, even after its turn ended', () => {
  let { rs, id } = ask(initialRequests(), 'refactor')
  rs = startTurn(rs, { turnId: 't', text: 'refactor', at: 0 })
  rs = agentBind(agentStart(rs, 'tu1'), 'tu1', 'ag-1')
  rs = end(rs, 't')
  rs = tool(rs, 'Edit', { file_path: '/r/b.ts', old_string: 'a', new_string: 'b' }, { agentId: 'ag-1' })
  // a subagent's own commands and tests are its business
  rs = tool(rs, 'Bash', { command: 'ls' }, { agentId: 'ag-1' })
  expect(rs.list.find(r => r.id === id)).toMatchObject({ files: [{ path: '/r/b.ts' }], commandCount: 0 })
  // an agent nobody knows changes nothing
  expect(tool(rs, 'Edit', { file_path: '/r/c.ts', old_string: 'a', new_string: 'b' }, { agentId: 'ag-x' })).toBe(rs)
})

test('a milestones call sets the objective and the whole list; the current one is the first running, checked, waiting or blocked', () => {
  let rs = startTurn(ask(initialRequests(), 'ship it').rs, { turnId: 't', text: 'ship it', at: 0 })
  rs = tool(rs, 'mcp__project-sentinel__milestones', {
    objective: 'Ship the release',
    milestones: [
      { title: 'Build', status: 'completed', evidence: '12 of 12 pass' },
      { title: 'Sign', status: 'blocked', blocker: 'needs the key' },
      { title: 'Upload', status: 'in_progress', doing: 'Uploading assets' },
      { title: '', status: 'pending' },
      { title: 'Announce', status: 'weird' },
    ],
  })
  const r = rs.list[0]!
  expect(r.objective).toBe('Ship the release')
  expect(r.milestonesFrom).toBe('milestones')
  expect(r.milestones).toEqual([
    { title: 'Build', status: 'completed', evidence: '12 of 12 pass' },
    { title: 'Sign', status: 'blocked', blocker: 'needs the key' },
    { title: 'Upload', status: 'in_progress', doing: 'Uploading assets' },
    { title: 'Announce', status: 'pending' },
  ])
  expect(currentMilestone(r.milestones)).toBe(2)
  expect(currentMilestone(readMilestones([{ title: 'a', status: 'waiting' }, { title: 'b', status: 'blocked' }]))).toBe(0)
  expect(currentMilestone(readMilestones([{ title: 'a', status: 'completed' }]))).toBe(-1)
  // the next call replaces the list and keeps the objective it does not repeat
  rs = tool(rs, 'mcp__project-sentinel__milestones', { milestones: [{ title: 'Build', status: 'completed' }] })
  expect(rs.list[0]).toMatchObject({ objective: 'Ship the release', milestones: [{ title: 'Build', status: 'completed' }] })
})

test('a progress bar\'s stages are the milestones until a milestones call says otherwise', () => {
  let rs = startTurn(ask(initialRequests(), 'go').rs, { turnId: 't', text: 'go', at: 0 })
  rs = tool(rs, 'mcp__plan-progress__plan_progress', { id: 'b', title: 'Port the parser', stages: [{ name: 'A', steps: [{ title: 'Read', status: 'done' }, { title: 'Write', status: 'active' }] }, { name: 'B', steps: [{ title: 'Test' }, { title: 'Ship' }] }] })
  expect(rs.list[0]).toMatchObject({ objective: 'Port the parser', milestonesFrom: 'progress' })
  expect(rs.list[0]!.milestones.map(m => m.status)).toEqual(['completed', 'in_progress', 'pending', 'pending'])
  rs = tool(rs, 'mcp__plan-progress__plan_progress', { id: 'b', next: true })
  expect(rs.list[0]!.milestones.map(m => m.status)).toEqual(['completed', 'completed', 'in_progress', 'pending'])
  rs = tool(rs, 'mcp__plan-progress__plan_progress', { id: 'b', done: ['Test'], failed: 'Ship' })
  expect(rs.list[0]!.milestones.map(m => m.status)).toEqual(['completed', 'completed', 'completed', 'failed'])
  rs = tool(rs, 'mcp__project-sentinel__milestones', { objective: 'Real objective', milestones: [{ title: 'One', status: 'in_progress' }] })
  rs = tool(rs, 'mcp__plan-progress__plan_progress', { id: 'b', stages: [{ name: 'X', steps: [{ title: 'Other' }] }] })
  expect(rs.list[0]).toMatchObject({ objective: 'Real objective', milestones: [{ title: 'One', status: 'in_progress' }] })
})

test('AskUserQuestion keeps each question with the answer given, a declined one without', () => {
  let rs = startTurn(ask(initialRequests(), 'set it up').rs, { turnId: 't', text: 'set it up', at: 0 })
  rs = tool(rs, 'AskUserQuestion', { questions: [{ question: 'Which folder?', header: 'Folder', options: [] }, { question: 'Public repo?', header: 'Repo', options: [] }] },
    { text: 'User has answered your questions: "Which folder?"="~/mods", "Public repo?"="No, private". You can now continue with the user\'s answers in mind.' })
  rs = tool(rs, 'AskUserQuestion', { questions: [{ question: 'Delete the old one?' }] }, { isError: true, text: 'The user declined' })
  expect(rs.list[0]!.asked).toEqual([{ question: 'Which folder?', answer: '~/mods' }, { question: 'Public repo?', answer: 'No, private' }, { question: 'Delete the old one?' }])
})

test('the answer\'s questions and steps for the person are kept as follow-ups', () => {
  const answer = [
    'Done. The pane now lists every request.',
    '',
    '```sh',
    'echo "is this a question?"',
    'you need to ignore code',
    '```',
    '',
    '## Why did it fail?',
    'The test kit had no spawn. You need to run /reload-plugins to load it.',
    '',
    '| col | why? |',
    '',
    '**Next steps**',
    '- Restart Claude Code',
    '- Copy the store file',
    '',
    'Want me to publish it to your org library? Or keep it local?',
    '',
    '### Open questions',
    '- Which hotkey for Back',
  ].join('\n')
  expect(asksOfYou(answer)).toEqual({
    questions: ['Want me to publish it to your org library?', 'Or keep it local?', 'Which hotkey for Back'],
    actions: ['You need to run /reload-plugins to load it.', 'Restart Claude Code', 'Copy the store file'],
  })
  let rs = startTurn(ask(initialRequests(), 'x').rs, { turnId: 't', text: 'x', at: 0 })
  rs = end(rs, 't', answer)
  expect(rs.list[0]!.followUps!.questions).toHaveLength(3)
  expect(asksOfYou('All done, nothing left.')).toEqual({ questions: [], actions: [] })
  // a question stays a question under an action heading, and explaining a reload is no step
  expect(asksOfYou('## Next steps\n- Restart the server\n\nShould I deploy it?')).toEqual({ questions: ['Should I deploy it?'], actions: ['Restart the server'] })
  expect(asksOfYou('It runs after a hot reload.')).toEqual({ questions: [], actions: [] })
  // a heading's section ends at the next heading
  expect(asksOfYou('## Next steps\nRun the tests.\n## Notes\nIt was slow.').actions).toEqual(['Run the tests.'])
})

test('a saved list reads back field by field: a running request was cut off, a waiting one never ran', () => {
  let rs = startTurn(ask(initialRequests(), 'a').rs, { turnId: 't', text: 'a', at: 0 })
  rs = tool(rs, 'mcp__project-sentinel__milestones', { objective: 'O', milestones: [{ title: 'M', status: 'in_progress' }] })
  rs = ask(rs, 'b', 1, { turnId: 't' }).rs
  const back = loadSaved(JSON.parse(JSON.stringify(saved(rs))))
  expect(back.list).toHaveLength(1)
  expect(back.list[0]).toMatchObject({ status: 'interrupted', objective: 'O', milestones: [{ title: 'M', status: 'in_progress' }] })
  expect(back.seq).toBe(2)
  expect(back.turnId).toBeUndefined()
  expect(loadSaved({ format: 99, list: rs.list }).list).toEqual([])
  expect(loadSaved('junk').list).toEqual([])
})

test('normalizeRequests keeps what it can of a damaged value and never throws', () => {
  expect(normalizeRequests(undefined)).toEqual(initialRequests())
  const rs = normalizeRequests({ list: [null, 3, { id: 'x' }, { id: 'r1-0', n: 1, status: 'completed', text: 7, files: [{ path: '/a', add: 'x' }, {}], turns: [{ reason: 'answer', answer: 'ok' }, { reason: 'nope' }], milestones: 'no', asked: [{ question: 'q' }], followUps: { questions: ['?'], actions: 5 } }], owners: { a: 'r1-0', b: 3 }, seq: 'x' })
  expect(rs.list).toHaveLength(1)
  expect(rs.list[0]).toMatchObject({ text: '', files: [{ path: '/a', add: 0, del: 0, how: 'edit' }], turns: [{ answer: 'ok', reason: 'answer' }], milestones: [], asked: [{ question: 'q' }], followUps: { questions: ['?'], actions: [] } })
  expect(rs.owners).toEqual({ a: 'r1-0' })
  expect(rs.seq).toBe(1)
})

test('withinSize drops the oldest requests until the list fits', () => {
  let rs = initialRequests()
  for (let i = 0; i < 10; i++) rs = ask(rs, 'x'.repeat(1000), i).rs
  const cut = withinSize(rs, 5000)
  expect(JSON.stringify(cut.list).length).toBeLessThanOrEqual(5000)
  expect(cut.list.at(-1)).toBe(rs.list.at(-1))
  expect(cut.list.length).toBeGreaterThan(1)
  expect(withinSize(rs)).toBe(rs)
})

test('adopt numbers the requests made while the id was unknown after the list read back', () => {
  const saved1 = ask(ask(initialRequests(), 'old one', 0).rs, 'old two', 1).rs
  const gap = ask(initialRequests(), 'new one', 50).rs
  const joined = adopt(saved1, gap.list)
  expect(joined.list.map(r => [r.n, r.text])).toEqual([[1, 'old one'], [2, 'old two'], [3, 'new one']])
  expect(joined.list[2]!.id).toBe(gap.list[0]!.id)
  expect(joined.seq).toBe(3)
  expect(adopt(joined, gap.list).list).toHaveLength(3)
})

test('a failed call is an issue until the same call works; repeats are tries of one; a refusal is one too', () => {
  let { rs } = ask(initialRequests(), 'build it')
  rs = startTurn(rs, { turnId: 't1', text: 'build it', at: 1 })
  rs = tool(rs, 'Bash', { command: 'make' }, { isError: true, text: 'Exit code 2\nmake: *** [all] Error 1' })
  rs = tool(rs, 'Bash', { command: 'make' }, { isError: true, text: 'Exit code 2' })
  rs = tool(rs, 'Edit', { file_path: '/p/a.ts', old_string: 'x', new_string: 'y' }, { isError: true, text: '<tool_use_error>String to replace not found</tool_use_error>' })
  rs = toolEnd(rs, { tool: 'Bash', toolUseId: 'd', input: { command: 'git push --force' }, isError: true, text: 'blocked', denied: true })
  let r = rs.list[0]!
  expect(r.issues.map(i => [i.kind, i.title, i.attempts, i.reason])).toEqual([
    ['failed', 'Running make', 2, 'Exit code 2'], ['failed', 'Editing p/a.ts', 1, 'String to replace not found'], ['refused', 'Running git push --force', 1, 'blocked'],
  ])
  expect(openIssues(r)).toHaveLength(3)
  // the same call working fixes it; a Write on the same file fixes a failed Edit
  rs = tool(rs, 'Bash', { command: 'make' })
  rs = tool(rs, 'Write', { file_path: '/p/a.ts', content: 'y' })
  r = rs.list[0]!
  expect(openIssues(r).map(i => i.title)).toEqual(['Running git push --force'])
  expect(r.issues.filter(i => i.fixed)).toHaveLength(2)
  // a person declining reads as a refusal; a failing test run and a declined question are no issue
  rs = tool(rs, 'WebFetch', { url: 'x' }, { isError: true, text: "The user doesn't want to proceed with this tool use." })
  rs = tool(rs, 'Bash', { command: 'npm test' }, { isError: true, text: '1 failed' })
  rs = tool(rs, 'AskUserQuestion', { questions: [] }, { isError: true, text: 'declined' })
  expect(rs.list[0]!.issues.at(-1)).toMatchObject({ kind: 'refused', title: 'WebFetch' })
  expect(rs.list[0]!.issues).toHaveLength(4)
  // a subagent's failures are its own
  expect(tool(rs, 'Bash', { command: 'ls' }, { agentId: 'a1', isError: true }).list[0]!.issues).toHaveLength(4)
  // they survive a save
  expect(loadSaved(JSON.parse(JSON.stringify(saved(rs)))).list[0]!.issues).toEqual(rs.list[0]!.issues)
})
