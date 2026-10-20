import type { Host } from './host.ts'
import type { PlanItem } from './events.ts'

const MAX_FILES = 200
const MAX_BYTES = 64 * 1024
const STATUSES = ['pending', 'in_progress', 'completed']

// Claude Code names a project's task list after its directory: every character
// outside [A-Za-z0-9] becomes '-', and the leading '-' of an absolute path is dropped
// (/home/u/.claude/tasks/home-u-Projects for /home/u/Projects).
export const cwdSlug = (cwd: string) => cwd.replace(/[^A-Za-z0-9]/g, '-').replace(/^-+/, '')

// CLAUDE_CODE_TASK_LIST_ID names the list when set. The id becomes a directory
// name, so anything that could leave tasks/ is refused.
export function taskListId(envId: string | undefined, cwd: string): string {
  if (envId && /^[\w.-]+$/.test(envId) && envId !== '.' && envId !== '..') return envId
  return cwdSlug(cwd)
}

const text = (v: unknown) => (typeof v === 'string' ? v : '')

// Reads ${configDir}/tasks/<id>/*.json. Deleted tasks, malformed files and anything
// oversized are skipped; the result is sorted by task id.
export async function loadTasks(host: Host, id: string): Promise<PlanItem[]> {
  if (!id) return []
  const dir = `${host.configDir}/tasks/${id}`
  let names: string[]
  // Newest ids first: the in-progress task is usually the latest. The size comes from the
  // listing, so an oversized file costs no read and no slot.
  const fileId = (n: string) => { const v = Number(n.replace(/\.json$/, '')); return Number.isNaN(v) ? -1 : v }
  try {
    names = (await host.listFiles(dir)).filter(f => f.name.endsWith('.json') && f.size <= MAX_BYTES).map(f => f.name)
      .sort((a, b) => fileId(b) - fileId(a)).slice(0, MAX_FILES)
  } catch { return [] }
  const read = await Promise.all(names.map(async (n): Promise<PlanItem | undefined> => {
    try {
      const raw = await host.readFile(`${dir}/${n}`)
      const j = JSON.parse(raw) as Record<string, unknown>
      const status = text(j.status), title = text(j.subject)
      if (!title || !STATUSES.includes(status)) return undefined
      const active = text(j.activeForm)
      return { id: text(j.id) || n.replace(/\.json$/, ''), title, status: status as PlanItem['status'], ...(active ? { active } : {}) }
    } catch { return undefined }
  }))
  const idNum = (p: PlanItem) => Number(p.id)
  return read.filter((p): p is PlanItem => p !== undefined).sort((a, b) => (idNum(a) - idNum(b)) || a.id.localeCompare(b.id))
}

export const DONE_SHOWN = 3

// In progress first, then pending, then the last few done, each group in id order.
export function planOrder(plan: PlanItem[]): { items: PlanItem[]; hiddenDone: number } {
  const by = (s: PlanItem['status']) => plan.filter(p => p.status === s)
  const done = by('completed')
  return { items: [...by('in_progress'), ...by('pending'), ...done.slice(-DONE_SHOWN)], hiddenDone: Math.max(0, done.length - DONE_SHOWN) }
}
