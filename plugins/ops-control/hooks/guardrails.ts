// The Guardrails tab: the rules a project sets for the agents working in it, read from where projects keep them
// (CLAUDE.md, AGENTS.md, rule folders, skills, agent definitions), or, when it keeps none, a default set. ops-control
// shows them; it enforces none of them. JSX-free and engine-free: the reading is plain text in, rules out.
import type { Host } from './host.ts'

export type Rule = { text: string; strong: boolean }
export type RuleFile = { path: string; rules: Rule[] }
export type DefaultRule = { label: string; state: 'default' | 'ask' | 'deny'; about: string }
export type Guardrails = { files: RuleFile[]; defaults?: DefaultRule[]; readAt: number }

// Where a project keeps instructions for agents, from its root; a folder entry takes the files in it with that ending.
export const SOURCES: readonly { path: string; ending?: string; nested?: string }[] = [
  { path: 'CLAUDE.md' }, { path: 'CLAUDE.local.md' }, { path: '.claude/CLAUDE.md' }, { path: 'AGENTS.md' }, { path: 'GUARDRAILS.md' },
  { path: '.claude/rules', ending: '.md' }, { path: '.claude/agents', ending: '.md' }, { path: '.claude/skills', nested: 'SKILL.md' },
  { path: 'agent_rules', ending: '.md' }, { path: '.agent_rules', ending: '.md' }, { path: '.agents/rules', ending: '.md' },
  { path: '.cursorrules' }, { path: '.cursor/rules', ending: '.mdc' }, { path: '.github/copilot-instructions.md' }, { path: '.windsurfrules' },
]
const MAX_FILES = 40, MAX_PER_FILE = 30, MAX_RULES = 150, MAX_TEXT = 220, MAX_BYTES = 256 * 1024

// The words that make a sentence a rule, and the ones that make it a hard one.
const STRONG = /\b(must( not)?|never|always|do not|don'?t|forbidden|prohibited|required|mandatory|only ever|under no circumstances)\b/i
const SOFT = /\b(should( not)?|avoid|prefer|make sure|ensure|no more than|at most|at least|only)\b/i
// A heading over a list of rules: everything listed under it counts.
const RULE_HEADING = /\b(rules?|guardrails?|constraints?|polic(y|ies)|don'?ts|do'?s|safety|must|never|requirements?|conventions?|restrictions?|boundaries|limits?)\b/i

const clip = (s: string) => (s.length > MAX_TEXT ? s.slice(0, MAX_TEXT - 1) + '…' : s)
const plain = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim()

// The rules in one file: list items under a rules heading, and anywhere a line or list item that says must, never,
// always, should and the like. Code, tables, front matter and headings are not read as rules.
export function rulesIn(text: string): Rule[] {
  const out: Rule[] = []
  const add = (s: string) => {
    const t = clip(plain(s))
    if (t.length < 6 || out.some(r => r.text === t) || out.length >= MAX_PER_FILE) return
    out.push({ text: t, strong: STRONG.test(t) })
  }
  let fence = false, front = false, underRules = false
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  lines.forEach((raw, i) => {
    const line = raw.trim()
    if (i === 0 && line === '---') { front = true; return }
    if (front) { if (line === '---') front = false; return }
    if (/^(```|~~~)/.test(line)) { fence = !fence; return }
    if (fence || !line || line.startsWith('|') || line.startsWith('<')) return
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (heading) { underRules = RULE_HEADING.test(heading[1]!); return }
    const item = /^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/.exec(line)
    const body = item ? item[1]! : line.replace(/^>\s?/, '')
    if (item && underRules) return add(body)
    for (const sentence of plain(body).split(/(?<=[.!?])\s+(?=[A-Z"'(`*])/)) if (STRONG.test(sentence) || (item && SOFT.test(sentence))) add(sentence)
  })
  return out
}

// What a project with no guardrails of its own is shown: the same categories and defaults as Control Room's
// permission policy (installs, network, edits, git, deploys, dangerous commands).
export const DEFAULT_RULES: readonly DefaultRule[] = [
  { label: 'Project edits', state: 'default', about: 'Editing files inside the project' },
  { label: 'Edits outside project', state: 'ask', about: 'Editing files outside the project folder' },
  { label: 'Deleting files', state: 'ask', about: 'rm, deletes and moves to nowhere' },
  { label: 'Network access', state: 'default', about: 'Web fetches and searches, curl, wget' },
  { label: 'Downloads', state: 'ask', about: 'Fetching files or archives onto the machine' },
  { label: 'Package installs', state: 'ask', about: 'npm, pnpm, yarn, pip, uv, cargo, go, gem, brew, apt, winget; npx -y, uvx' },
  { label: 'Git commits', state: 'default', about: 'git commit' },
  { label: 'Git push', state: 'ask', about: 'git push' },
  { label: 'Force push & resets', state: 'deny', about: 'git push --force, reset --hard, clean -fd, branch -D' },
  { label: 'Deploy & publish', state: 'ask', about: 'Deploys, releases, npm publish, docker push' },
  { label: 'Dangerous commands', state: 'deny', about: 'Recursive deletes of root, home or the project, disk formatting, dd to devices, shutdown, a download piped into a shell' },
]
export const STATE_WORD: Record<DefaultRule['state'], string> = { default: 'Claude Code decides', ask: 'Ask first', deny: 'Never' }

// Reads every source under root. A file that is missing, too big or unreadable is skipped.
export async function readGuardrails(host: Pick<Host, 'exists' | 'listDir' | 'readFile'>, root: string, now: number): Promise<Guardrails> {
  const base = root.replace(/[\\/]+$/, ''), paths: string[] = []
  for (const s of SOURCES) {
    const at = `${base}/${s.path}`
    if (!(await host.exists(at).catch(() => false))) continue
    if (!s.ending && !s.nested) { paths.push(s.path); continue }
    const names = (await host.listDir(at).catch(() => [] as string[])).sort()
    for (const n of names) {
      if (s.ending && n.endsWith(s.ending)) paths.push(`${s.path}/${n}`)
      if (s.nested && (await host.exists(`${at}/${n}/${s.nested}`).catch(() => false))) paths.push(`${s.path}/${n}/${s.nested}`)
    }
  }
  const files: RuleFile[] = []
  let total = 0
  for (const p of paths.slice(0, MAX_FILES)) {
    const text = await host.readFile(`${base}/${p}`).catch(() => '')
    if (!text || text.length > MAX_BYTES) continue
    const rules = rulesIn(text).slice(0, MAX_RULES - total)
    if (!rules.length) continue
    files.push({ path: p, rules })
    total += rules.length
    if (total >= MAX_RULES) break
  }
  return { files, ...(!files.length && { defaults: [...DEFAULT_RULES] }), readAt: now }
}

// A file Claude edits that is one of the sources: the tab reads them again.
export function isSource(path: string, root: string): boolean {
  const base = root.replace(/[\\/]+$/, '')
  if (!path.startsWith(base + '/')) return false
  const rel = path.slice(base.length + 1)
  return SOURCES.some(s => (s.ending || s.nested ? rel.startsWith(s.path + '/') : rel === s.path))
}
