// The loader reads this file alone, so it cannot import: Model and PaneView are
// mirrored here by JSON shape (hooks/model.ts, hooks/pane.tsx) and cast at the get.
export type OpsControlAct = { glyph: string; label: string; kind?: string; tone: 'text' | 'dim' | 'read' | 'edit' | 'shell' | 'agent' | 'pass' | 'fail' | 'accent' }
export type OpsControlAgent = { key: string; agentId?: string; name: string; task: string; state: 'running' | 'done'; startedAt: number; endedAt?: number; tokens?: number; now?: string; prompt?: string; log?: OpsControlStep[] }
// one thing an agent did: the tool's glyph and label, and when
export type OpsControlStep = { at: number; text: string }
export type OpsControlFileTouch = { path: string; add: number; del: number; how: 'read' | 'edit' | 'new'; at: number }
export type OpsControlPlanItem = { id: string; title: string; status: 'pending' | 'in_progress' | 'completed' }
export type OpsControlModel = {
  working: boolean
  doneAt?: number
  act: OpsControlAct
  agents: OpsControlAgent[]
  plan: OpsControlPlanItem[]
  files: OpsControlFileTouch[]
  ctxPercent: number
  needsYou?: { toolUseId: string; what: string; before: OpsControlAct }
}
export type OpsControlPaneView = {
  tab: 'agents' | 'diff' | 'plan' | 'context' | 'guardrails' | 'music' | 'settings'
  diff?: Record<string, { kind: 'hunk' | 'add' | 'del' | 'ctx' | 'note'; text: string }[]>
  categories?: { name: string; tokens: number; kind: 'used' | 'free' | 'buffer' | 'deferred' }[]
  maxTokens?: number
  reduced?: boolean
  request?: string
  // the Agents tab's agent shown in full ('main' for the main session)
  agent?: string
}
// hooks/requests.ts: the person's prompts and what was done for each
export type OpsControlRequest = {
  id: string; n: number; text: string; status: 'pending' | 'in_progress' | 'completed' | 'interrupted' | 'failed'
  at: number; startedAt?: number; endedAt?: number; queuedIn?: string; command?: true; foldedInto?: string
  turnIds: string[]
  turns: { answer: string; reason: 'answer' | 'aborted' | 'error' | 'refusal'; durationMs: number; endedAt: number }[]
  files: { path: string; add: number; del: number; how: 'edit' | 'new' }[]
  commands: string[]; commandCount: number; commits: number
  test?: { passed: boolean; summary: string }
  agents: { name: string; task: string }[]
  tasks: { id: string; title: string; status: 'pending' | 'in_progress' | 'completed' }[]
  tools: number
  objective?: string
  milestones: { title: string; status: 'pending' | 'in_progress' | 'verifying' | 'waiting' | 'blocked' | 'completed' | 'failed' | 'skipped'; doing?: string; evidence?: string; blocker?: string }[]
  milestonesFrom?: 'milestones' | 'progress'
  asked: { question: string; answer?: string }[]
  followUps?: { questions: string[]; actions: string[] }
}
export type OpsControlRequests = { list: OpsControlRequest[]; seq: number; turnId?: string; turnAt?: number; active?: string; owners: Record<string, string> }
export type OpsControlBubble = { text: string; mood: string; until: number }
export type OpsControlPetInput = { working: boolean; kind?: string; needsYou: boolean; lastTest?: { passed: boolean; at: number }; doneAt?: number; doneOk?: boolean; actAt?: number }

// $.ops: each method is an event a renderer plugin hooks (list ops-control under its
// plugin.json dependencies) to draw part of a pack its own way. Answer `{ value }`;
// ops-control's own method answers null, and ops-control then draws what it always draws.
// Answers are checked (hooks/renderers.ts): a malformed one counts as null.
export type OpsControlSeg = { text: string; color?: string; bold?: boolean }
export type OpsControlColors = Record<'accent' | 'text' | 'dim' | 'faint' | 'read' | 'edit' | 'shell' | 'agent' | 'pass' | 'fail' | 'panel' | 'addBg' | 'delBg' | 'sel', string>
// pack is the active colors pack's name, so a renderer answers only for its own pack.
export type OpsControlFieldArgs = { pack: string; cols: number; rows: number; colors: OpsControlColors; reduced: boolean }
// A loop: frames of rows, played every ms (40 to 2000). Rows past `rows` are cut from the top.
export type OpsControlFrames = { ms: number; frames: OpsControlSeg[][][] }
export type OpsControlWindow = { label: string; usedPercent: number; reset: string }
export type OpsControlMeterArgs = { pack: string; width: number; windows: OpsControlWindow[]; ctxPercent: number; colors: OpsControlColors }
export type OpsControlDividerArgs = { pack: string; turn: number; colors: OpsControlColors }
// fill is one cell, repeated between left and right to the transcript's width.
export type OpsControlDivider = { left: OpsControlSeg[]; fill: OpsControlSeg; right: OpsControlSeg[] }
export type OpsControl = {
  // the docked pane's open rows, below the tab and above the status box
  field(args: OpsControlFieldArgs): Promise<OpsControlFrames | null>
  // the rows under the status line in the pane's status box (at most three)
  meter(args: OpsControlMeterArgs): Promise<OpsControlSeg[][] | null>
  // a rule drawn above each of the person's own prompts
  divider(args: OpsControlDividerArgs): Promise<OpsControlDivider | null>
}

// Live data the render sites read. A get while drawing subscribes that site alone;
// a set redraws only its readers. Values are JSON.
declare module 'claude-code' {
  interface EngineInterface {
    ops: OpsControl
  }
  interface PluginState {
    'ops-control': {
      band: { model: OpsControlModel; at: number }
      pane: { model: OpsControlModel; view: OpsControlPaneView; at: number }
      spinner: { turnAt: number; detail: string; state: string; at: number }
      haiku: { lastAt: number }
      hello: { sid: string }
      requests: { requests: OpsControlRequests; sid: string; at: number }
      pet: { input: OpsControlPetInput; overlays: string[]; bubble?: OpsControlBubble; friday: boolean; at: number }
    }
  }
}
