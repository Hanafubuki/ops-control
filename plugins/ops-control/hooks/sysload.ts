// The machine's load and the plan's usage for the Context tab: CPU and RAM read from /proc (under WSL that
// is the WSL VM, as Linux sees it) or, on macOS, from sysctl, vm_stat and ps; the 5-hour and weekly windows
// from the usage Claude Code reports.
import type { EngineInterface } from 'claude-code'
import type { Model } from './model.ts'
import type { Theme } from './themes.ts'
import type { Seg } from './layout.tsx'
import { liveLimit, resetIn } from './fields.ts'
import { toneFor, type Meter } from './setup.ts'

type Engine = EngineInterface
export type CpuTimes = { idle: number; total: number }
// tz: the person's offset in minutes, which a weekly reset's weekday is read in
export type SysLoad = { cpu?: number; ram?: { percent: number; usedGb: number; totalGb: number }; wsl?: boolean; tz?: number }

// The aggregate `cpu` line of /proc/stat: idle counts idle and iowait.
export function cpuTimes(stat: string): CpuTimes | undefined {
  const line = stat.split('\n').find(l => /^cpu\s/.test(l))
  if (!line) return undefined
  const n = line.trim().split(/\s+/).slice(1).map(Number)
  if (n.length < 4 || n.some(x => !Number.isFinite(x))) return undefined
  return { idle: n[3]! + (n[4] ?? 0), total: n.reduce((a, b) => a + b, 0) }
}

// Busy share of the time between two readings, 0-100; undefined until there are two.
export function cpuPercent(prev: CpuTimes | undefined, cur: CpuTimes | undefined): number | undefined {
  if (!prev || !cur) return undefined
  const total = cur.total - prev.total, idle = cur.idle - prev.idle
  if (total <= 0) return undefined
  return Math.max(0, Math.min(100, Math.round((1 - idle / total) * 100)))
}

// Used memory as `free` counts it: total less what is available.
export function memOf(meminfo: string): SysLoad['ram'] {
  const kb = (k: string) => { const m = new RegExp(`^${k}:\\s+(\\d+)`, 'm').exec(meminfo); return m ? Number(m[1]) : undefined }
  const total = kb('MemTotal'), avail = kb('MemAvailable')
  if (!total || avail === undefined) return undefined
  const used = total - avail, gb = (x: number) => Math.round(x / 1048576 * 10) / 10
  return { percent: Math.round(used / total * 100), usedGb: gb(used), totalGb: gb(total) }
}

// macOS: memory in use as Activity Monitor counts it (wired, active and compressed pages), against hw.memsize.
export function macMemOf(vmStat: string, memBytes: number): SysLoad['ram'] {
  const page = Number(/page size of (\d+) bytes/.exec(vmStat)?.[1])
  const pages = (k: string) => { const m = new RegExp(`^${k}:\\s+(\\d+)`, 'm').exec(vmStat); return m ? Number(m[1]) : 0 }
  if (!page || !(memBytes > 0)) return undefined
  const used = Math.min(memBytes, (pages('Pages wired down') + pages('Pages active') + pages('Pages occupied by compressor')) * page)
  const gb = (x: number) => Math.round(x / 1073741824 * 10) / 10
  return { percent: Math.round(used / memBytes * 100), usedGb: gb(used), totalGb: gb(memBytes) }
}

// macOS: the busy share of all cores, from every process's %cpu (ps counts one full core as 100).
export function macCpuOf(psCpu: string, cores: number): number | undefined {
  if (!(cores > 0)) return undefined
  const sum = psCpu.split('\n').map(l => Number(l.trim().replace(',', '.'))).filter(Number.isFinite).reduce((a, b) => a + b, 0)
  return Math.max(0, Math.min(100, Math.round(sum / cores)))
}

async function run($: Engine, argv: string[]): Promise<string | undefined> {
  try {
    const r = await $.process.run(argv, { timeoutMs: 5_000 })
    return r.exitCode === 0 ? r.stdout : undefined
  } catch { return undefined }
}

// Asked once per sampler: a machine without /proc may be a Mac.
let darwin: boolean | undefined
async function isMac($: Engine): Promise<boolean> {
  if (darwin === undefined) darwin = (await run($, ['uname', '-s']))?.trim() === 'Darwin'
  return darwin
}

async function sampleMac($: Engine): Promise<SysLoad> {
  const [sysctl, vmStat, ps] = await Promise.all([run($, ['sysctl', '-n', 'hw.memsize', 'hw.ncpu']), run($, ['vm_stat']), run($, ['ps', '-A', '-o', '%cpu='])])
  const [memBytes, cores] = (sysctl ?? '').trim().split(/\s+/).map(Number)
  const ram = vmStat && memBytes ? macMemOf(vmStat, memBytes) : undefined
  const cpu = ps && cores ? macCpuOf(ps, cores) : undefined
  return { ...(cpu !== undefined && { cpu }), ...(ram && { ram }) }
}

async function read($: Engine, path: string): Promise<string | undefined> {
  try { return await $.fs.read(path) } catch { return undefined }
}

// One reading: the load since `prev`, and the CPU times to measure the next one from.
export async function sampleSys($: Engine, prev: CpuTimes | undefined): Promise<{ load: SysLoad; times?: CpuTimes }> {
  const [stat, mem, version] = await Promise.all([read($, '/proc/stat'), read($, '/proc/meminfo'), read($, '/proc/version')])
  if (!stat && !mem && (await isMac($))) return { load: await sampleMac($) }
  const times = stat ? cpuTimes(stat) : undefined
  const cpu = cpuPercent(prev, times)
  const ram = mem ? memOf(mem) : undefined
  const load: SysLoad = { ...(cpu !== undefined && { cpu }), ...(ram && { ram }), ...(version && /microsoft/i.test(version) && { wsl: true }) }
  return { load, ...(times && { times }) }
}

// A labelled bar: `cpu  ████░░░░  23%  note`, its fill toned by the meter's warn and danger marks.
function bar(label: string, p: number, note: string, w: number, t: Theme, meter: Meter): Seg[] {
  const c = t.colors, tail = `${String(p).padStart(4)}%${note ? '  ' + note : ''}`
  const n = Math.max(4, Math.min(24, w - label.length - 1 - tail.length - 1))
  const full = Math.round(Math.max(0, Math.min(100, p)) / 100 * n)
  return [{ text: label.padEnd(6), color: c.dim }, { text: '█'.repeat(full), color: c[toneFor(p, meter)] }, { text: '░'.repeat(n - full), color: c.faint }, { text: tail, color: c.text }]
}

// The rows the Context tab shows: what is known, nothing for what is not (an API key has no plan windows).
export function loadRows(sys: SysLoad | undefined, m: Model, now: number, w: number, t: Theme, meter: Meter): Seg[][] {
  const rows: Seg[][] = []
  const where = sys?.wsl ? 'WSL' : ''
  if (sys?.cpu !== undefined) rows.push(bar('cpu', sys.cpu, where, w, t, meter))
  if (sys?.ram) rows.push(bar('ram', sys.ram.percent, `${sys.ram.usedGb}/${sys.ram.totalGb} GB`, w, t, meter))
  const plan = (['five_hour', 'seven_day'] as const).flatMap(kind => { const l = liveLimit(m, kind, now); return l ? [{ kind, l }] : [] })
  for (const { kind, l } of plan) rows.push(bar(kind === 'five_hour' ? '5h' : 'week', Math.round(l.percentUsed), resetIn(l.resetsAt, now, sys?.tz ?? 0).trim(), w, t, meter))
  if (!plan.length && m.costUsd !== undefined) rows.push([{ text: 'plan'.padEnd(6), color: t.colors.dim }, { text: `$${m.costUsd.toFixed(2)} spent this session`, color: t.colors.text }])
  return rows
}

export const SYS_EVERY_MS = 3000
let sysTimer: { cancel(): void } | undefined
let lastTimes: CpuTimes | undefined
// Samples every few seconds while `wanted` (the Context tab is showing); one timer however often it starts.
export function startSysSampler($: Engine, wanted: () => boolean, onLoad: (load: SysLoad) => void) {
  sysTimer?.cancel()
  lastTimes = undefined
  darwin = undefined
  sysTimer = $.clock.every(SYS_EVERY_MS, () => {
    if (!wanted()) { lastTimes = undefined; return }
    void sampleSys($, lastTimes).then(({ load, times }) => { lastTimes = times; onLoad(load) }, () => {})
  })
}
