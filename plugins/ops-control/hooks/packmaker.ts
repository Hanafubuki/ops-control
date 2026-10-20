// JSX-free. "Create pack" in the Settings tab: a description becomes a name pack (the main session's name and a
// cast for subagents) and a pet for its main character, drawn by a model and checked by ops-control's own pet parser.
// Packs live in <config>/ops-control/namepacks/<id>.json; the pet goes where every installed pet goes.
import type { Host } from './host.ts'
import { NAME_PACKS, type NamePack } from './namepacks.ts'
import { installPetText } from './userpets.ts'
import { BUILTIN_PET_NAMES, PACK_PET_NAMES } from './petfile.ts'
import { SAFE_NAME } from './packs.ts'
import { parseJsonc } from './themes.ts'

export const NAMEPACK_DIR = (configDir: string) => `${configDir}/ops-control/namepacks`
export type PackFile = { format: 1; id: string; label: string; main: string; pet?: string; cast: string[]; description?: string }
// A model call: the reply's text, or undefined when none came.
export type Ask = (prompt: string, opts: { model: string; maxTokens: number }) => Promise<string | undefined>

const MAX_NAME = 30, MAX_LABEL = 40, MIN_CAST = 8, MAX_CAST = 60
const MAX_DESCRIPTION = 400
const printable = (s: string) => !/[\u0000-\u001f\u007f]/.test(s)
const clean = (s: unknown, max: number) => (typeof s === 'string' && printable(s) ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '')

// A pack's id from its label: lowercase letters, digits and dashes, never a built-in's.
export function packId(label: string, taken: readonly string[]): string {
  const base = (label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'pack').replace(/^[^a-z0-9]/, 'p')
  let id = base
  for (let n = 2; taken.includes(id) || !SAFE_NAME.test(id); n++) id = `${base.slice(0, 26)}-${n}`
  return id
}

// A pack file read back, or why not; the cast is kept unique and without the main name.
export function readPackFile(raw: unknown): PackFile | string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'a pack must be a JSON object'
  const o = raw as Record<string, unknown>
  if (o.format !== 1) return '"format": 1 is missing'
  if (typeof o.id !== 'string' || !SAFE_NAME.test(o.id)) return 'a pack needs an "id" of lowercase letters, digits and dashes'
  const label = clean(o.label, MAX_LABEL), main = clean(o.main, MAX_NAME)
  if (!label) return 'a pack needs a "label"'
  if (!main) return 'a pack needs a "main" name'
  if (!Array.isArray(o.cast)) return '"cast" must be a list of names'
  const cast = [...new Set(o.cast.map(n => clean(n, MAX_NAME)).filter(n => n && n !== main))].slice(0, MAX_CAST)
  if (cast.length < MIN_CAST) return `"cast" needs at least ${MIN_CAST} names`
  const pet = o.pet === undefined ? undefined : typeof o.pet === 'string' && SAFE_NAME.test(o.pet) ? o.pet : null
  if (pet === null) return '"pet" must be a pet name'
  const description = clean(o.description, MAX_DESCRIPTION)
  return { format: 1, id: o.id, label, main, cast, ...(pet && { pet }), ...(description && { description }) }
}

export const asNamePack = (f: PackFile): NamePack => ({ id: f.id, label: f.label, main: f.main, cast: f.cast, ...(f.pet && { pet: f.pet }) })

// The person's packs, after the built-ins; a file that does not read is skipped.
export async function loadPackFiles(host: Host): Promise<NamePack[]> {
  const dir = NAMEPACK_DIR(host.configDir)
  if (!(await host.exists(dir))) return []
  const out: NamePack[] = []
  for (const f of (await host.listDir(dir)).filter(f => f.endsWith('.json')).sort()) {
    try {
      const r = readPackFile(parseJsonc(await host.readFile(`${dir}/${f}`)))
      if (typeof r !== 'string' && !NAME_PACKS.some(p => p.id === r.id)) out.push(asNamePack(r))
    } catch { /* unreadable: left out */ }
  }
  return out
}

const jsonIn = (text: string): unknown => {
  const m = /\{[\s\S]*\}/.exec(text)
  if (!m) return undefined
  try { return JSON.parse(m[0]) } catch { return undefined }
}

export function namesPrompt(description: string): string {
  return [
    'Make a name pack for a terminal coding assistant from the description below.',
    'The main session is the leader; its subagents are named after the rest of the cast, in order.',
    'Reply with one JSON object and nothing else:',
    `{"label": "<pack name, at most ${MAX_LABEL} characters>", "main": "<the leader's short name>", "cast": ["<short name>", ...]}`,
    `- cast: ${MIN_CAST * 3} to 40 distinct short names (at most ${MAX_NAME} characters each), most recognisable first; never the main name`,
    '',
    '<description>', description, '</description>',
  ].join('\n')
}

export function petPrompt(description: string, main: string, id: string, problem?: string): string {
  return [
    `Draw "${main}" (from: ${description}) as a chibi pixel-art pet for a terminal. Reply with one JSON object and nothing else, in this format:`,
    `{"format": 1, "name": "${id}", "description": "<at most 80 characters>", "palette": {"<one character>": "#rrggbb", ...}, "animations": {"idle": [{"px": [...rows], "ms": 400}, ...], ...}}`,
    'Rules:',
    '- every frame is exactly 12 rows of exactly 24 characters; "." is a transparent pixel; every other character is a palette key',
    '- two pixel rows draw as one terminal row, so make the silhouette, hair and signature colors carry the character',
    '- at most 16 palette colors; keys are single letters or digits',
    '- animations: idle (3-4 frames, ms 300-600), walk (4 frames, ms 110, add "dx": 1 to each frame), working (3-4 frames, ms 120), done (3 frames, ms 150), sleep (2 frames, ms 500), alert (2 frames, ms 180)',
    '- feet on the bottom rows, the head near the top, the body centred; frames differ only where the pose moves',
    ...(problem ? ['', `Your last attempt was rejected: ${problem}. Fix that.`] : []),
  ].join('\n')
}

export type Made = { pack?: NamePack; message: string }

// Names first (cheap), then the pet, retried once with the parser's complaint; a pack whose pet will not
// draw is still made and keeps the person's pet.
export async function createPack(host: Host, ask: Ask, description: string, taken: readonly string[]): Promise<Made> {
  const text = description.trim().slice(0, MAX_DESCRIPTION)
  if (!text) return { message: 'Describe the pack first.' }
  const named = jsonIn((await ask(namesPrompt(text), { model: 'sonnet', maxTokens: 2_000 })) ?? '') as Record<string, unknown> | undefined
  const id = packId(clean(named?.label, MAX_LABEL) || text, [...taken, ...BUILTIN_PET_NAMES, ...PACK_PET_NAMES])
  const draft = readPackFile({ format: 1, id, label: named?.label, main: named?.main, cast: named?.cast, description: text })
  if (typeof draft === 'string') return { message: `Could not make the pack: ${draft}.` }
  let pet: string | undefined, problem: string | undefined
  for (let attempt = 0; attempt < 2 && !pet; attempt++) {
    const reply = await ask(petPrompt(text, draft.main, id, problem), { model: 'opus', maxTokens: 16_000 })
    const file = jsonIn(reply ?? '')
    if (!file) { problem = 'no JSON object came back'; continue }
    const r = await installPetText(host, JSON.stringify({ ...(file as object), format: 1, name: id }), true)
    if (r.name) pet = r.name
    else problem = r.message
  }
  const pack: PackFile = { ...draft, ...(pet && { pet }) }
  await host.writeFile(`${NAMEPACK_DIR(host.configDir)}/${id}.json`, JSON.stringify(pack, null, 2) + '\n')
  return {
    pack: asNamePack(pack),
    message: pet ? `Made the ${pack.label} pack: ${pack.main} leads ${pack.cast.length} names.` : `Made the ${pack.label} pack; its character could not be drawn (${problem}), so your pet stays.`,
  }
}
