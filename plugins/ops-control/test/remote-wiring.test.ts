import { expect, mock } from 'claude-code/testing'
import { runOpsControl, fakeFs, test } from './kit.ts'

const R = '/fake/.claude/ops-control/remote'
const ENV = { KONSOLE_VERSION: '260801', DISPLAY: ':0', OPS_CONTROL_BIN: '/bin/gi' }

function boot(on: any, files: Record<string, string> = {}, surfaces = ['terminal'], env: Record<string, string> = ENV) {
  const ran: string[][] = []
  const fs = fakeFs(on, { '/bin/gi': '', ...files }, argv => {
    ran.push(argv)
    if (argv.join(' ') === 'uname -s') return { exitCode: 0, stdout: 'Linux\n' }
    if (argv.join(' ') === 'uname -m') return { exitCode: 0, stdout: 'x86_64\n' }
    if (argv[0] === 'sh' && argv[1] === '-c' && argv[2]!.startsWith('setsid')) return { exitCode: 0, stdout: '' }
    if (argv[0] === 'cmd.exe') return { exitCode: 0, stdout: '' }
  }, env)
  mock.store(on)
  const clock = mock.clock(on)
  const opens: any[] = []
  on('ui.open', async (_$: unknown, e: unknown) => { opens.push(e); return { value: { isPlaced: true } } as never })
  on('ui.panes', async () => ({ value: [] }))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('session.surfaces', async () => ({ value: surfaces }) as never)
  on('session.id', async () => ({ value: 's1' }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  return { ...fs, ran, clock, opens }
}
const start = ($: any) => $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: false })
const runDir = (files: Record<string, string>) => Object.keys(files).find(f => f.startsWith(R + '/') && f.endsWith('/owner'))!.slice(0, -'/owner'.length)
const state = (files: Record<string, string>, dir: string) => JSON.parse(files[`${dir}/state.json`]!)

test('/ops config launches the TUI detached in Konsole and writes the first state', async ($, on) => {
  const b = boot(on)
  await start($)
  const out = await runOpsControl($, 'config')
  const dir = runDir(b.files)
  expect(b.files[`${dir}/owner`]).toBe('s1')
  expect(b.ran).toContainEqual(['sh', '-c', 'setsid -f "$@" </dev/null >/dev/null 2>&1', 'sh', 'konsole', '-e', '/bin/gi', 'config', '--run', dir])
  expect(out.text).toMatch(/^ops-control config is opening in Konsole\. If no window appears, run this in a terminal: \/bin\/gi config --run /)
  expect(state(b.files, dir).seq).toBe(0)
  expect(b.opens).toEqual([])
})

test('a line the TUI appends applies within one poll and comes back in state.json', async ($, on) => {
  const b = boot(on)
  await start($)
  await runOpsControl($, 'config')
  const dir = runDir(b.files)
  b.files[`${dir}/open`] = ''
  b.files[`${dir}/commands.jsonl`] = '{"seq":1,"cmds":["pack crt"]}\n'
  await b.clock.advance(250)
  expect((await runOpsControl($, 'pack list')).text).toContain('● crt')
  const s = state(b.files, dir)
  expect([s.seq, s.lines, s.state.mix.colors, s.note.text]).toEqual([1, 1, 'crt', 'Pack: crt'])
})

test('undo puts the stored settings back, and keys that were absent stay absent', async ($, on) => {
  const b = boot(on)
  await start($)
  await runOpsControl($, 'config')
  const dir = runDir(b.files)
  b.files[`${dir}/open`] = ''
  b.files[`${dir}/commands.jsonl`] = '{"seq":1,"cmds":["pack crt"]}\n{"seq":2,"cmds":["setup tabs plan"]}\n'
  await b.clock.advance(250)
  b.files[`${dir}/commands.jsonl`] += '{"seq":3,"undo":true}\n'
  await b.clock.advance(250)
  expect((await runOpsControl($, 'pack list')).text).toContain('● classic')
  expect((await runOpsControl($, 'setup')).text).toContain('tabs           plan, context, guardrails, agents, diff, music')
  expect(state(b.files, dir).seq).toBe(3)
})

test('a command outside the allowlist is refused with a note and does not run', async ($, on) => {
  const b = boot(on)
  await start($)
  await runOpsControl($, 'config')
  const dir = runDir(b.files)
  b.files[`${dir}/open`] = ''
  b.files[`${dir}/commands.jsonl`] = '{"seq":1,"cmds":["statusline on"]}\n'
  await b.clock.advance(250)
  expect(state(b.files, dir).note).toEqual({ text: 'ops-control config cannot run "statusline on".', tone: 'error' })
  expect(b.ran.some(a => a.join(' ').includes('statusline'))).toBe(false)
})

test('a half-written line waits for its newline', async ($, on) => {
  const b = boot(on)
  await start($)
  await runOpsControl($, 'config')
  const dir = runDir(b.files)
  b.files[`${dir}/open`] = ''
  b.files[`${dir}/commands.jsonl`] = '{"seq":1,"cmds":["pack c'
  await b.clock.advance(250)
  b.files[`${dir}/commands.jsonl`] += 'rt"]}\n'
  await b.clock.advance(250)
  expect((await runOpsControl($, 'pack list')).text).toContain('● crt')
})

test('once open goes stale the poll stops', async ($, on) => {
  const b = boot(on)
  await start($)
  await runOpsControl($, 'config')
  const dir = runDir(b.files)
  b.files[`${dir}/open`] = ''
  b.mtimes[`${dir}/open`] = Date.now() - 11_000
  b.files[`${dir}/commands.jsonl`] = '{"seq":1,"cmds":["pack crt"]}\n'
  await b.clock.advance(250)
  b.mtimes[`${dir}/open`] = Date.now()
  await b.clock.advance(250)
  expect((await runOpsControl($, 'pack list')).text).not.toContain('● crt')
})

test('once open has been seen and then removed the TUI has quit: the poll drains what it wrote, stops, and a new run starts at once', async ($, on) => {
  const b = boot(on)
  await start($)
  await runOpsControl($, 'config')
  const dir = runDir(b.files)
  b.files[`${dir}/open`] = ''
  await b.clock.advance(250)
  delete b.files[`${dir}/open`]
  b.files[`${dir}/commands.jsonl`] = '{"seq":1,"cmds":["pack crt"]}\n'
  await b.clock.advance(250)
  expect((await runOpsControl($, 'pack list')).text).toContain('● crt')
  expect(state(b.files, dir).seq).toBe(1)
  b.files[`${dir}/commands.jsonl`] += '{"seq":2,"cmds":["pack arcade"]}\n'
  await b.clock.advance(250)
  expect((await runOpsControl($, 'pack list')).text).toContain('● crt')
  expect((await runOpsControl($, 'config')).text).toMatch(/^ops-control config is opening in Konsole/)
  expect(Object.keys(b.files).filter(f => f.endsWith('/owner'))).toHaveLength(2)
})

test('an undo the TUI wrote just before it quit (its 1 s wait ran out) still applies', async ($, on) => {
  const b = boot(on)
  await start($)
  await runOpsControl($, 'config')
  const dir = runDir(b.files)
  b.files[`${dir}/open`] = ''
  b.files[`${dir}/commands.jsonl`] = '{"seq":1,"cmds":["pack crt"]}\n'
  await b.clock.advance(250)
  expect((await runOpsControl($, 'pack list')).text).toContain('● crt')
  b.files[`${dir}/commands.jsonl`] += '{"seq":2,"undo":true}\n'
  delete b.files[`${dir}/open`]
  await b.clock.advance(250)
  expect((await runOpsControl($, 'pack list')).text).toContain('● classic')
})

test('a change pressed just before q still applies', async ($, on) => {
  const b = boot(on)
  await start($)
  await runOpsControl($, 'config')
  const dir = runDir(b.files)
  b.files[`${dir}/open`] = ''
  await b.clock.advance(250)
  b.files[`${dir}/commands.jsonl`] = '{"seq":1,"cmds":["pack crt"]}\n'
  delete b.files[`${dir}/open`]
  await b.clock.advance(250)
  expect((await runOpsControl($, 'pack list')).text).toContain('● crt')
})

test('undo after motion reduced, with reducedMotion never stored, puts motion back to full', async ($, on) => {
  const b = boot(on)
  await start($)
  await runOpsControl($, 'config')
  const dir = runDir(b.files)
  b.files[`${dir}/open`] = ''
  b.files[`${dir}/commands.jsonl`] = '{"seq":1,"cmds":["motion reduced"]}\n'
  await b.clock.advance(250)
  expect(state(b.files, dir).state.reduced).toBe(true)
  b.files[`${dir}/commands.jsonl`] += '{"seq":2,"undo":true}\n'
  await b.clock.advance(250)
  const s = state(b.files, dir)
  expect([s.seq, s.state.reduced]).toEqual([2, false])
})

test('an undo.json that is not all seven keys is refused and changes nothing', async ($, on) => {
  const b = boot(on)
  await start($)
  await runOpsControl($, 'pack crt')
  await runOpsControl($, 'config')
  const dir = runDir(b.files)
  b.files[`${dir}/open`] = ''
  b.files[`${dir}/undo.json`] = '{}'
  b.files[`${dir}/commands.jsonl`] = '{"seq":1,"undo":true}\n'
  await b.clock.advance(250)
  expect((await runOpsControl($, 'pack list')).text).toContain('● crt')
  expect(state(b.files, dir).note).toEqual({ text: expect.stringMatching(/^ops-control config could not undo: /), tone: 'error' })
})

const NO_BIN = { KONSOLE_VERSION: '260801', DISPLAY: ':0' }

test('a binary lookup that fails creates no run', async ($, on) => {
  const b = boot(on, {}, ['terminal'], NO_BIN)
  await start($)
  const out = await runOpsControl($, 'config')
  expect(out.text).toMatch(/^ops-control config needs its installer binary: /)
  expect(Object.keys(b.files).filter(f => f.startsWith(R))).toEqual([])
})

test('the first /ops config says it is downloading before the download starts', async ($, on) => {
  // the plugin root is wherever the checkout sits: CI clones it somewhere else
  const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
  const b = boot(on, { [`${root}/.claude-plugin/plugin.json`]: '{"version":"9.9.9"}' }, ['terminal'], NO_BIN)
  on('ui.toast', async (_$: unknown, e: any) => { b.ran.push(['toast', e.text]); return { value: undefined } as never })
  await start($)
  await runOpsControl($, 'config')
  const at = (pred: (a: string[]) => boolean) => b.ran.findIndex(pred)
  expect(at(a => a[0] === 'toast' && a[1] === 'Downloading glowup-installer…')).toBeGreaterThanOrEqual(0)
  expect(at(a => a[0] === 'toast')).toBeLessThan(at(a => a[0] === 'mkdir'))
})

test('a second /ops config while the window is open says so', async ($, on) => {
  const b = boot(on)
  await start($)
  await runOpsControl($, 'config')
  b.files[`${runDir(b.files)}/open`] = ''
  expect((await runOpsControl($, 'config')).text).toBe('ops-control config is already open.')
})

test('a second /ops config after a window that never opened starts a new run', async ($, on) => {
  const b = boot(on)
  await start($)
  await runOpsControl($, 'config')
  const first = runDir(b.files)
  await runOpsControl($, 'config')
  const owners = Object.keys(b.files).filter(f => f.endsWith('/owner'))
  expect(owners).toHaveLength(2)
  expect(owners.some(f => !f.startsWith(first))).toBe(true)
})

test('a second /ops config after the window went stale starts a new run', async ($, on) => {
  const b = boot(on)
  await start($)
  await runOpsControl($, 'config')
  const first = runDir(b.files)
  b.files[`${first}/open`] = ''
  b.mtimes[`${first}/open`] = Date.now() - 11_000
  expect((await runOpsControl($, 'config')).text).toMatch(/^ops-control config is opening in Konsole/)
  expect(Object.keys(b.files).filter(f => f.endsWith('/owner'))).toHaveLength(2)
})

test('with no terminal found it prints the command, and a hand-started TUI still gets a live run', async ($, on) => {
  const b = boot(on, {}, ['terminal'], { OPS_CONTROL_BIN: '/bin/gi' })
  await start($)
  const out = await runOpsControl($, 'config')
  const dir = runDir(b.files)
  expect(out.text).toBe(`Run this in a terminal: /bin/gi config --run ${dir}`)
  b.mtimes[`${dir}/owner`] = Date.now() - 60_000
  b.files[`${dir}/open`] = ''
  b.files[`${dir}/commands.jsonl`] = '{"seq":1,"cmds":["pack crt"]}\n'
  await b.clock.advance(250)
  expect((await runOpsControl($, 'pack list')).text).toContain('● crt')
})

test('the desktop gets the pane; config pane opens it anywhere', async ($, on) => {
  const b = boot(on, {}, ['desktop'])
  await start($)
  await runOpsControl($, 'config')
  expect(b.opens.map(o => o.id)).toEqual(['ops-control-config'])
})

test('a hot reload resumes a live run from the seq in state.json', async ($, on) => {
  const dir = `${R}/r1`
  const b = boot(on, {
    [`${dir}/owner`]: 's1', [`${dir}/open`]: '', [`${dir}/undo.json`]: '{}',
    [`${dir}/state.json`]: JSON.stringify({ format: 1, seq: 1, lines: 1 }),
    [`${dir}/commands.jsonl`]: '{"seq":1,"cmds":["pack arcade"]}\n{"seq":2,"cmds":["pack crt"]}\n',
  })
  await start($)
  await b.clock.advance(250)
  expect((await runOpsControl($, 'pack list')).text).toContain('● crt')
  expect(state(b.files, dir).seq).toBe(2)
})

test('session start removes day-old runs', async ($, on) => {
  const b = boot(on, { [`${R}/old/owner`]: 's9' })
  b.mtimes[`${R}/old/owner`] = Date.now() - 86_400_001
  await start($)
  expect(b.ran).toContainEqual(['rm', '-rf', `${R}/old`])
})

const WIN_ENV = { OS: 'Windows_NT', PROCESSOR_ARCHITECTURE: 'AMD64', OPS_CONTROL_BIN: '/Users/A B/gi.exe' }

test('on Windows /ops config opens a window with cmd start and never runs uname', async ($, on) => {
  const b = boot(on, { '/Users/A B/gi.exe': '' }, ['terminal'], WIN_ENV)
  await start($)
  const out = await runOpsControl($, 'config')
  const dir = runDir(b.files)
  expect(b.ran).toContainEqual(['cmd.exe', '/c', 'start', 'ops-control config', '/Users/A B/gi.exe', 'config', '--run', dir])
  expect(b.ran.filter(a => a[0] === 'uname' || a[0] === 'sh')).toEqual([])
  expect(out.text).toBe(`ops-control config is opening in a new window. If no window appears, run this in a terminal: & "/Users/A B/gi.exe" config --run ${dir}`)
})

test('on Windows session start removes day-old runs with PowerShell', async ($, on) => {
  const b = boot(on, { [`${R}/old/owner`]: 's9' }, ['terminal'], WIN_ENV)
  b.mtimes[`${R}/old/owner`] = Date.now() - 86_400_001
  await start($)
  const rm = b.ran.find(a => a[0] === 'powershell.exe')!
  expect(rm.slice(0, 4)).toEqual(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command'])
  expect(rm[4]).toContain('Remove-Item')
  expect(b.ran.filter(a => a[0] === 'rm')).toEqual([])
})
