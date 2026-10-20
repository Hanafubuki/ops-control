// Not *.test.ts on purpose: `claude plugin test` runs those inside the engine, which cannot read
// files. `pnpm test` runs this one with Node after the engine's tests.
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validatePack, resolveLook, ROW_STYLES, BORDERS, SPINNER_IDS, PACK_KEYS, COLORS_KEYS, MOTION_KEYS, EXTRAS_KEYS, ROW_FLAG_KEYS, FIELD_KEYS } from '../hooks/packs.ts'
import { COLOR_KEYS, GLYPH_KEYS, parseJsonc, resolveTheme } from '../hooks/themes.ts'
import { loadUserPacks, PACK_DIR, SAFE_NAME } from '../hooks/userpacks.ts'
import type { Host } from '../hooks/host.ts'

const dir = decodeURIComponent(import.meta.url.replace(/^file:\/\//, '')).replace(/[^/]*$/, '')
const skill = readFileSync(`${dir}../skills/ops-control-pack/SKILL.md`, 'utf8')
const ref = readFileSync(`${dir}../skills/ops-control-pack/reference.md`, 'utf8')

const section = (title: string) => {
  const m = new RegExp(`^## ${title}\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(ref)
  if (!m) throw new Error(`reference.md has no "## ${title}" section`)
  return m[1]!
}
// First cell of each table row, when it is a single backticked name.
const rows = (title: string) => section(title).split('\n').flatMap(l => {
  const cells = l.split('|').map(c => c.trim())
  const m = /^`([^`]+)`$/.exec(cells[1] ?? '')
  return m ? [{ name: m[1]!, cells }] : []
})
const names = (title: string) => rows(title).map(r => r.name).sort()
const ticks = (s: string) => [...s.matchAll(/`([^`]+)`/g)].map(m => m[1]!)
const values = (title: string, field: string) => ticks(rows(title).find(r => r.name === field)!.cells[2]!)

test('the skill says when to use it and links the reference', () => {
  const fm = /^---\nname: ops-control-pack\ndescription: (Use when [^\n]+)\n---\n/.exec(skill)
  assert.ok(fm, 'frontmatter needs name and a "Use when" description')
  assert.ok(fm[1]!.length <= 500)
  assert.ok(skill.includes('(reference.md)'))
})

test('the worked example loads through the real loaders with no errors', async () => {
  const block = /## Worked example\n[\s\S]*?```jsonc?\n([\s\S]*?)```/.exec(ref)
  assert.ok(block, 'reference.md needs a json block under "## Worked example"')
  const file = parseJsonc(block[1]!) as { name: string }
  validatePack(file)
  assert.match(file.name, SAFE_NAME)
  const files: Record<string, string> = { [`${PACK_DIR('/home/u/.claude')}/${file.name}.json`]: block[1]! }
  const host = {
    configDir: '/home/u/.claude',
    exists: async (p: string) => Object.keys(files).some(f => f.startsWith(p)),
    listDir: async (p: string) => Object.keys(files).filter(f => f.startsWith(p + '/')).map(f => f.slice(p.length + 1)),
    readFile: async (p: string) => files[p]!,
  } as unknown as Host
  const user = await loadUserPacks(host)
  assert.ok(!(user[file.name] instanceof Error))
  const { errors, look } = resolveLook({ colors: file.name, motion: file.name }, user, {})
  assert.deepEqual(errors, [])
  assert.equal(look.colorsFrom, file.name)
  assert.equal(look.motionFrom, file.name)
})

test('the edit example in the skill loads and changes only what it names', () => {
  const m = /`(\{ "format": 1, "name": "arcade-soft"[^`]*\})`/.exec(skill)
  assert.ok(m, 'SKILL.md needs the arcade-soft extends example')
  const file = JSON.parse(m[1]!)
  validatePack(file)
  const mine = resolveLook({ colors: 'soft', motion: 'soft' }, { soft: file }, {})
  const base = resolveLook({ colors: 'arcade', motion: 'arcade' }, {}, {})
  assert.deepEqual(mine.errors, [])
  assert.equal(mine.look.theme.colors.accent, (file.colors as { palette: { accent: string } }).palette.accent)
  assert.equal(mine.look.theme.colors.text, base.look.theme.colors.text)
  assert.deepEqual(mine.look.rowFlags, base.look.rowFlags)
})

test('documented pack fields are the fields the pack loader accepts', () => {
  assert.deepEqual(names('Pack file'), [...PACK_KEYS].sort())
  assert.deepEqual(names('Colors layer').filter(n => !n.includes('.')), [...COLORS_KEYS].sort())
  assert.deepEqual(names('Colors layer').filter(n => n.startsWith('extras.')), EXTRAS_KEYS.map(k => `extras.${k}`).sort())
  assert.deepEqual(names('Colors layer').filter(n => n.startsWith('rowFlags.')), ROW_FLAG_KEYS.map(k => `rowFlags.${k}`).sort())
  assert.deepEqual(names('Motion layer').filter(n => !n.includes('.')), [...MOTION_KEYS].sort())
  assert.deepEqual(names('Motion layer').filter(n => n.startsWith('field.')), FIELD_KEYS.map(k => `field.${k}`).sort())
})

test('documented palette colors and glyphs are the ones themes accept', () => {
  assert.deepEqual(names('Theme colors'), [...COLOR_KEYS].sort())
  assert.deepEqual(names('Theme glyphs'), [...GLYPH_KEYS].sort())
})

// The theme loader has no key list: its fields are literals in validate(), so probe them.
test('documented theme file fields each load, and the loader skips a made-up color or glyph with a notice', () => {
  assert.deepEqual(names('Theme file'), ['band.hearts', 'colors', 'extends', 'glyphs', 'name', 'spinner.words'])
  const file = { name: 'x', extends: 'classic', colors: { accent: '#112233' }, glyphs: { read: '>' }, band: { hearts: ['a', 'b'] }, spinner: { words: ['Hm'] } }
  assert.equal(resolveTheme('x', { x: file }).error, undefined)
  for (const bad of [{ colors: { nope: '#112233' } }, { glyphs: { nope: '>' } }]) {
    const r = resolveTheme('x', { x: bad })
    assert.equal(r.error, undefined)
    assert.equal(r.notices.length, 1)
  }
})

test('documented row styles, borders, spinners and shimmer levels match the code', () => {
  assert.deepEqual(values('Colors layer', 'rows'), [...ROW_STYLES])
  assert.deepEqual(values('Colors layer', 'border'), [...BORDERS])
  assert.deepEqual(values('Motion layer', 'spinner'), [...SPINNER_IDS])
  assert.deepEqual(values('Motion layer', 'shimmer'), ['0', '1', '2'])
})

// validatePack skips unknown values with a notice, so acceptance means resolveLook reports nothing.
test('every documented value is accepted by validatePack and skipped by nothing', () => {
  const ok = (f: object) => {
    const file = { format: 1, name: 'x', ...f }
    validatePack(file)
    assert.deepEqual(resolveLook({ colors: 'x', motion: 'x' }, { x: file }, {}).errors, [])
  }
  for (const rows of values('Colors layer', 'rows')) ok({ colors: { rows } })
  for (const border of values('Colors layer', 'border')) ok({ colors: { border } })
  for (const spinner of values('Motion layer', 'spinner')) ok({ motion: { spinner } })
  for (const shimmer of values('Motion layer', 'shimmer')) ok({ motion: { shimmer: Number(shimmer) } })
})
