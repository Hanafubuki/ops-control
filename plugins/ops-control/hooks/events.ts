export type Kind = 'read' | 'search' | 'edit' | 'shell' | 'agent' | 'plan' | 'other'
export type ToolStart = { kind: Kind; label: string; file?: string; command?: string; isTest: boolean }
export type PlanItem = { id: string; title: string; status: 'pending' | 'in_progress' | 'completed'; active?: string }

export const shortPath = (p: string) => p.split('/').filter(Boolean).slice(-2).join('/')
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const lines = (s: string) => (s === '' ? 0 : s.replace(/\n$/, '').split('\n').length)

// Runner words that mean "this command runs tests". A command matches when one of
// its && / ; / | separated parts starts with a runner (after env assignments).
const RUNNERS = [
  /^(npm|pnpm|yarn|bun)\s+(run\s+)?tests?\b/, /^(npx\s+|pnpm\s+exec\s+|bunx\s+)?(vitest|jest|mocha|ava)\b/,
  /^(python3?\s+-m\s+)?pytest\b/, /^go\s+test\b/, /^cargo\s+(test|nextest)\b/, /^mix\s+test\b/,
  /^(bundle\s+exec\s+)?rspec\b/, /^make\s+test\b/, /^(\.\/gradlew|gradle)\s+test\b/, /^mvn\s+test\b/,
]
export function isTestCommand(command: string): boolean {
  return command.split(/&&|;|\|\|?/).map(p => p.trim().replace(/^(\w+=\S+\s+)+/, '')).some(p => RUNNERS.some(r => r.test(p)))
}

export function testOutcome(text: string, isError: boolean): { passed: boolean; summary: string } {
  // Jest and vitest print a suite/file summary before the tests line, so the
  // first "N passed" in the text can be the suite count.
  const scope = /^[ \t]*Tests:?[ \t]+.*$/m.exec(text)?.[0] ?? text
  const last = (re: RegExp) => Number([...scope.matchAll(re)].at(-1)?.[1] ?? NaN)
  // jest/pytest/vitest "N failed", mocha "N failing", node's runner "# fail N" / "ℹ fail N"
  const failed = [last(/(\d+)\s+(?:failed|failing)/g), last(/^[ \t]*[#ℹ][ \t]*fail[ \t]+(\d+)/gm)].find(n => !Number.isNaN(n)) ?? NaN
  const passedN = [last(/(\d+)\s+(?:passed|passing)/g), last(/^[ \t]*[#ℹ][ \t]*pass[ \t]+(\d+)/gm)].find(n => !Number.isNaN(n)) ?? NaN
  // A piped run (`npm test | tail`) hides the exit code, so failure text counts too.
  const failText = /^[ \t]*(?:not ok\b|FAIL\b)/m.test(text)
  if (isError || failed > 0 || failText) return { passed: false, summary: failed > 0 ? `${failed} test${failed === 1 ? '' : 's'} failed` : 'tests failed' }
  return { passed: true, summary: passedN > 0 ? `${passedN}/${passedN} tests passing` : 'tests passing' }
}

export function describeTool(tool: string, input: Record<string, unknown>): ToolStart {
  const file = str(input.file_path) || str(input.notebook_path)
  switch (tool) {
    case 'Read': return { kind: 'read', label: `Reading ${shortPath(file)}`, file, isTest: false }
    case 'Grep': return { kind: 'search', label: `Searching "${str(input.pattern)}"`, isTest: false }
    case 'Glob': return { kind: 'search', label: `Finding ${str(input.pattern)}`, isTest: false }
    case 'Edit': case 'NotebookEdit': return { kind: 'edit', label: `Editing ${shortPath(file)}`, file, isTest: false }
    case 'Write': return { kind: 'edit', label: `Writing ${shortPath(file)}`, file, isTest: false }
    case 'Bash': {
      // the call's own description says what it does in plain words ("Show working tree status"); the command is the fallback
      const command = str(input.command), said = str(input.description).replace(/\s+/g, ' ').trim()
      return { kind: 'shell', label: said ? said.slice(0, 80) : `Running ${command.split('\n')[0]!.slice(0, 48)}`, command, isTest: isTestCommand(command) }
    }
    case 'Agent': return { kind: 'agent', label: `Started subagent: ${str(input.description) || str(input.name) || 'agent'}`, isTest: false }
    case 'TodoWrite': case 'TaskCreate': case 'TaskUpdate': return { kind: 'plan', label: 'Updating the plan', isTest: false }
    default: return { kind: 'other', label: tool.startsWith('mcp__') ? tool.split('__').slice(1).join(' ') : tool, isTest: false }
  }
}

export const approvalLabel = (tool: string, input: Record<string, unknown>) =>
  tool === 'Bash' ? `approve ${str(input.command).split('\n')[0]!.slice(0, 40)}` : `approve ${tool}`

// The PermissionRequest hook runs on the path that opens the dialog, and it carries the
// session's permission mode. Only these modes put the dialog in front of a person; an
// absent or new mode name counts as no one, because a false alert costs more than a late one.
const ASKING_MODES = ['default', 'acceptEdits', 'plan']
export const modeAsksPerson = (mode: string | undefined) => mode !== undefined && ASKING_MODES.includes(mode)

// Which in-flight call a dialog is for. PermissionRequest carries no tool_use_id, so match on
// tool and input; a rewritten input still matches when only one call of that tool is in flight.
export function dialogCall(flying: ReadonlyMap<string, { tool: string; input: unknown }>, tool: string, input: unknown): string | undefined {
  const same = [...flying].filter(([, c]) => c.tool === tool)
  const exact = same.filter(([, c]) => JSON.stringify(c.input) === JSON.stringify(input))
  return (exact.length === 1 ? exact : same.length === 1 ? same : [])[0]?.[0]
}

const active = (v: unknown, keep?: string) => { const s = str(v) || keep; return s ? { active: s } : {} }

export function planFrom(tool: string, input: Record<string, unknown>, prev: PlanItem[], resultId?: string): PlanItem[] | undefined {
  if (tool === 'TodoWrite') {
    const todos = Array.isArray(input.todos) ? input.todos as { content?: unknown; status?: unknown }[] : []
    return todos.map((t, i) => ({ id: String(i), title: str(t.content), status: (['pending', 'in_progress', 'completed'].includes(str(t.status)) ? t.status : 'pending') as PlanItem['status'], ...active((t as { activeForm?: unknown }).activeForm) }))
  }
  if (tool === 'TaskCreate') return [...prev, { id: resultId ?? String(prev.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0) + 1), title: str(input.subject), status: 'pending', ...active(input.activeForm) }]
  if (tool === 'TaskUpdate') {
    const id = str(input.taskId), status = str(input.status)
    if (status === 'deleted') return prev.filter(p => p.id !== id)
    return prev.map(p => p.id !== id ? p : { ...p, title: str(input.subject) || p.title, status: (['pending', 'in_progress', 'completed'].includes(status) ? status : p.status) as PlanItem['status'], ...active(input.activeForm, p.active) })
  }
  return undefined
}

export function editCounts(tool: string, input: Record<string, unknown>): { add: number; del: number } | undefined {
  if (tool === 'Edit') return { add: lines(str(input.new_string)), del: lines(str(input.old_string)) }
  if (tool === 'Write') return { add: lines(str(input.content)), del: 0 }
  return undefined
}
