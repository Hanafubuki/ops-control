// The Sidequest board in the browser: `sidequest dashboard --no-open` starts its server when none answers
// (or reuses the running one) and prints the URL; ops-control opens that itself, since the CLI's own opener is
// xdg-open, which under WSL reaches no browser.
import type { EngineInterface } from 'claude-code'

type Engine = EngineInterface
export type Opener = 'windows' | 'wsl' | 'darwin' | 'linux'

// this marketplace's Sidequest first, then Eigenwise's, then one from any other marketplace
const PLUGINS = ['sidequest@ops-control', 'sidequest@eigenwise-toolshed']

// Where the installed sidequest lives, from Claude Code's installed_plugins.json.
export function sidequestRoot(installedJson: string): string | undefined {
  try {
    const all = (JSON.parse(installedJson) as { plugins?: Record<string, { installPath?: string }[]> }).plugins ?? {}
    const id = [...PLUGINS, ...Object.keys(all).filter(k => k.startsWith('sidequest@'))].find(k => all[k]?.[0]?.installPath)
    const path = id ? all[id]?.[0]?.installPath : undefined
    return typeof path === 'string' && path ? path : undefined
  } catch { return undefined }
}

// The dashboard's address, as `sidequest dashboard` prints it.
export const boardUrl = (out: string): string | undefined => /https?:\/\/(?:127\.0\.0\.1|localhost):\d+\S*/.exec(out)?.[0]

export function openArgv(opener: Opener, url: string): string[] {
  if (opener === 'windows') return ['cmd.exe', '/c', 'start', '', url]
  if (opener === 'wsl') return ['/mnt/c/Windows/explorer.exe', url]
  if (opener === 'darwin') return ['open', url]
  return ['xdg-open', url]
}

async function openerOf($: Engine): Promise<Opener> {
  if ((await $.env.get('OS')) === 'Windows_NT') return 'windows'
  if ((await $.env.get('WSL_DISTRO_NAME')) || (await $.env.get('WSL_INTEROP'))) return 'wsl'
  const u = await $.process.run(['uname', '-s'], { timeoutMs: 5_000 }).catch(() => undefined)
  return u?.stdout.trim() === 'Darwin' ? 'darwin' : 'linux'
}

// `sidequest serve`, out of the session's process group, its output to `log`: it reuses a running board
// (printing its URL and exiting) or becomes the board. `dashboard` would refuse a folder that is no board.
export const serveArgv = (cli: string, log: string): string[] =>
  ['sh', '-c', 'if command -v setsid >/dev/null; then setsid -f node "$1" serve >"$2" 2>&1 </dev/null; else nohup node "$1" serve >"$2" 2>&1 </dev/null & fi', 'sh', cli, log]

const POLL_MS = 400
const WAIT_MS = 12_000

// Starts the board if it is not running and opens it; says what happened, for a toast.
export async function openBoard($: Engine, configDir: string): Promise<string> {
  const installed = await $.fs.read(`${configDir}/plugins/installed_plugins.json`).catch(() => '')
  const root = sidequestRoot(installed)
  if (!root) return 'Sidequest is not installed.'
  const opener = await openerOf($)
  if (opener === 'windows') return 'Opening the Sidequest board needs WSL, macOS or Linux; run /sidequest:board.'
  const log = `${configDir}/ops-control/sqboard.log`
  await $.process.run(serveArgv(`${root}/bin/sidequest.js`, log), { timeoutMs: 10_000 }).catch(() => undefined)
  let url: string | undefined
  for (let waited = 0; !url && waited < WAIT_MS; waited += POLL_MS) {
    await new Promise<void>(r => { void $.clock.after(POLL_MS, () => r()) })
    url = boardUrl(await $.fs.read(log).catch(() => ''))
  }
  if (!url) return `Sidequest board did not start (see ${log}).`
  // explorer.exe reports failure even when the browser opened, so its exit code says nothing
  await $.process.run(openArgv(await openerOf($), url), { timeoutMs: 10_000 }).catch(() => undefined)
  return `Sidequest board: ${url}`
}
