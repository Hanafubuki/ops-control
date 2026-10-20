export type EggStore = { passRuns: number; shinyAt?: number; eggAt?: number; eggRuns?: number; hintAt?: number; hints?: number }
export type LocalTime = { year: number; month: number; date: number; day: number; hour: number }
export type Overlay = 'santa' | 'pumpkin' | 'party' | 'nightcap' | 'sweat' | 'friday'

export const SHINY_RUNS = 100
export const EGG_RUNS_PER_CRACK = 10, EGG_STAGES = 3

export function recordPass(s: EggStore | undefined, now: number): { next: EggStore; unlocked: boolean } {
  const passRuns = (s?.passRuns ?? 0) + 1
  const unlocked = passRuns >= SHINY_RUNS && s?.shinyAt === undefined
  return { next: unlocked ? { ...s, passRuns, shinyAt: now } : { ...s, passRuns }, unlocked }
}

export const eggUnlocked = (s: EggStore | undefined): boolean => s?.eggAt !== undefined

export const EGG_HINTS = ['psst… try clicking me', 'I remember an old cheat code…']
const HINT_EVERY_MS = 86_400_000

export const hintDue = (s: EggStore | undefined, now: number): boolean =>
  !eggUnlocked(s) && (s?.hintAt === undefined || now - s.hintAt >= HINT_EVERY_MS)

// eggRuns is the pass count at the unlock, so cracks count only runs after it.
export function unlockEgg(s: EggStore | undefined, now: number): EggStore | undefined {
  if (eggUnlocked(s)) return undefined
  const passRuns = s?.passRuns ?? 0
  return { ...s, passRuns, eggAt: now, eggRuns: passRuns }
}

export function crackStage(s: EggStore | undefined): 0 | 1 | 2 | 3 {
  if (!eggUnlocked(s)) return 0
  const cracks = Math.floor((s!.passRuns - (s!.eggRuns ?? 0)) / EGG_RUNS_PER_CRACK)
  return (Number.isFinite(cracks) ? Math.max(0, Math.min(EGG_STAGES, cracks)) : 0) as 0 | 1 | 2 | 3
}

const DEPLOY: RegExp[] = [
  /^git\s+push\b/,
  /^(npm|pnpm|yarn|bun)\s+(run\s+)?deploy\b/,
  /^vercel\b.*--prod\b/,
  /^(fly|flyctl)\s+deploy\b/,
  /^netlify\s+deploy\b.*--prod\b/,
  /^firebase\s+deploy\b/,
  /^pulumi\s+up\b/,
  /^terraform\s+apply\b/,
  /^kubectl\s+apply\b/,
]

export function isDeployCommand(cmd: string): boolean {
  return cmd.split(/[;&|\r\n]+/).some(part => {
    const p = part.trim().replace(/^(?:[A-Za-z_]\w*=\S*\s+)+/, '')
    return DEPLOY.some(re => re.test(p))
  })
}

export const fridayDeploy = (cmd: string, t: LocalTime): boolean => t.day === 5 && t.hour >= 15 && isDeployCommand(cmd)

export function parseOffset(s: string): number {
  const m = /^([+-])(\d{2})(\d{2})$/.exec(s.trim())
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0
}

// The sandbox may run in UTC, where getTimezoneOffset() is 0 for everyone; `date +%z` then gives the person's zone.
export const localOffset = (tzo: number, dateZ: string | undefined): number => tzo !== 0 ? -tzo : dateZ ? parseOffset(dateZ) : 0

export function localTime(ms: number, offsetMin: number): LocalTime {
  const d = new Date(ms + offsetMin * 60_000)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, date: d.getUTCDate(), day: d.getUTCDay(), hour: d.getUTCHours() }
}

export const daypart = (hour: number) => hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : hour < 23 ? 'evening' : 'night'

export function overlays(t: LocalTime, installed: LocalTime | undefined, friday: boolean, failed = false): Overlay[] {
  const out: Overlay[] = []
  if (t.month === 12 && t.date >= 20) out.push('santa')
  else if (t.month === 10 && t.date >= 25) out.push('pumpkin')
  else if (installed && t.month === installed.month && t.date === installed.date && t.year > installed.year) out.push('party')
  if (t.hour >= 23 || t.hour <= 4) out.push('nightcap')
  if (friday || failed) out.push('sweat')
  if (friday) out.push('friday')
  return out
}
