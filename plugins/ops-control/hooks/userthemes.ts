import type { Host } from './host.ts'
import { parseJsonc, resolveTheme, PRESETS } from './themes.ts'

export const THEME_DIR = (configDir: string) => `${configDir}/ops-control/themes`
const SAFE_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/

export async function loadUserThemes(host: Host): Promise<Record<string, unknown>> {
  const dir = THEME_DIR(host.configDir)
  if (!(await host.exists(dir))) return {}
  const out: Record<string, unknown> = {}
  for (const f of await host.listDir(dir)) {
    if (!f.endsWith('.json')) continue
    const name = f.slice(0, -5)
    try { out[name] = parseJsonc(await host.readFile(`${dir}/${f}`)) } catch (err) { out[name] = err instanceof Error ? err : new Error(String(err)) }
  }
  return out
}

export async function addTheme(host: Host, url: string): Promise<string> {
  if (!url.startsWith('https://')) return 'Theme URLs must start with https://'
  let r: Awaited<ReturnType<Host['fetchText']>>
  try { r = await host.fetchText(url) } catch (err) { return `Could not download the theme: ${err instanceof Error ? err.message : String(err)}` }
  if (!r.ok) return `Could not download the theme (HTTP ${r.status}).`
  let file: unknown
  try { file = parseJsonc(r.text) } catch (err) { return (err as Error).message }
  if (typeof file !== 'object' || file === null || Array.isArray(file)) return 'A theme must be a JSON object.'
  const name = String((file as { name?: unknown }).name ?? '').toLowerCase()
  if (!SAFE_NAME.test(name)) return 'A theme needs a "name" of lowercase letters, digits and dashes.'
  if (Object.hasOwn(PRESETS, name)) return `"${name}" is a built-in theme name; pick another.`
  const check = resolveTheme(name, { ...(await loadUserThemes(host)), [name]: file })
  if (check.error) return check.error
  await host.writeFile(`${THEME_DIR(host.configDir)}/${name}.json`, r.text)
  return [`Installed theme "${name}". Switch with /ops theme ${name}`, ...check.notices].join('\n')
}
