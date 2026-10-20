import { test, expect } from 'claude-code/testing'
import { levelOf, xpToReach, turnXp, countCommits, UNLOCKS, unlocksBetween, parseLevelStore, levelStoreIsNewer, levelStore, levelUp, groupDigits, OUTFIT_LEVELS, outfitsOf, unlockedOutfits, resolveOutfit, parseOutfitStore, outfitStore, outfitUnlocked } from '../hooks/levels.ts'

test('the curve: 100 x n per level, endless', async () => {
  expect(levelOf(0)).toEqual({ level: 1, into: 0, need: 100 })
  expect(levelOf(99)).toEqual({ level: 1, into: 99, need: 100 })
  expect(levelOf(100)).toEqual({ level: 2, into: 0, need: 200 })
  expect(levelOf(4500)).toEqual({ level: 10, into: 0, need: 1000 })
  expect(levelOf(19_000).level).toBe(20)
  for (const L of [1, 2, 10, 37]) expect(levelOf(xpToReach(L)).level).toBe(L)
})

test('turn XP: answered base, capped combo, green, capped commits', async () => {
  expect(turnXp({ answered: true, combo: 0, green: 0, commits: 0 })).toBe(5)
  expect(turnXp({ answered: true, combo: 50, green: 0, commits: 0 })).toBe(25)
  expect(turnXp({ answered: true, combo: 3, green: 1, commits: 5 })).toBe(5 + 3 + 15 + 30)
  expect(turnXp({ answered: false, combo: 9, green: 1, commits: 1 })).toBe(25)
})

test('commit detection', async () => {
  for (const c of ['git commit -m x', 'git -C sub commit -s', 'A=1 git commit', 'git add . && git commit -m y', 'npm test; git commit -am z', 'git add -A\ngit commit -m x'])
    expect({ c, n: countCommits(c) }).toEqual({ c, n: 1 })
  for (const c of ['git commit --dry-run', 'git log', 'echo git commit', 'git commit-tree abc', 'gitx commit'])
    expect({ c, n: countCommits(c) }).toEqual({ c, n: 0 })
})

test('commit count: one per qualifying commit in a chained command', async () => {
  expect(countCommits('git commit -m one && git commit -m two')).toBe(2)
  expect(countCommits('git commit -m a; git commit --dry-run; git -C x commit -s\ngit commit -m b')).toBe(3)
})

test('unlocks: the table and the ones a jump crosses', async () => {
  expect(UNLOCKS.map(u => `${u.level}:${u.kind}`)).toEqual(['2:lines', '3:outfit', '4:lines', '5:idle', '6:outfit', '7:lines', '8:outfit', '10:idle'])
  expect(unlocksBetween(1, 2).map(u => u.level)).toEqual([2])
  expect(unlocksBetween(3, 6).map(u => u.level)).toEqual([4, 5, 6])
  expect(unlocksBetween(10, 14)).toEqual([])
})

test('the store record: malformed reads as 0', async () => {
  expect(parseLevelStore({ format: 1, xp: 250 })).toBe(250)
  for (const bad of [undefined, null, 'x', { xp: -1 }, { xp: 1.5 }, { xp: NaN }, { format: 2, xp: 10 }, { format: 1 }])
    expect(parseLevelStore(bad)).toBe(0)
  expect(levelStore(42)).toEqual({ format: 1, xp: 42 })
})

test('a record with a newer format is told apart from a malformed one', async () => {
  for (const newer of [{ format: 2, xp: 10 }, { format: 3 }, { format: 2, xp: 'x' }]) expect(levelStoreIsNewer(newer)).toBe(true)
  for (const mine of [undefined, null, 'x', {}, { format: 1, xp: 5 }, { format: 0 }, { format: '2' }, { format: 1.5 }]) expect(levelStoreIsNewer(mine)).toBe(false)
})

test('levelUp: none, one level, a jump across two, art not ready', async () => {
  expect(levelUp(50, 99)).toBeUndefined()
  expect(levelUp(95, 100)).toEqual({ level: 2, unlock: 'new lines' })
  // 290 -> 1,000: level 2 -> 5 crosses 3 (outfit), 4 (lines), 5 (idle); the newest unlock names it
  expect(levelUp(290, 1000)).toEqual({ level: 5, unlock: 'a new move' })
  expect(levelUp(290, 1000, false)).toEqual({ level: 5, unlock: 'new lines' })
  // 250 -> 300 reaches 3, whose only unlock is an outfit
  expect(levelUp(250, 300)).toEqual({ level: 3, unlock: 'a new outfit' })
  expect(levelUp(250, 300, false)).toEqual({ level: 3, unlock: undefined })
  expect(levelUp(4500, 6000)).toEqual({ level: 11, unlock: undefined })
  expect(levelOf(-5)).toEqual({ level: 1, into: 0, need: 100 })
  expect(groupDigits(2310)).toBe('2,310')
  expect(groupDigits(950)).toBe('950')
  expect(groupDigits(1234567)).toBe('1,234,567')
})

test('non-finite xp counts as 0', async () => {
  expect(levelOf(Infinity)).toEqual(levelOf(0))
  expect(levelOf(NaN)).toEqual(levelOf(0))
})

test('level outfits: three per built-in pet, unlocked at levels 3, 6 and 8, none for a custom pet', async () => {
  expect(OUTFIT_LEVELS).toEqual([3, 6, 8])
  expect(outfitsOf('clawd')).toEqual(['cap', 'wizard', 'crown'])
  expect(outfitsOf('clawd-shiny')).toEqual(outfitsOf('clawd'))
  expect(outfitsOf('robot')).toEqual(['propeller', 'tophat', 'crown'])
  expect(outfitsOf('ghost')).toEqual(['bow', 'witch', 'crown'])
  expect(outfitsOf('egg')).toEqual(['bow', 'sprout', 'crown'])
  expect(outfitsOf('my-pet')).toEqual([])
  expect(outfitsOf('constructor')).toEqual([])
  expect(unlockedOutfits('clawd', 2)).toEqual([])
  expect(unlockedOutfits('clawd', 6)).toEqual(['cap', 'wizard'])
  expect(unlockedOutfits('clawd', 40)).toEqual(['cap', 'wizard', 'crown'])
  expect(unlockedOutfits('my-pet', 40)).toEqual([])
})

test('the worn outfit: the choice if unlocked, else the newest, nothing for off', async () => {
  expect(resolveOutfit('clawd', 2, undefined)).toBeUndefined()
  expect(resolveOutfit('clawd', 8, undefined)).toBe('crown')
  expect(resolveOutfit('clawd', 8, 'cap')).toBe('cap')
  expect(resolveOutfit('clawd', 8, 'off')).toBeUndefined()
  // a locked choice, or one another pet has, falls back to the newest unlocked
  expect(resolveOutfit('clawd', 6, 'crown')).toBe('wizard')
  expect(resolveOutfit('robot', 6, 'wizard')).toBe('tophat')
  expect(resolveOutfit('my-pet', 8, 'cap')).toBeUndefined()
})

test('the outfit store record: malformed reads as no choice', async () => {
  expect(parseOutfitStore({ format: 1, name: 'cap' })).toBe('cap')
  expect(parseOutfitStore({ format: 1, name: 'off' })).toBe('off')
  for (const bad of [undefined, null, 'cap', { name: 'cap' }, { format: 2, name: 'cap' }, { format: 1, name: 3 }, { format: 1, name: '' }])
    expect(parseOutfitStore(bad)).toBeUndefined()
  expect(outfitStore('cap')).toEqual({ format: 1, name: 'cap' })
})

test('a level-up names outfit and idle unlocks only once the art is ready', async () => {
  expect(levelUp(250, 300, true)).toEqual({ level: 3, unlock: 'a new outfit' })
  expect(levelUp(250, 300, false)).toEqual({ level: 3, unlock: undefined })
  expect(levelUp(500, 1000, true)).toEqual({ level: 5, unlock: 'a new move' })
  expect(levelUp(500, 1000, false)).toEqual({ level: 5, unlock: 'new lines' })
})

test('a level-up wears the newest outfit it unlocked', async () => {
  expect(outfitUnlocked(2, 3)).toBe(true)
  expect(outfitUnlocked(3, 5)).toBe(false)
  expect(outfitUnlocked(1, 9)).toBe(true)
})
