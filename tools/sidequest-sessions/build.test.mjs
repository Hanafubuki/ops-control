// node --test ~/.claude/sidequest-sessions/build.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { asksOfYou, build, readTranscript } from './build.mjs'

const T0 = Date.parse('2026-10-20T08:00:00Z')
const at = s => new Date(T0 + s * 1000).toISOString()
const human = (s, text, extra = {}) => ({ type: 'user', timestamp: at(s), origin: { kind: 'human' }, promptSource: 'typed', cwd: '/r/proj', message: { role: 'user', content: text }, ...extra })
const say = (s, text) => ({ type: 'assistant', timestamp: at(s), message: { role: 'assistant', content: [{ type: 'text', text }] } })
const call = (s, id, name, input) => ({ type: 'assistant', timestamp: at(s), message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } })
const result = (s, id, text, toolUseResult, isError = false) => ({ type: 'user', timestamp: at(s), toolUseResult, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: text, is_error: isError }] } })
const turnEnd = (s, ms) => ({ type: 'system', subtype: 'turn_duration', durationMs: ms, timestamp: at(s) })

function transcript(mdPath) {
  return [
    { type: 'ai-title', aiTitle: 'Login fix' },
    human(0, 'fix the login bug'),
    call(1, 'm1', 'mcp__project-sentinel__milestones', { objective: 'Fix login', milestones: [{ title: 'Find', status: 'completed' }, { title: 'Patch', status: 'in_progress', doing: 'Editing' }] }),
    result(2, 'm1', 'Recorded'),
    call(3, 'w1', 'Write', { file_path: mdPath, content: '# Notes\nline\n' }),
    result(4, 'w1', 'File created', { type: 'create', filePath: mdPath }),
    call(5, 'e1', 'Edit', { file_path: '/r/proj/src/auth.ts', old_string: 'a', new_string: 'b\nc' }),
    result(6, 'e1', 'ok', { type: 'update', filePath: '/r/proj/src/auth.ts' }),
    // a message typed while the turn ran, delivered into it
    { type: 'attachment', timestamp: at(7), attachment: { type: 'queued_command', prompt: 'also add a test', origin: { kind: 'human' }, humanTurn: true } },
    call(8, 'b1', 'Bash', { command: 'npm test' }),
    result(9, 'b1', 'Tests: 3 passed'),
    call(10, 'q1', 'AskUserQuestion', { questions: [{ question: 'Ship now?' }] }),
    result(11, 'q1', 'User has answered your questions: "Ship now?"="Yes". You can now continue.'),
    say(12, 'Fixed the token refresh and added a test.\n\n## Next steps\n- Restart the server\n\nShould I deploy it?'),
    turnEnd(13, 13000),
    // a background notification: more work for the latest request
    { type: 'user', timestamp: at(20), origin: { kind: 'task-notification' }, message: { role: 'user', content: '<task-notification>done</task-notification>' } },
    say(21, 'The background run passed.'),
    turnEnd(22, 2000),
    // a local command and its output are no requests
    { type: 'user', timestamp: at(30), message: { role: 'user', content: '<command-name>/config</command-name>\n<command-args></command-args>' } },
    { type: 'user', timestamp: at(31), message: { role: 'user', content: '<local-command-stdout>ok</local-command-stdout>' } },
    // a skill typed as a command is one
    human(40, '<command-message>review</command-message>\n<command-name>/code-review</command-name>\n<command-args>high</command-args>'),
    say(41, 'Reviewing…'),
    { type: 'user', timestamp: at(42), message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } },
    { type: 'cost-state', totalCostUSD: 1.25 },
  ]
}

test('a transcript reads as requests: prompts, a folded message, follow-ups, commands and interruptions', () => {
  const { meta, requests, live } = readTranscript(transcript('/r/proj/NOTES.md'), { now: T0 + 3_600_000 })
  assert.equal(meta.aiTitle, 'Login fix')
  assert.equal(meta.cwd, '/r/proj')
  assert.equal(meta.costUsd, 1.25)
  assert.equal(live, false)
  assert.deepEqual(requests.map(r => [r.n, r.text, r.status]), [[1, 'fix the login bug', 'completed'], [2, 'also add a test', 'completed'], [3, '/code-review high', 'interrupted']])
  const [first, folded, review] = requests
  assert.equal(folded.foldedInto, first.id)
  assert.equal(first.objective, 'Fix login')
  assert.deepEqual(first.milestones.map(m => m.status), ['completed', 'in_progress'])
  assert.deepEqual(first.files, [{ path: '/r/proj/NOTES.md', how: 'new', add: 2, del: 0 }, { path: '/r/proj/src/auth.ts', how: 'edit', add: 2, del: 1 }])
  assert.equal(first.commandCount, 1)
  assert.deepEqual(first.test, { passed: true, summary: 'Tests: 3 passed' })
  assert.deepEqual(first.asked, [{ question: 'Ship now?', answer: 'Yes' }])
  // both share the turn that answered them; its answer leaves a question and a step
  assert.deepEqual(first.turns.map(t => [t.answer.split('\n')[0], t.durationMs]), [['Fixed the token refresh and added a test.', 13000]])
  assert.deepEqual(first.followUps, { questions: ['Should I deploy it?'], actions: ['Restart the server'] })
  // the notification's turn is more work for the latest request (as in glowup), whose newest answer is what it leaves
  assert.deepEqual(folded.turns.map(t => t.answer.split('\n')[0]), ['Fixed the token refresh and added a test.', 'The background run passed.'])
  assert.deepEqual(folded.followUps, { questions: [], actions: [] })
  assert.equal(review.command, true)
  assert.equal(review.turns[0].reason, 'aborted')
})

test('a transcript changed a moment ago with its turn open is a session at work', () => {
  const entries = [human(0, 'long job'), call(1, 'b', 'Bash', { command: 'sleep 100' })]
  const fresh = readTranscript(entries, { now: T0 + 60_000 })
  assert.equal(fresh.live, true)
  assert.equal(fresh.requests[0].runningSince, T0)
  assert.equal(fresh.requests[0].status, 'in_progress')
  const old = readTranscript(entries, { now: T0 + 3_600_000 })
  assert.equal(old.live, false)
  assert.equal(old.requests[0].status, 'interrupted')
})

test('follow-ups read the same way glowup reads them', () => {
  assert.deepEqual(asksOfYou('It runs after a hot reload.\nPlease restart it. Want me to publish it?'), { questions: ['Want me to publish it?'], actions: ['Please restart it.'] })
})

test('build writes the index, each session, links to its markdown, and rebuilds only what changed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-sessions-'))
  const config = path.join(root, 'config'), out = path.join(root, 'out'), md = path.join(root, 'NOTES.md')
  fs.writeFileSync(md, '# Notes\n')
  const dir = path.join(config, 'projects', '-r-proj')
  fs.mkdirSync(dir, { recursive: true })
  const sid = '11111111-2222-3333-4444-555555555555', empty = '99999999-2222-3333-4444-555555555555'
  fs.writeFileSync(path.join(dir, `${sid}.jsonl`), transcript(md).map(e => JSON.stringify(e)).join('\n') + '\n{"broken')
  fs.writeFileSync(path.join(dir, `${empty}.jsonl`), JSON.stringify({ type: 'mode', mode: 'normal' }) + '\n')
  fs.writeFileSync(path.join(dir, 'not-a-session.jsonl'), '')
  const first = build({ config, out, now: T0 + 3_600_000 })
  assert.deepEqual(first, { sessions: 1, built: 2 })
  const index = JSON.parse(fs.readFileSync(path.join(out, 'index.json'), 'utf8'))
  assert.equal(index.sessions.length, 1)
  assert.deepEqual({ ...index.sessions[0], updatedAt: 0, startedAt: 0 }, { id: sid, name: 'Login fix', project: '-r-proj', cwd: '/r/proj', branch: '', startedAt: 0, updatedAt: 0, live: false, requests: 3, done: 2, working: 0, lastPrompt: '/code-review high', markdown: 1, costUsd: 1.25, from: 'transcript' })
  const session = JSON.parse(fs.readFileSync(path.join(out, 'sessions', `${sid}.json`), 'utf8'))
  assert.equal(session.markdown.length, 1)
  assert.equal(session.markdown[0].name, 'NOTES.md')
  const link = path.join(out, session.markdown[0].href.replace('sessions-data/', ''))
  assert.equal(fs.readlinkSync(link), md)
  assert.equal(fs.readFileSync(link, 'utf8'), '# Notes\n')
  // nothing changed: nothing rebuilt
  assert.deepEqual(build({ config, out, now: T0 + 3_600_000 }), { sessions: 1, built: 0 })
  // glowup's own list wins once it exists
  fs.mkdirSync(path.join(config, 'glowup', 'requests'), { recursive: true })
  fs.writeFileSync(path.join(config, 'glowup', 'requests', `${sid}.json`), JSON.stringify({ format: 1, seq: 1, list: [{ id: 'r1-x', n: 1, text: 'from glowup', status: 'completed', at: 0, turns: [], files: [], commands: [], commandCount: 0, commits: 0, agents: [], tasks: [], tools: 0, milestones: [], asked: [] }] }))
  assert.deepEqual(build({ config, out, now: T0 + 3_600_000 }), { sessions: 1, built: 1 })
  const fromGlowup = JSON.parse(fs.readFileSync(path.join(out, 'sessions', `${sid}.json`), 'utf8'))
  assert.equal(fromGlowup.from, 'glowup')
  assert.deepEqual(fromGlowup.requests.map(r => r.text), ['from glowup'])
  // a transcript that is gone takes its session and its links with it
  fs.rmSync(path.join(dir, `${sid}.jsonl`))
  assert.deepEqual(build({ config, out, now: T0 + 3_600_000 }), { sessions: 0, built: 0 })
  assert.equal(fs.existsSync(path.join(out, 'sessions', `${sid}.json`)), false)
  assert.deepEqual(fs.readdirSync(path.join(out, 'files')), [])
  fs.rmSync(root, { recursive: true, force: true })
})
