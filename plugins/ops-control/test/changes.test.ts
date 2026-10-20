import { test, expect } from 'claude-code/testing'
import { parseNumstat, gitBase, branchOf, rebase, refreshCounts, serial, type Repo } from '../hooks/changes.ts'
import { fakeHost } from './kit.ts'

const REV = 'git --no-optional-locks -C /r rev-parse --show-toplevel --show-prefix --git-path index HEAD'
const STASH = 'git --no-optional-locks -C /r stash create'
const DIFF = 'git --no-optional-locks -C /r diff --numstat -z abc'
const HEAD = 'git --no-optional-locks -C /r rev-parse HEAD'
const PRE = 'git --no-optional-locks -C /r diff --name-only -z HEAD f00d'
const repoAt = (base: string, preDirty: string[] = []): Repo => ({ root: '/r', base, head: 'abc', preDirty: new Set(preDirty) })
// rev-parse prints --git-path relative to the directory it ran in
const REV_OUT = '/r\n\n.git/index\nabc\n'
const COPY = { 'mktemp': { exitCode: 0, stdout: '/tmp/idx.1\n' }, 'cp /r/.git/index /tmp/idx.1': { exitCode: 0, stdout: '' }, 'rm -f /tmp/idx.1': { exitCode: 0, stdout: '' } }

test('parseNumstat reads counts, binary files and renames', async () => {
  const m = parseNumstat('3\t1\tsrc/a.ts\0-\t-\timg.png\0' + '2\t0\t\0src/old.ts\0src/new.ts\0' + '1\t1\tcafé.ts\0' + '4\t2\ta\tb.ts\0', '/r')
  expect(m.get('/r/src/a.ts')).toEqual({ add: 3, del: 1 })
  expect(m.get('/r/img.png')).toEqual({ add: 0, del: 0 })
  expect(m.get('/r/src/new.ts')).toEqual({ add: 2, del: 0 })
  expect(m.has('/r/src/old.ts')).toBe(false)
  expect(m.get('/r/café.ts')).toEqual({ add: 1, del: 1 })
  expect(m.get('/r/a\tb.ts')).toEqual({ add: 4, del: 2 })
  expect(m.size).toBe(5)
})

test('a rejecting git (not installed) is treated as no repo or unchanged counts', async () => {
  const { host } = fakeHost()
  const broken = { ...host, run: async () => { throw new Error('spawn git ENOENT') } }
  expect(await gitBase(broken, '/r')).toBeUndefined()
  const files = [{ path: '/r/a.ts', add: 1, del: 0, how: 'edit' as const, at: 1 }]
  expect(await refreshCounts(broken, files, repoAt('abc'), 9)).toEqual(files)
  expect(await rebase(broken, repoAt('abc'))).toEqual(repoAt('abc'))
})

test('gitBase is undefined outside a repo', async () => {
  const { host } = fakeHost()
  expect(await gitBase(host, '/r')).toBeUndefined()
})

test('branchOf names the branch, and nothing when detached or outside git', async () => {
  const argv = 'git --no-optional-locks -C /w symbolic-ref --short -q HEAD'
  expect(await branchOf(fakeHost({ runs: { [argv]: { exitCode: 0, stdout: 'main\n' } } }).host, '/w')).toBe('main')
  expect(await branchOf(fakeHost({ runs: { [argv]: { exitCode: 1, stdout: '' } } }).host, '/w')).toBeUndefined()
  expect(await branchOf(fakeHost().host, '/w')).toBeUndefined()
})

test('every git call skips optional locks so Claude\'s own git commit never meets index.lock', async () => {
  const { host, ran } = fakeHost({ runs: {
    [REV]: { exitCode: 0, stdout: REV_OUT },
    ...COPY,
    [STASH]: { exitCode: 0, stdout: '' },
    [DIFF]: { exitCode: 0, stdout: '' },
  } })
  const git = await gitBase(host, '/r')
  await refreshCounts(host, [], git, 9)
  const gits = ran.filter(a => a.startsWith('git '))
  expect(gits.length).toBe(3)
  await rebase(host, git!)
  await refreshCounts(host, [{ path: '/r/a.ts', add: 1, del: 0, how: 'edit', at: 1 }], git, 9)
  for (const argv of ran.filter(a => a.startsWith('git '))) expect(argv.startsWith('git --no-optional-locks -C ')).toBe(true)
  for (const argv of gits) expect(argv.startsWith('git --no-optional-locks -C ')).toBe(true)
})

test('stash create runs on a throwaway copy of the index, never .git/index itself', async () => {
  const { host, ran, envs } = fakeHost({ runs: { [REV]: { exitCode: 0, stdout: REV_OUT }, ...COPY, [STASH]: { exitCode: 0, stdout: 'f00d\n' } } })
  expect(await gitBase(host, '/r')).toMatchObject({ root: '/r', base: 'f00d' })
  expect(ran.slice(0, 5)).toEqual([REV, 'mktemp', 'cp /r/.git/index /tmp/idx.1', STASH, 'rm -f /tmp/idx.1'])
  expect(envs[ran.indexOf(STASH)]).toEqual({ GIT_INDEX_FILE: '/tmp/idx.1' })
})

test('the baseline is the session-start working tree when it is dirty, else HEAD', async () => {
  const dirty = fakeHost({ runs: { [REV]: { exitCode: 0, stdout: REV_OUT }, ...COPY, [STASH]: { exitCode: 0, stdout: 'f00d\n' }, [PRE]: { exitCode: 0, stdout: 'a.ts\0src/b.ts\0' } } })
  expect(await gitBase(dirty.host, '/r')).toEqual({ root: '/r', base: 'f00d', head: 'abc', preDirty: new Set(['/r/a.ts', '/r/src/b.ts']) })
  const clean = fakeHost({ runs: { [REV]: { exitCode: 0, stdout: REV_OUT }, ...COPY, [STASH]: { exitCode: 0, stdout: '' } } })
  expect(await gitBase(clean.host, '/r')).toEqual({ root: '/r', base: 'abc', head: 'abc', preDirty: new Set() })
  expect(clean.ran.some(a => a.includes('--name-only'))).toBe(false)
})

test('with no index to copy (fresh repo) the baseline is HEAD and stash create never runs', async () => {
  const { host, ran } = fakeHost({ runs: { [REV]: { exitCode: 0, stdout: REV_OUT }, mktemp: COPY.mktemp, 'rm -f /tmp/idx.1': COPY['rm -f /tmp/idx.1'] } })
  expect(await gitBase(host, '/r')).toMatchObject({ root: '/r', base: 'abc' })
  expect(ran).not.toContain(STASH)
  expect(ran).toContain('rm -f /tmp/idx.1')
})

test('the root keeps the cwd spelling, so a symlinked checkout matches tool paths', async () => {
  const { host } = fakeHost({ runs: {
    'git --no-optional-locks -C /link/sub/dir rev-parse --show-toplevel --show-prefix --git-path index HEAD': { exitCode: 0, stdout: '/real/repo\nsub/dir/\n/real/repo/.git/index\nabc\n' },
    ...COPY,
    'cp /real/repo/.git/index /tmp/idx.1': { exitCode: 0, stdout: '' },
    'git --no-optional-locks -C /link stash create': { exitCode: 0, stdout: '' },
  } })
  expect(await gitBase(host, '/link/sub/dir')).toMatchObject({ root: '/link', base: 'abc' })
})

test('refreshCounts prefers git numbers, keeps non-git files, and adds shell-edited files', async () => {
  const { host } = fakeHost({ runs: { [DIFF]: { exitCode: 0, stdout: '5\t2\tsrc/a.ts\0' + '1\t1\tsed.ts\0' } } })
  const out = await refreshCounts(host, [
    { path: '/r/src/a.ts', add: 1, del: 1, how: 'edit', at: 3 },
    { path: '/elsewhere/x.ts', add: 4, del: 0, how: 'edit', at: 1 },
  ], repoAt('abc'), 9)
  expect(out.map(f => [f.path, f.how, f.add, f.del])).toEqual([
    ['/r/src/a.ts', 'edit', 5, 2], ['/elsewhere/x.ts', 'edit', 4, 0], ['/r/sed.ts', 'edit', 1, 1],
  ])
  expect(out.map(f => f.at)).toEqual([9, 1, 9])
})

test('a refresh that finds the same counts leaves the touch time alone', async () => {
  const { host } = fakeHost({ runs: { [DIFF]: { exitCode: 0, stdout: '1\t1\tsrc/a.ts\0' } } })
  const out = await refreshCounts(host, [{ path: '/r/src/a.ts', add: 1, del: 1, how: 'edit', at: 3 }], repoAt('abc'), 9)
  expect(out.map(f => f.at)).toEqual([3])
})

test('refreshCounts runs git even when Claude has touched no file yet', async () => {
  const { host } = fakeHost({ runs: { [DIFF]: { exitCode: 0, stdout: '2\t0\tx.ts\0' } } })
  expect(await refreshCounts(host, [], repoAt('abc'), 5)).toEqual([{ path: '/r/x.ts', add: 2, del: 0, how: 'edit', at: 5 }])
})

test('git failing mid-session keeps the previous counts', async () => {
  const { host } = fakeHost()
  const files = [{ path: '/r/a.ts', add: 1, del: 0, how: 'edit' as const, at: 1 }]
  expect(await refreshCounts(host, files, repoAt('abc'), 9)).toEqual(files)
})

test('rebase moves the base to HEAD when HEAD moved, however it moved', async () => {
  const same = fakeHost({ runs: { [HEAD]: { exitCode: 0, stdout: 'abc\n' } } })
  const repo = repoAt('f00d', ['/r/pre.ts'])
  expect(await rebase(same.host, repo)).toBe(repo)
  const moved = fakeHost({ runs: { [HEAD]: { exitCode: 0, stdout: 'def\n' } } })
  const next = await rebase(moved.host, repo)
  expect(next).toEqual({ root: '/r', base: 'def', head: 'def', preDirty: new Set(['/r/pre.ts']) })
  // a second refresh with HEAD still at def changes nothing
  expect(await rebase(moved.host, next)).toBe(next)
  const failing = fakeHost({ runs: { [HEAD]: { exitCode: 128, stdout: '' } } })
  expect(await rebase(failing.host, repo)).toBe(repo)
})

test('a commit of one of two edited files leaves only the other', async () => {
  const both = [
    { path: '/r/a.ts', add: 3, del: 1, how: 'edit' as const, at: 2 },
    { path: '/r/b.ts', add: 2, del: 0, how: 'edit' as const, at: 1 },
  ]
  const { host, ran } = fakeHost({ runs: {
    'git --no-optional-locks -C /r diff --numstat -z def': { exitCode: 0, stdout: '2\t0\tb.ts\0' },
    'git --no-optional-locks -C /r ls-files -z -- a.ts': { exitCode: 0, stdout: 'a.ts\0' },
  } })
  const out = await refreshCounts(host, both, { ...repoAt('def'), head: 'def' }, 9)
  expect(out.map(f => f.path)).toEqual(['/r/b.ts'])
  // only the files git no longer reports are looked up
  expect(ran.filter(a => a.includes('ls-files'))).toEqual(['git --no-optional-locks -C /r ls-files -z -- a.ts'])
})

test('a partly committed file stays, with the lines still differing from the new HEAD', async () => {
  const { host } = fakeHost({ runs: { 'git --no-optional-locks -C /r diff --numstat -z def': { exitCode: 0, stdout: '1\t0\ta.ts\0' } } })
  const out = await refreshCounts(host, [{ path: '/r/a.ts', add: 4, del: 1, how: 'edit', at: 2 }], { ...repoAt('def'), head: 'def' }, 9)
  expect(out.map(f => [f.path, f.add, f.del])).toEqual([['/r/a.ts', 1, 0]])
})

test('an uncommitted new file and a file git does not track keep their own counts', async () => {
  const { host } = fakeHost({ runs: {
    [DIFF]: { exitCode: 0, stdout: '' },
    'git --no-optional-locks -C /r ls-files -z -- n.ts ignored.log': { exitCode: 0, stdout: '' },
  } })
  const files = [
    { path: '/r/n.ts', add: 4, del: 0, how: 'new' as const, at: 2 },
    { path: '/r/ignored.log', add: 1, del: 0, how: 'edit' as const, at: 1 },
    { path: '/elsewhere/x.ts', add: 2, del: 0, how: 'edit' as const, at: 1 },
  ]
  expect(await refreshCounts(host, files, repoAt('abc'), 9)).toEqual(files)
})

test('a failing ls-files keeps every file rather than dropping on a guess', async () => {
  const { host } = fakeHost({ runs: { [DIFF]: { exitCode: 0, stdout: '' } } })
  const files = [{ path: '/r/a.ts', add: 1, del: 0, how: 'edit' as const, at: 1 }]
  expect(await refreshCounts(host, files, repoAt('abc'), 9)).toEqual(files)
})

test('files that were dirty before the session stay out after a rebase unless Claude touched them', async () => {
  const { host } = fakeHost({ runs: { 'git --no-optional-locks -C /r diff --numstat -z def': { exitCode: 0, stdout: '5\t0\tpre.ts\0' + '1\t1\tsed.ts\0' + '2\t0\tmine.ts\0' } } })
  const mine = [{ path: '/r/mine.ts', add: 1, del: 0, how: 'edit' as const, at: 4 }]
  const out = await refreshCounts(host, mine, { ...repoAt('def', ['/r/pre.ts', '/r/mine.ts']), head: 'def' }, 9)
  expect(out.map(f => [f.path, f.add])).toEqual([['/r/mine.ts', 2], ['/r/sed.ts', 1]])
})

test('serial runs one job at a time and only one more after a burst', async () => {
  const queue = serial()
  let running = 0, most = 0, runs = 0
  const gates: (() => void)[] = []
  const job = () => new Promise<void>(resolve => {
    running++; runs++; most = Math.max(most, running)
    gates.push(() => { running--; resolve() })
  })
  for (let i = 0; i < 5; i++) queue(job)
  expect(runs).toBe(1)
  gates.shift()!()
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  expect(runs).toBe(2)
  gates.shift()!()
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  expect(runs).toBe(2)
  expect(most).toBe(1)
  // a rejecting job does not wedge the queue
  queue(() => Promise.reject(new Error('git died')))
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  queue(job)
  expect(runs).toBe(3)
})
