import { test, expect } from 'claude-code/testing'
import { fakeHost } from './kit.ts'
import { userPetNames, loadUserPet, installPetText, addPet, PET_DIR } from '../hooks/userpets.ts'

const DIR = PET_DIR('/home/u/.claude')
const row = (s: string) => s.padEnd(24, '.')
const file = (name: string) => JSON.stringify({ format: 1, name, palette: { A: '#112233' }, animations: { idle: [{ ms: 400, px: [...Array(11).fill(row('')), row('AAAA')] }] } })

test('installPetText writes <name>.json and returns the sheet', async () => {
  const { host, files } = fakeHost()
  const r = await installPetText(host, file('mochi'), false)
  expect(r.name).toBe('mochi')
  expect(r.sheet!.animations.idle!.frames).toHaveLength(1)
  expect(r.message).toBe('Installed pet "mochi". Switch to it with /ops pet mochi')
  expect(files[`${DIR}/mochi.json`]).toBe(file('mochi'))
})

test('a pet file with a key this build lacks installs and loads, with one notice naming the pet and the key', async () => {
  const later = JSON.stringify({ ...JSON.parse(file('mochi')), tail: 'long' })
  const notice = ['pet "mochi": unknown key "tail" skipped']
  const { host, files } = fakeHost()
  const r = await installPetText(host, later, false)
  expect(r.notices).toEqual(notice)
  expect(files[`${DIR}/mochi.json`]).toBe(later)
  const loaded = await loadUserPet(host, 'mochi')
  expect('sheet' in loaded && loaded.notices).toEqual(notice)
})

test('an installed name needs --force; over 64 KB and invalid files are refused', async () => {
  const { host } = fakeHost({ files: { [`${DIR}/mochi.json`]: file('mochi') } })
  expect((await installPetText(host, file('mochi'), false)).message).toBe('A pet named "mochi" is installed already. Add --force to replace it.')
  expect((await installPetText(host, file('mochi'), true)).name).toBe('mochi')
  expect((await installPetText(host, 'x'.repeat(65537), false)).message).toBe('The pet is over 64 KB.')
  expect((await installPetText(host, '{"format":1}', false)).message).toMatch(/lowercase letters, digits and dashes/)
})

test('reserved names: a stray robot.json is never listed or loaded', async () => {
  const { host } = fakeHost({ files: { [`${DIR}/robot.json`]: file('robot'), [`${DIR}/off.json`]: file('off'), [`${DIR}/mochi.json`]: file('mochi'), [`${DIR}/notes.txt`]: 'x' } })
  expect(await userPetNames(host)).toEqual(['mochi'])
  expect(await loadUserPet(host, 'robot')).toEqual({ error: '"robot" is a built-in pet name; pick another.' })
  expect((await installPetText(host, file('robot'), true)).message).toBe('"robot" is a built-in pet name; pick another.')
})

test('a user pet cannot be named ghost', async () => {
  const { host } = fakeHost({ files: { [`${DIR}/ghost.json`]: file('ghost'), [`${DIR}/mochi.json`]: file('mochi') } })
  expect(await userPetNames(host)).toEqual(['mochi'])
  expect(await loadUserPet(host, 'ghost')).toEqual({ error: '"ghost" is a built-in pet name; pick another.' })
  expect((await installPetText(host, file('ghost'), true)).message).toBe('"ghost" is a built-in pet name; pick another.')
})

test('loadUserPet names a missing, broken or renamed file', async () => {
  const { host } = fakeHost({ files: { [`${DIR}/bad.json`]: '{nope', [`${DIR}/moved.json`]: file('other') } })
  expect(await loadUserPet(host, 'gone')).toEqual({ error: 'No pet named "gone". /ops pet list shows the pets you have.' })
  expect('error' in (await loadUserPet(host, 'bad'))).toBe(true)
  expect(await loadUserPet(host, 'moved')).toEqual({ error: `${DIR}/moved.json holds a pet named "other"; rename the file or the pet.` })
})

test('addPet reads an https URL or a local path', async () => {
  const { host, files } = fakeHost({
    fetches: { 'https://x.test/mochi.json': file('mochi') },
    runs: { 'head -c 65537 /home/u/pets/kit.json': { exitCode: 0, stdout: file('kit') } },
  })
  expect((await addPet(host, 'https://x.test/mochi.json', false)).name).toBe('mochi')
  expect((await addPet(host, '~/pets/kit.json', false)).name).toBe('kit')
  expect(files[`${DIR}/kit.json`]).toBe(file('kit'))
  expect((await addPet(host, 'http://x.test/a.json', false)).message).toBe('Pet URLs must start with https://')
  expect((await addPet(host, '/nope.json', false)).message).toBe('Could not read /nope.json.')
})
