// JSX-free: the studio imports it.

export type Level = { level: number; into: number; need: number }

export const xpToReach = (level: number) => 50 * level * (level - 1)

export const levelOf = (xp: number): Level => {
  const x = Number.isFinite(xp) ? Math.max(0, xp) : 0
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + x / 12.5)) / 2))
  // The closed form drifts at exact boundaries in floating point.
  while (xpToReach(level) > x) level--
  while (xpToReach(level + 1) <= x) level++
  return { level, into: x - xpToReach(level), need: 100 * level }
}

export const levelBar = (xp: number, cells: number) => {
  const { level, into, need } = levelOf(xp)
  return { level, filled: Math.floor((into * cells) / need) }
}

export type TurnXp = { answered: boolean; combo: number; green: number; commits: number }

export const turnXp = (t: TurnXp) =>
  (t.answered ? 5 + Math.min(t.combo, 20) : 0) + 15 * t.green + 10 * Math.min(t.commits, 3)

export const countCommits = (command: string) =>
  command.split(/&&|;|\|\|?|\n/).filter(part => {
    const p = part.trim().replace(/^(\w+=\S+\s+)+/, '')
    return /^git\s+(-C\s+\S+\s+)?commit(\s|$)/.test(p) && !p.includes('--dry-run')
  }).length

export type UnlockKind = 'lines' | 'outfit' | 'idle'

export const UNLOCKS: readonly { level: number; kind: UnlockKind; label: string }[] = [
  { level: 2, kind: 'lines', label: 'new lines' },
  { level: 3, kind: 'outfit', label: 'a new outfit' },
  { level: 4, kind: 'lines', label: 'new lines' },
  { level: 5, kind: 'idle', label: 'a new move' },
  { level: 6, kind: 'outfit', label: 'a new outfit' },
  { level: 7, kind: 'lines', label: 'new lines' },
  { level: 8, kind: 'outfit', label: 'a new outfit' },
  { level: 10, kind: 'idle', label: 'a new move' },
]

export const unlocksBetween = (fromLevel: number, toLevel: number) =>
  UNLOCKS.filter(u => u.level > fromLevel && u.level <= toLevel)

export const ART_READY = true

// In unlock order, matching the outfit rows of UNLOCKS. Custom pets have none.
export const LEVEL_OUTFITS: Readonly<Record<string, readonly string[]>> = {
  clawd: ['cap', 'wizard', 'crown'],
  'clawd-shiny': ['cap', 'wizard', 'crown'],
  robot: ['propeller', 'tophat', 'crown'],
  ghost: ['bow', 'witch', 'crown'],
  egg: ['bow', 'sprout', 'crown'],
}
export const OUTFIT_LEVELS = UNLOCKS.filter(u => u.kind === 'outfit').map(u => u.level)

export const outfitsOf = (pet: string): readonly string[] => (Object.hasOwn(LEVEL_OUTFITS, pet) ? LEVEL_OUTFITS[pet]! : [])
export const unlockedOutfits = (pet: string, level: number) => outfitsOf(pet).filter((_, i) => level >= OUTFIT_LEVELS[i]!)

// choice is the stored name, or 'off'. One that this pet cannot wear yet falls back to its newest outfit.
export const resolveOutfit = (pet: string, level: number, choice: string | undefined): string | undefined => {
  const open = unlockedOutfits(pet, level)
  if (choice === 'off') return undefined
  return choice !== undefined && open.includes(choice) ? choice : open.at(-1)
}

export const outfitUnlocked = (fromLevel: number, toLevel: number) => unlocksBetween(fromLevel, toLevel).some(u => u.kind === 'outfit')

export const parseOutfitStore = (v: unknown): string | undefined => {
  const r = v as { format?: unknown; name?: unknown } | null
  return r?.format === 1 && typeof r.name === 'string' && r.name ? r.name : undefined
}

export const outfitStore = (name: string) => ({ format: 1 as const, name })

export const levelUp = (beforeXp: number, afterXp: number, artReady = ART_READY): { level: number; unlock?: string } | undefined => {
  const from = levelOf(beforeXp).level
  const to = levelOf(afterXp).level
  if (to <= from) return undefined
  const shipped = unlocksBetween(from, to).filter(u => u.kind === 'lines' || artReady)
  return { level: to, unlock: shipped.at(-1)?.label }
}

export const parseLevelStore = (v: unknown): number => {
  const r = v as { format?: unknown; xp?: unknown } | null
  return r?.format === 1 && Number.isInteger(r.xp) && (r.xp as number) >= 0 ? (r.xp as number) : 0
}

// A later format's XP is unreadable here, and writing a format-1 record over it would erase it.
export const levelStoreIsNewer = (v: unknown): boolean => {
  const f = (v as { format?: unknown } | null)?.format
  return Number.isInteger(f) && (f as number) > 1
}

export const outfitStoreIsNewer = levelStoreIsNewer

export const levelStore = (xp: number) => ({ format: 1 as const, xp })

// Not toLocaleString: its output depends on the host's locale and ICU build.
export const groupDigits = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
