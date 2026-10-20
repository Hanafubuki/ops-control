import { describe, expect, it, vi } from 'vitest';
import { currentMilestone, duration, filterSessions, forYou, loadIndex, loadMarkdown, markdownByPath, projectLabel, relativeTime, requestTitle, standing, stepsOf, type SessionRequest, type SessionSummary } from '../app/src/lib/sessions/model';

const request = (over: Partial<SessionRequest> = {}): SessionRequest => ({
  id: 'r1-0', n: 1, text: 'fix the login bug\nin auth.ts', status: 'completed', at: 0, turns: [{ answer: 'Done.', reason: 'answer', durationMs: 65_000, endedAt: 1 }],
  files: [], commands: [], commandCount: 0, commits: 0, agents: [], tasks: [], tools: 3, milestones: [], asked: [], ...over
});
const summary = (over: Partial<SessionSummary> = {}): SessionSummary => ({
  id: '1fec4bcb-0626-49c1-82ba-edcf59ffec3b', name: 'Glowup plugin task list retrieval', project: '-mnt-c-Users-me-Keys', cwd: '/mnt/c/Users/me/Keys', branch: 'main',
  startedAt: 0, updatedAt: 0, live: false, requests: 3, done: 2, working: 1, lastPrompt: 'add a context tab', markdown: 0, from: 'transcript', ...over
});

describe('sessions model', () => {
  it('words a duration and a time ago as glowup does', () => {
    expect([duration(4_000), duration(65_000), duration(3_725_000)]).toEqual(['4s', '1m 05s', '1h 02m']);
    expect(relativeTime(0)).toBe('');
    expect(relativeTime(1_000_000, 1_010_000)).toBe('just now');
    expect(relativeTime(1_000_000, 1_000_000 + 5 * 60_000)).toBe('5 min ago');
    expect(relativeTime(1_000_000, 1_000_000 + 3 * 3_600_000)).toBe('3 h ago');
  });

  it('shows the milestones Claude reported, else the tasks, and finds the one at work', () => {
    const ms = [{ title: 'Build', status: 'completed' as const }, { title: 'Sign', status: 'blocked' as const, blocker: 'needs the key' }, { title: 'Ship', status: 'in_progress' as const, doing: 'uploading' }];
    expect(currentMilestone(ms)).toBe(2);
    expect(currentMilestone([{ title: 'a', status: 'completed' }])).toBe(-1);
    expect(stepsOf(request({ milestones: ms }))).toEqual({ steps: ms, fromTasks: false });
    expect(stepsOf(request({ tasks: [{ id: '1', title: 'T', status: 'completed' }] }))).toEqual({ steps: [{ title: 'T', status: 'completed' }], fromTasks: true });
    expect(standing(request({ milestones: ms, status: 'in_progress' }))).toBe('working · 1m 05s · milestone 3 of 3');
    expect(standing(request({ milestones: [ms[0]] }))).toBe('done · 1m 05s · 1 of 1 milestones done');
    expect(standing(request())).toBe('done · 1m 05s');
    // a running turn counts from when it started
    expect(standing(request({ status: 'in_progress', runningSince: 1_000 }), [], 31_000)).toBe('working · 1m 35s');
    expect(standing(request({ status: 'completed', runningSince: 1_000 }), [], 31_000)).toBe('done · 1m 05s');
  });

  it('a prompt taken into another request\'s turn shows that turn\'s milestones, naming it', () => {
    const ms = [{ title: 'Gather', status: 'completed' as const }, { title: 'Sign', status: 'blocked' as const, blocker: 'needs the key' }];
    const host = request({ id: 'r1-0', milestones: ms }), folded = request({ id: 'r2-1', n: 2, foldedInto: 'r1-0' }), all = [host, folded];
    expect(stepsOf(folded, all)).toEqual({ steps: ms, fromTasks: false, from: host });
    expect(standing(folded, all)).toBe('done · 1m 05s · milestone 2 of 2');
    expect(forYou(folded, all).actions).toEqual(['Sign — needs the key']);
    // without the list, or with tasks of its own, it keeps its own
    expect(stepsOf(folded).steps).toEqual([]);
    expect(stepsOf(request({ foldedInto: 'r1-0', tasks: [{ id: '1', title: 'T', status: 'pending' }] }), all)).toEqual({ steps: [{ title: 'T', status: 'pending' }], fromTasks: true });
  });

  it('collects what is left to the person: asked questions, open questions, blocked milestones and steps', () => {
    const you = forYou(request({
      milestones: [{ title: 'Sign', status: 'blocked', blocker: 'needs the key' }],
      asked: [{ question: 'Which folder?', answer: '~/mods' }],
      followUps: { questions: ['Publish it?'], actions: ['Restart Claude Code'] }
    }));
    expect(you).toEqual({ asked: [{ question: 'Which folder?', answer: '~/mods' }], questions: ['Publish it?'], actions: ['Sign — needs the key', 'Restart Claude Code'], empty: false });
    expect(forYou(request()).empty).toBe(true);
  });

  it('titles, projects and search', () => {
    expect(requestTitle({ text: '\n  fix   the bug\nmore' })).toBe('fix the bug');
    expect(projectLabel(summary())).toBe('me / Keys');
    expect(projectLabel(summary({ cwd: '' }))).toBe('me / Keys');
    const list = [summary(), summary({ id: 'x', name: 'SFTP migration', lastPrompt: 'move files', cwd: '/srv/api' })];
    expect(filterSessions(list, '').length).toBe(2);
    expect(filterSessions(list, 'sftp').map((s) => s.id)).toEqual(['x']);
    expect(filterSessions(list, 'context TAB').map((s) => s.name)).toEqual(['Glowup plugin task list retrieval']);
    expect(filterSessions(list, '1fec4bcb').length).toBe(1);
    expect(filterSessions(list, 'nothing here').length).toBe(0);
  });

  it('links only markdown files that are still there', () => {
    const map = markdownByPath({ markdown: [{ path: '/a/README.md', name: 'README.md', request: 1, exists: true, href: 'sessions-data/files/abc.md' }, { path: '/a/gone.md', name: 'gone.md', request: 2, exists: false }] });
    expect([...map.keys()]).toEqual(['/a/README.md']);
  });

  it('reads the data under /sessions-data, uncached, and refuses other paths', async () => {
    const fetcher = vi.fn(async (url: string) => new Response(url.endsWith('index.json') ? '{"format":1,"generatedAt":5,"sessions":[]}' : '# hi', { status: 200 }));
    expect(await loadIndex(fetcher as unknown as typeof fetch)).toEqual({ format: 1, generatedAt: 5, sessions: [] });
    expect(fetcher).toHaveBeenCalledWith('/sessions-data/index.json', { cache: 'no-store' });
    expect(await loadMarkdown('sessions-data/files/abc.md', fetcher as unknown as typeof fetch)).toBe('# hi');
    await expect(loadMarkdown('../../etc/passwd', fetcher as unknown as typeof fetch)).rejects.toThrow('not a session file');
    const missing = vi.fn(async () => new Response('', { status: 404 }));
    await expect(loadIndex(missing as unknown as typeof fetch)).rejects.toThrow('not built yet');
  });
});
