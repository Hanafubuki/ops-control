import { expect } from 'claude-code/testing'
import { carryOver } from '../hooks/carryover.ts'
import { fakeHost, test } from './kit.ts'

test('the person\'s packs, themes, pets and name packs come over from glowup; what is already there stays', async () => {
  const c = '/home/u/.claude'
  const { host, files } = fakeHost({ files: {
    [`${c}/glowup/packs/sunset.json`]: '{"name":"sunset"}',
    [`${c}/glowup/namepacks/one-piece.json`]: '{"id":"one-piece"}',
    [`${c}/glowup/pets/mochi.json`]: 'old mochi',
    [`${c}/ops-control/pets/mochi.json`]: 'new mochi',
    [`${c}/glowup/status/s1`]: 'not carried',
  } })
  expect(await carryOver(host)).toBe(2)
  expect(files[`${c}/ops-control/packs/sunset.json`]).toBe('{"name":"sunset"}')
  expect(files[`${c}/ops-control/namepacks/one-piece.json`]).toBe('{"id":"one-piece"}')
  expect(files[`${c}/ops-control/pets/mochi.json`]).toBe('new mochi')
  expect(files[`${c}/ops-control/status/s1`]).toBeUndefined()
  // the glowup folder is left as it was
  expect(files[`${c}/glowup/packs/sunset.json`]).toBe('{"name":"sunset"}')
  expect(await carryOver(fakeHost().host)).toBe(0)
})
