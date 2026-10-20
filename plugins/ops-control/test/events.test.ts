import { test, expect } from 'claude-code/testing'
import { describeTool, isTestCommand, testOutcome, planFrom, editCounts, shortPath, approvalLabel, modeAsksPerson, dialogCall } from '../hooks/events.ts'

test('only the prompting modes ask a person; an absent or unknown mode asks no one', async () => {
  for (const m of ['default', 'acceptEdits', 'plan']) expect(modeAsksPerson(m)).toBe(true)
  for (const m of ['auto', 'bypassPermissions', 'dontAsk', 'somethingNew', undefined]) expect(modeAsksPerson(m)).toBe(false)
})

test('a dialog matches its call by tool and input, else the lone call of that tool', async () => {
  const fly = new Map([['a', { tool: 'Bash', input: { command: 'ls' } }], ['b', { tool: 'Bash', input: { command: 'rm x' } }], ['c', { tool: 'Edit', input: { file_path: '/f' } }]])
  expect(dialogCall(fly, 'Bash', { command: 'rm x' })).toBe('b')
  expect(dialogCall(fly, 'Edit', { file_path: '/rewritten' })).toBe('c')
  expect(dialogCall(fly, 'Bash', { command: 'rewritten' })).toBeUndefined()
  expect(dialogCall(fly, 'Write', {})).toBeUndefined()
})

test('the approval label keeps only the first line of a command', async () => {
  expect(approvalLabel('Bash', { command: 'git push\nrm -rf /' })).toBe('approve git push')
  expect(approvalLabel('Bash', { command: 'x'.repeat(60) })).toBe('approve ' + 'x'.repeat(40))
  expect(approvalLabel('Write', { file_path: '/r/a.ts' })).toBe('approve Write')
})

test('tool kinds and labels', async () => {
  expect(describeTool('Read', { file_path: '/r/src/auth.ts' })).toMatchObject({ kind: 'read', label: 'Reading src/auth.ts', file: '/r/src/auth.ts' })
  expect(describeTool('Grep', { pattern: 'redirect' })).toMatchObject({ kind: 'search', label: 'Searching "redirect"' })
  expect(describeTool('Glob', { pattern: '**/*.ts' }).kind).toBe('search')
  expect(describeTool('Edit', { file_path: '/r/a.ts', old_string: 'x', new_string: 'y' })).toMatchObject({ kind: 'edit', label: 'Editing r/a.ts' })
  expect(describeTool('Write', { file_path: '/r/b.ts', content: 'z' }).kind).toBe('edit')
  expect(describeTool('Bash', { command: 'npm test' })).toMatchObject({ kind: 'shell', isTest: true, label: 'Running npm test' })
  expect(describeTool('Agent', { description: 'Find tests', prompt: '...' })).toMatchObject({ kind: 'agent', label: 'Started subagent: Find tests' })
  expect(describeTool('TodoWrite', { todos: [] }).kind).toBe('plan')
  expect(describeTool('mcp__x__y', {}).kind).toBe('other')
})

test('labels shorten long paths to the last two segments', async () => {
  expect(describeTool('Read', { file_path: '/very/long/path/to/src/auth.ts' }).label).toBe('Reading src/auth.ts')
  expect(shortPath('/very/long/path/to/src/auth.ts')).toBe('src/auth.ts')
})

test('test commands are recognized, others are not', async () => {
  for (const c of ['npm test', 'npm run test:unit', 'npm run tests', 'pnpm run tests', 'yarn run tests', 'bun run tests', 'pnpm test', 'yarn test', 'bun test', 'pytest -x', 'python -m pytest', 'go test ./...', 'cargo test', 'npx vitest run', 'jest', 'mix test', 'rspec', 'make test', 'gradle test', './gradlew test', 'mvn test', 'cd web && pnpm test'])
    expect(isTestCommand(c)).toBe(true)
  for (const c of ['npm install', 'git status', 'cat test.txt', 'ls tests/', 'echo test'])
    expect(isTestCommand(c)).toBe(false)
})

test('test outcome reads error flag and common summaries', async () => {
  expect(testOutcome('Tests: 2 failed, 12 passed, 14 total', true)).toEqual({ passed: false, summary: '2 tests failed' })
  expect(testOutcome('14 passed in 1.2s', false)).toEqual({ passed: true, summary: '14/14 tests passing' })
  expect(testOutcome('ok  	pkg	0.01s', false)).toEqual({ passed: true, summary: 'tests passing' })
  expect(testOutcome('', true)).toEqual({ passed: false, summary: 'tests failed' })
})

test('test outcome counts from the Tests line, not the suite line', async () => {
  expect(testOutcome('Test Suites: 3 passed, 3 total\nTests:       20 passed, 20 total\n', false)).toEqual({ passed: true, summary: '20/20 tests passing' })
  expect(testOutcome('Test Suites: 1 failed, 2 passed, 3 total\nTests:       2 failed, 18 passed, 20 total\n', true)).toEqual({ passed: false, summary: '2 tests failed' })
  expect(testOutcome(' Test Files  3 passed (3)\n      Tests  20 passed (20)\n', false)).toEqual({ passed: true, summary: '20/20 tests passing' })
})

test('a piped run hides the exit code; the summary still decides', async () => {
  expect(testOutcome('ℹ tests 5\nℹ pass 3\nℹ fail 2\n', false)).toEqual({ passed: false, summary: '2 tests failed' })
  expect(testOutcome('# tests 5\n# pass 5\n# fail 0\n', false)).toEqual({ passed: true, summary: '5/5 tests passing' })
  expect(testOutcome('  3 passing (12ms)\n  1 failing\n', false)).toEqual({ passed: false, summary: '1 test failed' })
  expect(testOutcome('  4 passing (9ms)\n', false)).toEqual({ passed: true, summary: '4/4 tests passing' })
  expect(testOutcome('not ok 1 - adds\n', false).passed).toBe(false)
  expect(testOutcome('FAIL: add(2,3) expected 5, got -1\n', false).passed).toBe(false)
})

test('plan from TodoWrite replaces the list', async () => {
  const plan = planFrom('TodoWrite', { todos: [{ content: 'A', status: 'completed', activeForm: 'a' }, { content: 'B', status: 'in_progress', activeForm: 'b' }] }, [])
  expect(plan).toEqual([{ id: '0', title: 'A', status: 'completed', active: 'a' }, { id: '1', title: 'B', status: 'in_progress', active: 'b' }])
})

test('plan from TaskCreate appends and TaskUpdate changes status', async () => {
  let plan = planFrom('TaskCreate', { subject: 'A', description: '' }, [], '1')!
  plan = planFrom('TaskCreate', { subject: 'B', description: '' }, plan, '2')!
  plan = planFrom('TaskUpdate', { taskId: '1', status: 'completed' }, plan)!
  expect(plan.map(p => [p.id, p.title, p.status])).toEqual([['1', 'A', 'completed'], ['2', 'B', 'pending']])
  expect(planFrom('TaskUpdate', { taskId: '2', status: 'deleted' }, plan)!.length).toBe(1)
  expect(planFrom('Read', {}, plan)).toBeUndefined()
})

test('TaskCreate takes the result id, and counts on only when there is none', async () => {
  expect(planFrom('TaskCreate', { subject: 'C' }, [], '9')![0]!.id).toBe('9')
  expect(planFrom('TaskCreate', { subject: 'D' }, [{ id: '9', title: 'C', status: 'pending' }])![1]!.id).toBe('10')
})

test('edit counts from tool input', async () => {
  expect(editCounts('Edit', { old_string: 'a\nb', new_string: 'a\nc\nd' })).toEqual({ add: 3, del: 2 })
  expect(editCounts('Write', { content: 'x\ny\n' })).toEqual({ add: 2, del: 0 })
  expect(editCounts('Read', {})).toBeUndefined()
})

test('a shell call is labelled by its own description, the command only when it has none', () => {
  expect(describeTool('Bash', { command: 'cd ~/.claude/sidequest-arcade/work/app/src; cat x.ts', description: 'Read the arcade app source' }).label).toBe('Read the arcade app source')
  expect(describeTool('Bash', { command: 'git status', description: '  ' }).label).toBe('Running git status')
  expect(describeTool('Bash', { command: 'npm test', description: 'Run the tests' }).isTest).toBe(true)
})
