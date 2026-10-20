import { expect } from 'claude-code/testing'
import { NAME_PACKS, agentName, nameAgent, packOf } from '../hooks/namepacks.ts'
import { test } from './kit.ts'

test('each pack leads with its main character and the cast the user named, in order', () => {
  const by = (id: string) => packOf(id)
  expect([by('code-geass').main, ...by('code-geass').cast.slice(0, 6)]).toEqual(['Lelouch', 'C.C.', 'Suzaku', 'Rolo', 'Kallen', 'Ougi', 'Tohdoh'])
  expect([by('naruto').main, ...by('naruto').cast.slice(0, 5)]).toEqual(['Shikamaru', 'Naruto', 'Sasuke', 'Sakura', 'Kakashi', 'Itachi'])
  expect([by('jujutsu-kaisen').main, ...by('jujutsu-kaisen').cast.slice(0, 6)]).toEqual(['Gojo', 'Yuji', 'Megumi', 'Nobara', 'Yuta', 'Maki', 'Nanami'])
  expect([by('attack-on-titan').main, ...by('attack-on-titan').cast.slice(0, 3)]).toEqual(['Levi', 'Eren', 'Armin', 'Mikasa'])
  for (const p of NAME_PACKS.filter(p => p.id !== 'default')) {
    expect(new Set(p.cast).size, p.id).toBe(p.cast.length)
    expect(p.cast.includes(p.main), p.id).toBe(false)
    expect(p.cast.length, p.id).toBeGreaterThan(30)
  }
  expect(packOf('nope').id).toBe('default')
})

test('names come round with a numeral once the cast is used up', () => {
  const p = packOf('attack-on-titan'), n = p.cast.length
  expect(agentName(p, 0)).toBe('Eren')
  expect(agentName(p, n - 1)).toBe(p.cast.at(-1))
  expect(agentName(p, n)).toBe('Eren II')
  expect(agentName(p, 2 * n + 1)).toBe('Armin III')
})

test('an agent keeps its name, and a new one takes the first name not yet given', () => {
  const p = packOf('code-geass')
  const given: Record<string, string> = {}
  for (const k of ['a', 'b', 'c']) given[k] = nameAgent(p, given, k, 'general-purpose')
  expect(given).toEqual({ a: 'C.C.', b: 'Suzaku', c: 'Rolo' })
  expect(nameAgent(p, given, 'b', 'x')).toBe('Suzaku')
  // a name given under another pack is still taken: Suzaku stays unique
  expect(nameAgent(p, { x: 'C.C.', y: 'Naruto' }, 'z', 'x')).toBe('Suzaku')
})

test('the Default pack keeps each agent\'s own name and the person\'s pet', () => {
  const d = packOf('default')
  expect(d).toMatchObject({ label: 'Default', main: 'Main session', cast: [] })
  expect(d.pet).toBeUndefined()
  expect(packOf(undefined).id).toBe('default')
  expect(agentName(d, 3)).toBeUndefined()
  expect(nameAgent(d, {}, 'a', 'Explore')).toBe('Explore')
  expect(NAME_PACKS.map(p => p.label)).toEqual(['Default', 'Code Geass', 'Naruto', 'Jujutsu Kaisen', 'Attack on Titan'])
})
