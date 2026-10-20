import { expect } from 'claude-code/testing'
import { cpuPercent, cpuTimes, loadRows, macCpuOf, macMemOf, memOf, sampleSys } from '../hooks/sysload.ts'
import { initialModel } from '../hooks/model.ts'
import { resolveLook, DEFAULT_MIX } from '../hooks/packs.ts'
import { DEFAULT_SETUP } from '../hooks/setup.ts'
import { test } from './kit.ts'

const T = resolveLook(DEFAULT_MIX, {}, {}).look.theme
const STAT = (busy: number, idle: number) => `cpu  ${busy} 0 0 ${idle} 0 0 0 0 0 0\ncpu0 1 0 0 1 0 0 0 0 0 0\n`
const MEM = 'MemTotal:       16384000 kB\nMemFree:         1000000 kB\nMemAvailable:    4096000 kB\n'
const text = (r: { text: string }[]) => r.map(s => s.text).join('')

test('cpu is the busy share between two /proc/stat readings', () => {
  expect(cpuTimes(STAT(100, 300))).toEqual({ idle: 300, total: 400 })
  expect(cpuPercent(cpuTimes(STAT(100, 300)), cpuTimes(STAT(160, 340)))).toBe(60)
  expect(cpuPercent(undefined, cpuTimes(STAT(1, 1)))).toBeUndefined()
  expect(cpuPercent(cpuTimes(STAT(1, 1)), cpuTimes(STAT(1, 1)))).toBeUndefined()
  expect(cpuTimes('nothing')).toBeUndefined()
})

test('ram is total less available, as free counts it', () => {
  expect(memOf(MEM)).toEqual({ percent: 75, usedGb: 11.7, totalGb: 15.6 })
  expect(memOf('MemTotal: 1 kB\n')).toBeUndefined()
})

test('the rows show cpu, ram and both plan windows, each with its figure', () => {
  const now = Date.parse('2026-10-20T12:00:00Z')
  const m = { ...initialModel(), limits: [{ kind: 'five_hour', percentUsed: 42, resetsAt: '2026-10-20T14:30:00Z' }, { kind: 'seven_day', percentUsed: 91 }] }
  const rows = loadRows({ cpu: 23, ram: { percent: 61, usedGb: 9.8, totalGb: 16 }, wsl: true }, m, now, 60, T, DEFAULT_SETUP.meter).map(text)
  expect(rows).toHaveLength(4)
  expect(rows[0]).toMatch(/^cpu +█+░+ +23% {2}WSL$/)
  expect(rows[1]).toMatch(/^ram .* 61% {2}9\.8\/16 GB$/)
  expect(rows[2]).toMatch(/^5h .* 42% {2}↻2h30m$/)
  expect(rows[3]).toMatch(/^week .* 91%$/)
  for (const r of rows) expect(r.length).toBeLessThanOrEqual(60)
})

test('an API-key session shows what it spent; nothing known draws nothing', () => {
  const rows = loadRows(undefined, { ...initialModel(), costUsd: 1.5 }, Date.now(), 60, T, DEFAULT_SETUP.meter).map(text)
  expect(rows).toEqual(['plan  $1.50 spent this session'])
  expect(loadRows(undefined, initialModel(), Date.now(), 60, T, DEFAULT_SETUP.meter)).toEqual([])
})

test('sampleSys reads /proc and needs a second reading for the cpu', async () => {
  const files: Record<string, string> = { '/proc/stat': STAT(100, 300), '/proc/meminfo': MEM, '/proc/version': 'Linux version 5.15.167.4-microsoft-standard-WSL2' }
  const $ = { fs: { read: async (p: string) => { if (!(p in files)) throw new Error('ENOENT ' + p); return files[p]! } } } as never
  const first = await sampleSys($, undefined)
  expect(first.load).toEqual({ ram: { percent: 75, usedGb: 11.7, totalGb: 15.6 }, wsl: true })
  files['/proc/stat'] = STAT(160, 340)
  const second = await sampleSys($, first.times)
  expect(second.load.cpu).toBe(60)
  delete files['/proc/meminfo']
  expect((await sampleSys($, second.times)).load).toEqual({ wsl: true })
})

// vm_stat as a 16 GB Apple silicon Mac prints it (16 KB pages)
const VM_STAT = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                5000.
Pages active:                            300000.
Pages inactive:                          290000.
Pages speculative:                         4000.
Pages throttled:                              0.
Pages wired down:                        150000.
Pages purgeable:                          10000.
Pages occupied by compressor:            100000.
`

test('macOS memory counts wired, active and compressed pages against hw.memsize', () => {
  // (150000 + 300000 + 100000) pages × 16 KB = 8.39 GiB of 16 GiB
  expect(macMemOf(VM_STAT, 17179869184)).toEqual({ percent: 52, usedGb: 8.4, totalGb: 16 })
  expect(macMemOf('no page size here', 17179869184)).toBeUndefined()
  expect(macMemOf(VM_STAT, 0)).toBeUndefined()
})

test('macOS cpu is every process\'s %cpu shared over the cores', () => {
  expect(macCpuOf(' 0.0\n 12.5\n 187.5\n  0,0\n', 8)).toBe(25)
  expect(macCpuOf('900\n', 8)).toBe(100)
  expect(macCpuOf('10\n', 0)).toBeUndefined()
})

test('without /proc, a Mac is read through uname, sysctl, vm_stat and ps, cpu from the first reading', async () => {
  const ran: string[] = []
  const out: Record<string, string> = { 'uname -s': 'Darwin\n', 'sysctl -n hw.memsize hw.ncpu': '17179869184\n8\n', vm_stat: VM_STAT, 'ps -A -o %cpu=': ' 50.0\n 30.0\n' }
  const $ = {
    fs: { read: async (p: string) => { throw new Error('ENOENT ' + p) } },
    process: { run: async (argv: string[]) => { const k = argv.join(' '); ran.push(k); return k in out ? { exitCode: 0, stdout: out[k]!, stderr: '' } : { exitCode: 1, stdout: '', stderr: '' } } },
  } as never
  const { load } = await sampleSys($, undefined)
  expect(load).toEqual({ cpu: 10, ram: { percent: 52, usedGb: 8.4, totalGb: 16 } })
  expect(ran).toContain('uname -s')
  const rows = loadRows(load, initialModel(), 0, 60, T, DEFAULT_SETUP.meter).map(text)
  expect(rows[0]).toMatch(/^cpu .*10%$/)
  expect(rows[1]).toMatch(/^ram .*52%  8\.4\/16 GB$/)
})
