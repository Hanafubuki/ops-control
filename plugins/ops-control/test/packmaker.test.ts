import { expect } from 'claude-code/testing'
import type { Host } from '../hooks/host.ts'
import { createPack, loadPackFiles, packId, petPrompt, readPackFile, type Ask } from '../hooks/packmaker.ts'
import { test } from './kit.ts'

function fakeHost(files: Record<string, string> = {}): Host & { files: Record<string, string> } {
  const dirOf = (p: string) => p.slice(0, p.lastIndexOf('/'))
  return {
    files,
    configDir: '/c', dataHome: '/d', home: '/h',
    readFile: async p => { if (!(p in files)) throw new Error('ENOENT ' + p); return files[p]! },
    writeFile: async (p, t) => { files[p] = t },
    exists: async p => p in files || Object.keys(files).some(f => dirOf(f) === p),
    listDir: async p => Object.keys(files).filter(f => dirOf(f) === p).map(f => f.slice(p.length + 1)),
  } as Host & { files: Record<string, string> }
}

const CAST = ['Luffy', 'Zoro', 'Nami', 'Usopp', 'Sanji', 'Chopper', 'Robin', 'Franky', 'Brook', 'Jinbe']
const ROW = '.'.repeat(24)
const frame = (ms: number) => ({ px: [...Array(5).fill(ROW), '.'.repeat(10) + 'RRRR' + '.'.repeat(10), ...Array(6).fill(ROW)], ms })
const PET = { format: 1, name: 'whatever', palette: { R: '#ff0000' }, animations: { idle: [frame(400)], walk: [{ ...frame(110), dx: 1 }] } }

test('packId slugs the label and steps round a taken one', () => {
  expect(packId('One Piece!', [])).toBe('one-piece')
  expect(packId('One Piece', ['one-piece'])).toBe('one-piece-2')
  expect(packId('Robot', ['robot'])).toBe('robot-2')
  expect(packId('???', [])).toBe('pack')
})

test('readPackFile cleans the cast and refuses a pack it cannot use', () => {
  const ok = readPackFile({ format: 1, id: 'op', label: 'One Piece', main: 'Luffy', cast: [...CAST, 'Zoro', '  Nami  '] })
  expect(ok).toMatchObject({ id: 'op', main: 'Luffy', cast: CAST.slice(1) })
  expect(readPackFile({ format: 1, id: 'op', label: 'x', main: 'y', cast: ['a'] })).toMatch(/at least 8/)
  expect(readPackFile({ format: 1, id: 'Bad Id', label: 'x', main: 'y', cast: CAST })).toMatch(/"id"/)
  expect(readPackFile({ format: 1, id: 'op', label: 'x', main: 'y', cast: CAST, pet: '../evil' })).toMatch(/"pet"/)
  expect(readPackFile([])).toMatch(/JSON object/)
})

test('createPack names the cast, draws the pet, and saves both where ops-control reads them', async () => {
  const host = fakeHost()
  const asked: { model: string }[] = []
  const ask: Ask = async (prompt, opts) => {
    asked.push(opts)
    return opts.model === 'sonnet' ? JSON.stringify({ label: 'One Piece', main: 'Luffy', cast: CAST.slice(1) }) : '```json\n' + JSON.stringify(PET) + '\n```'
  }
  const r = await createPack(host, ask, 'the Straw Hat pirates', ['default', 'naruto'])
  expect(r.message).toMatch(/Made the One Piece pack: Luffy leads 9 names/)
  expect(r.pack).toMatchObject({ id: 'one-piece', label: 'One Piece', main: 'Luffy', pet: 'one-piece' })
  expect(asked.map(a => a.model)).toEqual(['sonnet', 'opus'])
  expect(JSON.parse(host.files['/c/ops-control/pets/one-piece.json']!).name).toBe('one-piece')
  expect(JSON.parse(host.files['/c/ops-control/namepacks/one-piece.json']!)).toMatchObject({ format: 1, id: 'one-piece', pet: 'one-piece', description: 'the Straw Hat pirates' })
  expect(await loadPackFiles(host)).toEqual([r.pack])
})

test('a pet that will not parse is asked for again with the reason, then the pack is made without it', async () => {
  const host = fakeHost()
  const prompts: string[] = []
  const ask: Ask = async (prompt, opts) => {
    if (opts.model === 'sonnet') return JSON.stringify({ label: 'One Piece', main: 'Luffy', cast: CAST.slice(1) })
    prompts.push(prompt)
    return JSON.stringify({ ...PET, animations: { walk: PET.animations.walk } })
  }
  const r = await createPack(host, ask, 'pirates', [])
  expect(prompts).toHaveLength(2)
  expect(prompts[1]).toContain('Your last attempt was rejected: a pet needs an idle animation')
  expect(r.pack?.pet).toBeUndefined()
  expect(r.message).toMatch(/could not be drawn .*your pet stays/)
  expect(host.files['/c/ops-control/namepacks/one-piece.json']).toBeDefined()
})

test('no names, no pack; an empty description asks for one', async () => {
  const host = fakeHost()
  expect((await createPack(host, async () => undefined, 'x', [])).message).toMatch(/Could not make the pack/)
  expect((await createPack(host, async () => 'never', '   ', [])).message).toBe('Describe the pack first.')
  expect(Object.keys(host.files)).toEqual([])
  expect(petPrompt('d', 'Luffy', 'op')).toContain('"name": "op"')
})
