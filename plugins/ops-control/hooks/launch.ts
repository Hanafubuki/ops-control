import type { Host } from './host.ts'

export type Platform = 'linux' | 'darwin' | 'windows'
export const TERM_KEYS = ['TMUX', 'KONSOLE_VERSION', 'KITTY_WINDOW_ID', 'GHOSTTY_RESOURCES_DIR', 'WEZTERM_PANE', 'GNOME_TERMINAL_SCREEN', 'TERM_PROGRAM', 'TERMINAL', 'DISPLAY', 'WAYLAND_DISPLAY'] as const
export type TermEnv = Partial<Record<(typeof TERM_KEYS)[number], string>>
export const RELEASES = 'https://github.com/NovusEdge/glowup/releases'

const SAFE = /^[A-Za-z0-9@%+=:,./_-]+$/
// cmd and PowerShell both read double quotes; backslash is a path separator there, so it is safe
const WIN_SAFE = /^[A-Za-z0-9@%+=:,./\\_-]+$/
// PowerShell (Windows Terminal's default) reads a quoted first token as a string, so it needs the call operator.
// cmd takes & as a command separator, so a line with the prefix is PowerShell only.
export const shellLine = (argv: string[], platform?: Platform) => {
  const line = argv.map(a => (platform === 'windows' ? (WIN_SAFE.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`) : SAFE.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`)).join(' ')
  return platform === 'windows' && line.startsWith('"') ? `& ${line}` : line
}
const appleString = (s: string) => s.replace(/[\\"]/g, '\\$&')

const BY_NAME: Record<string, (cmd: string[]) => string[]> = {
  konsole: c => ['-e', ...c],
  kitty: c => c,
  ghostty: c => ['-e', ...c],
  wezterm: c => ['start', '--', ...c],
  'gnome-terminal': c => ['--', ...c],
  foot: c => c,
  alacritty: c => ['-e', ...c],
  // their -e takes one command string; -x takes the rest of argv
  'xfce4-terminal': c => ['-x', ...c],
  'mate-terminal': c => ['-x', ...c],
  terminator: c => ['-x', ...c],
}
// -e is xterm's convention, which st, urxvt and most other terminals accept.
// $TERMINAL is user input, so a name like toString must not find an Object.prototype method.
const named = (bin: string, label: string, cmd: string[]) => {
  const b = bin.split('/').pop()!
  return { name: label, argv: [bin, ...(Object.hasOwn(BY_NAME, b) ? BY_NAME[b]! : (c: string[]) => ['-e', ...c])(cmd)] }
}

// Windows has no uname: the caller passes $OS ('Windows_NT') and $PROCESSOR_ARCHITECTURE in its place
export const platformOf = (unameS: string): Platform | undefined => ({ Linux: 'linux', Darwin: 'darwin', Windows_NT: 'windows' } as const)[unameS.trim() as 'Linux' | 'Darwin' | 'Windows_NT']

export function pickTerminal(env: TermEnv, platform: Platform, has: { xdgTerminalExec: boolean; xTerminalEmulator: boolean }, cmd: string[]): { name: string; argv: string[] } | undefined {
  if (env.TMUX) return { name: 'tmux', argv: ['tmux', 'new-window', ...cmd] }
  // start opens the default terminal app on Windows 11 and a console window on Windows 10
  if (platform === 'windows') return { name: 'a new window', argv: ['cmd.exe', '/c', 'start', 'ops-control config', ...cmd] }
  if (platform === 'darwin') {
    const line = appleString(shellLine(cmd))
    if (env.TERM_PROGRAM === 'ghostty') return { name: 'Ghostty', argv: ['open', '-na', 'Ghostty', '--args', '-e', ...cmd] }
    if (env.TERM_PROGRAM === 'iTerm.app') return { name: 'iTerm', argv: ['osascript', '-e', `tell application "iTerm" to create window with default profile command "${line}"`] }
    if (env.KITTY_WINDOW_ID) return { name: 'kitty', argv: ['open', '-na', 'kitty', '--args', ...cmd] }
    if (env.WEZTERM_PANE) return { name: 'WezTerm', argv: ['open', '-na', 'WezTerm', '--args', 'start', '--', ...cmd] }
    // Terminal.app ships with every Mac, so it is the answer for any terminal we do not drive
    return { name: 'Terminal', argv: ['osascript', '-e', `tell application "Terminal" to do script "${line}"`] }
  }
  // over SSH there is no window to open
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) return undefined
  if (env.TERMINAL) return named(env.TERMINAL, env.TERMINAL.split('/').pop()!, cmd)
  if (env.KONSOLE_VERSION) return named('konsole', 'Konsole', cmd)
  if (env.KITTY_WINDOW_ID) return named('kitty', 'kitty', cmd)
  if (env.GHOSTTY_RESOURCES_DIR) return named('ghostty', 'Ghostty', cmd)
  if (env.WEZTERM_PANE) return named('wezterm', 'WezTerm', cmd)
  if (env.GNOME_TERMINAL_SCREEN) return named('gnome-terminal', 'GNOME Terminal', cmd)
  if (has.xdgTerminalExec) return { name: 'your default terminal', argv: ['xdg-terminal-exec', ...cmd] }
  if (has.xTerminalEmulator) return { name: 'your default terminal', argv: ['x-terminal-emulator', '-e', ...cmd] }
  return undefined
}

// process.run reads the child's output until it exits and kills it at 30 s: the terminal
// must hold none of the pipes and must leave the session's process group.
export const detached = (argv: string[], platform: Platform): string[] =>
  platform === 'linux' ? ['sh', '-c', 'setsid -f "$@" </dev/null >/dev/null 2>&1', 'sh', ...argv] : argv

export function releaseTarget(unameS: string, unameM: string): { os: string; arch: string } | undefined {
  const os = platformOf(unameS)
  const arch = ({ x86_64: 'amd64', amd64: 'amd64', AMD64: 'amd64', aarch64: 'arm64', arm64: 'arm64', ARM64: 'arm64' } as Record<string, string>)[unameM.trim()]
  // release.yml builds windows/amd64 only
  return os && arch && (os !== 'windows' || arch === 'amd64') ? { os, arch } : undefined
}

export const assetName = (version: string, t: { os: string; arch: string }) => `glowup-installer_v${version}_${t.os}_${t.arch}.${t.os === 'windows' ? 'zip' : 'tar.gz'}`

// Paths travel in the environment, never in the script text: -Command re-parses its arguments,
// so a path with a space or quote would change the script.
const pwsh = (script: string, env: Record<string, string>) => ({ argv: ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script], env })
const REMOVE = pwsh('Remove-Item -LiteralPath $env:OPS_CONTROL_PATH -Recurse -Force -ErrorAction SilentlyContinue', {}).argv

export const removeTree = (host: Host, path: string, platform: Platform) =>
  (platform === 'windows' ? host.run(REMOVE, { OPS_CONTROL_PATH: path }) : host.run(['rm', '-rf', path])).catch(() => {})

// the asset's own line, with or without the binary-mode star, as install.sh matches it
const WIN_WANT = '$f = Get-Content -LiteralPath "$env:OPS_CONTROL_DIR/checksums.txt" | ForEach-Object { , ($_ -split "\\s+") } | Where-Object { $_.Count -ge 2 -and ($_[1] -eq $env:OPS_CONTROL_ASSET -or $_[1] -eq "*$env:OPS_CONTROL_ASSET") } | Select-Object -First 1; '
const WIN_FIND = WIN_WANT + 'if (-not $f) { exit 1 }'
const WIN_CHECK = WIN_WANT + 'if (-not $f) { exit 1 }; if ((Get-FileHash -Algorithm SHA256 -LiteralPath "$env:OPS_CONTROL_DIR/$env:OPS_CONTROL_ASSET").Hash.ToLower() -ne $f[0].ToLower()) { exit 1 }'
const WIN_MKDIR = 'New-Item -ItemType Directory -Force -Path $env:OPS_CONTROL_PATH | Out-Null'
const WIN_MOVE = 'Move-Item -LiteralPath $env:OPS_CONTROL_FROM -Destination $env:OPS_CONTROL_TO -Force'
// The engine's fs has no rename. Within one directory either command replaces the target whole, so a reader polling it
// never sees half a file.
export const moveFile = (host: Host, from: string, to: string, platform: Platform) =>
  platform === 'windows' ? host.run(pwsh(WIN_MOVE, {}).argv, { OPS_CONTROL_FROM: from, OPS_CONTROL_TO: to }) : host.run(['mv', from, to])

// the same match install.sh makes: the asset's own line, with or without the binary-mode star
const FIND = 'cd "$1" && awk -v f="$2" \'$2 == f || $2 == "*" f { print $1 "  " f }\' checksums.txt > want.txt && test -s want.txt'
const CHECK = 'cd "$1" && { sha256sum -c want.txt || shasum -a 256 -c want.txt; } >/dev/null 2>&1'

export async function ensureBinary(host: Host, o: { opsControlBin?: string; pluginRoot: string; version: string; target?: { os: string; arch: string }; windows?: boolean; onDownload?: () => void }, id = Math.random().toString(36).slice(2, 8)): Promise<{ path: string } | { error: string }> {
  // windows is separate from target: an unreleased arch has no target but still names its .exe
  const win = o.windows === true, exe = win ? 'glowup-installer.exe' : 'glowup-installer'
  for (const p of [o.opsControlBin, `${o.pluginRoot}/installer/${exe}`]) if (p && (await host.exists(p))) return { path: p }
  const dir = `${host.dataHome}/ops-control/bin/${o.version}`, path = `${dir}/${exe}`
  if (await host.exists(path)) return { path }
  if (o.version === 'dev') return { error: 'A dev checkout has no release to download. Build one with just installer-build, or set OPS_CONTROL_BIN.' }
  if (!o.target) return { error: 'There is no glowup-installer build for this system.' }
  o.onDownload?.()
  const asset = assetName(o.version, o.target), url = `${RELEASES}/download/v${o.version}`
  // a part folder of its own, so two sessions downloading at once never share half a file
  const tmp = `${dir}.part-${id}`
  const step = async (argv: string[], what: string, env?: Record<string, string>) => {
    // run() rejects when the command cannot start or times out
    const r = await host.run(argv, env, 120_000).catch((err: unknown) => { throw new Error(`${what}: ${err instanceof Error ? err.message : String(err)}`) })
    if (r.exitCode !== 0) throw new Error(`${what}: ${r.stderr.trim().split('\n').pop() || `exit ${r.exitCode}`}`)
  }
  // curl.exe and tar.exe (bsdtar, which reads zip) ship with Windows 10 1803 and later
  const ps = (script: string, env: Record<string, string>, what: string) => step(pwsh(script, env).argv, what, env)
  try {
    if (win) {
      const both = { OPS_CONTROL_DIR: tmp, OPS_CONTROL_ASSET: asset }
      await ps(WIN_MKDIR, { OPS_CONTROL_PATH: tmp }, 'could not make a folder')
      await step(['curl.exe', '-fsSL', '-o', `${tmp}/${asset}`, `${url}/${asset}`], `could not download ${asset}`)
      await step(['curl.exe', '-fsSL', '-o', `${tmp}/checksums.txt`, `${url}/checksums.txt`], 'could not download checksums.txt')
      await ps(WIN_FIND, both, `checksums.txt has no entry for ${asset}`)
      await ps(WIN_CHECK, both, `checksum mismatch for ${asset}`)
      await step(['tar.exe', '-xf', `${tmp}/${asset}`, '-C', tmp, exe], `could not unpack ${asset}`)
      await ps(WIN_MKDIR, { OPS_CONTROL_PATH: dir }, 'could not make a folder')
      await ps(WIN_MOVE, { OPS_CONTROL_FROM: `${tmp}/${exe}`, OPS_CONTROL_TO: path }, 'could not move the binary into place')
      return { path }
    }
    await step(['mkdir', '-p', tmp], 'could not make a folder')
    await step(['curl', '-fsSL', '-o', `${tmp}/${asset}`, `${url}/${asset}`], `could not download ${asset}`)
    await step(['curl', '-fsSL', '-o', `${tmp}/checksums.txt`, `${url}/checksums.txt`], 'could not download checksums.txt')
    await step(['sh', '-c', FIND, 'sh', tmp, asset], `checksums.txt has no entry for ${asset}`)
    await step(['sh', '-c', CHECK, 'sh', tmp], `checksum mismatch for ${asset}`)
    await step(['tar', '-xzf', `${tmp}/${asset}`, '-C', tmp, exe], `could not unpack ${asset}`)
    await step(['mkdir', '-p', dir], 'could not make a folder')
    await step(['mv', `${tmp}/${exe}`, path], 'could not move the binary into place')
    return { path }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  } finally {
    await removeTree(host, tmp, win ? 'windows' : 'linux')
  }
}
