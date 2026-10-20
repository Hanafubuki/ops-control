import { test, expect } from 'claude-code/testing'
import { petPose, halfBlock, frameAt, shiny, petPalette, composeFrame, validateSheet, animFor, newPlayer, stepPlayer, playerFrame, mirrored, type PetSheet, CLAWD_SHEET, CLAWD_ROW, CLAWD_COLOR, SHINY_COLOR, PET_COLS, PET_ROWS, OUTFIT_PAD, BUILTIN_SHEETS, isClawd, mainColor, stripRows, CRITTER_ROW, idleVariant, withLevelOutfit, HEAD_OUTFITS, IDLE_VARIANTS } from '../hooks/pets.ts'
import { PET_ANIMS, BUILTIN_PET_NAMES, PACK_PET_NAMES } from '../hooks/petfile.ts'
import { cellWidth } from '../hooks/cells.ts'

const width = (s: string) => [...s].reduce((n, c) => n + cellWidth(c.codePointAt(0)!), 0)
const flat = (rows: { text: string }[][]) => rows.map(r => r.map(s => s.text).join(''))
const f = (c: string, exit?: boolean) => ({ px: [c], ms: 100, ...(exit ? { exit } : {}) })
const sheet = (): PetSheet => ({
  w: 1, h: 1, palette: {},
  animations: Object.fromEntries(['idle', 'walk', 'working', 'fail'].map(n => [n, { loop: true, frames: [f(n, true), f(n), f(n), f(n, true)] }])),
})
const draw =(pet: 'clawd' | 'clawd-shiny', pose: string, f: number, ov: string[] = []) =>
  halfBlock(composeFrame(CLAWD_SHEET, animFor(CLAWD_SHEET, pose).frames[f]!, ov, false), petPalette(CLAWD_SHEET, pet))

test('music: working poses become work-dance, resting poses become dance, events still win', async () => {
  const base = { working: false, needsYou: false, music: true }
  expect(petPose(base, 0)).toBe('dance')
  expect(petPose({ ...base, ctx: 95 }, 0)).toBe('dance')
  expect(petPose({ ...base, actAt: 1, sleepMs: 10 }, 1000)).toBe('dance')
  expect(petPose({ ...base, working: true, kind: 'edit' }, 0)).toBe('work-dance')
  expect(petPose({ ...base, working: true, kind: 'read' }, 0)).toBe('work-dance')
  expect(petPose({ ...base, working: true, kind: 'read', ctx: 95 }, 0)).toBe('work-dance')
  expect(petPose({ ...base, needsYou: true }, 0)).toBe('alert')
  expect(petPose({ ...base, lastTest: { passed: true, at: 0 } }, 100)).toBe('hop')
  expect(petPose({ ...base, doneAt: 0, doneOk: true }, 100)).toBe('done')
  expect(petPose({ ...base, agents: 3 }, 0)).toBe('juggle')
  expect(petPose({ ...base, music: false }, 0)).toBe('idle')
})

test('a sheet without dance art keeps its poses', async () => {
  const s = sheet()
  expect(animFor(s, 'work-dance')).toBe(s.animations.working)
  expect(animFor(s, 'dance')).toBe(s.animations.idle)
})

test('poses follow the table', async () => {
  const base = { working: false, needsYou: false }
  expect(petPose(base, 0)).toBe('idle')
  expect(petPose({ ...base, working: true }, 0)).toBe('walk')
  expect(petPose({ ...base, working: true, needsYou: true }, 0)).toBe('alert')
  const fail = { ...base, working: true, lastTest: { passed: false, at: 1000 } }
  expect(petPose(fail, 2000)).toBe('fail')
  expect(petPose(fail, 2600)).toBe('walk')
  expect(petPose({ ...fail, needsYou: true }, 2000)).toBe('alert')
  const pass = { ...base, working: true, lastTest: { passed: true, at: 1000 } }
  expect(petPose(pass, 2100)).toBe('hop')
  expect(petPose(pass, 2300)).toBe('walk')
  expect(petPose({ ...base, doneAt: 1000, doneOk: true }, 4900)).toBe('done')
  expect(petPose({ ...base, doneAt: 1000, doneOk: true }, 5100)).toBe('idle')
  expect(petPose({ ...base, doneAt: 1000, doneOk: false }, 1100)).toBe('idle')
})

test('done keeps dancing through its window, then returns to idle', async () => {
  const p = newPlayer(), seen = new Set<unknown>()
  stepPlayer(p, CLAWD_SHEET, 'idle', 0, 20)
  for (let t = 0; t <= 4000; t += 40) {
    stepPlayer(p, CLAWD_SHEET, 'done', t, 20)
    if (t >= 2500 && t <= 3500) seen.add(playerFrame(p, t))
  }
  expect(seen.size).toBeGreaterThan(1)
  for (let t = 4040; t <= 6000; t += 40) stepPlayer(p, CLAWD_SHEET, 'idle', t, 20)
  expect(p.seg!.pose).toBe('idle')
})

test('editing, shell commands and subagents type; everything else while working walks', async () => {
  const w = { working: true, needsYou: false }
  for (const kind of ['edit', 'shell', 'agent'] as const) expect(petPose({ ...w, kind }, 0)).toBe('working')
  for (const kind of ['read', 'search', 'plan', 'think'] as const) expect(petPose({ ...w, kind }, 0)).toBe('walk')
  expect(petPose({ ...w, kind: 'edit', lastTest: { passed: false, at: 0 } }, 100)).toBe('fail')
  expect(petPose({ ...w, kind: 'edit', lastTest: { passed: true, at: 0 } }, 100)).toBe('hop')
  expect(petPose({ working: false, needsYou: false, kind: 'edit' }, 0)).toBe('idle')
})

test('working and fail play their own animations and switch at exit frames', async () => {
  for (const pose of ['working', 'fail'] as const) expect(animFor(CLAWD_SHEET, pose)).toBe(CLAWD_SHEET.animations[pose])
  const sh = sheet(), p = newPlayer()
  stepPlayer(p, sh, 'walk', 0, 50)
  stepPlayer(p, sh, 'working', 150, 50)
  expect(p.seg!.pose).toBe('walk')
  stepPlayer(p, sh, 'working', 300, 50)
  expect(p.seg!.pose).toBe('working')
  stepPlayer(p, sh, 'fail', 305, 50)
  stepPlayer(p, sh, 'fail', 600, 50)
  expect(p.seg!.pose).toBe('fail')
})

test('a long idle falls asleep, work wakes him', async () => {
  const base = { working: false, needsYou: false, actAt: 1000 }
  expect(petPose(base, 1000 + 59_000)).toBe('idle')
  expect(petPose(base, 1000 + 60_000)).toBe('sleep')
  expect(petPose({ ...base, working: true }, 1000 + 20 * 60_000)).toBe('walk')
  expect(petPose({ ...base, needsYou: true }, 1000 + 20 * 60_000)).toBe('alert')
})

test('three or more running subagents juggle, under the reactions and over the work poses', async () => {
  const w = { working: true, needsYou: false, kind: 'agent' as const }
  expect(petPose({ ...w, agents: 2 }, 0)).toBe('working')
  expect(petPose({ ...w, agents: 3 }, 0)).toBe('juggle')
  expect(petPose({ ...w, agents: 3, kind: 'read' }, 0)).toBe('juggle')
  expect(petPose({ ...w, agents: 3, needsYou: true }, 0)).toBe('alert')
  expect(petPose({ ...w, agents: 3, lastTest: { passed: true, at: 0 } }, 100)).toBe('hop')
})

test('a compaction scrunches once, then he goes back to what he was doing', async () => {
  const base = { working: false, needsYou: false, compactAt: 1000 }
  expect(petPose(base, 900)).toBe('idle')
  expect(petPose(base, 1000)).toBe('scrunch')
  expect(petPose({ ...base, working: true, kind: 'edit' as const }, 2400)).toBe('scrunch')
  expect(petPose({ ...base, needsYou: true }, 1200)).toBe('alert')
  expect(petPose(base, 2600)).toBe('idle')
  const p = newPlayer(), clip = CLAWD_SHEET.animations.scrunch!
  const total = clip.frames.reduce((n, f) => n + f.ms, 0)
  stepPlayer(p, CLAWD_SHEET, 'scrunch', 0, 0)
  stepPlayer(p, CLAWD_SHEET, 'idle', total - 50, 0)
  expect(p.seg!.pose).toBe('scrunch')
  stepPlayer(p, CLAWD_SHEET, 'idle', total + 400, 0)
  expect(p.seg!.pose).toBe('idle')
})

test('a context window 80% full makes him pant while idle or walking', async () => {
  const base = { working: false, needsYou: false, ctx: 80 }
  expect(petPose({ ...base, ctx: 79 }, 0)).toBe('idle')
  expect(petPose(base, 0)).toBe('pant')
  expect(petPose({ ...base, working: true, kind: 'read' as const }, 0)).toBe('pant-walk')
  expect(petPose({ ...base, working: true, kind: 'edit' as const }, 0)).toBe('working')
  expect(petPose({ ...base, actAt: 1000 }, 1000 + 60_000)).toBe('sleep')
})

test('the panting walk turns at the edge on its own left-facing frames', async () => {
  const p = newPlayer()
  // three steps of dx 1 reach maxX 3 and turn him
  for (let t = 0; t <= 500; t += 20) stepPlayer(p, CLAWD_SHEET, 'pant-walk', t, 3)
  expect(p.seg!.name).toBe('pant-walk-left')
  expect(mirrored(p)).toBe(false)
})

test('an unknown activity time never means asleep', async () => {
  const base = { working: false, needsYou: false }
  expect(petPose(base, 99 * 60_000)).toBe('idle')
  expect(petPose({ ...base, actAt: 0 }, 99 * 60_000)).toBe('idle')
})

test('a missing animation falls back: fail to alert, a panting walk to the walk, anything else to idle', async () => {
  const fr = (c: string) => ({ ms: 100, px: [c] })
  const sheet = { w: 1, h: 1, palette: {}, animations: { idle: { loop: true, frames: [fr('i')] }, alert: { loop: true, frames: [fr('a')] }, walk: { loop: true, frames: [fr('w')] } } }
  expect(animFor(sheet, 'fail').frames[0]!.px).toEqual(['a'])
  expect(animFor(sheet, 'pant-walk').frames[0]!.px).toEqual(['w'])
  expect(animFor(sheet, 'juggle').frames[0]!.px).toEqual(['i'])
  expect(animFor(sheet, 'nope').frames[0]!.px).toEqual(['i'])
})

test('the shiny sheet is the sheet palette swapped to gold', async () => {
  const colors = new Set(draw('clawd-shiny', 'idle', 0).flat().flatMap(s => [s.color, s.bg]))
  expect(colors.has(CLAWD_SHEET.shiny!.L)).toBe(true)
})

test('the shipped sheet has no unknown palette keys and no ragged rows', async () => {
  validateSheet(CLAWD_SHEET)
})

test('a typo in a palette key throws instead of vanishing', async () => {
  const bad = { ...CLAWD_SHEET, animations: { idle: { loop: true, frames: [{ ms: 100, px: CLAWD_SHEET.animations.idle!.frames[0]!.px.map(r => r.replace('B', 'Q')) }] } } }
  expect(() => validateSheet(bad)).toThrow(/unknown palette key "Q"/)
  expect(() => validateSheet({ ...CLAWD_SHEET, outfits: { hat: { anchor: [0, 0], px: ['q'] } } })).toThrow(/outfit hat/)
})

test('halfBlock pairs pixel rows into half-block cells', async () => {
  const pal = { a: '#111111', b: '#222222' }
  expect(halfBlock(['a.ab', '.bab'], pal)[0]).toEqual([
    { text: '▀', color: '#111111' },
    { text: '▄', color: '#222222' },
    { text: '█', color: '#111111' },
    { text: '█', color: '#222222' },
  ])
  expect(halfBlock(['ab', 'ba'], pal)[0]).toEqual([
    { text: '▀', color: '#111111', bg: '#222222' },
    { text: '▀', color: '#222222', bg: '#111111' },
  ])
  expect(flat(halfBlock(['..', '..'], pal))).toEqual(['  '])
})

test('halfBlock merges runs and keeps blanks out of colored runs', async () => {
  const pal = { a: '#111111', b: '#222222' }
  const rows = halfBlock(['aa..aa', 'bb..bb'], pal)
  expect(flat(rows)).toEqual(['▀▀  ▀▀'])
  expect(rows[0]).toEqual([
    { text: '▀▀', color: '#111111', bg: '#222222' },
    { text: '  ', color: '#111111' },
    { text: '▀▀', color: '#111111', bg: '#222222' },
  ])
  expect(halfBlock(['a.', '..'], pal)[0]).toEqual([{ text: '▀ ', color: '#111111' }])
  expect(halfBlock(['.a', '.b'], pal)[0]![0]!.text).toBe(' ')
})

test('frameAt honors per-frame ms and loop', async () => {
  const f = (ms: number) => ({ px: [], ms })
  const loop = { loop: true, frames: [f(100), f(300), f(50)] }
  expect([0, 99, 100, 399, 400, 449, 450, 549, 550].map(t => frameAt(loop, t))).toEqual([0, 0, 1, 1, 2, 2, 0, 0, 1])
  const once = { loop: false, frames: [f(100), f(300)] }
  expect([0, 100, 399, 400, 99999].map(t => frameAt(once, t))).toEqual([0, 1, 1, 1, 1])
})

test('the sheet has every pose with enough frames', async () => {
  expect(CLAWD_SHEET.w).toBe(PET_COLS)
  expect(CLAWD_SHEET.h).toBe(PET_ROWS * 2)
  for (const pose of ['idle', 'walk', 'hop', 'alert', 'done', 'sleep', 'working', 'fail']) {
    const a = CLAWD_SHEET.animations[pose]!
    expect(a.loop).toBe(!['hop', 'fail'].includes(pose))
    expect(a.frames.length).toBeGreaterThanOrEqual(8)
    for (const fr of a.frames) {
      expect(fr.px).toHaveLength(CLAWD_SHEET.h)
      for (const r of fr.px) expect([...r]).toHaveLength(CLAWD_SHEET.w)
      expect(fr.ms).toBeGreaterThan(0)
    }
  }
  expect(CLAWD_SHEET.animations.walk!.frames.some(f => f.dx !== undefined && f.dx !== 0)).toBe(true)
  expect(CLAWD_SHEET.animations.idle!.frames.every(f => f.head !== undefined)).toBe(true)
})

test('every frame is PET_ROWS rows of exactly PET_COLS cells; outfits add the headroom', { timeoutMs: 20000 }, async () => {
  for (const pet of ['clawd', 'clawd-shiny'] as const)
    for (const [pose, a] of Object.entries(CLAWD_SHEET.animations)) a.frames.forEach((_, f) => {
      for (const ov of [[], ['friday']]) {
        const rows = flat(draw(pet, pose, f, ov))
        expect(rows).toHaveLength(PET_ROWS)
        for (const r of rows) expect(width(r)).toBe(PET_COLS)
      }
      for (const ov of [['santa'], ['nightcap', 'sweat'], ['pumpkin'], ['party']]) {
        const rows = flat(draw(pet, pose, f, ov))
        expect(rows).toHaveLength(PET_ROWS + OUTFIT_PAD / 2)
        for (const r of rows) expect(width(r)).toBe(PET_COLS)
      }
    })
})

test('movement frames last at least 80 ms and the body keeps the sheet colors', async () => {
  const clips = Object.entries(CLAWD_SHEET.transitions ?? {}).map(([n, c]) => [n, c.frames] as const)
  for (const [pose, frames] of [...Object.entries(CLAWD_SHEET.animations).map(([n, a]) => [n, a.frames] as const), ...clips]) {
    frames.forEach((fr, i) => {
      expect(fr.ms, `${pose}[${i}]`).toBeGreaterThanOrEqual(80)
      const keys = new Set(fr.px.join(''))
      for (const k of 'BD') expect(keys.has(k), `${pose}[${i}] has ${k}`).toBe(true)
    })
  }
})

test('exit frames and transition clips have the shape the Client reads', async () => {
  for (const [name, a] of Object.entries(CLAWD_SHEET.animations)) expect(a.frames.every(f => f.exit === undefined || f.exit === true), name).toBe(true)
  for (const [name, c] of Object.entries(CLAWD_SHEET.transitions ?? {})) {
    expect(typeof c.from, name).toBe('string')
    expect(typeof c.to, name).toBe('string')
    expect(c.frames.length, name).toBeGreaterThan(0)
  }
})

test('the one-row Clawd is five width-1 cells', async () => {
  expect([...CLAWD_ROW]).toHaveLength(5)
  expect(width(CLAWD_ROW)).toBe(5)
})

test('Clawd keeps his colors, shiny is gold', async () => {
  const colors = (pet: 'clawd' | 'clawd-shiny') => new Set(draw(pet, 'idle', 0).flat().flatMap(s => [s.color, s.bg].filter(Boolean)))
  expect(colors('clawd').has(CLAWD_COLOR)).toBe(true)
  expect(colors('clawd').has(SHINY_COLOR)).toBe(false)
  expect(colors('clawd-shiny').has(SHINY_COLOR)).toBe(true)
  expect(colors('clawd-shiny').has(CLAWD_COLOR)).toBe(false)
})

test('shiny swaps only the body colors, and only keys the palette has', async () => {
  const s = shiny(CLAWD_SHEET.palette)
  expect(s.B).toBe(SHINY_COLOR)
  expect(Object.keys(s).sort()).toEqual(Object.keys(CLAWD_SHEET.palette).sort())
})

test('a pack tint recolors B, L and D for clawd and is ignored for clawd-shiny', async () => {
  const tint = { body: '#112233', light: '#445566', shade: '#778899' }
  const p = petPalette(CLAWD_SHEET, 'clawd', tint)
  expect([p.B, p.L, p.D]).toEqual(['#112233', '#445566', '#778899'])
  expect(petPalette(CLAWD_SHEET, 'clawd', { body: '#112233' }).L).toBe(CLAWD_SHEET.palette.L)
  expect(petPalette(CLAWD_SHEET, 'clawd')).toEqual(CLAWD_SHEET.palette)
  expect(petPalette(CLAWD_SHEET, 'clawd-shiny', tint)).toEqual(petPalette(CLAWD_SHEET, 'clawd-shiny'))
})

test('outfits draw on the head and change the picture; unknown names change nothing', async () => {
  const base = (ov: string[]) => flat(draw('clawd', 'idle', 0, ov))
  for (const ov of ['santa', 'party', 'nightcap', 'pumpkin', 'sweat']) expect(base([ov]).join('\n')).not.toBe(base([]).join('\n'))
  expect(base(['friday'])).toEqual(base([]))
})

test('composeFrame mirrors every row', async () => {
  const sheet = { w: 3, h: 2, palette: { a: '#111111' }, animations: {} }
  expect(composeFrame(sheet, { px: ['a..', '.a.'] }, [], true)).toEqual(['..a', '.a.'])
})

test('a hand outfit sits at the frame hand, or four pixels under the head', async () => {
  const sheet = { w: 4, h: 4, palette: { a: '#111111', b: '#222222' }, outfits: { cup: { slot: 'hand' as const, anchor: [0, 0] as [number, number], px: ['b'] } }, animations: {} }
  const blank = ['....', '....', '....', '....', '....', '....']
  expect(composeFrame(sheet, { px: blank, head: [1, 0] }, ['cup'], false)[4 + OUTFIT_PAD]).toBe('.b..')
  expect(composeFrame(sheet, { px: blank, head: [1, 0], hand: [3, 1] }, ['cup'], false)[1 + OUTFIT_PAD]).toBe('...b')
})

test('walking carries horizontal travel in dx', async () => {
  expect(CLAWD_SHEET.animations.walk!.frames.every(f => (f.dx ?? 0) > 0)).toBe(true)
  const left = CLAWD_SHEET.animations['walk-left']
  if (left) expect(left.frames.every(f => (f.dx ?? 0) < 0)).toBe(true)
})

test('sleep and pant follow the setup when given', () => {
  const idle = { working: false, needsYou: false, actAt: 1000 }
  expect(petPose({ ...idle, sleepMs: 20_000 }, 1000 + 20_000)).toBe('sleep')
  expect(petPose({ ...idle, sleepMs: 120_000 }, 1000 + 60_000)).toBe('idle')
  expect(petPose({ ...idle, ctx: 70, pantAt: 65 }, 2000)).toBe('pant')
  expect(petPose({ ...idle, ctx: 70 }, 2000)).toBe('idle')
})

test('a juggle right after the egg unlock, then back to idle', () => {
  const p = { working: false, needsYou: false, juggleAt: 1000 }
  expect(petPose(p, 1500)).toBe('juggle')
  expect(petPose(p, 1000 + 3001)).toBe('idle')
})

test('the ghost follows the user-pet rules: the spec animations plus the dances, hand-drawn left walks, headphones and lie-down', () => {
  const s = BUILTIN_SHEETS.ghost!
  expect([s.w, s.h]).toEqual([24, 12])
  expect(Object.keys(s.animations).filter(n => !IDLE_VARIANTS.includes(n)).sort()).toEqual([...PET_ANIMS.filter(n => !IDLE_VARIANTS.includes(n)), 'dance', 'work-dance', 'walk-left', 'pant-walk-left'].sort())
  expect(Object.keys(s.outfits ?? {})).toEqual(['headphones', 'bow', 'witch', 'crown'])
  expect(Object.keys(s.transitions ?? {})).toEqual(['lie-down'])
  for (const f of s.animations.walk!.frames) expect(f.dx).toBe(1)
  for (const f of s.animations['walk-left']!.frames) expect(f.dx).toBe(-1)
  for (const f of s.animations['pant-walk-left']!.frames) expect(f.dx).toBe(-1)
  expect(isClawd('ghost')).toBe(false)
  expect(petPalette(s, 'ghost', { body: '#000001' })).toEqual(s.palette)
  expect(stripRows(s, [])).toBe(6)
})

test('the built-in sheets are clawd, the robot, the ghost and the name packs\' characters, all playable', () => {
  expect(Object.keys(BUILTIN_SHEETS)).toEqual([...BUILTIN_PET_NAMES, ...PACK_PET_NAMES])
  for (const s of Object.values(BUILTIN_SHEETS)) expect(() => validateSheet(s)).not.toThrow()
})

test('the robot follows the user-pet rules: the spec animations plus the dances, hand-drawn left walks, headphones and the level outfits', () => {
  const s = BUILTIN_SHEETS.robot!
  expect([s.w, s.h]).toEqual([32, 16])
  expect(Object.keys(s.animations).filter(n => !IDLE_VARIANTS.includes(n)).sort()).toEqual([...PET_ANIMS.filter(n => !IDLE_VARIANTS.includes(n)), 'dance', 'work-dance', 'walk-left', 'pant-walk-left'].sort())
  expect(Object.keys(s.outfits ?? {})).toEqual(['headphones', 'propeller', 'tophat', 'crown'])
  expect(s.transitions ?? {}).toEqual({})
  for (const f of s.animations.walk!.frames) expect(f.dx).toBe(1)
  for (const f of s.animations['walk-left']!.frames) expect(f.dx).toBe(-1)
  for (const f of s.animations['pant-walk-left']!.frames) expect(f.dx).toBe(-1)
})

test('a pack tint recolors only Clawd', () => {
  const tint = { body: '#000001' }
  expect(petPalette(BUILTIN_SHEETS.robot!, 'robot', tint)).toEqual(BUILTIN_SHEETS.robot!.palette)
  expect(petPalette(CLAWD_SHEET, 'clawd', tint).B).toBe('#000001')
  expect([isClawd('clawd'), isClawd('clawd-shiny'), isClawd('robot')]).toEqual([true, true, false])
})

test('the strip is as tall as the pet; only head outfits a sheet has add two rows', () => {
  expect(stripRows(CLAWD_SHEET, [])).toBe(6)
  expect(stripRows(CLAWD_SHEET, ['santa'])).toBe(8)
  expect(stripRows(CLAWD_SHEET, ['sweat'])).toBe(6)
  expect(stripRows(BUILTIN_SHEETS.robot!, [])).toBe(8)
  expect(stripRows(BUILTIN_SHEETS.robot!, ['santa'])).toBe(8)
})

test('a sheet without left-facing walks mirrors the panting walk too', () => {
  const f = (c: string) => ({ ms: 100, dx: 1, px: [c] })
  const s: PetSheet = { w: 2, h: 1, palette: {}, animations: { idle: { loop: true, frames: [{ ms: 100, px: ['..'] }] }, walk: { loop: true, frames: [f('ab')] }, 'pant-walk': { loop: true, frames: [f('cd')] } } }
  const p = newPlayer()
  p.dir = -1
  p.x = 5
  stepPlayer(p, s, 'pant-walk', 0, 10)
  expect(mirrored(p)).toBe(true)
})

test('mainColor is the commonest color of the first idle frame', () => {
  const s: PetSheet = { w: 3, h: 1, palette: { A: '#111111', B: '#222222' }, animations: { idle: { loop: true, frames: [{ ms: 100, px: ['ABB'] }] } } }
  expect(mainColor(s)).toBe('#222222')
  expect([...CRITTER_ROW]).toHaveLength(5)
})

test('idle variants: idle2 from level 5, idle3 from level 10, one time in eight', async () => {
  const sheet = (...names: string[]) => ({ animations: Object.fromEntries(names.map(n => [n, {}])) }) as never
  const both = sheet('idle', 'idle2', 'idle3')
  expect(idleVariant(both, 4, () => 0)).toBeUndefined()
  expect(idleVariant(both, 5, () => 0)).toBe('idle2')
  expect(idleVariant(both, 5, () => 0.125)).toBeUndefined()
  expect(idleVariant(sheet('idle', 'idle3'), 9, () => 0)).toBeUndefined()
  expect(idleVariant(sheet('idle'), 20, () => 0)).toBeUndefined()
  expect(idleVariant(sheet('idle', 'idle3'), 10, () => 0)).toBe('idle3')
  const draws = [0.01, 0.9]
  expect(idleVariant(both, 10, () => draws.shift()!)).toBe('idle3')
  const low = [0.01, 0.1]
  expect(idleVariant(both, 10, () => low.shift()!)).toBe('idle2')
})

// idle: 3 frames of 100 ms, an exit frame at the start and end; idle2: 4 frames, exits at 0 and 3
const variantSheet = (): PetSheet => ({
  w: 1, h: 1, palette: {},
  animations: {
    idle: { loop: true, frames: [f('i', true), f('i'), f('i', true)] },
    idle2: { loop: true, frames: [f('a', true), f('b'), f('c'), f('d', true)] },
    walk: { loop: true, frames: [f('w', true), f('w'), f('w', true)] },
  },
})
const toIdle = (p: ReturnType<typeof newPlayer>, s: PetSheet, dice: { level: number; rand: () => number }) => {
  stepPlayer(p, s, 'walk', 0, 50, dice)
  for (let t = 0; t <= 100; t += 20) stepPlayer(p, s, 'idle', t, 50, dice)
}

test('returning to idle can start the variant, which plays one loop and then idle again', () => {
  const s = variantSheet(), p = newPlayer()
  let draws = 0
  const dice = { level: 5, rand: () => (draws++, 0) }
  toIdle(p, s, dice)
  expect(p.seg!.name).toBe('idle2')
  expect(p.seg!.pose).toBe('idle')
  const rolled = draws
  // a loop is 400 ms; it ends at an exit frame
  const start = p.seg!.start
  stepPlayer(p, s, 'idle', start + 380, 50, dice)
  expect(p.seg!.name).toBe('idle2')
  stepPlayer(p, s, 'idle', start + 400, 50, dice)
  expect(p.seg!.name).toBe('idle')
  // back on plain idle it stays there: the variant is rolled on return, not every loop
  for (let t = start + 420; t < start + 5000; t += 20) stepPlayer(p, s, 'idle', t, 50, dice)
  expect(p.seg!.name).toBe('idle')
  expect(draws).toBe(rolled)
})

test('without the level, the art or luck, idle stays idle', () => {
  const miss = { level: 5, rand: () => 0.5 }
  for (const [s, dice] of [[variantSheet(), miss], [variantSheet(), { level: 4, rand: () => 0 }], [{ ...variantSheet(), animations: { idle: variantSheet().animations.idle!, walk: variantSheet().animations.walk! } }, { level: 20, rand: () => 0 }]] as const) {
    const p = newPlayer()
    toIdle(p, s, dice)
    expect(p.seg!.name).toBe('idle')
  }
  // no dice at all, as the callers before levels
  const p = newPlayer()
  stepPlayer(p, variantSheet(), 'walk', 0, 50)
  for (let t = 0; t <= 400; t += 20) stepPlayer(p, variantSheet(), 'idle', t, 50)
  expect(p.seg!.name).toBe('idle')
})

test('a pose change leaves the variant at its next exit frame and finds the idle clips', () => {
  const s = variantSheet()
  s.transitions = { go: { from: 'idle', to: 'walk', frames: [f('g')] } }
  const p = newPlayer(), dice = { level: 5, rand: () => 0 }
  toIdle(p, s, dice)
  const start = p.seg!.start
  stepPlayer(p, s, 'walk', start + 120, 50, dice)
  expect(p.seg!.name).toBe('idle2')
  stepPlayer(p, s, 'walk', start + 300, 50, dice)
  expect(p.seg!.name).toBe('go')
})

test('a level outfit is worn unless a hat of the sheet is already on', () => {
  const o = (slot?: 'hand') => ({ slot, anchor: [0, 0] as [number, number], px: ['a'] })
  const s: PetSheet = { w: 1, h: 1, palette: { a: '#111111' }, animations: {}, outfits: { cap: o(), santa: o(), headphones: o(), pumpkin: o('hand'), sweat: o() } }
  expect(withLevelOutfit(s, [], 'cap')).toEqual(['cap'])
  expect(withLevelOutfit(s, [], undefined)).toEqual([])
  expect(withLevelOutfit(s, [], 'wizard')).toEqual([])
  expect(withLevelOutfit(s, ['santa'], 'cap')).toEqual(['santa'])
  expect(withLevelOutfit(s, ['headphones'], 'cap')).toEqual(['headphones'])
  expect(withLevelOutfit(s, ['pumpkin'], 'cap')).toEqual(['pumpkin', 'cap'])
  expect(withLevelOutfit(s, ['sweat', 'pumpkin'], 'cap')).toEqual(['sweat', 'pumpkin', 'cap'])
  // a holiday hat the sheet does not have yields nothing to wear it with
  expect(withLevelOutfit({ ...s, outfits: { cap: o() } }, ['santa', 'nightcap'], 'cap')).toEqual(['santa', 'nightcap', 'cap'])
})

test('every level outfit reserves the hat headroom in the strip', () => {
  for (const name of ['cap', 'wizard', 'crown', 'propeller', 'tophat', 'bow', 'witch', 'sprout']) expect(HEAD_OUTFITS).toContain(name)
  const o = { anchor: [0, 0] as [number, number], px: ['a'] }
  const s: PetSheet = { w: 1, h: 4, palette: { a: '#111111' }, animations: {}, outfits: { cap: o } }
  expect(stripRows(s, [])).toBe(2)
  expect(stripRows(s, ['cap'])).toBe(4)
})

test('a variant with no exit frames hands back to idle when its loop ends', () => {
  const s = variantSheet()
  s.animations.idle2 = { loop: true, frames: [f('a'), f('b'), f('c')] }
  const p = newPlayer(), dice = { level: 5, rand: () => 0 }
  toIdle(p, s, dice)
  const start = p.seg!.start
  stepPlayer(p, s, 'idle', start + 290, 50, dice)
  expect(p.seg!.name).toBe('idle2')
  stepPlayer(p, s, 'idle', start + 300, 50, dice)
  expect(p.seg!.name).toBe('idle')
})

test('an alert cuts into a variant mid-loop', () => {
  const s = variantSheet()
  s.animations.alert = { loop: true, frames: [f('!')] }
  s.transitions = { startle: { from: '*', to: 'alert', frames: [f('s')] } }
  const p = newPlayer(), dice = { level: 5, rand: () => 0 }
  toIdle(p, s, dice)
  stepPlayer(p, s, 'alert', p.seg!.start + 150, 50, dice)
  expect(p.seg!.name).toBe('startle')
  stepPlayer(p, s, 'alert', p.seg!.start + 150, 50, dice)
  expect(p.seg!.pose).toBe('alert')
})

test('the rows the pane reserves equal the height composeFrame draws, with a level hat and with headphones', () => {
  const o = { anchor: [0, 0] as [number, number], px: ['a'] }
  const s: PetSheet = { w: 2, h: 4, palette: { a: '#111111' }, animations: {}, outfits: { cap: o, headphones: o, santa: o } }
  const fr = { px: ['..', '..', '..', '..'], head: [0, 0] as [number, number] }
  const rows = (overlays: string[], outfit?: string, extra: string[] = []) =>
    [stripRows(s, withLevelOutfit(s, overlays, outfit)), composeFrame(s, fr, withLevelOutfit(s, [...overlays, ...extra], outfit), false).length / 2]
  for (const [ov, outfit, extra] of [[[], undefined, []], [[], 'cap', []], [['santa'], 'cap', []], [[], 'cap', ['headphones']]] as const) {
    const [reserved, drawn] = rows([...ov], outfit, [...extra])
    // headphones sit inside the pad a hat would reserve, so the strip may only be shorter by the pad
    if (extra.length) expect(drawn!).toBeLessThanOrEqual(reserved!)
    else expect(drawn).toBe(reserved)
  }
})
