import { test, expect } from 'claude-code/testing'
import { cwdSlug, taskListId, loadTasks, planOrder } from '../hooks/tasks.ts'
import { planFrom } from '../hooks/events.ts'
import { applyEvent, initialModel } from '../hooks/model.ts'
import { fakeHost } from './kit.ts'

const D = '/home/u/.claude/tasks/home-u-Projects'
const task = (id: string, subject: string, status: string, extra: object = {}) => JSON.stringify({ id, subject, status, description: 'd', activeForm: '', blocks: [], blockedBy: [], ...extra })

test('the list id is the cwd with non-alphanumerics as dashes and no leading dash', async () => {
  expect(cwdSlug('/home/novusedge/Projects')).toBe('home-novusedge-Projects')
  expect(cwdSlug('/home/n/Projects/ops-control/.claude/worktrees/site-t7')).toBe('home-n-Projects-ops-control--claude-worktrees-site-t7')
  expect(cwdSlug('/home/n/Projects/NovusEdge.github.io')).toBe('home-n-Projects-NovusEdge-github-io')
})

test('CLAUDE_CODE_TASK_LIST_ID wins, unless it could leave the tasks directory', async () => {
  expect(taskListId('team-a', '/x/y')).toBe('team-a')
  expect(taskListId(undefined, '/x/y')).toBe('x-y')
  expect(taskListId('', '/x/y')).toBe('x-y')
  for (const bad of ['..', '.', '../etc', 'a/b']) expect(taskListId(bad, '/x/y')).toBe('x-y')
})

test('task files load sorted by id; deleted, malformed and oversized files are skipped', async () => {
  const { host } = fakeHost({ files: {
    [`${D}/10.json`]: task('10', 'ten', 'pending'),
    [`${D}/2.json`]: task('2', 'two', 'in_progress', { activeForm: 'Doing two' }),
    [`${D}/3.json`]: task('3', 'gone', 'deleted'),
    [`${D}/4.json`]: '{not json',
    [`${D}/5.json`]: task('5', 'huge', 'pending', { description: 'x'.repeat(70000) }),
    [`${D}/6.json`]: task('6', 'odd status', 'blocked'),
    [`${D}/7.json`]: '[]',
    [`${D}/.lock`]: 'x',
  } })
  host.configDir = '/home/u/.claude'
  expect(await loadTasks(host, 'home-u-Projects')).toEqual([
    { id: '2', title: 'two', status: 'in_progress', active: 'Doing two' },
    { id: '10', title: 'ten', status: 'pending' },
  ])
  expect(await loadTasks(host, 'nope')).toEqual([])
  expect(await loadTasks(host, '')).toEqual([])
})

test('over 200 task files, the newest ids are kept, and an oversized file is never read', async () => {
  const files: Record<string, string> = {}
  for (let i = 1; i <= 250; i++) files[`${D}/${i}.json`] = task(String(i), 't' + i, 'completed')
  files[`${D}/900.json`] = task('900', 'now', 'in_progress')
  files[`${D}/901.json`] = task('901', 'huge', 'pending', { description: 'x'.repeat(70000) })
  const { host } = fakeHost({ files })
  host.configDir = '/home/u/.claude'
  const read: string[] = []
  const readFile = host.readFile
  host.readFile = async p => { read.push(p); return readFile(p) }
  const plan = await loadTasks(host, 'home-u-Projects')
  expect(plan).toHaveLength(200)
  expect(plan.at(-1)).toMatchObject({ id: '900', status: 'in_progress' })
  expect(plan[0]!.id).toBe('52')
  expect(read).not.toContain(`${D}/901.json`)
  expect(read).toHaveLength(200)
})

test('plan order: in progress, pending, then the last three done', async () => {
  const mk = (id: number, status: 'pending' | 'in_progress' | 'completed') => ({ id: String(id), title: 't' + id, status })
  const plan = [mk(1, 'completed'), mk(2, 'completed'), mk(3, 'pending'), mk(4, 'completed'), mk(5, 'in_progress'), mk(6, 'completed'), mk(7, 'pending')]
  const { items, hiddenDone } = planOrder(plan)
  expect(items.map(p => p.id)).toEqual(['5', '3', '7', '2', '4', '6'])
  expect(hiddenDone).toBe(1)
})

test('plan-load replaces the plan, and an empty read keeps the one built from calls', async () => {
  const m = applyEvent(initialModel(), { type: 'plan-load', plan: [{ id: '1', title: 'a', status: 'pending' }] })
  expect(m.plan).toHaveLength(1)
  expect(applyEvent(m, { type: 'plan-load', plan: [] }).plan).toHaveLength(1)
})

test('activeForm is kept from TaskCreate, TodoWrite and TaskUpdate', async () => {
  let plan = planFrom('TaskCreate', { subject: 'A', activeForm: 'Doing A' }, [], '1')!
  expect(plan[0]!.active).toBe('Doing A')
  plan = planFrom('TaskUpdate', { taskId: '1', status: 'in_progress' }, plan)!
  expect(plan[0]!.active).toBe('Doing A')
  expect(planFrom('TodoWrite', { todos: [{ content: 'B', status: 'pending', activeForm: 'Doing B' }] }, [])![0]!.active).toBe('Doing B')
})

test('context history takes one sample per turn, is bounded, and counts compactions', async () => {
  let m = initialModel()
  for (let i = 0; i < 130; i++) {
    m = applyEvent(m, { type: 'turn-start', at: i })
    m = applyEvent(m, { type: 'context', percent: i % 100 })
    m = applyEvent(m, { type: 'turn-done', at: i, reason: 'answer' })
    m = applyEvent(m, { type: 'context', percent: i % 100 })
    m = applyEvent(m, { type: 'context', percent: i % 100 })
  }
  expect(m.ctxHistory).toHaveLength(120)
  expect(m.ctxHistory.at(-1)).toBe(29)
  expect(m.ctxPeak).toBe(99)
  m = applyEvent(applyEvent(m, { type: 'compact', at: 10 }), { type: 'compact', at: 20 })
  expect(m.compactions).toBe(2)
  expect(m.compactAt).toBe(20)
  expect(applyEvent(initialModel(), { type: 'context', percent: 40 }).ctxHistory).toEqual([])
})
