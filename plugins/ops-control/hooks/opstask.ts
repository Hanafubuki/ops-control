// /opstask: Claude works on a request, then files the result as a Sidequest ticket in SQ-1's format
// (Background, numbered steps with commands, labels, manual verify). Typed mid-turn like /btw, it picks
// the board at once and queues the work as a turn of its own once the session is idle.
import type { EngineInterface, Register } from 'claude-code'

type Engine = EngineInterface
type On = Parameters<Register>[0]
export type Category = { id: string; name: string; description: string }

// The sidequest plugin's MCP server, as its tool names spell it (mcp__plugin_sidequest_board__add).
const SERVER = 'plugin_sidequest_board'
const SERVER_TOOL = `mcp__${SERVER}__add`
const MAX_TITLE = 80
const NOT_A_BOARD = /not a project root/i
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

// The first JSON object an MCP result's text blocks hold, or undefined.
export function jsonOf(r: { content?: { type: string; text?: string }[] }): any {
  for (const b of r.content ?? []) {
    if (b.type !== 'text' || !b.text) continue
    try { return JSON.parse(b.text) } catch { /* not JSON: the next block */ }
  }
  return undefined
}

const errorOf = (r: { content?: { type: string; text?: string }[] }) =>
  oneLine((r.content ?? []).map(b => b.text ?? '').join(' ')) || 'no reason given'

// The folder's last path segment: the name proposed for a new board there.
export const proposedBoardName = (cwd: string) => cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'board'

async function boardCategories($: Engine, project: string): Promise<Category[]> {
  const cats = await $.mcp.call(SERVER, 'category_list', { project, limit: 100 })
  return cats.isError ? [] : jsonOf(cats)?.categories ?? []
}

// Registers the session's folder as a new board under `name`; a string when Sidequest refused.
async function createBoard($: Engine, name: string): Promise<{ project: string; categories: Category[] } | string> {
  const cwd = await $.session.cwd()
  const created = await $.mcp.call(SERVER, 'board_config', { project: cwd, name })
  if (created.isError) return `Board not created: ${errorOf(created)}`
  const project = jsonOf(created)?.name ?? name
  $.ui.toast(`Created Sidequest board ${project}`)
  return { project, categories: await boardCategories($, project) }
}

// This folder's board, or the one the person picks or creates; a string when there is none to file on.
async function pickBoard($: Engine): Promise<{ project?: string; categories: Category[] } | string> {
  const here = await $.mcp.call(SERVER, 'category_list', { limit: 100 })
  if (!here.isError) return { categories: jsonOf(here)?.categories ?? [] }
  if (!NOT_A_BOARD.test(errorOf(here))) return `Sidequest refused: ${errorOf(here)}`
  const listed = await $.mcp.call(SERVER, 'projects', {})
  const boards: { name: string; slug: string; lastActivity?: string }[] = jsonOf(listed)?.projects ?? []
  const proposed = proposedBoardName(await $.session.cwd())
  const create = `Create board "${proposed}"`
  // At most 4 options: create, the two most recent boards, cancel. A name typed under "Other" files on that board, or creates it.
  const recent = [...boards].sort((a, b) => String(b.lastActivity ?? '').localeCompare(String(a.lastActivity ?? ''))).slice(0, 2)
  const options = [create, ...recent.map(b => b.name), 'Cancel']
  let picked: string
  try { picked = (await $.ui.ask('This folder has no Sidequest board. What should we do?', { options, header: 'opstask' })).trim() } catch { return 'Not filed.' }
  if (!picked || picked === 'Cancel') return 'Not filed.'
  if (picked === create) return createBoard($, proposed)
  const board = boards.find(b => b.name === picked || b.slug === picked)
  if (!board) return createBoard($, picked)
  return { project: board.name, categories: await boardCategories($, board.name) }
}

export function workPrompt(request: string, project: string | undefined, categories: Category[]): string {
  const board = project ? `the "${project}" board (pass project: "${project}")` : "this folder's board (no project argument)"
  return [
    'Do the request below yourself now, in this session: read the code, run read-only checks, and work out the actual answer. Do not delegate it to a ticket.',
    `When it is done, file the result as one Sidequest ticket with ${SERVER_TOOL} on ${board}, in the same format as SQ-1:`,
    `- title: a short imperative summary of the work the ticket asks for, at most ${MAX_TITLE} characters`,
    '- description: markdown that stands on its own for whoever picks it up. Start with "## Background" (bullets: what this is about, versions, servers, paths, env keys; the facts you verified). Then numbered sections "## 1. <step>", "## 2. <step>", … each with a one-line purpose, the exact commands or SQL in fenced blocks, and what a correct outcome looks like. Mark anything unconfirmed as unconfirmed. Code names in backticks.',
    '- labels: a few short lowercase tags (area, ticket ids such as WP-1234, "manual" for hand-run steps)',
    '- priority: low, normal, high or urgent',
    '- why: one or two sentences on why the steps are needed now',
    '- verifyKind and verify: "manual" with the observable outcome that proves the steps worked, when a person runs them; otherwise the kind that fits',
    '- readonly: true when the ticket only asks for checks, documentation or hand-run steps',
    ...(categories.length ? ['- category: the id below whose description fits, left out when none does:', ...categories.map(c => `  - ${c.id}: ${clip(oneLine(c.description || c.name), 240)}`)] : []),
    'Then reply in a few lines: what you found, and the ticket ref and title.',
    '',
    '<request>',
    request,
    '</request>',
  ].join('\n')
}

export async function runTask($: Engine, args: string): Promise<string> {
  const request = args.trim()
  if (!request) return 'Usage: /opstask <what you want done>'
  try {
    const board = await pickBoard($)
    if (typeof board === 'string') return board
    // Submitted from inside command.run it would wait on the turn the hook holds: queue it once the hook returned.
    const text = workPrompt(request, board.project, board.categories)
    void $.clock.sleep(50).then(() => $.prompt.submit({ text })).catch(err => $.ui.toast(`/opstask not started: ${err instanceof Error ? err.message : String(err)}`))
    return `Claude works on it next, then files the ticket${board.project ? ` on ${board.project}` : ''}: ${clip(oneLine(request), MAX_TITLE)}`
  } catch (err) {
    return `Not started: ${err instanceof Error ? err.message : String(err)}`
  }
}

// From ops-control's session.start.
export async function startOpstask($: Engine) {
  await $.command.register({ name: 'opstask', description: 'Claude does the request, then files the result as a Sidequest task', argumentHint: '<what you want done>', immediate: true })
}

export function wireOpstask(on: On, off: () => boolean) {
  on('command.run', { command: 'opstask' }, async ($, e, next) => {
    if (off()) return next(e)
    return { text: await runTask($, e.args) }
  })
}
