import { test, expect } from 'claude-code/testing'
import { parseDiff, readDiff } from '../hooks/diff.ts'
import type { Repo } from '../hooks/changes.ts'
import type { FileTouch } from '../hooks/model.ts'
import { fakeHost } from './kit.ts'

const repo: Repo = { root: '/r', base: 'abc', head: 'abc', preDirty: new Set() }
const touch = (path: string, how: FileTouch['how'] = 'edit', at = 1): FileTouch => ({ path, add: 1, del: 1, how, at })
const GIT = 'git --no-optional-locks -C /r diff -U3 --no-renames abc --'

const PATCH = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 1111111..2222222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,3 +1,3 @@ function f() {',
  ' keep',
  '-old\tline',
  '+new line',
  ' tail',
  '\\ No newline at end of file',
  'diff --git a/my file.ts b/my file.ts',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/my file.ts',
  '@@ -0,0 +1 @@',
  '+--- not a header',
  'diff --git a/img.png b/img.png',
  'Binary files a/img.png and b/img.png differ',
  '',
].join('\n')

test('parseDiff splits a patch per file and tells hunk, added, removed and context lines apart', () => {
  const m = parseDiff(PATCH, '/r')
  expect(Object.keys(m)).toEqual(['/r/src/a.ts', '/r/my file.ts', '/r/img.png'])
  expect(m['/r/src/a.ts']).toEqual([
    { kind: 'hunk', text: '@@ -1,3 +1,3 @@ function f() {' },
    { kind: 'ctx', text: ' keep' },
    { kind: 'del', text: '-old    line' },
    { kind: 'add', text: '+new line' },
    { kind: 'ctx', text: ' tail' },
    { kind: 'note', text: '\\ No newline at end of file' },
  ])
  // a removed line that looks like a file header is still a removed line once a hunk has begun
  expect(m['/r/my file.ts']).toEqual([{ kind: 'hunk', text: '@@ -0,0 +1 @@' }, { kind: 'add', text: '+--- not a header' }])
  expect(m['/r/img.png']).toEqual([{ kind: 'note', text: 'Binary files differ' }])
})

test('readDiff asks git once for the files under the root, against the base', async () => {
  const { host, ran } = fakeHost({ runs: { [`${GIT} src/a.ts`]: { exitCode: 0, stdout: PATCH } } })
  const out = await readDiff(host, repo, [touch('/r/src/a.ts'), touch('/elsewhere/x.ts')])
  expect(ran).toEqual([`${GIT} src/a.ts`])
  expect(Object.keys(out!)).toEqual(['/r/src/a.ts', '/r/my file.ts', '/r/img.png'])
})

test('an untracked new file shows every line as added, read from the file', async () => {
  const { host } = fakeHost({ runs: {
    [`${GIT} src/a.ts n.ts`]: { exitCode: 0, stdout: PATCH.split('diff --git a/my')[0]! },
    'head -c 65537 /r/n.ts': { exitCode: 0, stdout: 'one\ntwo\n' },
  } })
  const out = await readDiff(host, repo, [touch('/r/src/a.ts'), touch('/r/n.ts', 'new')])
  expect(out!['/r/n.ts']).toEqual([{ kind: 'hunk', text: '@@ -0,0 +1,2 @@' }, { kind: 'add', text: '+one' }, { kind: 'add', text: '+two' }])
})

test('an untracked file over 64 KB or unreadable gets a note instead of lines', async () => {
  const { host } = fakeHost({ runs: {
    [`${GIT} big.ts gone.ts`]: { exitCode: 0, stdout: '' },
    'head -c 65537 /r/big.ts': { exitCode: 0, stdout: 'x'.repeat(65537) },
  } })
  const out = await readDiff(host, repo, [touch('/r/big.ts', 'new'), touch('/r/gone.ts')])
  expect(out!['/r/big.ts']).toEqual([{ kind: 'note', text: 'not shown: over 64 KB' }])
  expect(out!['/r/gone.ts']).toBeUndefined()
})

test('a failing git or no repo reads nothing, so the tab keeps what it had', async () => {
  const { host } = fakeHost()
  expect(await readDiff(host, repo, [touch('/r/a.ts')])).toBeUndefined()
  expect(await readDiff(host, undefined, [touch('/r/a.ts')])).toBeUndefined()
})

test('with nothing under the root git does not run', async () => {
  const { host, ran } = fakeHost()
  expect(await readDiff(host, repo, [touch('/elsewhere/x.ts')])).toEqual({})
  expect(ran).toEqual([])
})
