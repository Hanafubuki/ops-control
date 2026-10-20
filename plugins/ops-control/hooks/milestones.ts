// ops-control's own milestones tool, offered when no other plugin offers one (Control Room does): Claude records the
// work's milestones with it, the Plan tab files them under the request they were sent for, and the work bar
// draws them. JSX-free and engine-free.
import { readMilestones, currentMilestone } from './requests.ts'

export const MILESTONES_NAME = 'milestones'
// Any server's tool so named is read the same way (requests.ts); one is enough for the model.
export const ANY_MILESTONES = /(^|__)milestones$/

const STATUSES = ['pending', 'in_progress', 'verifying', 'waiting', 'blocked', 'completed']

export const MILESTONES_SPEC = {
  name: MILESTONES_NAME,
  description: [
    'Record the milestones of the work in progress, so the person sees how far it is (ops-control draws them as a track over the prompt and lists them under the request in its Plan tab).',
    'A milestone is an outcome worth reporting, not an action: "Analyse the E-008 results", "Fix the cache scheduler", "Validate the release build", "Document the findings".',
    'Never a single read, fetch, search or command ("Read config.ts", "Run npm test", "Fetch the logs"); those are steps inside a milestone.',
    'Keep 3 to 10 milestones for the whole objective, and send the whole list each time: when multi-step work starts, and whenever a milestone starts, moves to verifying, waits, is blocked or finishes. A quick one-step request needs none.',
    'Mark exactly one milestone in_progress while you work on it, with `doing`: what you are doing now, in a few present-tense words ("Rewriting the scheduler").',
    'Use verifying for work that is done but still being checked; completed only once it is verified, with `evidence` (what showed it works).',
    'Use waiting for a result that will come by itself (a running job, a scheduled run, a review) and blocked for something only the person can give; for both, say what it waits for in `blocker`.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      objective: { type: 'string', description: 'The objective of the work in a few words, as the person would put it ("Fix the failing ISS test and document the helpers"). Send it with the first list, and again when it changes.' },
      milestones: {
        type: 'array',
        description: 'Every milestone of the work, in order.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'The outcome, in a few words ("Fix the renderer"), never a single command or file read.' },
            status: { type: 'string', enum: STATUSES },
            doing: { type: 'string', description: 'While in progress or verifying: what you are doing now, a few present-tense words ("Rewriting the scheduler").' },
            evidence: { type: 'string', description: 'For verifying or completed: what showed it works, in a few words ("42 of 42 tests pass").' },
            blocker: { type: 'string', description: 'For waiting or blocked: what it waits for, in a few words ("the S-002 run to finish", "needs the API key").' },
          },
          required: ['title', 'status'],
        },
      },
    },
    required: ['milestones'],
  },
}

// What the call answers: how far the work is, and the milestone it is at.
export function recorded(input: Record<string, unknown>): string {
  const ms = readMilestones(input.milestones)
  if (!ms.length) return 'No milestones in the list: send every milestone, each with a title and a status.'
  const done = ms.filter(m => m.status === 'completed').length, at = currentMilestone(ms)
  return `Recorded: ${done} of ${ms.length} milestones done${at >= 0 ? `, now: ${ms[at]!.title}` : ''}.`
}

// What the model is told once per session (and after a compaction), while the tool is offered.
export const policy = (tool: string) => [
  '## Work progress',
  `The person follows this work's progress in ops-control, counted from your milestones. For work with several steps, record its milestones with the \`${tool}\` tool as you begin: the objective in a few words and 3 to 10 milestones, each an outcome worth reporting ("Analyse the E-008 results", "Validate the fix"), never a single read, fetch, search or command.`,
  'Send the whole list again each time a milestone starts, moves to verifying, waits or is blocked, or finishes. Give the one in progress a short present-tense `doing` line. Mark a milestone completed only once it is verified, with its `evidence`; while it is being checked it is verifying. Mark it waiting when it waits for a result that will come by itself (a running job, a scheduled run) and blocked when it needs something only the person can give, each with its `blocker`. Skip it for quick one-step requests.',
].join('\n')

// Control Room offers a milestones tool of its own while it is on; ops-control then reads that one.
export function otherOffers(enabledPlugins: unknown, tools: readonly string[]): boolean {
  const on = enabledPlugins && typeof enabledPlugins === 'object' ? Object.entries(enabledPlugins as Record<string, unknown>) : []
  if (on.some(([id, v]) => v === true && id.startsWith('project-sentinel@'))) return true
  return tools.some(t => ANY_MILESTONES.test(t) && !t.startsWith('mcp__ops-control__'))
}
