import type { Host } from './host.ts'
import { safeId } from './instances.ts'
import { renderFields, renderLines, DEFAULT_FIELDS, type ColorMode, type FieldToken } from './fields.ts'
import type { Model } from './model.ts'
import type { Theme } from './themes.ts'
import type { Meter } from './setup.ts'

export const SCRIPT_PATH = (configDir: string) => `${configDir}/ops-control/statusline.sh`
export const STATUS_DIR = (configDir: string) => `${configDir}/ops-control/status`
const SETTINGS = (configDir: string) => `${configDir}/settings.json`
export const BACKUP_KEY = 'statusline-backup'
const NONE = '__none__'
// Claude Code runs the command on events only; without this a status file written after the
// last event (after /clear, at launch, after a reload) stays unseen until the next message.
const REFRESH_SECONDS = 30

// split: the takeover file, where a / starts a second row; the entry under the prompt is one line.
export function statusText(m: Model, t: Theme, o: { fields?: readonly FieldToken[]; now?: number; tzOffset?: number; color?: ColorMode; meter?: Meter; split?: boolean } = {}): string {
  const opts = { now: o.now ?? Date.now(), tzOffset: o.tzOffset ?? 0, color: o.color ?? 'plain', meter: o.meter }
  const fields = o.fields ?? DEFAULT_FIELDS
  return o.split ? renderLines(m, t, fields, opts).join('\n') : renderFields(m, t, fields, opts)
}

// The script prints the line ops-control wrote for this session; when that file is
// missing or over 10 minutes old (ops-control removed or off) it runs the user's
// original command with the same stdin, so uninstalling never blanks the line.
// Single quotes: the config dir may hold a space, `$` or a backquote.
const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
const command = (configDir: string) => `sh ${sq(SCRIPT_PATH(configDir))}`

// Invariant: the fallback must never be ops-control's own script. Each plugin copy
// has its own store, so a second copy can see the first one's line in
// settings.json and would otherwise back it up as "the user's" command; the
// script would then call itself and fork shells until the machine died.
// The STATUS_DIR test alone catches both paths: ".../ops-control/status" is a string
// prefix of ".../ops-control/statusline.sh". The other two tests name the intent.
const isOurs = (configDir: string, cmd: unknown) =>
  typeof cmd === 'string' && (cmd === command(configDir) || cmd.includes(SCRIPT_PATH(configDir)) || cmd.includes(STATUS_DIR(configDir)))

// The guard line is a second wall: even a bad fallback exits at the second level.
export function script(configDir: string, original: string) {
  if (isOurs(configDir, original)) original = ''
  return `#!/bin/sh
[ -n "$OPS_CONTROL_STATUSLINE" ] && exit 0; OPS_CONTROL_STATUSLINE=1; export OPS_CONTROL_STATUSLINE
input=$(cat)
sid=$(printf '%s' "$input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' | tr -cd 'A-Za-z0-9-')
f=${sq(STATUS_DIR(configDir))}/"$sid"
if [ -n "$sid" ] && [ -f "$f" ] && [ -n "$(find "$f" -mmin -10 2>/dev/null)" ]; then cat "$f"; exit 0; fi
${original ? `printf '%s' "$input" | sh -c ${sq(original)}` : 'exit 0'}
`
}

async function readSettings(host: Host): Promise<Record<string, unknown> | undefined> {
  if (!(await host.exists(SETTINGS(host.configDir)))) return {}
  try { const v = JSON.parse(await host.readFile(SETTINGS(host.configDir))); return typeof v === 'object' && v && !Array.isArray(v) ? v : undefined } catch { return undefined }
}

const originalOf = (backup: unknown) =>
  backup !== NONE && typeof backup === 'object' && backup && typeof (backup as { command?: unknown }).command === 'string' ? (backup as { command: string }).command : ''

const OVERRIDE = ' A project or local settings file sets its own statusLine, which wins over this one, so ops-control will not show there.'

export async function drawsStatusLine(host: Host): Promise<boolean> {
  const settings = await readSettings(host)
  return isOurs(host.configDir, (settings?.statusLine as { command?: unknown } | undefined)?.command)
}

// Installs from before refreshInterval existed; a value the person set stays.
export async function ensureRefresh(host: Host): Promise<void> {
  // re-read just before writing: Claude Code writes this file too
  const settings = await readSettings(host)
  const line = settings?.statusLine as { command?: unknown; refreshInterval?: unknown } | undefined
  // not isOurs: a command that only reads our status files is the person's own
  const cmd = line?.command
  const runsOurs = typeof cmd === 'string' && (cmd === command(host.configDir) || cmd.includes(SCRIPT_PATH(host.configDir)))
  if (!settings || !line || !runsOurs || line.refreshInterval !== undefined) return
  await host.writeFile(SETTINGS(host.configDir), JSON.stringify({ ...settings, statusLine: { ...line, refreshInterval: REFRESH_SECONDS } }, null, 2) + '\n')
}

export async function takeOver(host: Host, ask: (question: string) => Promise<boolean>): Promise<string> {
  const settings = await readSettings(host)
  if (!settings) return `ops-control could not read ${SETTINGS(host.configDir)}, so your status line is unchanged.`
  if (await drawsStatusLine(host)) {
    // Another copy of ops-control (or an earlier run) already took over. Nothing is
    // backed up from here; only a script that calls itself gets repaired.
    const path = SCRIPT_PATH(host.configDir)
    if ((await host.exists(path)) && (await host.readFile(path)).includes(`sh -c`) && (await host.readFile(path)).includes(path)) {
      await host.writeFile(path, script(host.configDir, originalOf(await host.storeGet(BACKUP_KEY))))
    }
    await ensureRefresh(host)
    return 'ops-control already draws your status line.'
  }
  const override = (await host.projectStatusLine()) ? OVERRIDE : ''
  if (!(await ask(`Let ops-control draw your status line? It edits ${SETTINGS(host.configDir)} and keeps your current one to restore.${override}`))) return 'Your status line is unchanged.'
  if ((await host.storeGet(BACKUP_KEY)) === undefined) await host.storeSet(BACKUP_KEY, settings.statusLine === undefined ? NONE : settings.statusLine)
  await host.writeFile(SCRIPT_PATH(host.configDir), script(host.configDir, originalOf(await host.storeGet(BACKUP_KEY))))
  // re-read just before writing: Claude Code writes this file too
  const fresh = (await readSettings(host)) ?? settings
  await host.writeFile(SETTINGS(host.configDir), JSON.stringify({ ...fresh, statusLine: { type: 'command', command: command(host.configDir), refreshInterval: REFRESH_SECONDS } }, null, 2) + '\n')
  return 'ops-control now draws your status line. `/ops statusline restore` brings yours back.' + override
}

export async function restore(host: Host): Promise<string> {
  const backup = await host.storeGet(BACKUP_KEY)
  if (backup === undefined) return 'Nothing to restore: ops-control never replaced your status line.'
  const settings = await readSettings(host)
  if (!settings) return `ops-control could not read ${SETTINGS(host.configDir)}; nothing changed.`
  const { statusLine: current, ...rest } = settings
  // Someone set another status line since the takeover: theirs stays. The path
  // match covers the unquoted command older builds wrote; a quote in the config
  // dir is escaped in ours, so that needs the exact match.
  const ours = isOurs(host.configDir, (current as { command?: unknown } | undefined)?.command)
  // A backup that is ops-control's own line (stored by the two-copies bug) is no previous line.
  const previous = backup !== NONE && !isOurs(host.configDir, originalOf(backup)) ? { statusLine: backup } : undefined
  if (ours) await host.writeFile(SETTINGS(host.configDir), JSON.stringify(previous ? { ...rest, ...previous } : rest, null, 2) + '\n')
  await host.storeDelete(BACKUP_KEY)
  await host.run(['rm', '-f', SCRIPT_PATH(host.configDir)])
  await host.run(['rm', '-rf', STATUS_DIR(host.configDir)])
  return ours ? 'Your status line is back.' : 'Your status line was changed since; left it as is.'
}

export async function writeStatusFile(host: Host, sessionId: string, line: string) {
  const id = safeId(sessionId)
  if (!id) return
  await host.writeFile(`${STATUS_DIR(host.configDir)}/${id}`, line)
}
