import type { Host } from './host.ts'
import type { FileTouch } from './model.ts'
import { git, type Repo } from './changes.ts'

export type DiffLine = { kind: 'hunk' | 'add' | 'del' | 'ctx' | 'note'; text: string }
export type Diffs = Record<string, DiffLine[]>

const MAX_BYTES = 65536
// Tabs would count as one cell in the width math and draw as eight.
const flat = (s: string) => s.replace(/\r$/, '').replaceAll('\t', '    ')

// Input is `git diff --no-renames` output. Without renames both sides of a header carry the
// same path, so "a/X b/X" splits by length even when X holds spaces; a quoted path (a name
// with a quote, backslash or control character) is skipped.
export function parseDiff(out: string, root: string): Diffs {
  const files: Diffs = {}
  let lines: DiffLine[] | undefined, inHunk = false
  for (const raw of out.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      const both = raw.slice(11), n = (both.length - 5) / 2
      lines = Number.isInteger(n) && both.startsWith('a/') ? (files[`${root}/${both.slice(2, 2 + n)}`] = []) : undefined
      inHunk = false
      continue
    }
    if (!lines) continue
    if (raw.startsWith('@@')) { inHunk = true; lines.push({ kind: 'hunk', text: flat(raw) }); continue }
    // before the first hunk: index, mode and ---/+++ lines, none of which are content
    if (!inHunk) { if (raw.startsWith('Binary files ')) lines.push({ kind: 'note', text: 'Binary files differ' }); continue }
    const kind = ({ '+': 'add', '-': 'del', ' ': 'ctx', '\\': 'note' } as const)[raw[0] as '+']
    if (kind) lines.push({ kind, text: flat(raw) })
  }
  return files
}

// The unified hunks for the files the Diff tab lists, against the same base. Undefined when
// git cannot answer, so the tab keeps what it last had. A listed file git does not report is
// untracked (or ignored): its lines are all additions, read from disk up to 64 KB.
export async function readDiff(host: Host, repo: Repo | undefined, files: FileTouch[]): Promise<Diffs | undefined> {
  if (!repo) return undefined
  const under = files.filter(f => f.path.startsWith(repo.root + '/'))
  if (!under.length) return {}
  const r = await git(host, repo.root, ['diff', '-U3', '--no-renames', repo.base, '--', ...under.map(f => f.path.slice(repo.root.length + 1))])
  if (!r || r.exitCode !== 0) return undefined
  const out = parseDiff(r.stdout, repo.root)
  for (const f of under) {
    if (out[f.path]) continue
    const head = await host.run(['head', '-c', String(MAX_BYTES + 1), f.path]).catch(() => undefined)
    if (!head || head.exitCode !== 0) continue
    if (new TextEncoder().encode(head.stdout).length > MAX_BYTES) { out[f.path] = [{ kind: 'note', text: 'not shown: over 64 KB' }]; continue }
    const rows = head.stdout.split('\n')
    if (rows.at(-1) === '') rows.pop()
    if (!rows.length) continue
    out[f.path] = [{ kind: 'hunk', text: `@@ -0,0 +1${rows.length > 1 ? ',' + rows.length : ''} @@` }, ...rows.map((t): DiffLine => ({ kind: 'add', text: flat('+' + t) }))]
  }
  return out
}
