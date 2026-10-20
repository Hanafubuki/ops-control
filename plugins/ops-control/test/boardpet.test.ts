import { test, expect } from 'claude-code/testing'
import { boardPet, writeBoardPet, BOARD_PET_FILE } from '../hooks/boardpet.ts'
import { CLAWD_SHEET, BUILTIN_SHEETS, type PetSheet } from '../hooks/pets.ts'
import type { Host } from '../hooks/host.ts'

const sheet: PetSheet = {
  w: 6, h: 4,
  palette: { A: '#ff8a3d', B: '#111111', C: '#222222' },
  animations: { idle: { loop: true, frames: [{ ms: 400, px: ['......', '..AA..', '.ABBA', '......'] }, { ms: 400, px: ['CCCCCC'] }] } },
}

test('the board character is the first idle frame, trimmed, with only the colors it uses', async () => {
  expect(boardPet('dot', sheet)).toEqual({ format: 1, name: 'dot', w: 4, h: 2, palette: { A: '#ff8a3d', B: '#111111' }, px: ['.AA.', 'ABBA'] })
})

test('a sheet with nothing painted in idle has no board character', async () => {
  expect(boardPet('none', { ...sheet, animations: { idle: { loop: true, frames: [{ ms: 400, px: ['..', '..'] }] } } })).toBe(undefined)
})

test('a pack tint recolors Clawd on the board, and the built-in characters all have one', async () => {
  const clawd = boardPet('clawd', CLAWD_SHEET, { body: '#123456' })!
  expect(clawd.palette.B).toBe('#123456')
  for (const id of Object.keys(BUILTIN_SHEETS)) expect(boardPet(id, BUILTIN_SHEETS[id]!)?.px.length).toBeGreaterThan(0)
})

test('the file is written once per change, and a failed write is retried after making the folder', async () => {
  const writes: string[] = [], runs: string[][] = []
  let fail = 1
  const host = {
    configDir: '/c',
    writeFile: async (path: string, text: string) => { if (fail-- > 0) throw new Error('no folder'); writes.push(`${path} ${text}`) },
    run: async (argv: readonly string[]) => { runs.push([...argv]); return { exitCode: 0, stdout: '', stderr: '' } },
  } as unknown as Host
  const pet = boardPet('dot', sheet)
  const first = await writeBoardPet(host, pet, '')
  expect(runs).toEqual([['mkdir', '-p', '/c/ops-control/board']])
  expect(writes).toEqual([`${BOARD_PET_FILE('/c')} ${first}`])
  expect(await writeBoardPet(host, pet, first)).toBe(first)
  expect(writes.length).toBe(1)
})
