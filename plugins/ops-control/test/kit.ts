import { mock, test as baseTest, type Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { FetchResult, Host } from '../hooks/host.ts'
import type { PetLines } from '../hooks/lines.ts'

// Every line a moment can draw, any flavour, with its slots filled as the bubble would.
export const anyLine = (t: PetLines, moment: string, vars: Record<string, string> = {}) =>
  Object.entries(t).filter(([k]) => k === moment || k.startsWith(moment + '@')).flatMap(([, ls]) => ls!).map(l => l.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '…'))

// Booting the engine takes 1 to 4 s on an idle machine and more under load, so the
// stock 5 s limit failed a different test on each busy CI run.
export const test = ((name: string, ...rest: unknown[]) => {
  const [opts, body] = rest.length === 1 ? [{}, rest[0]] : [rest[0], rest[1]]
  ;(baseTest as (...a: unknown[]) => void)(name, { timeoutMs: 20000, ...(opts as object) }, body)
}) as unknown as typeof baseTest

export const runOpsControl = ($: Engine, args = '', columns = 120, isFullscreen = false) =>
  $.command.run({ command: 'ops', args, origin: { kind: 'composer' }, presentation: { isFullscreen, columns } })

export type FakeRequest = { method: string; url: string; headers: Record<string, string>; body?: string }

// An in-memory Host: files is a path -> text map, runs answers argv strings.
export function fakeHost(opts: { files?: Record<string, string>; runs?: Record<string, { exitCode: number; stdout: string }>; fetches?: Record<string, string>; projectStatusLine?: boolean; mtimes?: Record<string, number>; http?: (req: FakeRequest) => FetchResult | Promise<FetchResult>; spawns?: (argv: string[], emit: (stream: 'stdout' | 'stderr', line: string) => void) => Promise<number | null> } = {}) {
  const files = { ...(opts.files ?? {}) }
  const mtimes = { ...(opts.mtimes ?? {}) }
  const store: Record<string, unknown> = {}
  const ran: string[] = []
  const envs: (Record<string, string> | undefined)[] = []
  const timeouts: (number | undefined)[] = []
  const requests: FakeRequest[] = []
  const spawned: string[] = []
  const killed: string[] = []
  const expiries = new Set<() => void>()
  // the 5 s timeout of every fetch still out: its promise rejects, its http handler keeps running
  const expire = () => { for (const f of expiries) f(); expiries.clear() }
  const host: Host = {
    run: async (argv, env, timeoutMs) => {
      ran.push(argv.join(' '))
      envs.push(env)
      timeouts.push(timeoutMs)
      const hit = opts.runs?.[argv.join(' ')]
      if (!hit) return { exitCode: 127, stdout: '', stderr: 'not found' }
      return { ...hit, stderr: '' }
    },
    readFile: async p => { if (!(p in files)) throw new Error('ENOENT ' + p); return files[p]! },
    writeFile: async (p, t) => { files[p] = t },
    exists: async p => p in files || Object.keys(files).some(f => f.startsWith(p + '/')),
    stat: async p => p in files ? { mtimeMs: mtimes[p] ?? Date.now() } : undefined,
    listDir: async p => [...new Set(Object.keys(files).filter(f => f.startsWith(p + '/')).map(f => f.slice(p.length + 1).split('/')[0]!))],
    listFiles: async p => Object.keys(files).filter(f => f.startsWith(p + '/')).map(f => ({ name: f.slice(p.length + 1), size: files[f]!.length })).filter(e => !e.name.includes('/')),
    fetchText: async url => url in (opts.fetches ?? {}) ? { ok: true, status: 200, text: opts.fetches![url]! } : { ok: false, status: 404, text: '' },
    fetch: (url, init) => {
      const req: FakeRequest = { method: init.method ?? 'GET', url, headers: init.headers ?? {}, ...(init.body !== undefined && { body: init.body }) }
      requests.push(req)
      return new Promise((resolve, reject) => {
        expiries.add(() => reject(new Error('timed out')))
        ;(async () => { if (!opts.http) throw new Error('offline'); return opts.http(req) })()
          .then(r => { init.onSettled?.(); resolve(r) }, e => { init.onSettled?.(); reject(e) })
      })
    },
    spawn: (argv, onLine) => {
      const key = argv.join(' ')
      spawned.push(key)
      let kill = () => {}
      const stopped = new Promise<null>(r => { kill = () => { killed.push(key); r(null) } })
      return { done: Promise.race([opts.spawns ? opts.spawns([...argv], onLine).catch(() => null) : Promise.resolve(127), stopped]), kill: () => kill() }
    },
    storeGet: async k => store[k],
    storeSet: async (k, v) => { store[k] = v },
    storeDelete: async k => { delete store[k] },
    projectStatusLine: async () => opts.projectStatusLine === true,
    configDir: '/home/u/.claude',
    dataHome: '/home/u/.local/share',
    home: '/home/u',
  }
  return { host, files, store, ran, envs, timeouts, mtimes, requests, spawned, killed, expire }
}

// Answers $.env, $.fs and $.process from memory, so a wiring test can never reach
// the real config directory. Call it first in any test that loads the mod's hooks.
export function fakeFs(on: On, files: Record<string, string> = {}, ran?: (argv: string[]) => { exitCode: number; stdout: string } | void | Promise<{ exitCode: number; stdout: string } | void>, env: Record<string, string> = {}, beforeWrite?: (path: string) => Promise<void> | void) {
  mock.env(on, { HOME: '/fake', CLAUDE_CONFIG_DIR: '/fake/.claude', ...env })
  const writes: string[] = []
  const mtimes: Record<string, number> = {}
  const under = (p: string) => Object.keys(files).filter(f => f.startsWith(p + '/'))
  on('fs.exists', async (_$, e) => ({ value: e.path in files || under(e.path).length > 0 }) as never)
  on('fs.read', async (_$, e) => { if (!(e.path in files)) throw new Error('ENOENT ' + e.path); return { value: files[e.path]! } as never })
  on('fs.write', async (_$, e) => { await beforeWrite?.(e.path); writes.push(e.path); files[e.path] = e.text; return { value: undefined } as never })
  on('fs.list', async (_$, e) => ({ value: [...new Set(under(e.path).map(f => f.slice(e.path.length + 1).split('/')[0]!))].map(name => {
    const p = `${e.path}/${name}`
    return p in files ? { name, kind: 'file', size: files[p]!.length } : { name, kind: 'dir', size: 0 }
  }) }) as never)
  on('fs.stat', async (_$, e) => {
    if (!(e.path in files)) throw new Error('ENOENT ' + e.path)
    return { value: { kind: 'file', size: files[e.path]!.length, mtimeMs: mtimes[e.path] ?? Date.now(), isLink: false } } as never
  })
  on('settings.read', async () => ({ value: {} }) as never)
  on('process.run', async (_$, e) => ({ value: { exitCode: 1, stdout: '', stderr: '', ...(await ran?.((e as { argv: string[] }).argv)) } }) as never)
  return { files, writes, mtimes }
}
