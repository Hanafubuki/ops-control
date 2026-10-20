import type { Host } from './host.ts'

// An installed ops-control and `claude --plugin-dir .` load two copies into one session. Each
// copy has its own store, so they cannot see each other's state; the false "Needs you"
// alerts and the status line loop both came from that. Exactly one copy may act.
export const INSTANCES_DIR = (configDir: string) => `${configDir}/ops-control/instances`
const DAY = 86_400_000
// The active copy refreshes its entry every 60 s. A session killed without session.end
// (crash, kill -9, OOM) leaves its entry behind, and `claude --continue` reuses the
// session id, so a dead entry must stop counting after a few missed beats.
export const HEARTBEAT_MS = 60_000
const STALE = 3 * 60_000

// The id is a file name and reaches `rm`: nothing but these characters gets through.
export const safeId = (id: string) => id.replace(/[^A-Za-z0-9-]/g, '')

// at orders the copies and never changes; seen is the last refresh.
type Entry = { root: string; at: number; seen?: number }
const lastSeen = (e: Entry) => e.seen ?? e.at

export const tidy = (p: string) => p.replace(/\/+/g, '/').replace(/\/$/, '')

// Installed copies live under the plugin cache; anything else came from --plugin-dir.
export const isDev = (configDir: string, root: string) => !`${tidy(root)}/`.startsWith(`${tidy(configDir)}/plugins/cache/`)

// What makes two roots the same copy. An installed copy lives in
// plugins/cache/<marketplace>/<plugin>/<version> and the version changes on every update, so
// the version is left out: after `plugin update` the new version takes over the old one's
// entry, as one copy. A dev copy is its own folder.
function identity(configDir: string, root: string) {
  const r = tidy(root), cache = `${tidy(configDir)}/plugins/cache/`
  return `${r}/`.startsWith(cache) ? cache + r.slice(cache.length).split('/').slice(0, 2).join('/') : r
}

// One file per copy, never one shared file: two copies starting together would
// read-modify-write the same file and one entry would be lost, leaving both active.
function fileOf(configDir: string, sid: string, root: string) {
  let h = 5381
  for (const c of identity(configDir, root)) h = ((h * 33) ^ c.codePointAt(0)!) >>> 0
  return `${INSTANCES_DIR(configDir)}/${sid}.${h.toString(16)}.json`
}

async function readAll(host: Host): Promise<{ path: string; entry?: Entry }[]> {
  const dir = INSTANCES_DIR(host.configDir)
  let names: string[]
  try { names = (await host.exists(dir)) ? await host.listDir(dir) : [] } catch { return [] }
  const out: { path: string; entry?: Entry }[] = []
  for (const name of names) {
    const path = `${dir}/${name}`
    try {
      const v = JSON.parse(await host.readFile(path))
      out.push({ path, entry: typeof v?.root === 'string' && typeof v?.at === 'number' ? { root: v.root, at: v.at, seen: typeof v.seen === 'number' ? v.seen : undefined } : undefined })
    } catch { out.push({ path }) }
  }
  return out
}

export async function registerCopy(host: Host, sid: string, root: string, now: number) {
  const path = fileOf(host.configDir, sid, root), me = identity(host.configDir, root)
  for (const f of await readAll(host)) {
    // an older version of this copy wrote its entry under a name of its own
    const oldSelf = f.path !== path && f.path.startsWith(`${INSTANCES_DIR(host.configDir)}/${sid}.`) && f.entry && identity(host.configDir, f.entry.root) === me
    if (!f.entry || lastSeen(f.entry) < now - DAY || oldSelf) await host.run(['rm', '-f', f.path]).catch(() => {})
  }
  await host.writeFile(path, JSON.stringify({ root, at: now, seen: now }))
}

export async function touchCopy(host: Host, sid: string, root: string, now: number) {
  const path = fileOf(host.configDir, sid, root)
  const mine = (await readAll(host)).find(f => f.path === path)?.entry
  // no entry: session.end removed it, and a beat must not bring a finished session back
  if (!mine) return
  await host.writeFile(path, JSON.stringify({ root, at: mine.at, seen: now }))
}

// Same answer in every copy that reads the same files: dev copy first, then the
// earliest registration, then the path. Entries not refreshed for STALE are dead
// sessions and do not count. This copy's own entry always counts, so a missing or
// unreadable file can never leave zero active copies. Another copy whose folder is gone (an
// old version or a deleted checkout) is not running, whatever its entry says.
export async function decide(host: Host, sid: string, root: string, now: number): Promise<{ active: boolean; winner: string }> {
  const prefix = `${INSTANCES_DIR(host.configDir)}/${sid}.`, me = identity(host.configDir, root)
  const isMe = (e: Entry) => identity(host.configDir, e.root) === me
  const seen: Entry[] = []
  let at = now
  for (const f of await readAll(host)) {
    const e = f.entry
    if (!e || !f.path.startsWith(prefix)) continue
    if (f.path === fileOf(host.configDir, sid, root)) at = e.at
    if (isMe(e) || lastSeen(e) < now - STALE) continue
    if (await host.exists(e.root).catch(() => true)) seen.push(e)
  }
  seen.push({ root, at })
  const key = (e: Entry) => [isDev(host.configDir, e.root) ? 0 : 1, e.at] as const
  seen.sort((a, b) => key(a)[0] - key(b)[0] || key(a)[1] - key(b)[1] || (a.root < b.root ? -1 : a.root > b.root ? 1 : 0))
  return { active: isMe(seen[0]!), winner: seen[0]!.root }
}

export async function unregisterCopy(host: Host, sid: string, root: string) {
  await host.run(['rm', '-f', fileOf(host.configDir, sid, root)]).catch(() => {})
}

// Status files of ended sessions are never rewritten, so they only pile up.
export async function pruneStatus(host: Host, statusDir: string) {
  await host.run(['find', statusDir, '-type', 'f', '-mtime', '+7', '-delete']).catch(() => {})
}
