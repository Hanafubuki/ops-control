import { test, expect } from 'claude-code/testing'
import { firstRun, FIRST_RUN_KEY, TRIES_KEY, INSTALLED_KEY } from '../hooks/firstrun.ts'
import { BACKUP_KEY } from '../hooks/statusline.ts'
import { fakeHost } from './kit.ts'

const SETTINGS = '/home/u/.claude/settings.json'
const asker = (answers: (string | undefined)[]) => {
  const asked: string[] = []
  return { asked, ask: async (q: string) => { asked.push(q); return answers.shift() } }
}

test('Yes takes over with a backup and is never asked again', async () => {
  const { host, files, store } = fakeHost({ files: { [SETTINGS]: '{"model":"opus"}' } })
  const a = asker(['Yes'])
  expect(await firstRun(host, a.ask, 5)).toContain('ops-control now draws your status line')
  expect(JSON.parse(files[SETTINGS]!).statusLine.command).toContain('statusline.sh')
  expect([store[FIRST_RUN_KEY], store[INSTALLED_KEY]]).toEqual(['yes', 5])
  expect(store[BACKUP_KEY]).toBe('__none__')
  expect(await firstRun(host, a.ask, 6)).toBeUndefined()
  expect(a.asked).toHaveLength(1)
  expect(store[INSTALLED_KEY]).toBe(5)
})

test('No, and free text typed under Other, change nothing and are stored as no', async () => {
  for (const label of ['No', 'maybe later']) {
    const { host, files, store } = fakeHost({ files: { [SETTINGS]: '{"model":"opus"}' } })
    expect(await firstRun(host, asker([label]).ask, 0)).toContain('/ops statusline on')
    expect(files[SETTINGS]).toBe('{"model":"opus"}')
    expect(store[FIRST_RUN_KEY]).toBe('no')
    expect(BACKUP_KEY in store).toBe(false)
  }
})

test('a rejected ask stores nothing and retries, three times at most', async () => {
  const { host, store } = fakeHost({ files: { [SETTINGS]: '{}' } })
  const a = asker([undefined, undefined, undefined, 'Yes'])
  for (let i = 0; i < 3; i++) expect(await firstRun(host, a.ask, 0)).toBeUndefined()
  expect(store[TRIES_KEY]).toBe(3)
  expect(store[FIRST_RUN_KEY]).toBe('gave-up')
  expect(await firstRun(host, a.ask, 0)).toBeUndefined()
  expect(a.asked).toHaveLength(3)
})

test('an existing takeover counts as answered', async () => {
  const { host, store } = fakeHost({ files: { [SETTINGS]: '{}' } })
  store[BACKUP_KEY] = '__none__'
  const a = asker(['No'])
  expect(await firstRun(host, a.ask, 0)).toBeUndefined()
  expect(a.asked).toHaveLength(0)
  expect(store[FIRST_RUN_KEY]).toBe('yes')
})

test('a status line that is already ops-control is not asked about and counts as answered', async () => {
  const ours = `{"statusLine":{"type":"command","command":"sh '/home/u/.claude/ops-control/statusline.sh'"}}`
  const { host, files, store } = fakeHost({ files: { [SETTINGS]: ours } })
  const a = asker(['Yes'])
  expect(await firstRun(host, a.ask, 0)).toBeUndefined()
  expect(a.asked).toHaveLength(0)
  expect(store[FIRST_RUN_KEY]).toBe('yes')
  expect(BACKUP_KEY in store).toBe(false)
  expect(files[SETTINGS]).toBe(ours)
})

test('unreadable settings: nothing asked, nothing stored, no attempt counted', async () => {
  const { host, store } = fakeHost({ files: { [SETTINGS]: '{' } })
  const a = asker(['Yes'])
  expect(await firstRun(host, a.ask, 0)).toBeUndefined()
  expect(a.asked).toHaveLength(0)
  expect(FIRST_RUN_KEY in store || TRIES_KEY in store).toBe(false)
})
