// The Guardrails tab: the rules a project sets for the agents working in it, read from where projects keep them
// (CLAUDE.md, AGENTS.md, rule folders, skills, agent definitions), and a default set ops-control can enforce. Each has a
// switch, kept per project: a default switched on is enforced (register.tsx's tool.check asks first or refuses the
// call); a project rule switched off is one Claude is told to disregard. JSX-free and engine-free.
import type { Host } from './host.ts'

export type Rule = { text: string; strong: boolean }
export type RuleFile = { path: string; rules: Rule[] }
export type DefaultRule = { label: string; state: 'default' | 'ask' | 'deny'; about: string }
export type Guardrails = { files: RuleFile[]; defaults?: DefaultRule[]; readAt: number }
// What the person switched, per project: the defaults switched on (by label) and the project rules switched off (ruleId).
export type GuardSwitches = { on: string[]; off: string[] }
export const NO_SWITCHES: GuardSwitches = { on: [], off: [] }
export const ruleId = (path: string, text: string) => `${path}#${text}`
// A default that changes what happens: one Claude Code decides on its own has nothing to switch.
export const switchable = (d: DefaultRule) => d.state !== 'default'

export function readSwitches(v: unknown): GuardSwitches {
  const o = v && typeof v === 'object' ? v as Record<string, unknown> : {}
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === 'string') : [])
  return { on: strings(o.on), off: strings(o.off) }
}

// Flips one switch: a default's label in `on`, a project rule's id in `off`.
export function toggle(sw: GuardSwitches, id: string, isDefault: boolean): GuardSwitches {
  const key = isDefault ? 'on' : 'off'
  const has = sw[key].includes(id)
  return { ...sw, [key]: has ? sw[key].filter(x => x !== id) : [...sw[key], id] }
}

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
  return { files, defaults: [...DEFAULT_RULES], readAt: now }
}

// A file Claude edits that is one of the sources: the tab reads them again.
export function isSource(path: string, root: string): boolean {
  const base = root.replace(/[\\/]+$/, '')
  if (!path.startsWith(base + '/')) return false
  const rel = path.slice(base.length + 1)
  return SOURCES.some(s => (s.ending || s.nested ? rel.startsWith(s.path + '/') : rel === s.path))
}

// The default a tool call falls under, the strictest first: a command is read whole, so `cd x && git push` is a push.
// Undefined for a call none of them covers.
const SHELL: readonly [string, RegExp][] = [
  ['Dangerous commands', /\brm\s+-[a-z]*r[a-z]*f?[a-z]*\s+(\/|~|\$HOME|\.)(\s|$|\/\*)|\bmkfs\b|\bdd\b[^|]*\bof=\/dev\/|\b(shutdown|reboot|halt|poweroff)\b|\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z)?sh\b/i],
  ['Force push & resets', /\bgit\s+push\b[^;&|]*\s(--force(-with-lease)?|-f)\b|\bgit\s+reset\s+--hard\b|\bgit\s+clean\s+-[a-z]*f|\bgit\s+branch\s+-D\b/],
  ['Git push', /\bgit\s+push\b/],
  ['Deploy & publish', /\b(npm|pnpm|yarn)\s+publish\b|\bdocker\s+push\b|\bvercel\b|\bnetlify\s+deploy\b|\bfly(ctl)?\s+deploy\b|\bkubectl\s+(apply|rollout)\b|\bterraform\s+apply\b|\bgh\s+release\s+create\b|\bcargo\s+publish\b|\btwine\s+upload\b|\bdeploy\b/i],
  ['Package installs', /\b(npm|pnpm|yarn|bun)\s+(install|i|add|ci)\b|\bpip3?\s+install\b|\buv\s+(add|pip\s+install)\b|\bcargo\s+(install|add)\b|\bgo\s+(get|install)\b|\bgem\s+install\b|\bbrew\s+install\b|\bapt(-get)?\s+install\b|\bwinget\s+install\b|\bcomposer\s+(require|install)\b|\bnpx\s+(-y|--yes)\b|\buvx\b/i],
  ['Downloads', /\bcurl\b[^|;&]*\s(-o|-O|--output|--remote-name)\b|\bwget\b/],
  ['Deleting files', /(^|[;&|]\s*|\s)(rm|rmdir|unlink|shred)\s|\bgit\s+rm\b/],
]
const EDITS = ['Edit', 'Write', 'NotebookEdit', 'MultiEdit']

export function categoryOf(tool: string, input: unknown, root: string): string | undefined {
  const o = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  if (tool === 'Bash' && typeof o.command === 'string') return SHELL.find(([, re]) => re.test(o.command as string))?.[0]
  if (EDITS.includes(tool)) {
    const path = typeof o.file_path === 'string' ? o.file_path : typeof o.notebook_path === 'string' ? o.notebook_path : ''
    const base = root.replace(/[\\/]+$/, '')
    if (path && base && path.startsWith('/') && !(path === base || path.startsWith(base + '/'))) return 'Edits outside project'
  }
  return undefined
}

// What an enforced default answers a call it covers: ask the person first, or refuse it.
export function verdictFor(tool: string, input: unknown, root: string, sw: GuardSwitches): { decision: 'ask' | 'deny'; reason: string } | undefined {
  const label = categoryOf(tool, input, root)
  const rule = label && sw.on.includes(label) ? DEFAULT_RULES.find(d => d.label === label && switchable(d)) : undefined
  if (!rule) return undefined
  return rule.state === 'deny'
    ? { decision: 'deny', reason: `Ops Control guardrail "${rule.label}" is on: ${rule.about} is not allowed in this project. Ask the person to switch it off in the Guardrails tab if it is needed.` }
    : { decision: 'ask', reason: `Ops Control guardrail "${rule.label}" is on: ${rule.about} needs your approval.` }
}

// What Claude is told about the project rules switched off: none, or one note listing them.
export function offNote(g: Guardrails | undefined, sw: GuardSwitches): string | undefined {
  const off = (g?.files ?? []).flatMap(f => f.rules.filter(r => sw.off.includes(ruleId(f.path, r.text))).map(r => `- ${r.text} (${f.path})`))
  if (!off.length) return undefined
  return ['The person switched these project rules off in the Ops Control Guardrails tab. Disregard them for this project until they are switched back on:', ...off].join('\n')
}
