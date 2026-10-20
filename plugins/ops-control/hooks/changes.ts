import type { Host, RunResult } from './host.ts'
import type { FileTouch } from './model.ts'

// Input is `git diff --numstat -z`: NUL-terminated records, paths unquoted.
// A rename is "add\tdel\t\0old\0new\0"; the new path is the one that counts.
export function parseNumstat(out: string, root: string): Map<string, { add: number; del: number }> {
  const m = new Map<string, { add: number; del: number }>()
  const parts = out.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const rec = parts[i]!
    const t1 = rec.indexOf('\t')
    const t2 = rec.indexOf('\t', t1 + 1)
    if (t1 < 0 || t2 < 0) continue
    let path = rec.slice(t2 + 1)
    if (path === '') { path = parts[i + 2] ?? ''; i += 2 }
    if (path === '') continue
    m.set(`${root}/${path}`, { add: Number(rec.slice(0, t1)) || 0, del: Number(rec.slice(t1 + 1, t2)) || 0 })
  }
  return m
}

// A missing git binary rejects instead of returning a non-zero exit code.
// Without --no-optional-locks, `git diff` rewrites a stale index under
// .git/index.lock, and Claude's own `git commit` at that moment fails.
export async function git(host: Host, dir: string, args: string[], env?: Record<string, string>): Promise<RunResult | undefined> {
  try { return await host.run(['git', '--no-optional-locks', '-C', dir, ...args], env) } catch { return undefined }
}
async function run(host: Host, argv: string[]): Promise<RunResult | undefined> {
  try { return await host.run(argv) } catch { return undefined }
}

// head is the HEAD the base was last measured against; preDirty the files that differed
// from HEAD when the session began, which a rebase onto HEAD would otherwise show as edits.
export type Repo = { root: string; base: string; head: string; preDirty: ReadonlySet<string> }

// The base is the working tree as the session found it (`stash create` writes a
// commit object and no stash entry), so edits made before the session stay out.
// The root keeps the cwd's spelling: through a symlink, --show-toplevel gives the
// real path, which never matches the paths Claude's tools report.
export async function gitBase(host: Host, cwd: string): Promise<Repo | undefined> {
  const r = await git(host, cwd, ['rev-parse', '--show-toplevel', '--show-prefix', '--git-path', 'index', 'HEAD'])
  if (!r || r.exitCode !== 0) return undefined
  const [top = '', prefix = '', indexPath = '', head = ''] = r.stdout.split('\n')
  const dir = cwd.replace(/\/+$/, '')
  const sub = prefix.replace(/\/$/, '')
  const root = !sub ? dir : dir.endsWith('/' + sub) ? dir.slice(0, -sub.length - 1) : top
  // --git-path is relative to the directory rev-parse ran in
  const index = indexPath.startsWith('/') ? indexPath : `${dir}/${indexPath}`
  const tip = head.trim(), base = (await worktreeCommit(host, root, index)) ?? tip
  const preDirty = new Set<string>()
  if (base !== tip) {
    const names = await git(host, root, ['diff', '--name-only', '-z', 'HEAD', base])
    if (names?.exitCode === 0) for (const p of names.stdout.split('\0')) if (p) preDirty.add(`${root}/${p}`)
  }
  return { root, base, head: tip, preDirty }
}

// HEAD moved (commit, pull, checkout, reset; by Claude or by the person): what the session
// changed is now measured from the new HEAD, so a committed file stops differing.
export async function rebase(host: Host, repo: Repo): Promise<Repo> {
  const r = await git(host, repo.root, ['rev-parse', 'HEAD'])
  const tip = r?.exitCode === 0 ? r.stdout.trim() : ''
  return tip && tip !== repo.head ? { ...repo, base: tip, head: tip } : repo
}

// symbolic-ref fails on a detached HEAD, which then shows no branch
export async function branchOf(host: Host, dir: string): Promise<string | undefined> {
  const r = await git(host, dir, ['symbolic-ref', '--short', '-q', 'HEAD'])
  return r && r.exitCode === 0 && r.stdout.trim() ? r.stdout.trim() : undefined
}

// `stash create` refreshes the index it reads, under its .lock, even with
// --no-optional-locks: on the real index that clashes with Claude's own git
// commit. A throwaway copy takes that lock instead.
async function worktreeCommit(host: Host, root: string, index: string): Promise<string | undefined> {
  const tmp = (await run(host, ['mktemp']))?.stdout.trim()
  if (!tmp) return undefined
  try {
    if ((await run(host, ['cp', index, tmp]))?.exitCode !== 0) return undefined
    const r = await git(host, root, ['stash', 'create'], { GIT_INDEX_FILE: tmp })
    return r?.exitCode === 0 && r.stdout.trim() ? r.stdout.trim() : undefined
  } finally {
    await run(host, ['rm', '-f', tmp])
  }
}

// Files git reports that Claude never edited (sed -i, a file it only read, the person's
// editor) join as edits, except files that were already dirty at session start.
// Untracked and ignored files are absent from `git diff`, so they keep their own counts; a
// tracked file absent from it matches the base (committed, or edited back) and drops out.
// A file whose counts changed is touched again at `at`.
export async function refreshCounts(host: Host, files: FileTouch[], repo: Repo | undefined, at: number): Promise<FileTouch[]> {
  if (!repo) return files
  const r = await git(host, repo.root, ['diff', '--numstat', '-z', repo.base])
  if (!r || r.exitCode !== 0) return files
  const counts = parseNumstat(r.stdout, repo.root)
  const known = new Set(files.map(f => f.path))
  const extra = [...counts].filter(([path]) => !known.has(path) && !repo.preDirty.has(path)).map(([path, c]): FileTouch => ({ path, ...c, how: 'edit', at }))
  const kept = files.map(f => {
    const c = counts.get(f.path)
    return c ? { ...f, ...c, at: c.add !== f.add || c.del !== f.del ? at : f.at } : f
  })
  const tracked = await trackedAmong(host, repo.root, files.filter(f => !counts.has(f.path)).map(f => f.path))
  return [...kept.filter(f => !tracked.has(f.path)), ...extra]
}

// Tracked paths among `paths`; a failing git answers none, so nothing is dropped on a guess.
async function trackedAmong(host: Host, root: string, paths: string[]): Promise<Set<string>> {
  const rels = paths.filter(p => p.startsWith(root + '/')).map(p => p.slice(root.length + 1))
  if (!rels.length) return new Set()
  const r = await git(host, root, ['ls-files', '-z', '--', ...rels])
  if (!r || r.exitCode !== 0) return new Set()
  return new Set(r.stdout.split('\0').filter(Boolean).map(p => `${root}/${p}`))
}

// One git process at a time: a call while a job runs marks the queue dirty, and
// exactly one more job (the latest) runs when the current one settles.
export function serial(): (job: () => Promise<void>) => void {
  let busy = false
  let next: (() => Promise<void>) | undefined
  const start = (job: () => Promise<void>) => {
    busy = true
    void job().catch(() => {}).finally(() => {
      busy = false
      const queued = next
      next = undefined
      if (queued) start(queued)
    })
  }
  return job => { if (busy) next = job; else start(job) }
}
