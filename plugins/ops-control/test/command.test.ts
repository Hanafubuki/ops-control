import { expect, mock } from 'claude-code/testing'
import { runOpsControl, fakeHost, fakeFs, test } from './kit.ts'
import { runCommand, pastedOpsControl, USAGE, type Ctl } from '../hooks/command.ts'
import { SHORT_TEXT, FULL_TEXT, SECTIONS, DOCS_URL } from '../hooks/help.ts'
import { resolveLook, cleanOverrides, type Mix } from '../hooks/packs.ts'
import type { PetSetting } from '../hooks/pets.ts'
import { DEFAULT_FIELDS, type FieldToken } from '../hooks/fields.ts'
import { DEFAULT_SETUP, type Setup } from '../hooks/setup.ts'
import { encodeLink } from '../hooks/link.ts'
import { ROLE_LABELS } from '../hooks/themes.ts'

test('/ops and /ops help print the short card', { timeoutMs: 20000 }, async ($, on) => {
  fakeFs(on)
  mock.store(on)
  for (const args of ['', 'help']) {
    const out = (await runOpsControl($, args)).text!
    expect(out).toBe(SHORT_TEXT)
    for (const c of ['/ops config', '/ops pack <name>', '/ops pet clawd|robot|ghost|off', '/ops pane', '/ops motion reduced', '/ops help all', DOCS_URL]) expect(out).toContain(c)
    expect(out).toContain('arcade classic cozy crt')
    expect(out).not.toContain('theme add')
  }
})

test('/ops help all prints every command in groups', async ($, on) => {
  fakeFs(on)
  mock.store(on)
  const out = (await runOpsControl($, 'help all')).text!
  expect(out).toBe(FULL_TEXT)
  for (const s of ['Start here', 'Look', 'Pet', 'Comfort', 'Layout', 'Make your own', 'Status line']) expect(out).toContain(s)
  for (const [, rows] of SECTIONS) for (const [c] of rows) expect(out).toContain(c)
  expect(out).toBe(USAGE)
})

test('an unknown subcommand keeps its error line above the short card', async ($, on) => {
  fakeFs(on)
  mock.store(on)
  expect((await runOpsControl($, 'bogus')).text).toBe(`Unknown: bogus\n\n${SHORT_TEXT}`)
})

test('/ops level: level, XP to the next, what is unlocked and what is next', async () => {
  const run = async (xp?: number) => {
    const { host, store } = fakeHost()
    if (xp !== undefined) store.level = { format: 1, xp }
    return runCommand(host, 'level', ctl().ctl)
  }
  expect(await run()).toBe('Level 1 · 0 XP · 100 to level 2\nUnlocked: nothing yet\nNext: new lines at level 2')
  expect(await run(2310)).toBe([
    'Level 7 · 2,310 XP · 490 to level 8',
    'Unlocked: new lines (2), a new outfit (3), new lines (4), a new move (5), a new outfit (6), new lines (7)',
    'Next: a new outfit at level 8',
  ].join('\n'))
  expect((await run(20_000)).split('\n')).toEqual([
    'Level 20 · 20,000 XP · 1,000 to level 21',
    'Unlocked: new lines (2), a new outfit (3), new lines (4), a new move (5), a new outfit (6), new lines (7), a new outfit (8), a new move (10)',
    'All unlocks earned.',
  ])
  const { host, store } = fakeHost()
  store.level = { format: 2, xp: 9000 }
  expect(await runCommand(host, 'level', ctl().ctl)).toMatch(/saved by a newer ops-control/)
})

const SETTINGS = '/home/u/.claude/settings.json'

test('/ops outfit lists the level outfits: worn, unlocked, and the level of the locked', async () => {
  const run = async (xp: number, choice?: unknown, pet: PetSetting = 'clawd') => {
    const { host, store } = fakeHost()
    store.level = { format: 1, xp }
    if (choice !== undefined) store.outfit = choice
    const c = ctl()
    c.ctl.setPet(pet)
    return (await runCommand(host, 'outfit', c.ctl)).split('\n')
  }
  // level 6: cap and wizard are open, and with no choice the newest is worn
  expect((await run(1600)).slice(0, 4)).toEqual(['Outfits for clawd', '○ cap', '● wizard (worn)', '· crown (level 8)'])
  expect((await run(1600, { format: 1, name: 'cap' })).slice(1, 4)).toEqual(['● cap (worn)', '○ wizard', '· crown (level 8)'])
  expect((await run(1600, { format: 1, name: 'off' })).slice(1, 4)).toEqual(['○ cap', '○ wizard', '· crown (level 8)'])
  expect((await run(0)).slice(1, 4)).toEqual(['· cap (level 3)', '· wizard (level 6)', '· crown (level 8)'])
  expect((await run(1600, undefined, 'robot')).slice(0, 2)).toEqual(['Outfits for robot', '○ propeller'])
  expect((await run(1600, undefined, 'ghost'))[1]).toBe('○ bow')
  expect((await run(1600, undefined, 'egg'))[2]).toBe('● sprout (worn)')
  expect((await run(1600, undefined, 'off'))[0]).toMatch(/nothing to dress/)
})

test('/ops outfit leaves a level or outfit record from a newer ops-control as it is', async () => {
  const newerLevel = fakeHost()
  newerLevel.store.level = { format: 2, xp: 9000 }
  const a = ctl()
  for (const args of ['outfit', 'outfit cap']) expect(await runCommand(newerLevel.host, args, a.ctl)).toMatch(/level was saved by a newer ops-control/)
  expect(newerLevel.store.outfit).toBeUndefined()

  const newerOutfit = fakeHost()
  newerOutfit.store.level = { format: 1, xp: 1600 }
  const record = { format: 2, name: 'cap', hue: 'red' }
  newerOutfit.store.outfit = record
  const b = ctl()
  expect(await runCommand(newerOutfit.host, 'outfit wizard', b.ctl)).toMatch(/outfit was saved by a newer ops-control/)
  expect(newerOutfit.store.outfit).toEqual(record)
  expect(b.calls).toEqual([])
})

test('/ops outfit <name> wears an unlocked outfit and stores the choice', async () => {
  const { host, store } = fakeHost()
  store.level = { format: 1, xp: 1600 }
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'outfit cap', c)).toBe('Outfit: cap')
  expect(store.outfit).toEqual({ format: 1, name: 'cap' })
  expect(await runCommand(host, 'outfit WIZARD', c)).toBe('Outfit: wizard')
  expect(calls).toEqual(['outfit:cap', 'outfit:wizard'])
})

test('/ops outfit refuses a locked or unknown name and leaves the store alone', async () => {
  const { host, store } = fakeHost()
  store.level = { format: 1, xp: 1600 }
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'outfit crown', c)).toBe('The crown unlocks at level 8; you are level 6.')
  expect(await runCommand(host, 'outfit tophat', c)).toBe('No outfit named "tophat" for clawd. Choose one of: cap, wizard, crown, or off.')
  expect(store.outfit).toBeUndefined()
  expect(calls).toEqual([])
  c.setPet('my-pet')
  expect(await runCommand(host, 'outfit cap', c)).toBe('my-pet has no level outfits.')
})

test('/ops outfit off takes it off, even at level 0', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'outfit off', c)).toBe('Outfit: off')
  expect(store.outfit).toEqual({ format: 1, name: 'off' })
  expect(calls).toEqual(['outfit:off'])
})

test('the help lists /ops outfit', async () => {
  expect(FULL_TEXT).toContain('/ops outfit')
})

const ctl = (answer = true, current = 'classic') => {
  const calls: string[] = []
  const questions: string[] = []
  let mix: Mix = { colors: 'classic', motion: 'classic' }
  let pet: PetSetting = 'clawd'
  let fields: readonly FieldToken[] = DEFAULT_FIELDS
  let setup: Setup = DEFAULT_SETUP
  const c: Ctl = {
    current: () => current,
    setTheme: async name => { calls.push('theme:' + name) },
    togglePane: async () => { calls.push('pane'); return 'ops-control pane open' },
    setMotion: reduced => { calls.push('motion:' + reduced) },
    confirm: async q => { calls.push('confirm'); questions.push(q); return answer },
    mix: () => mix,
    setMix: async m => { mix = m; calls.push(`mix:${m.colors}/${m.motion}${m.theme ? '/' + m.theme : ''}`); return [] },
    pet: () => pet,
    setPet: (p, sheet) => { pet = p; calls.push('pet:' + p + (sheet ? '+sheet' : '')) },
    setOutfit: choice => { calls.push('outfit:' + choice) },
    bubbles: () => 'on',
    setBubbles: b => { calls.push('bubbles:' + b) },
    reduced: () => false,
    fields: () => fields,
    setFields: f => { fields = f ?? DEFAULT_FIELDS },
    setup: () => setup,
    setSetup: s => { setup = s; calls.push('setup') },
    openConfig: async () => 'ops-control config open (Esc closes it)',
    openConfigTui: async () => 'ops-control config is opening',
    openPlayer: async () => { calls.push('player'); return 'Music player open (Esc closes it)' },
    spotify: async a => 'spotify ' + a,
    headless: async () => true,
  }
  return { calls, questions, ctl: c }
}

test('/ops music opens the player, and prints the usage in a -p run', async () => {
  const { calls, ctl: c } = ctl()
  expect(await runCommand(fakeHost().host, 'music', { ...c, headless: async () => false })).toBe('Music player open (Esc closes it)')
  expect(calls).toEqual(['player'])
  expect(await runCommand(fakeHost().host, 'music', c)).toBe(USAGE)
  expect(calls).toEqual(['player'])
})

test('/ops spotify routes to the connection; connect needs an interactive session', async () => {
  const asked: string[] = []
  const c: Ctl = { ...ctl().ctl, headless: async () => false, spotify: async a => { asked.push(a); return 'ok ' + a } }
  expect(await runCommand(fakeHost().host, 'spotify', c)).toBe('ok status')
  expect(await runCommand(fakeHost().host, 'spotify connect', c)).toBe('ok connect')
  expect(await runCommand(fakeHost().host, 'spotify disconnect', c)).toBe('ok disconnect')
  expect(await runCommand(fakeHost().host, 'spotify nope', c)).toBe('Use /ops spotify, /ops spotify connect or /ops spotify disconnect.')
  expect(await runCommand(fakeHost().host, 'spotify connect', { ...c, headless: async () => true })).toContain('interactive session')
  expect(asked).toEqual(['status', 'connect', 'disconnect'])
})

test('theme switch persists the name and applies it', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'theme cyberpunk', c)).toContain('cyberpunk')
  expect(store.theme).toBe('cyberpunk')
  expect(calls).toEqual(['mix:classic/classic/cyberpunk'])
})

test('a user theme resolves and switches', async () => {
  const { host, store } = fakeHost({ files: { '/home/u/.claude/ops-control/themes/mine.json': '{"name":"mine"}' } })
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'theme mine', c)).toBe('Theme: mine')
  expect(store.theme).toBe('mine')
  expect(calls).toEqual(['mix:classic/classic/mine'])
})

test('a user pack with a key this build does not know applies, and the notice follows the result', async () => {
  const { host } = fakeHost({ files: { '/home/u/.claude/ops-control/packs/later.json': '{"format":1,"name":"later","motion":{"swirl":1}}' } })
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'pack later', c)).toBe('Pack: later\npack "later": unknown key "motion.swirl" skipped')
  expect(calls).toEqual(['mix:later/later'])
})

test('a user theme with an unknown color role switches and names it', async () => {
  const { host } = fakeHost({ files: { '/home/u/.claude/ops-control/themes/mine.json': '{"name":"mine","colors":{"glow":"#ffffff"}}' } })
  expect(await runCommand(host, 'theme mine', ctl().ctl)).toBe('Theme: mine\ntheme "mine": unknown key "colors.glow" skipped')
})

test('unknown theme is refused and nothing changes', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'theme ghost', c)).toContain('no theme named "ghost"')
  expect(store.theme).toBeUndefined()
  expect(calls).toEqual([])
})

test('theme list shows built-ins and user themes and marks the active one', async () => {
  const { host } = fakeHost({ files: { '/home/u/.claude/ops-control/themes/mine.json': '{"name":"mine"}' } })
  const out = await runCommand(host, 'theme list', ctl().ctl)
  for (const n of ['ops-control', 'aurora', 'dusk', 'classic', 'cyberpunk', 'vaporwave', 'high-contrast', 'mine']) expect(out).toContain(n)
  expect(out).toContain('● classic')
  // the active theme may come from the plugin's userConfig, with nothing in the store
  const again = await runCommand(host, 'theme list', ctl(true, 'mine').ctl)
  expect(again).toContain('● mine')
  expect(again).toContain('○ classic')
})

test('theme add installs a downloaded theme', async () => {
  const { host, files } = fakeHost({ fetches: { 'https://x.test/n.json': '{"name":"neon"}' } })
  expect(await runCommand(host, 'theme add https://x.test/n.json', ctl().ctl)).toContain('Installed theme "neon"')
  expect(files['/home/u/.claude/ops-control/themes/neon.json']).toBe('{"name":"neon"}')
})

test('pane, motion and unknown subcommands', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'pane', c)).toBe('ops-control pane open')
  expect(await runCommand(host, 'motion reduced', c)).toBe('Motion: reduced.')
  expect(store.reducedMotion).toBe(true)
  expect(await runCommand(host, 'motion full', c)).toBe('Motion: full.')
  expect(store.reducedMotion).toBe(false)
  expect(calls).toEqual(['pane', 'motion:true', 'motion:false'])
  expect(await runCommand(host, 'dance', c)).toContain('/ops help all')
})

test('a subcommand with no argument answers with its current value, never Unknown', async () => {
  const { host } = fakeHost()
  const { ctl: c } = ctl()
  const ask = (args: string) => runCommand(host, args, c)
  const pack = await ask('pack')
  expect(pack).toContain('● classic')
  expect(pack).toContain('○ arcade')
  expect(await ask('pack')).toBe(await ask('pack list'))
  expect(await ask('theme')).toBe(await ask('theme list'))
  expect(await ask('pet')).toBe(await ask('pet list'))
  expect(await ask('bubbles')).toContain('Bubbles: on')
  expect(await ask('bubbles')).toContain('/ops bubbles on|off|haiku')
  expect(await ask('motion')).toContain('Motion: full')
  expect(await ask('statusline')).toContain('/ops statusline on')
  expect(await ask('import')).toContain('/ops import <file>')
  expect(await ask('export')).toContain('konsole')
  for (const sub of ['color', 'pack','theme', 'pet', 'bubbles', 'motion', 'statusline', 'import', 'export', 'spinner']) {
    expect(await ask(sub), sub).not.toContain('Unknown')
  }
})

test('color lists every role with its hex and marks overrides', async () => {
  const { host } = fakeHost()
  const { ctl: c } = ctl()
  const plain = await runCommand(host, 'color', c)
  expect(plain).toBe(await runCommand(host, 'color list', c))
  expect(plain).toContain('○ accent #d77757')
  expect(plain).toContain(`○ read   ${resolveLook({ colors: 'classic', motion: 'classic' }, {}, {}).look.theme.colors.read}  ${ROLE_LABELS.read}`)
  expect(plain.split('\n').filter(l => l.startsWith('○'))).toHaveLength(14)
  expect(plain).not.toContain('(override)')
  await runCommand(host, 'color accent #0f0', c)
  const after = await runCommand(host, 'color list', c)
  expect(after).toContain(`● accent #00ff00  ${ROLE_LABELS.accent}  (override)`)
  expect(after).toContain('○ text')
})

test('color <role> <hex> stores an override, normalised to #rrggbb', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'color accent #ABC', c)).toBe('Color accent: #aabbcc')
  expect(await runCommand(host, 'color fail #FF0000', c)).toBe('Color fail: #ff0000')
  expect(store.mix).toEqual({ colors: 'classic', motion: 'classic', overrides: { accent: '#aabbcc', fail: '#ff0000' } })
  expect(calls).toHaveLength(2)
})

test('color refuses an unknown role and a bad hex with the reason, and stores nothing', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'color glow #fff', c)).toContain('No color role named "glow". Roles: accent, text')
  for (const hex of ['red', 'fff', '#ff', '#12345', '#gggggg', '#1234567']) expect(await runCommand(host, `color accent ${hex}`, c), hex).toContain('is not a color. Use #rgb or #rrggbb.')
  expect(await runCommand(host, 'color accent', c)).toContain('/ops color <role> <#hex>')
  expect(store.mix).toBeUndefined()
  expect(calls).toEqual([])
})

test('color reset clears one override or all', async () => {
  const { host, store } = fakeHost()
  const { ctl: c } = ctl()
  expect(await runCommand(host, 'color reset', c)).toBe('No color overrides to clear.')
  await runCommand(host, 'color accent #111111', c)
  await runCommand(host, 'color text #222222', c)
  expect(await runCommand(host, 'color reset ghost', c)).toContain('No color role named "ghost"')
  expect(await runCommand(host, 'color reset dim', c)).toBe('dim has no override.')
  expect(await runCommand(host, 'color reset accent', c)).toContain('accent')
  expect(store.mix).toEqual({ colors: 'classic', motion: 'classic', overrides: { text: '#222222' } })
  expect(await runCommand(host, 'color reset text', c)).toContain('text')
  expect(store.mix).toEqual({ colors: 'classic', motion: 'classic' })
  await runCommand(host, 'color accent #111111', c)
  await runCommand(host, 'color text #222222', c)
  expect(await runCommand(host, 'color reset', c)).toBe('Color overrides cleared.')
  expect(store.mix).toEqual({ colors: 'classic', motion: 'classic' })
})

test('color overrides survive pack, theme and spinner changes and apply on top of them', async () => {
  const { host } = fakeHost()
  const { ctl: c } = ctl()
  await runCommand(host, 'color accent #123456', c)
  await runCommand(host, 'pack arcade', c)
  await runCommand(host, 'theme dusk', c)
  await runCommand(host, 'spinner comet', c)
  expect(c.mix().overrides).toEqual({ accent: '#123456' })
  expect(resolveLook(c.mix(), {}, {}).look.theme.colors.accent).toBe('#123456')
  expect(resolveLook({ colors: 'arcade', motion: 'arcade' }, {}, {}).look.theme.colors.accent).toBe('#ff3ec8')
  const list = await runCommand(host, 'color list', c)
  expect(list).toContain(`● accent #123456  ${ROLE_LABELS.accent}  (override)`)
  expect(list).toContain('○ read')
})

test('export konsole uses the overridden colors', async () => {
  const { host, files } = fakeHost()
  const { ctl: c } = ctl()
  await runCommand(host, 'color text #abcdef', c)
  const out = await runCommand(host, 'export konsole', c)
  const path = out.split('\n')[0]!
  expect(files[path]).toContain('171,205,239')
})

test('stored overrides are cleaned: unknown roles and bad colors are dropped', async () => {
  expect(cleanOverrides({ accent: '#ABC', nope: '#ffffff', text: 'blue' })).toEqual({ accent: '#aabbcc' })
  expect(cleanOverrides({ nope: '#ffffff' })).toBeUndefined()
  expect(cleanOverrides('x')).toBeUndefined()
})

test('statusline fields: set, show, default, unknown, repeats', async () => {
  const { host, store } = fakeHost()
  const { ctl: c } = ctl()
  expect(await runCommand(host, 'statusline fields', c)).toBe('Status line fields: activity ctx effort 5h week')
  expect(await runCommand(host, 'statusline fields 5h week 5h branch', c)).toBe('Status line fields: 5h week branch')
  expect(store.statusline).toEqual(['5h', 'week', 'branch'])
  const bad = await runCommand(host, 'statusline fields 5h nope zzz', c)
  expect(bad).toContain('Unknown fields: nope, zzz')
  expect(bad).toContain('activity, ctx, 5h')
  expect(store.statusline).toEqual(['5h', 'week', 'branch'])
  expect(await runCommand(host, 'statusline fields default', c)).toBe('Status line fields: activity ctx effort 5h week')
  expect('statusline' in store).toBe(false)
})

test('statusline fields: one / splits the line, two are refused, a / alone is refused', async () => {
  const { host, store } = fakeHost()
  const { ctl: c } = ctl()
  expect(await runCommand(host, 'statusline fields activity ctx / 5h week', c)).toBe('Status line fields: activity ctx / 5h week')
  expect(store.statusline).toEqual(['activity', 'ctx', '/', '5h', 'week'])
  expect(await runCommand(host, 'statusline fields ctx / 5h / week', c)).toBe('Use one / to start the second line.')
  expect(await runCommand(host, 'statusline fields /', c)).toBe('List at least one field.')
  expect(store.statusline).toEqual(['activity', 'ctx', '/', '5h', 'week'])
  expect(await runCommand(host, 'statusline fields ctx nope', c)).toContain('and / to start a second line')
})

test('bare statusline names the fields subcommand', async () => {
  const { host } = fakeHost()
  expect(await runCommand(host, 'statusline', ctl().ctl)).toContain('/ops statusline fields')
})

test('statusline on asks first; No changes nothing', async () => {
  const { host, files, store } = fakeHost({ files: { [SETTINGS]: '{"model":"opus"}' } })
  const { calls, ctl: c } = ctl(false)
  expect(await runCommand(host, 'statusline on', c)).toBe('Your status line is unchanged.')
  expect(calls).toEqual(['confirm'])
  expect(files[SETTINGS]).toBe('{"model":"opus"}')
  expect('statusline-backup' in store).toBe(false)
})

test('statusline on, then restore', async () => {
  const { host, files, store } = fakeHost({ files: { [SETTINGS]: '{"model":"opus"}' } })
  const { ctl: c } = ctl(true)
  expect(await runCommand(host, 'statusline on', c)).toContain('ops-control now draws your status line')
  expect(JSON.parse(files[SETTINGS]!).statusLine.command).toContain('statusline.sh')
  expect(await runCommand(host, 'statusline restore', c)).toBe('Your status line is back.')
  expect(JSON.parse(files[SETTINGS]!)).toEqual({ model: 'opus' })
  expect('statusline-backup' in store).toBe(false)
})

test('statusline on warns when project settings set their own', async () => {
  const { host } = fakeHost({ files: { [SETTINGS]: '{}' }, projectStatusLine: true })
  const { questions, ctl: c } = ctl(true)
  const out = await runCommand(host, 'statusline on', c)
  expect(questions[0]).toContain('project or local settings')
  expect(out).toContain('project or local settings')
})

test('theme add without a URL shows usage', async () => {
  const { host } = fakeHost()
  expect(await runCommand(host, 'theme add', ctl().ctl)).toContain('/ops theme add <url>')
})

const PACKS_DIR = '/home/u/.claude/ops-control/packs'

test('pack <name> stores both layers and applies them', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'pack arcade', c)).toBe('Pack: arcade')
  expect(store.mix).toEqual({ colors: 'arcade', motion: 'arcade' })
  expect(calls).toEqual(['mix:arcade/arcade'])
})

test('an unknown pack changes nothing', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'pack ghost', c)).toContain('no pack named "ghost"')
  expect(store.mix).toBeUndefined()
  expect(calls).toEqual([])
})

test('spinner <name> sets the override and persists the mix', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'spinner comet', c)).toBe('Spinner: comet')
  expect(store.mix).toEqual({ colors: 'classic', motion: 'classic', spinner: 'comet' })
  expect(calls).toEqual(['mix:classic/classic'])
})

test('an unknown spinner is refused and lists the valid ones', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  const out = await runCommand(host, 'spinner nope', c)
  for (const n of ['stock', 'comet', 'eyes', 'orb-states', 'clawd', 'shimmer', 'scanline', 'ring', 'glitch', 'signal']) expect(out).toContain(n)
  expect(store.mix).toBeUndefined()
  expect(calls).toEqual([])
})

test('spinner list marks the override, else the pack spinner', async () => {
  const { host } = fakeHost()
  const { ctl: c } = ctl()
  expect(await runCommand(host, 'spinner list', c)).toContain('● stock')
  await c.setMix({ colors: 'crt', motion: 'crt' })
  expect(await runCommand(host, 'spinner list', c)).toContain('● comet')
  await runCommand(host, 'spinner eyes', c)
  const out = await runCommand(host, 'spinner list', c)
  expect(out).toContain('● eyes')
  expect(out).toContain('○ comet')
})

test('spinner default clears the override and keeps the rest of the mix', async () => {
  const { host, store } = fakeHost()
  const { ctl: c } = ctl()
  await c.setMix({ colors: 'cozy', motion: 'cozy', theme: 'dusk', spinner: 'comet' })
  expect(await runCommand(host, 'spinner default', c)).toBe('Spinner: pack default')
  expect(store.mix).toEqual({ colors: 'cozy', motion: 'cozy', theme: 'dusk' })
  expect(c.mix().spinner).toBeUndefined()
})

test('spinner with no argument prints usage', async () => {
  const { host } = fakeHost()
  expect(await runCommand(host, 'spinner', ctl().ctl)).toBe(USAGE)
  expect(USAGE).toContain('/ops spinner')
})

test('pack list marks the active pack or the custom mix', async () => {
  const { host } = fakeHost({ files: { [`${PACKS_DIR}/mine.json`]: '{"format":1,"name":"mine"}' } })
  const { ctl: c } = ctl()
  const out = await runCommand(host, 'pack list', c)
  for (const n of ['classic', 'crt', 'cozy', 'arcade', 'mine']) expect(out).toContain(n)
  expect(out).toContain('● classic')
  await c.setMix({ colors: 'crt', motion: 'cozy' })
  expect(await runCommand(host, 'pack list', c)).toContain('custom mix: colors crt, motion cozy')
})

test('pack save writes the current mix as a self-contained file', async () => {
  const { host, files } = fakeHost()
  const { ctl: c } = ctl()
  await c.setMix({ colors: 'crt', motion: 'cozy' })
  expect(await runCommand(host, 'pack save mine', c)).toContain('Saved pack "mine"')
  const file = JSON.parse(files[`${PACKS_DIR}/mine.json`]!)
  expect([file.format, file.colors.rows, file.motion.spinner]).toEqual([1, 'retro', 'eyes'])
})

test('pack <url> installs then applies; --force replaces', async () => {
  const { host, store } = fakeHost({ fetches: { 'https://x.dev/n.json': '{"format":1,"name":"neon","extends":"arcade"}' } })
  const { ctl: c } = ctl()
  expect(await runCommand(host, 'pack https://x.dev/n.json', c)).toBe('Pack: neon')
  expect(store.mix).toEqual({ colors: 'neon', motion: 'neon' })
  expect(await runCommand(host, 'pack https://x.dev/n.json', c)).toContain('--force')
  expect(await runCommand(host, 'pack https://x.dev/n.json --force', c)).toContain('neon')
})

test('theme <name> keeps the pack and sets mix.theme', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  await runCommand(host, 'pack arcade', c)
  expect(await runCommand(host, 'theme dusk', c)).toBe('Theme: dusk')
  expect(store.mix).toEqual({ colors: 'arcade', motion: 'arcade', theme: 'dusk' })
  expect(store.theme).toBe('dusk')
  expect(calls.at(-1)).toBe('mix:arcade/arcade/dusk')
})

test('theme default drops the theme from the mix and the store, keeping the pack', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  await runCommand(host, 'pack arcade', c)
  await runCommand(host, 'theme dusk', c)
  expect(await runCommand(host, 'theme default', c)).toBe('Theme: pack default')
  expect(store.mix).toEqual({ colors: 'arcade', motion: 'arcade' })
  expect(store.theme).toBeUndefined()
  expect(calls.at(-1)).toBe('mix:arcade/arcade')
})

test('import reads a scheme and applies its colors layer', async () => {
  const ghostty = ['#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2'].map((x, i) => `palette = ${i}=${x}`).join('\n') + '\nbackground = #282a36\nforeground = #f8f8f2'
  const { host, files, store } = fakeHost({ runs: { 'head -c 65537 /home/u/schemes/dracula': { exitCode: 0, stdout: ghostty } } })
  const { ctl: c } = ctl()
  await runCommand(host, 'pack cozy', c)
  expect(await runCommand(host, 'import ~/schemes/dracula', c)).toContain('dracula')
  expect(JSON.parse(files[`${PACKS_DIR}/dracula.json`]!).colors.palette.text).toBe('#f8f8f2')
  expect(store.mix).toEqual({ colors: 'dracula', motion: 'cozy' })
  expect(await runCommand(host, 'import ~/nope', c)).toContain('Could not read')
})

test('import refuses a file over 64 KB before reading it', async () => {
  const { host, ran } = fakeHost({ runs: { 'head -c 65537 /home/u/big': { exitCode: 0, stdout: 'x'.repeat(65537) } } })
  expect(await runCommand(host, 'import ~/big', ctl().ctl)).toContain('over 64 KB')
  expect(ran).toEqual(['head -c 65537 /home/u/big'])
})

test('pet and bubbles; clawd-shiny stays locked until earned', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'pet off', c)).toBe('Pet: off')
  expect(await runCommand(host, 'pet clawd-shiny', c)).toContain('not unlocked')
  store.eggs = { passRuns: 100, shinyAt: 1 }
  expect(await runCommand(host, 'pet clawd-shiny', c)).toBe('Pet: clawd-shiny')
  expect(await runCommand(host, 'pet list', c)).toContain('● clawd-shiny')
  expect(await runCommand(host, 'bubbles off', c)).toBe('Bubbles: off')
  expect([store.pet, store.bubbles]).toEqual(['clawd-shiny', 'off'])
  expect(await runCommand(host, 'bubbles haiku', c)).toBe('Bubbles: haiku')
  expect(store.bubbles).toBe('haiku')
  expect(calls).toEqual(['pet:off', 'pet:clawd-shiny', 'bubbles:off', 'bubbles:haiku'])
})

test('the egg is hidden and refused until unlocked, then listed and picked with its stage sheet', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  const locked = await runCommand(host, 'pet list', c)
  expect(locked).not.toContain('egg')
  expect(locked).toContain('○ ???')
  expect(await runCommand(host, 'pet egg', c)).toBe('The egg is not unlocked yet.')
  store.eggs = { passRuns: 25, eggAt: 1, eggRuns: 3 }
  const open = await runCommand(host, 'pet list', c)
  expect(open).toContain('○ egg')
  expect(open).not.toContain('???')
  expect(await runCommand(host, 'pet egg', c)).toBe('Pet: egg')
  expect(calls).toEqual(['pet:egg+sheet'])
})

test('setup prints every key, sets one, and resets', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'setup', c)).toContain('meter.danger   80')
  const out = await runCommand(host, 'setup meter.danger 90', c)
  expect(out).toContain('meter.danger   90')
  expect((store.setup as Setup).meter.danger).toBe(90)
  expect(calls).toContain('setup')
  expect(await runCommand(host, 'setup band plan,meter', c)).toContain('band           plan, meter')
  expect(await runCommand(host, 'setup reset', c)).toContain('meter.danger   80')
  expect(store.setup).toBeUndefined()
})

test('setup keeps a comma list that was typed with spaces', async () => {
  const { host, store } = fakeHost()
  const { ctl: c } = ctl()
  await runCommand(host, 'setup band plan, meter', c)
  expect((store.setup as Setup).band).toEqual(['plan', 'meter'])
})

test('setup commands refuse to rewrite a setup saved by a newer ops-control', async () => {
  const { host, store } = fakeHost()
  const newer = { format: 5, band: ['plan', 'weather'], hologram: { on: true } }
  store.setup = newer
  const { calls, ctl: c } = ctl()
  const refusal = /saved by a newer ops-control/
  expect(await runCommand(host, 'setup meter.danger 90', c)).toMatch(refusal)
  expect(await runCommand(host, 'setup reset', c)).toMatch(refusal)
  expect(await runCommand(host, `pack ${encodeLink({ setup: { band: ['plan'] } })}`, ctl(true).ctl)).toMatch(/Setup not applied: .*saved by a newer ops-control/)
  expect(store.setup).toEqual(newer)
  expect(calls).not.toContain('setup')
})

test('setup rewrites keep the keys a later release added to a format 4 record', async () => {
  const { host, store } = fakeHost()
  store.setup = { format: 4, hologram: { on: true } }
  await runCommand(host, 'setup meter.danger 90', ctl().ctl)
  expect(store.setup).toMatchObject({ format: 4, meter: { warn: 50, danger: 90 }, hologram: { on: true } })
})

test('setup rewrites and link setups keep keys a later release added inside meter, bubbles and pet', async () => {
  const nested = () => ({ format: 4, meter: { warn: 50, danger: 80, tint: 'x' }, bubbles: { ms: 3000, style: 'y' }, pet: { sleepMs: 60000, nap: true } })
  const a = fakeHost()
  a.store.setup = nested()
  await runCommand(a.host, 'setup meter.danger 90', ctl().ctl)
  expect(a.store.setup).toMatchObject({ meter: { danger: 90, tint: 'x' }, bubbles: { style: 'y' }, pet: { nap: true } })
  const b = fakeHost()
  b.store.setup = nested()
  await runCommand(b.host, `pack ${encodeLink({ setup: { meter: { warn: 40, danger: 90 } } })}`, ctl(true).ctl)
  expect(b.store.setup).toMatchObject({ meter: { warn: 40, danger: 90, tint: 'x' }, bubbles: { style: 'y' }, pet: { nap: true } })
})

test('setup refuses a bad value and keeps the old setup', async () => {
  const { host, store } = fakeHost()
  const { ctl: c } = ctl()
  expect(await runCommand(host, 'setup meter.warn 95', c)).toBe('meter.warn must be below meter.danger')
  expect(await runCommand(host, 'setup tabs none', c)).toBe('tabs must name at least one of: plan, context, guardrails, agents, diff, music, settings')
  expect(await runCommand(host, 'setup band', c)).toBe('Use /ops setup <key> <value>, /ops setup, or /ops setup reset.')
  expect(store.setup).toBeUndefined()
})

const SUNSET = { format: 1, name: 'sunset', colors: { palette: { accent: '#ff8c42' } } }

test('pack <studio link> installs and applies the pack without fetching', async () => {
  const { host, files } = fakeHost()
  const { calls, ctl: c } = ctl()
  const out = await runCommand(host, `pack ${encodeLink({ pack: SUNSET })}`, c)
  expect(out).toBe('Pack: sunset')
  expect(JSON.parse(files['/home/u/.claude/ops-control/packs/sunset.json']!)).toEqual(SUNSET)
  expect(calls).toContain('mix:sunset/sunset')
})

test('a studio link with a setup asks before applying it', async () => {
  const { host, store } = fakeHost()
  const yes = ctl(true)
  expect(await runCommand(host, `pack ${encodeLink({ pack: SUNSET, setup: { band: ['plan'] } })}`, yes.ctl)).toBe('Pack: sunset\nSetup: applied')
  expect(yes.questions[0]).toContain('layout setup')
  expect((store.setup as { band: string[] }).band).toEqual(['plan'])
  const no = ctl(false)
  const { host: h2, store: s2 } = fakeHost()
  expect(await runCommand(h2, `pack ${encodeLink({ setup: { band: ['plan'] } })}`, no.ctl)).toBe('Setup: kept yours')
  expect(s2.setup).toBeUndefined()
})

test('a studio link without pet.dance keeps the receiver\'s dance setting', async () => {
  const { host, store } = fakeHost()
  const c = ctl(true)
  c.ctl.setSetup({ ...DEFAULT_SETUP, pet: { ...DEFAULT_SETUP.pet, dance: false } })
  await runCommand(host, `pack ${encodeLink({ setup: { pet: { sleepMs: 90000 } } })}`, c.ctl)
  expect(c.ctl.setup().pet).toEqual({ sleepMs: 90000, dance: false })
  expect((store.setup as Setup).pet).toEqual({ sleepMs: 90000, dance: false })
  await runCommand(host, `pack ${encodeLink({ setup: { pet: { sleepMs: 90000, dance: true } } })}`, c.ctl)
  expect(c.ctl.setup().pet.dance).toBe(true)
})

test('a studio link setup with unknown ids applies like a stored one and names what it dropped', async () => {
  const { host, store } = fakeHost()
  const out = await runCommand(host, `pack ${encodeLink({ setup: { band: ['plan', 'weather'] } })}`, ctl(true).ctl)
  expect(out).toBe('Setup: applied\n  dropped: unknown band item "weather"')
  expect((store.setup as { band: string[] }).band).toEqual(['plan'])
  expect(await runCommand(host, `pack ${encodeLink({ setup: { band: ['plan', 'weather'] } })}`, ctl(false).ctl)).toBe('Setup: kept yours')
})

test('a studio link status line keeps the field ids ops-control knows and names the rest', async () => {
  const { host, store } = fakeHost()
  const out = await runCommand(host, `pack ${encodeLink({ setup: { statusline: ['model', 'nope', 'ctx'] } })}`, ctl(true).ctl)
  expect(store.statusline).toEqual(['model', 'ctx'])
  expect(out).toContain('  dropped: unknown status line field "nope"')
})

test('a link status line keeps its first / and does not call it unknown', async () => {
  const { host, store } = fakeHost()
  const out = await runCommand(host, `pack ${encodeLink({ setup: { statusline: ['ctx', '/', '/', 'cost', 'nope'] } })}`, ctl(true).ctl)
  expect(out).toContain('Status line: ctx / cost')
  expect(out).toContain('  dropped: unknown status line field "nope"')
  expect(out).not.toContain('field "/"')
  expect(store.statusline).toEqual(['ctx', '/', 'cost'])
})

test('the setup prompt names the status line only when the link carries one', async () => {
  const withSl = ctl(true)
  expect(await runCommand(fakeHost().host, `pack ${encodeLink({ setup: { band: ['plan'], statusline: ['model', 'ctx'] } })}`, withSl.ctl)).toBe('Setup: applied\nStatus line: model ctx')
  expect(withSl.questions[0]).toBe('This link also carries a layout setup (band, tabs, meter, bubbles, pet sleep, status line). Apply it?')
  const without = ctl(true)
  await runCommand(fakeHost().host, `pack ${encodeLink({ setup: { band: ['plan'] } })}`, without.ctl)
  expect(without.questions[0]).toBe('This link also carries a layout setup (band, tabs, meter, bubbles, pet sleep). Apply it?')
})

test('a studio link status line of only unknown ids leaves the stored fields alone', async () => {
  const { host, store } = fakeHost()
  const out = await runCommand(host, `pack ${encodeLink({ setup: { statusline: ['nope'] } })}`, ctl(true).ctl)
  expect(store.statusline).toBeUndefined()
  expect(out).toContain('  dropped: unknown status line field "nope"')
})

test('a studio link setup that is not an object is refused without asking', async () => {
  const { host, store } = fakeHost()
  const q = ctl(true)
  expect(await runCommand(host, `pack ${encodeLink({ setup: [1] })}`, q.ctl)).toBe('Setup not applied: setup must be an object')
  expect(q.questions).toEqual([])
  expect(store.setup).toBeUndefined()
})

test('a studio link cannot smuggle terminal escapes through a setup id', async () => {
  const { host } = fakeHost()
  const out = await runCommand(host, `pack ${encodeLink({ setup: { band: ['\u001b]0;pwn\u0007'] } })}`, ctl(true).ctl)
  expect(out).toContain('unknown band item')
  expect(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(out)).toBe(false)
})

test('a studio link names the installed pack it would replace unless --force', async () => {
  const { host } = fakeHost({ files: { '/home/u/.claude/ops-control/packs/sunset.json': '{"format":1,"name":"sunset"}' } })
  const { ctl: c } = ctl()
  const link = encodeLink({ pack: SUNSET })
  const refused = await runCommand(host, `pack ${link}`, c)
  expect(refused).not.toBe('Pack: sunset')
  expect(refused).toContain('sunset')
  expect(await runCommand(host, `pack ${link} --force`, c)).toBe('Pack: sunset')
})

test('a cut-off studio link applies the parts that decoded and names the one that did not', async () => {
  const { host } = fakeHost()
  const { ctl: c } = ctl()
  const cut = encodeLink({ pack: SUNSET, setup: { band: ['plan', 'meter', 'agents'] } }).slice(0, -6)
  const out = await runCommand(host, `pack ${cut}`, c)
  expect(out.split('\n')[0]).toMatch(/^setup part: /)
  expect(out).toContain('Pack: sunset')
})

const PETS = '/home/u/.claude/ops-control/pets'
const petFile = (name: string) => JSON.stringify({ format: 1, name, palette: { A: '#112233' }, animations: { idle: [{ ms: 400, px: Array(12).fill('A'.repeat(24)) }] } })

test('pet list shows built-ins, the locked egg as ???, then user pets, then off', async () => {
  const { host } = fakeHost({ files: { [`${PETS}/mochi.json`]: petFile('mochi') } })
  expect(await runCommand(host, 'pet list', ctl().ctl)).toBe(['● clawd', '○ robot', '○ ghost', '○ ???', '○ mochi', '○ off'].join('\n'))
})

test('pet robot switches with no sheet; a user pet passes its sheet', async () => {
  const { host, store } = fakeHost({ files: { [`${PETS}/mochi.json`]: petFile('mochi') } })
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'pet robot', c)).toBe('Pet: robot')
  expect(await runCommand(host, 'pet mochi', c)).toBe('Pet: mochi')
  expect(store.pet).toBe('mochi')
  expect(calls).toEqual(['pet:robot', 'pet:mochi+sheet'])
})

test('pet ghost switches with no sheet', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'pet ghost', c)).toBe('Pet: ghost')
  expect(store.pet).toBe('ghost')
  expect(calls).toEqual(['pet:ghost'])
})

test('pet <unknown> is refused and nothing changes', async () => {
  const { host, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'pet nope', c)).toBe('No pet named "nope". /ops pet list shows the pets you have.')
  expect(await runCommand(host, 'pet Nope!', c)).toBe('No pet named "Nope!". /ops pet list shows the pets you have.')
  expect(store.pet).toBeUndefined()
  expect(calls).toEqual([])
})

test('pet add installs without switching; bare pet add prints usage', async () => {
  const { host, store } = fakeHost({ fetches: { 'https://x.test/m.json': petFile('mochi') } })
  const { calls, ctl: c } = ctl()
  expect(await runCommand(host, 'pet add https://x.test/m.json', c)).toBe('Installed pet "mochi". Switch to it with /ops pet mochi')
  expect(store.pet).toBeUndefined()
  expect(calls).toEqual([])
  expect(await runCommand(host, 'pet add', c)).toBe('Use /ops pet add <file|https url> with a pet .json from the studio or the pet sprites page.')
})

test('a pasted /ops line from the person is a command; anything else stays a prompt', () => {
  const you = { kind: 'composer' }
  const link = 'https://glowup.khimani.dev/studio#v=1&pet=eyJ9'
  expect(pastedOpsControl(`/ops pack ${link}`, you)).toBe(`pack ${link}`)
  expect(pastedOpsControl('  /ops pet robot \n', you)).toBe('pet robot')
  expect(pastedOpsControl('/ops', you)).toBe('')
  expect(pastedOpsControl('/opsx', you)).toBeUndefined()
  expect(pastedOpsControl('/ops pet robot\nwhy is he red?', you)).toBeUndefined()
  expect(pastedOpsControl('why does /ops pet robot fail?', you)).toBeUndefined()
  expect(pastedOpsControl('/ops pet robot', { kind: 'peer' })).toBeUndefined()
  expect(pastedOpsControl('/ops pet robot', { kind: 'plugin' })).toBeUndefined()
  // how Claude Code 2.1.291 hands over an expanded paste
  const pasted = (s: string) => `\n\n<pasted_content id="c2c5">\n${s}\n</pasted_content id="c2c5">\n`
  expect(pastedOpsControl(pasted(`/ops pack ${link} --force`), you)).toBe(`pack ${link} --force`)
  expect(pastedOpsControl(`${pasted('/ops pet robot')} why?`, you)).toBeUndefined()
  expect(pastedOpsControl('<pasted_content id="a">\n/ops-control pet robot\n</pasted_content id="b">', you)).toBeUndefined()
})

test('pet add --force over the pet in use draws the new art at once', async () => {
  const { host } = fakeHost({ files: { [`${PETS}/mochi.json`]: petFile('mochi') }, fetches: { 'https://x.test/m.json': petFile('mochi') } })
  const { calls, ctl: c } = ctl()
  await runCommand(host, 'pet mochi', c)
  expect(await runCommand(host, 'pet add https://x.test/m.json --force', c)).toBe('Installed pet "mochi".')
  expect(calls).toEqual(['pet:mochi+sheet', 'pet:mochi+sheet'])
})

const linkPet = (name: string) => ({ format: 1, name, palette: { A: '#112233' }, animations: { idle: [{ ms: 400, px: Array(12).fill('A'.repeat(24)) }] } })

test('a studio link with a pet installs it and switches to it', async () => {
  const { host, files, store } = fakeHost()
  const { calls, ctl: c } = ctl()
  const out = await runCommand(host, `pack ${encodeLink({ pet: linkPet('mochi') })}`, c)
  expect(out).toBe('Pet: mochi')
  expect(JSON.parse(files['/home/u/.claude/ops-control/pets/mochi.json']!).name).toBe('mochi')
  expect(store.pet).toBe('mochi')
  expect(calls).toEqual(['pet:mochi+sheet'])
})

test('a bad pet part is named and the pack in the same link still installs', async () => {
  const { host } = fakeHost()
  const pack = { format: 1, name: 'sunset', colors: { palette: { accent: '#ff8c42' } } }
  const out = await runCommand(host, `pack ${encodeLink({ pack, pet: { ...linkPet('mochi'), palette: {} } })}`, ctl().ctl)
  expect(out).toBe('Pack: sunset\nPet not installed: the palette needs at least one color')
})

test('a link pet whose name is installed needs --force', async () => {
  const { host } = fakeHost({ files: { '/home/u/.claude/ops-control/pets/mochi.json': JSON.stringify(linkPet('mochi')) } })
  const link = encodeLink({ pet: linkPet('mochi') })
  expect(await runCommand(host, `pack ${link}`, ctl().ctl)).toBe('Pet not installed: A pet named "mochi" is installed already. Add --force to replace it.')
  expect(await runCommand(host, `pack ${link} --force`, ctl().ctl)).toBe('Pet: mochi')
})
