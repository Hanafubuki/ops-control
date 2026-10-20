// The Sessions page: every Claude Code session and what was asked in it, as ~/.claude/sidequest-sessions/build.mjs
// writes it (served under /sessions-data). The shapes and words follow glowup's Plan tab.

export type MilestoneStatus = 'pending' | 'in_progress' | 'verifying' | 'waiting' | 'blocked' | 'completed' | 'failed' | 'skipped';
export type Milestone = { title: string; status: MilestoneStatus; doing?: string; evidence?: string; blocker?: string };
export type RequestStatus = 'pending' | 'in_progress' | 'completed' | 'interrupted' | 'failed';
export type TurnReason = 'answer' | 'aborted' | 'error' | 'refusal';

export interface SessionRequest {
  id: string;
  n: number;
  text: string;
  status: RequestStatus;
  at: number;
  startedAt?: number;
  endedAt?: number;
  foldedInto?: string;
  command?: boolean;
  turns: { answer: string; reason: TurnReason; durationMs: number; endedAt: number }[];
  files: { path: string; add: number; del: number; how: 'edit' | 'new' }[];
  commands: string[];
  commandCount: number;
  commits: number;
  test?: { passed: boolean; summary: string };
  agents: { name: string; task: string }[];
  tasks: { id: string; title: string; status: 'pending' | 'in_progress' | 'completed' }[];
  tools: number;
  objective?: string;
  milestones: Milestone[];
  milestonesFrom?: 'milestones' | 'progress';
  asked: { question: string; answer?: string }[];
  followUps?: { questions: string[]; actions: string[] };
  // set while the request's turn runs: when that turn started
  runningSince?: number;
}

export interface MarkdownFile { path: string; name: string; request: number; exists: boolean; href?: string }

export interface Session {
  format: number;
  id: string;
  name: string;
  project: string;
  cwd: string;
  branch: string;
  startedAt: number;
  updatedAt: number;
  live: boolean;
  costUsd?: number;
  version: string;
  from: 'glowup' | 'transcript';
  requests: SessionRequest[];
  markdown: MarkdownFile[];
}

export interface SessionSummary {
  id: string;
  name: string;
  project: string;
  cwd: string;
  branch: string;
  startedAt: number;
  updatedAt: number;
  live: boolean;
  requests: number;
  done: number;
  working: number;
  lastPrompt: string;
  markdown: number;
  costUsd?: number;
  from: 'glowup' | 'transcript';
}

export interface SessionIndex { format: number; generatedAt: number; sessions: SessionSummary[] }

export const DATA_ROOT = '/sessions-data';

async function getJson<T>(path: string, fetcher: typeof fetch): Promise<T> {
  const response = await fetcher(`${DATA_ROOT}/${path}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(response.status === 404 ? 'not built yet' : `HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export const loadIndex = (fetcher: typeof fetch = fetch) => getJson<SessionIndex>('index.json', fetcher);
export const loadSession = (id: string, fetcher: typeof fetch = fetch) => getJson<Session>(`sessions/${encodeURIComponent(id)}.json`, fetcher);

// A markdown file a session created, as text; its href is under the data root.
export async function loadMarkdown(href: string, fetcher: typeof fetch = fetch): Promise<string> {
  if (!href.startsWith('sessions-data/files/')) throw new Error('not a session file');
  const response = await fetcher(`/${href}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(response.status === 404 ? 'the file is gone' : `HTTP ${response.status}`);
  return response.text();
}

export const STATUS_WORD: Record<RequestStatus, string> = { pending: 'queued', in_progress: 'working', completed: 'done', interrupted: 'interrupted', failed: 'stopped' };
export const STATUS_MARK: Record<RequestStatus, string> = { pending: '○', in_progress: '◉', completed: '✓', interrupted: '■', failed: '✗' };
export const MILESTONE_MARK: Record<MilestoneStatus, string> = { pending: '○', in_progress: '◉', verifying: '◎', waiting: '◌', blocked: '!', completed: '✓', failed: '✗', skipped: '–' };
export const MILESTONE_WORD: Record<MilestoneStatus, string> = { pending: 'pending', in_progress: 'in progress', verifying: 'verifying', waiting: 'waiting', blocked: 'blocked', completed: 'done', failed: 'failed', skipped: 'skipped' };

export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export function relativeTime(at: number, now = Date.now()): string {
  if (!at) return '';
  const s = Math.round((now - at) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(at).toLocaleDateString();
}

export const requestTitle = (r: Pick<SessionRequest, 'text'>) => (r.text.split('\n').find((line) => line.trim()) ?? '').replace(/\s+/g, ' ').trim();
// Every finished turn, plus the running one's time so far.
export const workedMs = (r: SessionRequest, now = Date.now()) =>
  r.turns.reduce((sum, turn) => sum + turn.durationMs, 0) + (r.status === 'in_progress' && r.runningSince ? Math.max(0, now - r.runningSince) : 0);

// The steps a request shows: the milestones Claude reported, else its task-list tasks. A prompt taken into another
// request's turn has none of its own: that turn's are the work done for it, so it shows them (from names that request).
export function stepsOf(r: SessionRequest, all: readonly SessionRequest[] = []): { steps: Milestone[]; fromTasks: boolean; from?: SessionRequest } {
  if (r.milestones.length) return { steps: r.milestones, fromTasks: false };
  const host = r.foldedInto ? all.find((x) => x.id === r.foldedInto) : undefined;
  if (host && !r.tasks.length) {
    const h = stepsOf(host, all);
    if (h.steps.length) return { ...h, from: host };
  }
  return { steps: r.tasks.map((task) => ({ title: task.title, status: task.status })), fromTasks: r.tasks.length > 0 };
}

// The milestone the work is at: the one running, else one being checked, waiting or blocked.
export function currentMilestone(steps: readonly Milestone[]): number {
  for (const status of ['in_progress', 'verifying', 'waiting', 'blocked'] as const) {
    const index = steps.findIndex((step) => step.status === status);
    if (index >= 0) return index;
  }
  return -1;
}

// Where a request stands, in a line: its status word and the milestone it is at.
export function standing(r: SessionRequest, all: readonly SessionRequest[] = [], now = Date.now()): string {
  const { steps } = stepsOf(r, all);
  const at = currentMilestone(steps), done = steps.filter((step) => step.status === 'completed').length;
  const where = !steps.length ? '' : at >= 0 ? ` · milestone ${at + 1} of ${steps.length}` : ` · ${done} of ${steps.length} milestones done`;
  return `${STATUS_WORD[r.status]} · ${duration(workedMs(r, now))}${where}`;
}

// What is left to the person: questions asked during the work (with the answers given), the questions the last
// answer puts, and action items (blocked milestones, then the steps the answer gives).
export function forYou(r: SessionRequest, all: readonly SessionRequest[] = []) {
  const { steps } = stepsOf(r, all);
  const blocked = steps.filter((step) => step.status === 'blocked').map((step) => `${step.title}${step.blocker ? ` — ${step.blocker}` : ''}`);
  const questions = r.followUps?.questions ?? [];
  const actions = [...blocked, ...(r.followUps?.actions ?? [])];
  return { asked: r.asked, questions, actions, empty: !r.asked.length && !questions.length && !actions.length };
}

export const projectLabel = (s: Pick<SessionSummary, 'cwd' | 'project'>) =>
  (s.cwd || s.project.replace(/^-/, '/').replace(/-/g, '/')).split(/[\\/]+/).filter(Boolean).slice(-2).join(' / ');

export function filterSessions(list: readonly SessionSummary[], query: string): SessionSummary[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...list];
  return list.filter((s) => {
    const hay = `${s.name} ${s.id} ${s.cwd} ${s.project} ${s.branch} ${s.lastPrompt}`.toLowerCase();
    return words.every((word) => hay.includes(word));
  });
}

export const totals = (r: SessionRequest) => ({ add: r.files.reduce((n, f) => n + f.add, 0), del: r.files.reduce((n, f) => n + f.del, 0) });

// The markdown files a request created, by path, so its file list can link them.
export const markdownByPath = (session: Pick<Session, 'markdown'>) => new Map(session.markdown.filter((file) => file.href).map((file) => [file.path, file]));
