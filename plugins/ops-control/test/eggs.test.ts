import { test, expect } from 'claude-code/testing'
import { recordPass, isDeployCommand, fridayDeploy, parseOffset, localOffset, localTime, overlays, unlockEgg, crackStage, eggUnlocked, hintDue, SHINY_RUNS, type LocalTime } from '../hooks/eggs.ts'

test('recordPass counts and unlocks once at 100', async () => {
  let s = { passRuns: SHINY_RUNS - 2 }
  let r = recordPass(s, 1); expect(r.unlocked).toBe(false); s = r.next
  r = recordPass(s, 2); expect(r.unlocked).toBe(true); expect(r.next).toEqual({ passRuns: 100, shinyAt: 2 })
  r = recordPass(r.next, 3); expect(r.unlocked).toBe(false); expect(r.next.shinyAt).toBe(2)
  expect(recordPass(undefined, 0).next.passRuns).toBe(1)
})

test('the hint is due only while the egg is locked, once per 24 h', () => {
  const DAY = 86_400_000
  expect(hintDue(undefined, 5)).toBe(true)
  expect(hintDue({ passRuns: 3 }, 5)).toBe(true)
  expect(hintDue({ passRuns: 3, hintAt: 1000 }, 1000 + DAY - 1)).toBe(false)
  expect(hintDue({ passRuns: 3, hintAt: 1000 }, 1000 + DAY)).toBe(true)
  expect(hintDue({ passRuns: 3, eggAt: 1 }, 5)).toBe(false)
  expect(hintDue({ passRuns: 3, eggAt: 1, hintAt: 1 }, 1 + DAY)).toBe(false)
})

test('the egg unlocks once, at the current pass count', () => {
  const s = unlockEgg({ passRuns: 7 }, 1000)!
  expect(s).toEqual({ passRuns: 7, eggAt: 1000, eggRuns: 7 })
  expect(eggUnlocked(s)).toBe(true)
  expect(unlockEgg(s, 2000)).toBeUndefined()
  expect(unlockEgg(undefined, 5)).toEqual({ passRuns: 0, eggAt: 5, eggRuns: 0 })
  expect(eggUnlocked(undefined)).toBe(false)
})

test('a crack every 10 passing runs after the unlock, up to 3', () => {
  const at = (runs: number) => crackStage({ passRuns: 7 + runs, eggAt: 1, eggRuns: 7 })
  expect([0, 9, 10, 19, 20, 29, 30, 100].map(at)).toEqual([0, 0, 1, 1, 2, 2, 3, 3])
  expect(crackStage({ passRuns: 500 })).toBe(0)
  expect(crackStage(undefined)).toBe(0)
})

test('a corrupt store never gives a crack stage outside 0 to 3', () => {
  expect(crackStage({ passRuns: 1, eggAt: 1, eggRuns: 5 })).toBe(0)
  expect(crackStage({ passRuns: 50, eggAt: 1, eggRuns: NaN })).toBe(0)
  expect(crackStage({ passRuns: NaN, eggAt: 1, eggRuns: 0 })).toBe(0)
  expect(crackStage({ passRuns: Infinity, eggAt: 1, eggRuns: 0 })).toBe(0)
})

test('the shiny unlock keeps the egg fields', () => {
  const r = recordPass({ passRuns: 99, eggAt: 1, eggRuns: 3 }, 50)
  expect(r.next).toEqual({ passRuns: 100, eggAt: 1, eggRuns: 3, shinyAt: 50 })
})

test('deploy commands', async () => {
  for (const c of ['git push', 'git push origin main', 'npm run deploy', 'pnpm deploy', 'vercel --prod', 'fly deploy', 'netlify deploy --prod', 'firebase deploy', 'pulumi up', 'terraform apply', 'kubectl apply -f x.yaml', 'npm test && git push', 'CI=1 git push', 'npm test\ngit push', 'sleep 1 & git push'])
    expect(isDeployCommand(c)).toBe(true)
  for (const c of ['git pushd', 'vercel', 'echo git push', 'netlify deploy', 'git status']) expect(isDeployCommand(c)).toBe(false)
})

const at = (iso: string, off = 0) => localTime(Date.parse(iso), off)

test('friday deploy only on Friday from 15:00', async () => {
  expect(fridayDeploy('git push', at('2026-10-02T15:00:00Z'))).toBe(true)
  expect(fridayDeploy('git push', at('2026-10-02T14:59:00Z'))).toBe(false)
  expect(fridayDeploy('git push', at('2026-10-03T16:00:00Z'))).toBe(false)
})

test('offsets: getTimezoneOffset first, date +%z only when it is 0', async () => {
  expect(parseOffset('+0300\n')).toBe(180)
  expect(parseOffset('-0530')).toBe(-330)
  expect(parseOffset('garbage')).toBe(0)
  expect(localOffset(-120, '+0900')).toBe(120)
  expect(localOffset(0, '+0900')).toBe(540)
  expect(localOffset(0, undefined)).toBe(0)
  expect(at('2026-10-02T13:00:00Z', 180)).toEqual({ year: 2026, month: 10, date: 2, day: 5, hour: 16 })
})

test('overlays', async () => {
  const none: LocalTime | undefined = undefined
  expect(overlays(at('2026-12-24T12:00:00Z'), none, false)).toEqual(['santa'])
  expect(overlays(at('2026-12-19T12:00:00Z'), none, false)).toEqual([])
  expect(overlays(at('2026-12-20T12:00:00Z'), none, false)).toEqual(['santa'])
  expect(overlays(at('2026-10-24T12:00:00Z'), none, false)).toEqual([])
  expect(overlays(at('2026-10-25T12:00:00Z'), none, false)).toEqual(['pumpkin'])
  expect(overlays(at('2026-07-01T01:59:00Z'), none, false)).toEqual(['nightcap'])
  expect(overlays(at('2026-07-01T02:00:00Z'), none, false)).toEqual(['nightcap'])
  for (const h of ['23', '00', '04']) expect(overlays(at(`2026-07-01T${h}:30:00Z`), none, false)).toEqual(['nightcap'])
  for (const h of ['05', '22']) expect(overlays(at(`2026-07-01T${h}:00:00Z`), none, false)).toEqual([])
  expect(overlays(at('2026-07-01T12:00:00Z'), none, false, true)).toEqual(['sweat'])
  expect(overlays(at('2026-07-03T16:00:00Z'), none, true, true)).toEqual(['sweat', 'friday'])
  expect(overlays(at('2026-07-01T12:00:00Z'), none, true, false)).toEqual(['sweat', 'friday'])
  expect(overlays(at('2027-12-24T12:00:00Z'), at('2026-12-24T09:00:00Z'), false)).toEqual(['santa'])
  expect(overlays(at('2026-10-31T12:00:00Z'), none, false)).toEqual(['pumpkin'])
  expect(overlays(at('2027-03-05T12:00:00Z'), at('2026-03-05T09:00:00Z'), false)).toEqual(['party'])
  expect(overlays(at('2026-03-05T12:00:00Z'), at('2026-03-05T09:00:00Z'), false)).toEqual([])
  expect(overlays(at('2026-07-01T03:00:00Z'), none, false)).toEqual(['nightcap'])
  expect(overlays(at('2026-07-01T05:00:00Z'), none, false)).toEqual([])
  expect(overlays(at('2026-07-03T16:00:00Z'), none, true)).toEqual(['sweat', 'friday'])
})
