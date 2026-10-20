import type { Host } from './host.ts'
import { parseJsonc, isUnsafe } from './themes.ts'
import { loadUserThemes } from './userthemes.ts'
import { resolveLook, validatePack, isNewerSpinner, packNameProblem, type PackFile } from './packs.ts'

export const PACK_DIR = (configDir: string) => `${configDir}/ops-control/packs`
export { SAFE_NAME } from './packs.ts'
const MAX_BYTES = 65536

export async function loadUserPacks(host: Host): Promise<Record<string, unknown>> {
  const dir = PACK_DIR(host.configDir)
  if (!(await host.exists(dir))) return {}
  const out: Record<string, unknown> = {}
  for (const f of await host.listDir(dir)) {
    if (!f.endsWith('.json')) continue
    const name = f.slice(0, -5)
    try { out[name] = parseJsonc(await host.readFile(`${dir}/${f}`)) } catch (err) { out[name] = new Error([...(err instanceof Error ? err.message : String(err))].filter(c => !isUnsafe(c.codePointAt(0)!)).join('')) }
  }
  return out
}

const msg = (err: unknown) => err instanceof Error ? err.message : String(err)

// Shared by addPack and savePack: a refusal message, or undefined when the name may be written.
async function nameProblem(host: Host, name: string, force: boolean): Promise<string | undefined> {
  const problem = packNameProblem(name)
  if (problem) return problem
  if (!force && (await host.exists(`${PACK_DIR(host.configDir)}/${name}.json`))) return `A pack named "${name}" is installed already. Add --force to replace it.`
  return undefined
}

export async function addPack(host: Host, url: string, force: boolean): Promise<{ name?: string; message: string; notices?: string[] }> {
  if (!url.startsWith('https://')) return { message: 'Pack URLs must start with https://' }
  let r: Awaited<ReturnType<Host['fetchText']>>
  try { r = await host.fetchText(url) } catch (err) { return { message: `Could not download the pack: ${msg(err)}` } }
  if (!r.ok) return { message: `Could not download the pack (HTTP ${r.status}).` }
  return installPackText(host, r.text, force)
}

// The checks every installed pack passes, from a URL or a studio link.
export async function installPackText(host: Host, text: string, force: boolean): Promise<{ name?: string; message: string; notices?: string[] }> {
  if (text.length > MAX_BYTES) return { message: 'The pack is over 64 KB.' }
  let file: unknown
  try { file = parseJsonc(text); validatePack(file) } catch (err) { return { message: msg(err) } }
  const name = file.name.toLowerCase()
  const problem = await nameProblem(host, name, force)
  if (problem) return { message: problem }
  const check = resolveLook({ colors: name, motion: name }, { ...(await loadUserPacks(host)), [name]: file }, await loadUserThemes(host))
  // A spinner this build lacks, or a key or value only a later 1.x knows, is a warning: the pack loads without it.
  const fatal = check.errors.filter(e => !isNewerSpinner(e))
  if (fatal.length) return { message: fatal[0]! }
  await host.writeFile(`${PACK_DIR(host.configDir)}/${name}.json`, text)
  return { name, message: `Installed pack "${name}". Apply it with /ops pack ${name}`, ...(check.notices.length && { notices: check.notices }) }
}

export async function savePack(host: Host, file: PackFile, force = false): Promise<string> {
  try { validatePack(file) } catch (err) { return msg(err) }
  const problem = await nameProblem(host, file.name, force)
  if (problem) return problem
  const path = `${PACK_DIR(host.configDir)}/${file.name}.json`
  await host.writeFile(path, JSON.stringify(file, null, 2) + '\n')
  return `Saved pack "${file.name}" to ${path}. Apply it with /ops pack ${file.name}, or share the file.`
}
