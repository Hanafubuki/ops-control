import type { Host } from './host.ts'
import { resolveTheme, PRESETS, COLOR_KEYS, ROLE_LABELS, shown } from './themes.ts'
import { loadUserThemes, addTheme } from './userthemes.ts'
import { takeOver, restore } from './statusline.ts'
import { resolveLook, exportMix, normalizeHex, cleanOverrides, SPINNER_IDS, type Mix } from './packs.ts'
import { PACKS } from './packpresets.ts'
import { decodeLink, isStudioLink } from './link.ts'
import { loadUserPacks, addPack, savePack, installPackText, SAFE_NAME } from './userpacks.ts'
import { parseScheme } from './schemes.ts'
import { konsoleScheme } from './konsole.ts'
import { eggSheet, type PetSetting, type PetSheet } from './pets.ts'
import { BUILTIN_PET_NAMES, builtinPets } from './petfile.ts'
import { userPetNames, loadUserPet, addPet, installPetText } from './userpets.ts'
import { readLocal } from './readlocal.ts'
import type { BubbleSetting } from './bubbles.ts'
import { eggUnlocked, type EggStore } from './eggs.ts'
import { SHORT_TEXT, FULL_TEXT } from './help.ts'
import { FIELD_CHOICES, TWO_BREAKS, BREAK, isFieldId, isFieldToken, parseFields, type FieldToken } from './fields.ts'
import { levelOf, parseLevelStore, levelStoreIsNewer, outfitStoreIsNewer, groupDigits, UNLOCKS, ART_READY, OUTFIT_LEVELS, outfitsOf, resolveOutfit, parseOutfitStore, outfitStore } from './levels.ts'
import { parseSetup, setupIsNewer, setupRecord, SETUP_NEWER, setSetupField, describeSetup, DEFAULT_SETUP, type Setup } from './setup.ts'

// What a command that needs more input falls back to, and what a headless config run prints.
export const USAGE = FULL_TEXT

export type Ctl = {
  // the theme in use, which may come from userConfig rather than the store
  current(): string
  setTheme(name: string): Promise<void>
  togglePane(): Promise<string>
  setMotion(reduced: boolean): void
  confirm(question: string): Promise<boolean>
  mix(): Mix
  // applies the mix; returns what failed to resolve
  setMix(mix: Mix): Promise<string[]>
  pet(): PetSetting
  setPet(p: PetSetting, sheet?: PetSheet): void
  // the stored choice: an outfit name, or 'off'
  setOutfit(choice: string): void
  bubbles(): BubbleSetting
  setBubbles(b: BubbleSetting): void
  reduced(): boolean
  // opens the config pane; returns what to print
  openConfig(): Promise<string>
  // opens the config TUI in a terminal, or the pane where there is none; returns what to print
  openConfigTui(): Promise<string>
  // opens the Music dialog; returns what to print
  openPlayer(): Promise<string>
  // the Spotify Web API connection: where it stands, the connect flow in the Music dialog, or removing it; returns what to print
  spotify(action: 'status' | 'connect' | 'disconnect'): Promise<string>
  // a -p run: nobody is attached to any surface
  headless(): Promise<boolean>
  fields(): readonly FieldToken[]
  // undefined goes back to the installer's (userConfig) list
  setFields(f: readonly FieldToken[] | undefined): void
  setup(): Setup
  setSetup(s: Setup): void
}

const MAX_SCHEME_BYTES = 65536

async function applyMix(host: Host, ctl: Ctl, mix: Mix) {
  await host.storeSet('mix', mix)
  await ctl.setMix(mix)
}

function levelReport(xp: number): string {
  const { level, into, need } = levelOf(xp)
  const soon = (u: (typeof UNLOCKS)[number]) => !ART_READY && u.kind !== 'lines'
  const got = UNLOCKS.filter(u => u.level <= level).map(u => `${u.label} (${u.level}${soon(u) ? ', coming soon' : ''})`)
  const next = UNLOCKS.find(u => u.level > level)
  return [
    `Level ${level} · ${groupDigits(xp)} XP · ${groupDigits(need - into)} to level ${level + 1}`,
    `Unlocked: ${got.join(', ') || 'nothing yet'}`,
    next ? `Next: ${next.label} at level ${next.level}${soon(next) ? ' (coming soon)' : ''}` : 'All unlocks earned.',
  ].join('\n')
}

async function outfitCommand(host: Host, ctl: Ctl, want: string | undefined): Promise<string> {
  const pet = ctl.pet(), names = outfitsOf(pet)
  if (pet === 'off') return 'No pet is on, so there is nothing to dress.'
  if (!names.length) return `${pet} has no level outfits.`
  const storedLevel = await host.storeGet('level'), storedOutfit = await host.storeGet('outfit')
  if (levelStoreIsNewer(storedLevel)) return 'Your level was saved by a newer ops-control, so this version cannot tell which outfits are unlocked and leaves them as they are.'
  const level = levelOf(parseLevelStore(storedLevel)).level
  const choice = parseOutfitStore(storedOutfit)
  if (want === undefined) {
    const worn = resolveOutfit(pet, level, choice)
    const rows = names.map((n, i) => level < OUTFIT_LEVELS[i]! ? `· ${n} (level ${OUTFIT_LEVELS[i]})` : `${n === worn ? '●' : '○'} ${n}${n === worn ? ' (worn)' : ''}`)
    return [`Outfits for ${pet}`, ...rows, '', 'Wear one with /ops outfit <name>; /ops outfit off takes it off.'].join('\n')
  }
  const name = want.toLowerCase()
  const at = names.indexOf(name)
  if (name !== 'off' && at < 0) return `No outfit named "${shown(want)}" for ${pet}. Choose one of: ${names.join(', ')}, or off.`
  if (at >= 0 && level < OUTFIT_LEVELS[at]!) return `The ${name} unlocks at level ${OUTFIT_LEVELS[at]}; you are level ${level}.`
  if (outfitStoreIsNewer(storedOutfit)) return 'Your outfit was saved by a newer ops-control, so this version leaves it as it is.'
  await host.storeSet('outfit', outfitStore(name))
  ctl.setOutfit(name)
  return `Outfit: ${name}`
}

const eggsOf = async (host: Host) => (await host.storeGet('eggs')) as EggStore | undefined

async function packList(host: Host, ctl: Ctl): Promise<string> {
  const user = await loadUserPacks(host)
  const names = [...new Set([...Object.keys(PACKS), ...Object.keys(user).filter(n => SAFE_NAME.test(n))])]
  const m = ctl.mix()
  // a layer that failed to resolve fell back to classic, so the pack is not what is showing
  const { look } = resolveLook(m, user, await loadUserThemes(host))
  const whole = m.colors === m.motion && m.theme === undefined && m.spinner === undefined && look.colorsFrom === m.colors && look.motionFrom === m.motion
  const lines = names.map(n => `${whole && n === m.colors ? '●' : '○'} ${n}`)
  if (!whole) lines.push(`custom mix: colors ${m.colors}, motion ${m.motion}${m.theme ? `, theme ${m.theme}` : ''}${m.spinner ? `, spinner ${m.spinner}` : ''}`)
  return lines.join('\n')
}

const isRole = (s: string | undefined): s is (typeof COLOR_KEYS)[number] => (COLOR_KEYS as readonly string[]).includes(s ?? '')
const noRole = (s: string) => `No color role named "${shown(s)}". Roles: ${COLOR_KEYS.join(', ')}.`

async function colorList(host: Host, ctl: Ctl): Promise<string> {
  const m = ctl.mix()
  const { look } = resolveLook(m, await loadUserPacks(host), await loadUserThemes(host))
  const over = cleanOverrides(m.overrides) ?? {}
  const rows = COLOR_KEYS.map(k => `${k in over ? '●' : '○'} ${k.padEnd(6)} ${look.theme.colors[k]}  ${ROLE_LABELS[k]}${k in over ? '  (override)' : ''}`)
  return [...rows, '', '● overridden. Set one with /ops color <role> <#hex>; clear with /ops color reset [role].'].join('\n')
}

async function setColor(host: Host, ctl: Ctl, role: string, hex: string): Promise<string> {
  if (!isRole(role)) return noRole(role)
  const v = normalizeHex(hex)
  if (!v) return `"${shown(hex)}" is not a color. Use #rgb or #rrggbb.`
  const m = ctl.mix()
  await applyMix(host, ctl, { ...m, overrides: { ...cleanOverrides(m.overrides), [role]: v } })
  return `Color ${role}: ${v}`
}

async function resetColor(host: Host, ctl: Ctl, role: string | undefined): Promise<string> {
  const { overrides, ...rest } = ctl.mix()
  const over = cleanOverrides(overrides) ?? {}
  if (role === undefined) {
    if (!Object.keys(over).length) return 'No color overrides to clear.'
    await applyMix(host, ctl, rest)
    return 'Color overrides cleared.'
  }
  if (!isRole(role)) return noRole(role)
  if (!(role in over)) return `${role} has no override.`
  const { [role]: _, ...left } = over
  await applyMix(host, ctl, Object.keys(left).length ? { ...rest, overrides: left } : rest)
  return `Color ${role}: back to the look's own.`
}

async function usePack(host: Host, ctl: Ctl, name: string): Promise<string> {
  const keep = ctl.mix().overrides
  const mix: Mix = { colors: name, motion: name, ...(keep && { overrides: keep }) }
  const { errors, notices } = resolveLook(mix, await loadUserPacks(host), await loadUserThemes(host))
  if (errors.length) return errors.join('\n')
  await applyMix(host, ctl, mix)
  return [`Pack: ${name}`, ...notices].join('\n')
}

async function importScheme(host: Host, ctl: Ctl, rawPath: string, force: boolean): Promise<string> {
  const read = await readLocal(host, rawPath, MAX_SCHEME_BYTES)
  if ('error' in read) return read.error
  const { text, path } = read
  let scheme: ReturnType<typeof parseScheme>
  try { scheme = parseScheme(text, path) } catch (err) { return err instanceof Error ? err.message : String(err) }
  const msg = await savePack(host, {
    format: 1, name: scheme.name, description: `imported from ${path.split('/').pop()}`,
    colors: { palette: scheme.palette, bg: scheme.bg },
  }, force)
  if (!msg.startsWith('Saved')) return msg
  await applyMix(host, ctl, { ...ctl.mix(), colors: scheme.name, theme: undefined })
  return msg
}

// Each part stands alone: one that fails is named, and the others still apply.
async function packFromLink(host: Host, ctl: Ctl, link: string, force: boolean): Promise<string> {
  const { parts, errors } = decodeLink(link)
  const out = [...errors]
  if (parts.pack !== undefined) {
    const r = await installPackText(host, JSON.stringify(parts.pack, null, 2) + '\n', force)
    if (!r.name) out.push(r.message)
    else {
      const keep = ctl.mix().overrides
      await applyMix(host, ctl, { colors: r.name, motion: r.name, ...(keep && { overrides: keep }) })
      out.push(`Pack: ${r.name}`, ...(r.notices ?? []))
    }
  }
  if (parts.setup !== undefined) {
    const parsed = parseSetup(parts.setup), notices = parsed.notices
    // parseSetup reads a missing dance as on; a link that never mentions it must not undo the receiver's choice
    const sentDance = (parts.setup as { pet?: { dance?: unknown } } | null)?.pet?.dance !== undefined
    const setup: Setup = sentDance ? parsed.setup : { ...parsed.setup, pet: { ...parsed.setup.pet, dance: ctl.setup().pet.dance } }
    if (typeof parts.setup !== 'object' || parts.setup === null || Array.isArray(parts.setup)) out.push(`Setup not applied: ${notices[0]}`)
    else if (setupIsNewer(await host.storeGet('setup'))) out.push(`Setup not applied: ${SETUP_NEWER}`)
    else if (await ctl.confirm(`This link also carries a layout setup (band, tabs, meter, bubbles, pet sleep${'statusline' in parts.setup ? ', status line' : ''}). Apply it?`)) {
      await host.storeSet('setup', setupRecord(await host.storeGet('setup'), setup))
      ctl.setSetup(setup)
      out.push('Setup: applied', ...notices.map(n => `  dropped: ${n}`))
      const sl = (parts.setup as { statusline?: unknown }).statusline
      if (Array.isArray(sl)) {
        const ids = parseFields(sl)
        if (ids) {
          await host.storeSet('statusline', ids)
          ctl.setFields(ids)
          out.push(`Status line: ${ids.join(' ')}`)
        }
        for (const s of sl) if (typeof s !== 'string' || !isFieldToken(s.trim())) out.push(`  dropped: unknown status line field "${shown(String(s))}"`)
      }
    } else out.push('Setup: kept yours')
  }
  if (parts.pet !== undefined) {
    const r = await installPetText(host, JSON.stringify(parts.pet, null, 2) + '\n', force)
    if (!r.name) out.push(`Pet not installed: ${r.message}`)
    else {
      await host.storeSet('pet', r.name)
      ctl.setPet(r.name, r.sheet)
      out.push(`Pet: ${r.name}`, ...(r.notices ?? []))
    }
  }
  return out.join('\n') || 'This link carries nothing to install.'
}

// Claude Code shows a paste over about 700 characters as "[Pasted text #N]" and then sends it to the model,
// wrapped in <pasted_content>, instead of running it as a slash command: every studio link that carries a
// pet. A prompt of the person's own that is one /ops line, bare or as one pasted block, is that paste.
const PASTED = /^<pasted_content id="([^"]*)">\n?([\s\S]*?)\n?<\/pasted_content id="\1">$/
export function pastedOpsControl(text: string, origin: { kind: string }): string | undefined {
  if (origin.kind !== 'composer') return undefined
  const t = text.trim()
  const m = /^\/ops(?:[ \t]+([^\n]*))?$/.exec(PASTED.exec(t)?.[2]?.trim() ?? t)
  return m ? (m[1] ?? '').trim() : undefined
}

export async function runCommand(host: Host, args: string, ctl: Ctl): Promise<string> {
  const [sub, a1, a2] = args.trim().split(/\s+/)
  // A bare subcommand reports where things stand instead of falling through to Unknown.
  if (sub === 'theme' && !a1) return runCommand(host, 'theme list', ctl)
  if (sub === 'pack' && !a1) return packList(host, ctl)
  if (sub === 'pet' && !a1) return runCommand(host, 'pet list', ctl)
  if (sub === 'bubbles' && !a1) return `Bubbles: ${ctl.bubbles()}. Change it with /ops bubbles on|off|haiku.`
  if (sub === 'motion' && !a1) return `Motion: ${ctl.reduced() ? 'reduced' : 'full'}. Change it with /ops motion reduced|full.`
  if (sub === 'statusline' && !a1) return 'Use /ops statusline on to let ops-control draw it, /ops statusline fields <ids> to pick what it shows, or /ops statusline restore to put yours back.'
  if (sub === 'color' && (!a1 || a1 === 'list')) return colorList(host, ctl)
  if (sub === 'color' && a1 === 'reset') return resetColor(host, ctl, a2)
  if (sub === 'color') return a2 ? setColor(host, ctl, a1!, a2) : 'Use /ops color <role> <#hex>, /ops color list, or /ops color reset [role].'
  if (sub === 'import' && !a1) return 'Use /ops import <file> with a Ghostty or base16 scheme; it becomes a pack.'
  if (sub === 'theme' && a1 === 'list') {
    const names = [...new Set([...Object.keys(PRESETS), ...Object.keys(await loadUserThemes(host))])]
    const current = ctl.current()
    return names.map(n => `${n === current ? '●' : '○'} ${n}`).join('\n')
  }
  if (sub === 'theme' && a1 === 'add' && a2) return addTheme(host, a2)
  if (sub === 'theme' && a1 === 'add') return USAGE
  if (sub === 'theme' && a1 === 'default') {
    const { theme: _, ...rest } = ctl.mix()
    await host.storeDelete('theme')
    await applyMix(host, ctl, rest)
    return 'Theme: pack default'
  }
  if (sub === 'theme' && a1) {
    const r = resolveTheme(a1, await loadUserThemes(host))
    if (r.error) return r.error
    await host.storeSet('theme', a1)
    await applyMix(host, ctl, { ...ctl.mix(), theme: a1 })
    return [`Theme: ${a1}`, ...r.notices].join('\n')
  }
  if (sub === 'pack' && a1 === 'list') return packList(host, ctl)
  if (sub === 'pack' && a1 === 'save') {
    if (!a2) return USAGE
    const { look } = resolveLook(ctl.mix(), await loadUserPacks(host), await loadUserThemes(host))
    return savePack(host, exportMix(look, a2))
  }
  if (sub === 'pack' && a1 && isStudioLink(a1)) return packFromLink(host, ctl, a1, a2 === '--force')
  if (sub === 'pack' && a1?.startsWith('https://')) {
    const r = await addPack(host, a1, a2 === '--force')
    if (!r.name) return r.message
    const keep = ctl.mix().overrides
    await applyMix(host, ctl, { colors: r.name, motion: r.name, ...(keep && { overrides: keep }) })
    return [`Pack: ${r.name}`, ...(r.notices ?? [])].join('\n')
  }
  if (sub === 'pack' && a1) return usePack(host, ctl, a1)
  if (sub === 'spinner' && a1 === 'list') {
    const { look } = resolveLook(ctl.mix(), await loadUserPacks(host), await loadUserThemes(host))
    return SPINNER_IDS.map(n => `${n === look.motion.spinner ? '●' : '○'} ${n}`).join('\n')
  }
  if (sub === 'spinner' && a1 === 'default') {
    const { spinner: _, ...rest } = ctl.mix()
    await applyMix(host, ctl, rest)
    return 'Spinner: pack default'
  }
  if (sub === 'spinner' && a1) {
    if (!(SPINNER_IDS as readonly string[]).includes(a1)) return `No spinner named "${a1}". Choose one of: ${SPINNER_IDS.join(', ')}.`
    await applyMix(host, ctl, { ...ctl.mix(), spinner: a1 })
    return `Spinner: ${a1}`
  }
  if (sub === 'spinner') return USAGE
  if (sub === 'export') {
    if (a1 !== 'konsole') return 'Export targets: konsole'
    const { look } = resolveLook(ctl.mix(), await loadUserPacks(host), await loadUserThemes(host))
    // An override that failed to resolve falls back to the pack's colors, so name it only when it took effect.
    const over = ctl.mix().theme
    const name = (over !== undefined && look.theme.name === over ? over : look.colorsFrom).replace(/[^a-z0-9-]/g, '-')
    const path = `${host.dataHome}/konsole/ops-control-${name}.colorscheme`
    await host.writeFile(path, konsoleScheme(name, look.theme.colors, look.bg))
    return `${path}\nIn Konsole: Settings → Edit Current Profile → Appearance → pick "ops-control ${name}".`
  }
  if (sub === 'import' && a1) return importScheme(host, ctl, a1, a2 === '--force')
  if (sub === 'pet' && a1 === 'list') {
    const cur = ctl.pet()
    const eggs = await eggsOf(host)
    const egg = eggUnlocked(eggs)
    const names = [...builtinPets(eggs?.shinyAt !== undefined, egg), ...(egg ? [] : ['???']), ...(await userPetNames(host)), 'off']
    return names.map(n => `${n === cur ? '●' : '○'} ${n}`).join('\n')
  }
  // the [sub, a1, a2] split stops at three words, hence index 3 for the flag
  if (sub === 'pet' && a1 === 'add') {
    if (!a2) return 'Use /ops pet add <file|https url> with a pet .json from the studio or the pet sprites page.'
    const r = await addPet(host, a2, args.trim().split(/\s+/)[3] === '--force')
    if (!r.name || !r.sheet || r.name !== ctl.pet()) return [r.message, ...(r.notices ?? [])].join('\n')
    ctl.setPet(r.name, r.sheet)
    return [`Installed pet "${r.name}".`, ...(r.notices ?? [])].join('\n')
  }
  if (sub === 'pet' && a1) {
    const eggs = await eggsOf(host)
    if (a1 === 'clawd-shiny' && eggs?.shinyAt === undefined) return 'The shiny pet is not unlocked yet.'
    if (a1 === 'egg' && !eggUnlocked(eggs)) return 'The egg is not unlocked yet.'
    let sheet: PetSheet | undefined
    let notices: string[] = []
    if (a1 === 'egg') sheet = eggSheet(eggs)
    else if (a1 !== 'off' && !BUILTIN_PET_NAMES.includes(a1)) {
      const r = await loadUserPet(host, a1)
      if ('error' in r) return r.error
      sheet = r.sheet
      notices = r.notices ?? []
    }
    await host.storeSet('pet', a1)
    ctl.setPet(a1, sheet)
    return [`Pet: ${a1}`, ...notices].join('\n')
  }
  if (sub === 'bubbles' && (a1 === 'on' || a1 === 'off' || a1 === 'haiku')) {
    await host.storeSet('bubbles', a1)
    ctl.setBubbles(a1)
    return `Bubbles: ${a1}`
  }
  if (sub === 'pane') return ctl.togglePane()
  if (sub === 'config') return (await ctl.headless()) ? USAGE : a1 === 'pane' ? ctl.openConfig() : ctl.openConfigTui()
  if (sub === 'music') return (await ctl.headless()) ? USAGE : ctl.openPlayer()
  if (sub === 'spotify' && (!a1 || a1 === 'connect' || a1 === 'disconnect')) {
    if (a1 === 'connect' && (await ctl.headless())) return 'Connecting Spotify needs an interactive session: run /ops spotify connect in Claude Code.'
    return ctl.spotify((a1 ?? 'status') as 'status' | 'connect' | 'disconnect')
  }
  if (sub === 'spotify') return 'Use /ops spotify, /ops spotify connect or /ops spotify disconnect.'
  if (sub === 'motion' && (a1 === 'reduced' || a1 === 'full')) {
    await host.storeSet('reducedMotion', a1 === 'reduced')
    ctl.setMotion(a1 === 'reduced')
    return `Motion: ${a1}.`
  }
  if (sub === 'statusline' && a1 === 'fields') {
    // the only subcommand with a list: the [sub, a1, a2] split stops at two
    const rest = args.trim().split(/\s+/).slice(2)
    const show = () => `Status line fields: ${ctl.fields().join(' ')}`
    if (!rest.length) return show()
    if (rest.length === 1 && rest[0] === 'default') {
      await host.storeDelete('statusline')
      ctl.setFields(undefined)
      return show()
    }
    const bad = rest.filter(s => !isFieldToken(s))
    if (bad.length) return `Unknown field${bad.length > 1 ? 's' : ''}: ${bad.join(', ')}. Choose from: ${FIELD_CHOICES}.`
    if (rest.filter(s => s === BREAK).length > 1) return TWO_BREAKS
    if (!rest.some(isFieldId)) return 'List at least one field.'
    const ids = [...new Set(rest)] as FieldToken[]
    await host.storeSet('statusline', ids)
    ctl.setFields(ids)
    return show()
  }
  if (sub === 'statusline' && a1 === 'on') return takeOver(host, q => ctl.confirm(q))
  if (sub === 'statusline' && a1 === 'restore') return restore(host)
  if (sub === 'setup' && !a1) return describeSetup(ctl.setup())
  if (sub === 'setup' && (a1 === 'reset' || (a1 && a2)) && setupIsNewer(await host.storeGet('setup'))) return SETUP_NEWER
  if (sub === 'setup' && a1 === 'reset') {
    await host.storeDelete('setup')
    ctl.setSetup(DEFAULT_SETUP)
    return describeSetup(DEFAULT_SETUP)
  }
  if (sub === 'setup' && a1 && a2) {
    const r = setSetupField(ctl.setup(), a1, args.trim().split(/\s+/).slice(2).join(' '))
    if ('error' in r) return r.error
    await host.storeSet('setup', setupRecord(await host.storeGet('setup'), r.setup))
    ctl.setSetup(r.setup)
    return describeSetup(r.setup)
  }
  if (sub === 'setup') return 'Use /ops setup <key> <value>, /ops setup, or /ops setup reset.'
  if (sub === 'outfit') return outfitCommand(host, ctl, a1)
  if (sub === 'level') {
    const stored = await host.storeGet('level')
    return levelStoreIsNewer(stored) ? 'Your level was saved by a newer ops-control. This version cannot read it and leaves it as it is.' : levelReport(parseLevelStore(stored))
  }
  if (sub === 'help' && a1 === 'all') return FULL_TEXT
  return sub && sub !== 'help' ? `Unknown: ${args.trim()}\n\n${SHORT_TEXT}` : SHORT_TEXT
}
