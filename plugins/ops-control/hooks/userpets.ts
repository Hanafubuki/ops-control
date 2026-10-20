import type { Host } from './host.ts'
import { parseJsonc, shown } from './themes.ts'
import { readPetFile, petSheet, petNameProblem, type PetFile } from './petfile.ts'
import { readLocal } from './readlocal.ts'
import type { PetSheet } from './pets.ts'

export const PET_DIR = (configDir: string) => `${configDir}/ops-control/pets`
const MAX_BYTES = 65536
const msg = (err: unknown) => (err instanceof Error ? err.message : String(err))
const noPet = (name: string) => `No pet named "${shown(name)}". /ops pet list shows the pets you have.`

export async function userPetNames(host: Host): Promise<string[]> {
  const dir = PET_DIR(host.configDir)
  if (!(await host.exists(dir))) return []
  return (await host.listDir(dir)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).filter(n => !petNameProblem(n)).sort()
}

// notices name what the file holds that this build does not know and so left out
function parse(text: string): { file: PetFile; notices: string[] } | { error: string } {
  if (text.length > MAX_BYTES) return { error: 'The pet is over 64 KB.' }
  try {
    const notes: string[] = []
    const file = readPetFile(parseJsonc(text), notes)
    return { file, notices: notes.map(n => `pet "${shown(file.name)}": ${n}`) }
  } catch (err) { return { error: msg(err) } }
}

export async function loadUserPet(host: Host, name: string): Promise<{ sheet: PetSheet; notices?: string[] } | { error: string }> {
  const problem = petNameProblem(name)
  // a typed `pet Nope!` is a missing pet, not a naming lesson; only reserved names explain themselves
  if (problem) return { error: problem.startsWith('A pet needs') ? noPet(name) : problem }
  const path = `${PET_DIR(host.configDir)}/${name}.json`
  if (!(await host.exists(path))) return { error: noPet(name) }
  let text: string
  try { text = await host.readFile(path) } catch (err) { return { error: `Could not read ${path}: ${msg(err)}` } }
  const r = parse(text)
  if ('error' in r) return { error: `${path}: ${r.error}` }
  if (r.file.name !== name) return { error: `${path} holds a pet named "${shown(r.file.name)}"; rename the file or the pet.` }
  return { sheet: petSheet(r.file), ...(r.notices.length && { notices: r.notices }) }
}

// validatePetFile refuses reserved names, so no separate name check here.
export async function installPetText(host: Host, text: string, force: boolean): Promise<{ name?: string; sheet?: PetSheet; message: string; notices?: string[] }> {
  const r = parse(text)
  if ('error' in r) return { message: r.error }
  const { file } = r
  const path = `${PET_DIR(host.configDir)}/${file.name}.json`
  if (!force && (await host.exists(path))) return { message: `A pet named "${file.name}" is installed already. Add --force to replace it.` }
  await host.writeFile(path, text)
  return { name: file.name, sheet: petSheet(file), message: `Installed pet "${file.name}". Switch to it with /ops pet ${file.name}`, ...(r.notices.length && { notices: r.notices }) }
}

export async function addPet(host: Host, source: string, force: boolean): Promise<{ name?: string; sheet?: PetSheet; message: string; notices?: string[] }> {
  if (/^[a-z]+:\/\//i.test(source)) {
    if (!source.startsWith('https://')) return { message: 'Pet URLs must start with https://' }
    let res: Awaited<ReturnType<Host['fetchText']>>
    try { res = await host.fetchText(source) } catch (err) { return { message: `Could not download the pet: ${msg(err)}` } }
    if (!res.ok) return { message: `Could not download the pet (HTTP ${res.status}).` }
    return installPetText(host, res.text, force)
  }
  const read = await readLocal(host, source, MAX_BYTES)
  return 'error' in read ? { message: read.error } : installPetText(host, read.text, force)
}
