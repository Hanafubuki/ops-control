import { test, expect } from 'claude-code/testing'
import { firstRun, FIRST_RUN_KEY, INSTALLED_KEY } from '../hooks/firstrun.ts'
import { BACKUP_KEY } from '../hooks/statusline.ts'
import { fakeHost } from './kit.ts'

const SETTINGS = '/home/u/.claude/settings.json'

test('the first launch leaves the status line alone and records the install once', async () => {
  const { host, files, store } = fakeHost({ files: { [SETTINGS]: '{"model":"opus"}' } })
  await firstRun(host, 5)
  expect(files[SETTINGS]).toBe('{"model":"opus"}')
  expect([store[FIRST_RUN_KEY], store[INSTALLED_KEY]]).toEqual(['no', 5])
  expect(BACKUP_KEY in store).toBe(false)
  await firstRun(host, 6)
  expect(store[INSTALLED_KEY]).toBe(5)
})

test('an existing takeover, or a status line that is already ops-control, counts as on', async () => {
  const kept = fakeHost({ files: { [SETTINGS]: '{}' } })
  kept.store[BACKUP_KEY] = '__none__'
  await firstRun(kept.host, 0)
  expect(kept.store[FIRST_RUN_KEY]).toBe('yes')
  const ours = `{"statusLine":{"type":"command","command":"sh '/home/u/.claude/ops-control/statusline.sh'"}}`
  const drawn = fakeHost({ files: { [SETTINGS]: ours } })
  await firstRun(drawn.host, 0)
  expect(drawn.store[FIRST_RUN_KEY]).toBe('yes')
  expect(drawn.files[SETTINGS]).toBe(ours)
})
