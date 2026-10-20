// JSX-free. Name packs: the main session always carries the pack's lead name (and wears its character as the
// pet); subagents take the cast in order of their spawn. Once the cast is used up the names come round again
// with a numeral (Naruto II), so no two agents of one session share a name. The Default pack changes nothing:
// agents keep the names their spawns give them and the pet stays the one picked with /ops pet.

// pet: the character the pack puts on the pet; none keeps the person's own pick
export type NamePack = { id: string; label: string; main: string; pet?: string; cast: readonly string[] }

export const NAME_PACKS: readonly NamePack[] = [
  { id: 'default', label: 'Default', main: 'Main session', cast: [] },
  {
    id: 'code-geass', label: 'Code Geass', main: 'Lelouch', pet: 'lelouch',
    cast: ['C.C.', 'Suzaku', 'Rolo', 'Kallen', 'Ougi', 'Tohdoh', 'Nunnally', 'Cornelia', 'Euphemia', 'Schneizel', 'Jeremiah', 'Kaguya', 'Xingke', 'Sayoko', 'Milly', 'Rivalz', 'Shirley', 'Nina', 'Lloyd', 'Cecile', 'Gino', 'Anya', 'Bismarck', 'Diethard', 'Rakshata', 'Tamaki', 'Chiba', 'Asahina', 'Guilford', 'Darlton', 'Villetta', 'Kanon', 'Clovis', 'Charles', 'Marianne', 'V.V.', 'Mao'],
  },
  {
    id: 'naruto', label: 'Naruto', main: 'Shikamaru', pet: 'shikamaru',
    cast: ['Naruto', 'Sasuke', 'Sakura', 'Kakashi', 'Itachi', 'Hinata', 'Neji', 'Rock Lee', 'Tenten', 'Gaara', 'Ino', 'Choji', 'Kiba', 'Shino', 'Jiraiya', 'Tsunade', 'Orochimaru', 'Minato', 'Kushina', 'Obito', 'Madara', 'Hashirama', 'Tobirama', 'Hiruzen', 'Might Guy', 'Asuma', 'Kurenai', 'Iruka', 'Yamato', 'Sai', 'Temari', 'Kankuro', 'Kisame', 'Deidara', 'Sasori', 'Konan', 'Nagato', 'Killer Bee', 'Shisui'],
  },
  {
    id: 'jujutsu-kaisen', label: 'Jujutsu Kaisen', main: 'Gojo', pet: 'gojo',
    cast: ['Yuji', 'Megumi', 'Nobara', 'Yuta', 'Maki', 'Nanami', 'Toge', 'Panda', 'Todo', 'Mai', 'Miwa', 'Momo', 'Noritoshi', 'Mechamaru', 'Utahime', 'Yaga', 'Ijichi', 'Mei Mei', 'Shoko', 'Geto', 'Choso', 'Toji', 'Hakari', 'Kirara', 'Ui Ui', 'Higuruma', 'Takaba', 'Yuki', 'Kusakabe', 'Hanami', 'Jogo', 'Mahito', 'Uraume', 'Naoya', 'Sukuna'],
  },
  {
    id: 'attack-on-titan', label: 'Attack on Titan', main: 'Levi', pet: 'levi',
    cast: ['Eren', 'Armin', 'Mikasa', 'Hange', 'Erwin', 'Jean', 'Connie', 'Sasha', 'Historia', 'Ymir', 'Reiner', 'Bertholdt', 'Annie', 'Zeke', 'Pieck', 'Porco', 'Gabi', 'Falco', 'Hannes', 'Mike', 'Petra', 'Oluo', 'Gunther', 'Eld', 'Moblit', 'Floch', 'Yelena', 'Onyankopon', 'Kenny', 'Grisha', 'Marco', 'Pixis', 'Nile', 'Hitch', 'Marlo', 'Kiyomi', 'Magath'],
  },
]

export const DEFAULT_NAME_PACK = 'default'

export const packOf = (id: string | undefined): NamePack => NAME_PACKS.find(p => p.id === id) ?? NAME_PACKS.find(p => p.id === DEFAULT_NAME_PACK)!

const ROMAN = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X']
const round = (n: number) => ROMAN[n] ?? ` ${n + 1}`

// The name of the n-th subagent (0-based) a session spawned; none from a pack without a cast.
export function agentName(pack: NamePack, n: number): string | undefined {
  if (!pack.cast.length) return undefined
  const i = Math.max(0, Math.floor(n))
  return pack.cast[i % pack.cast.length]! + round(Math.floor(i / pack.cast.length))
}

// Names kept per agent key once given, so an agent keeps its name when the pack or the list changes.
// `given` maps agent keys to names; a new key takes the first cast name not yet given in this session,
// or its own name (`own`, what its spawn called it) under a pack without a cast.
export function nameAgent(pack: NamePack, given: Readonly<Record<string, string>>, key: string, own: string): string {
  if (Object.hasOwn(given, key)) return given[key]!
  if (!pack.cast.length) return own
  const used = new Set(Object.values(given))
  for (let n = 0; ; n++) {
    const name = agentName(pack, n)!
    if (!used.has(name)) return name
  }
}
