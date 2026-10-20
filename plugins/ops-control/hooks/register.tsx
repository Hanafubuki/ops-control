import type { EngineInterface, PaneOpenArgs, PromptSubmitInput, PromptSubmitResult, Register, RenderElement, RenderSurface, Timer } from 'claude-code'
import type { Host } from './host.ts'
import { initialModel, normalizeModel, applyEvent, mergeCounts, isBusy, agentsRunning, type Model, type Ev } from './model.ts'
import { approvalLabel, dialogCall, modeAsksPerson } from './events.ts'
import { PRESETS, shown, type Theme } from './themes.ts'
import { resolveLook, cleanOverrides, exportMix, exportName, DEFAULT_MIX, SPINNER_IDS, type Mix, type Look } from './packs.ts'
import { PACKS } from './packpresets.ts'
import { loadUserPacks, SAFE_NAME } from './userpacks.ts'
import { BUILTIN_SHEETS, CLAWD_SHEET, eggSheet, stripRows, withLevelOutfit, type PetSetting, type PetInput, type PetKind, type PetSheet } from './pets.ts'
import { loadUserPet, userPetNames, PET_DIR } from './userpets.ts'
import { bubbleFor, BUBBLE_SETTINGS, daypart, fitsBubble, haikuLimit, haikuMaxTokens, haikuPrompt, kindWords, HaikuGate, HAIKU_MODEL, HAIKU_TIMEOUT_MS, sanitizeLine, speaks, voiceFor, type BubbleSetting, type BubbleVars, type HaikuContext } from './bubbles.ts'
import { linesFor, pool, flavoursOf, workingLinesFor, type BubbleMood, type Moment } from './lines.ts'
import { momentOf, quipDue } from './moments.ts'
import { turnXp, countCommits, levelUp, levelOf, parseLevelStore, levelStoreIsNewer, outfitStoreIsNewer, levelStore, parseOutfitStore, outfitStore, resolveOutfit, outfitUnlocked, unlockedOutfits } from './levels.ts'
import { recordPass, unlockEgg, eggUnlocked, hintDue, EGG_HINTS, overlays, localTime, localOffset, fridayDeploy, type EggStore } from './eggs.ts'
import { branchOf, gitBase, rebase, refreshCounts, serial, type Repo } from './changes.ts'
import { readDiff } from './diff.ts'
import { loadTasks, taskListId } from './tasks.ts'
import { adopt, agentBind, agentStart, backfill, currentMilestone, drop, endTurn, foldIn, hasQueued, initialRequests, loadSaved, normalizeRequests, readMilestones, retext, saved, settleQueued, startTurn, submit, toolEnd as requestWork, unstarted, withinSize, type Requests } from './requests.ts'
import { TranscriptReader, projectFolder, readTranscript } from './backfill.ts'
import { cacheHit, heaviest } from './ctxchart.ts'
import { pinRows, startOpspin, wireOpspin } from './opspin.tsx'
import { DEFAULT_NAME_PACK, NAME_PACKS, nameAgent, packOf, type NamePack } from './namepacks.ts'
import { createPack, loadPackFiles } from './packmaker.ts'
import { dropdownKey, optionKey, renderSettings, withinDropdown, type Dropdown } from './settingstab.tsx'
import { focusablesOf, steer, stepOf, tabStep } from './panekeys.ts'
import { openBoard } from './sqboard.ts'
import { ARCADE } from './sqthemes.ts'
import { startOpstask, wireOpstask } from './opstask.ts'
import { startSysSampler } from './sysload.ts'
import { carryOver } from './carryover.ts'
import { tierFor } from './layout.tsx'
import { renderBand, renderWorkBar } from './band.tsx'
import { MILESTONES_SPEC, otherOffers, policy, recorded } from './milestones.ts'
import { agentWork, workIssues, workOf } from './workbar.ts'
import { NO_SWITCHES, isSource, offNote, readGuardrails, readSwitches, toggle, verdictFor, type GuardSwitches } from './guardrails.ts'
import { renderPane, bubbleBox, petStripCols, visibleTabs, COVER_COLS, type PaneExtra, type PaneView, type TabId } from './pane.tsx'
import { spinnerWord, newTurnWord } from './restyle.ts'
import { styleRow } from './rows.tsx'
import { makeTurns } from './turns.ts'
import { orbStateOf, usesOwnSpinner, checkedSpinnerProps } from './spinner.ts'
import type { PetClientProps } from './client/pet.tsx'
import type { OrbState } from './motion.ts'
import { statusText, writeStatusFile, drawsStatusLine, ensureRefresh, BACKUP_KEY, STATUS_DIR } from './statusline.ts'
import { parseFields, DEFAULT_FIELDS, type ColorMode, type FieldToken } from './fields.ts'
import { DEFAULT_SETUP, parseSetup, setupIsNewer, type Setup } from './setup.ts'
import { runCommand, pastedOpsControl, type Ctl } from './command.ts'
import { SHORT_TEXT, FULL_TEXT } from './help.ts'
import { renderHelp, renderColorList } from './helpcard.tsx'
import { cycleCommands, inputCommand, inputValue, type ConfigState, type CycleId, type InputId } from './configrows.ts'
import { renderConfig, type ConfigNote } from './configpane.tsx'
import { encodeLink } from './link.ts'
import { loadUserThemes } from './userthemes.ts'
import { firstRun } from './firstrun.ts'
import { registerCopy, touchCopy, decide, unregisterCopy, pruneStatus, safeId, HEARTBEAT_MS } from './instances.ts'
import { staleToast, INSTALLED_FILE } from './update.ts'
import { syncPlugin } from './pluginsync.ts'
import { cleanFrames, cleanRows, cleanDivider, fitField, meterWindows, type Frames, type Divider } from './renderers.ts'
import { ditherMeters, turnDivider } from './effects.ts'
import type { FieldClientProps } from './client/field.tsx'
import type { Seg } from './layout.tsx'
import { allowed, createRun, isLive, isUndo, newLines, restoreUndo, runTimes, scanRuns, snapshotOf, type Cursor } from './remote.ts'
import { renderPlayer, playerCoverSize, PLAYER_ID, PASTE_INPUT, type AccountView, type PlayerNote } from './musicplayer.tsx'
import { sameMusic, type Music, type MusicCmd } from './music/parse.ts'
import { MusicReader, pickBackend, type Platform } from './music/reader.ts'
import { SMTC_ART, scaleArt } from './music/smtc.ts'
import { ArtCache, coverRows, parseArt, smallArtUrl } from './music/art.ts'
import type { SeekBarProps } from './music/seek.ts'
import { TokenKeeper, pasteFile, readTokens, tokenFile } from './music/tokens.ts'
import { SpotifyClient, allPlaylists, readPlayer, skipTo } from './music/spotify.ts'
import { apiDelay, capsOf, mergeMusic, routeOf, type Link } from './music/player.ts'
import { commandRequest, devicesRequest, likeRequest, likedRequest, meRequest, parseDevices, parseLiked, parseMe, parseQueue, parseRecent, queueRequest, recentRequest, type ApiError } from './music/webapi.ts'
import { deviceRows, expire, initialLists, listError, loadingFrom, needsLoad, playlistRows, pressError, queueRows, recentRows, rowsOf, skipText, type ListId, type ListRow, type ListState, type Lists } from './music/lists.ts'
import { detached, ensureBinary, moveFile, pickTerminal, platformOf, releaseTarget, removeTree, shellLine, type TermEnv } from './launch.ts'

type Engine = EngineInterface
type SpinKey = { turnAt: number; detail: string; state: OrbState }

const BAND = { plugin: 'ops-control', key: 'band' } as const
const PANE = { plugin: 'ops-control', key: 'pane' } as const
const SPIN = { plugin: 'ops-control', key: 'spinner' } as const
const PET = { plugin: 'ops-control', key: 'pet' } as const
const HAIKU = { plugin: 'ops-control', key: 'haiku' } as const
// The session id that was greeted. A hot reload re-runs session.start, and must not greet again.
const HELLO = { plugin: 'ops-control', key: 'hello' } as const
// The person's requests, which the Plan tab lists: a key of their own, written when one changes, so the band
// and the 1 s beat never carry them.
const REQS = { plugin: 'ops-control', key: 'requests' } as const

// Module state: one session per process. A hot reload starts it over, which only
// loses the in-flight session's view (settings and takeover state live in $.store).
let model: Model = initialModel()
let mix: Mix = DEFAULT_MIX
let look: Look = resolveLook(DEFAULT_MIX, {}, {}).look
let theme: Theme = look.theme
let pet: PetSetting = 'clawd'
// A user pet's sheet, read when it is picked: the render hook may not read disk.
let petSheet: PetSheet | undefined
// Name packs (namepacks.ts): the pack in use, the person's own (packmaker.ts), and the names this session's agents
// were given, by agent key. A pack with a character puts it on the pet in place of the person's own.
let namePackId = DEFAULT_NAME_PACK
let userNamePacks: NamePack[] = []
let agentNames: Record<string, string> = {}
let packPet: string | undefined
let packPetSheet: PetSheet | undefined
// the Settings tab's character switch: false hides the pet whichever it is
let petShown = true
// the Settings tab's own state: the pack description field, a pack being made, and the last thing said
let settingsUi: { creating?: boolean; making?: string; open?: Dropdown } = {}
// the theme the Settings tab marks: arcade when ops-control's arcade pack is worn without a theme over it
const shownTheme = () => (mix.colors === ARCADE && !mix.theme ? ARCADE : theme.name)
const allPacks = (): NamePack[] => [...NAME_PACKS, ...userNamePacks]
const currentPack = (): NamePack => allPacks().find(p => p.id === namePackId) ?? packOf(DEFAULT_NAME_PACK)
// The pet drawn: off while hidden, else the pack's character when it has one, else the person's own.
const shownPet = (): PetSetting => (!petShown ? 'off' : packPet ?? pet)
const shownSheet = (): PetSheet | undefined => (packPet ? packPetSheet : petSheet)
// The stored /ops outfit choice: a name or 'off'. What is worn also depends on the pet and the level.
let outfitChoice: string | undefined
let bubbles: BubbleSetting = 'on'
let view: PaneView = { tab: DEFAULT_SETUP.tabs[0]! }
let requests: Requests = initialRequests()
let requestsTimer: Timer | undefined
let requestsSave: Timer | undefined
let queuedSettle: Timer | undefined
// the open tab's last window offset and window height, as the pane drew them; ui.scroll clamps and pages by them
let scroll = { last: 0, win: 0 }
// The pane's focus ring as last drawn (its stops in order) and where it stands, for panekeys.ts's arrow map.
let paneRing: string[] = []
let paneFocus: string | undefined

// Shows tab `id`: a tab press, its Alt+digit, or ←/→ in the pane.
function showTab($: Engine, id: TabId) {
  // a tab press, the Plan and Agents tabs' own included, goes back to their lists
  view = { ...view, tab: id, offset: 0, request: undefined, agent: undefined }
  settingsUi = { ...settingsUi, open: undefined }
  publish($)
  if (id === 'context') void feedContext($)
  if (id === 'diff') refresh($)
  if (id === 'music') void pollMusic($)
}
let git: Repo | undefined
let cwd = ''
let configDir = ''
let home = ''
let dataHome = ''
let reducedMotion = false
let docked = false
// Where the surface seated the pane, learned from its last render: panes() does not say.
let panePlacement: 'dock' | 'inline' | undefined
// The surface of the last pane render has no Client to move the seek bar.
let paneSeekless = false
// Calls between tool.call and its result: a permission dialog names its tool and input but not its id.
const flying = new Map<string, { tool: string; input: unknown }>()
let ticker: Timer | undefined
let refreshSeq = 0
const refreshQueue = serial()
let sessionId = ''
// off: another ops-control copy is acting in this session (hooks/instances.ts)
let off = false
let guardSid = '', guardRoot = ''
let takenOver = false
let fields: readonly FieldToken[] = DEFAULT_FIELDS
let setup: Setup = DEFAULT_SETUP
// the installer's value; `statusline fields default` returns to it
let configFields: readonly FieldToken[] = DEFAULT_FIELDS
let colorMode: ColorMode = '256'
// The one 60 s clock: refreshes this copy's guard entry and rewrites the status file.
let beatTimer: Timer | undefined
let lastStatusLine: string | undefined
let spinKey: SpinKey = { turnAt: 0, detail: '', state: 'think' }
// Pet state, published to PET for the pane only; the band never reads it.
type Bubble = { text: string; mood: BubbleMood; until: number }
type PetSnap = { input: PetInput; overlays: string[]; bubble?: Bubble; friday: boolean; level: number; outfit?: string }
let bubble: Bubble | undefined
let lastTemplate: string | undefined
// When the pet last said a working quip; the turn's start counts too, so the first waits QUIP_DELAY_MS.
let quipAt = 0
const haikuGate = new HaikuGate()
let haikuAbort: AbortController | undefined
let bubbleTimer: Timer | undefined
let turnNo = 0
// Characters the last drawn pane can show in a bubble; 40 until a pane has drawn.
let bubbleCap = 40
// false in a plain -p run, where nobody sees a bubble
let interactive = true
let friday = false
let failed = false
// The last main-loop test run in this session failed; a pass then speaks `green`.
let red = false
// What this turn has earned so far besides the answer; turn.complete turns it into XP.
let turnGain = { green: 0, commits: 0 }
// Set by turn.complete, spoken (or dropped) by the turn-done feed that follows it.
let pendingLevelUp: { level: number; unlock?: string } | undefined
// A fresh session greets once, at its first pane draw, unless something else spoke first.
let helloDue = false
let tzOffset = 0
let installed: number | undefined
let lastPet = ''
let eggJuggleAt: number | undefined
let clickToasted = false
const PANE_OPEN: PaneOpenArgs = { id: 'ops-control', title: 'ops-control', focus: true, closeOnEscape: true }
const CONFIG_ID = 'ops-control-config'
const CONFIG_OPEN: PaneOpenArgs = { id: CONFIG_ID, title: 'ops-control config', focus: true, closeOnEscape: true, rows: 40 }
// Read when the config pane opens and after each pack change: its render hook may not read disk.
let configPacks: string[] = Object.keys(PACKS)
let configShiny = false
let configEgg = false
let configUserPets: string[] = []
let configNote: ConfigNote | undefined
// The element holding the config pane's focus ring, from ui.focus; the preview marks what it paints.
let configFocus: string | undefined
// The config TUI run this session owns (hooks/remote.ts); one at a time.
let remote: { dir: string; cursor: Cursor; seen: boolean } | undefined
let remoteTimer: Timer | undefined
let remotePolling = false
// The local Spotify player. One poll loop: each pollMusic bumps musicSeq, and a read that
// returns after a newer poll started drops its answer, so a control click cannot fork the loop.
let musicReader: MusicReader | undefined
let musicTimer: Timer | undefined
let musicSeq = 0
// Covers by "size:url". The helper binary is looked up once per session for art: a missing one stays missing
// until startMusic resets these for the next session.
let covers = new ArtCache(20)
let coversInFlight = new Set<string>()
let artBin: Promise<string | undefined> | undefined
// The Web API side. spotify is set once startMusic has read the token file, whatever it found; link is set only
// while a token is usable, and holds what the API last said. localMusic is the local reader's last read;
// mergeMusic combines the two into model.music.
type Spotify = { keeper: TokenKeeper; client: SpotifyClient }
let spotify: Spotify | undefined
let link: Link | undefined
let localMusic: Music = { status: 'closed' }
// One API poll loop, like the local one, plus one player read out at a time: a call that arrives while a read is out
// sets apiAgain, and that read's end polls again instead of waiting for its timer.
let apiTimer: Timer | undefined
let apiSeq = 0
let apiReading = false
let apiAgain = false
let musicInSight = false
let spotifyName: string | undefined
let premiumToasted = false
// The right column while a connect is under way; undefined shows restingAccount().
let connectFlow: Extract<AccountView, { step: 'steps' | 'waiting' }> | undefined
let login: { kill(): void; paste: string } | undefined
let loginSeq = 0
const pasteSession = Math.random().toString(36).slice(2, 8)
// The dialog's lists. They live only while the dialog is open: closing it, /clear, Reconnect and disconnect drop them,
// and listSeq drops an answer that lands after that.
let lists: Lists = initialLists()
let listTimer: Timer | undefined
let listSeq = 0
// What the dialog last drew. A write that lands while the dialog draws does not draw it again, so the
// list's answer can sit unshown until something else publishes; the 5 s tick publishes when this lags.
let listsDrawn: Lists | undefined
const CLIENT_ID = /^[0-9a-f]{32}$/
let modVersion: string | undefined
// the plugin's userConfig, kept for loadSettings: an undo reloads settings outside register()
let pluginOptions: Readonly<Record<string, unknown>> = {}
const DOCK_OPEN: PaneOpenArgs = { id: 'ops-control', title: 'ops-control' }
const PLAYER_OPEN: PaneOpenArgs = { id: PLAYER_ID, title: 'Music', focus: true, closeOnEscape: true, holdToasts: true, rows: 24, columns: 110 }
// open({ focus }) is refused while the ops-control pane holds the keys, so a press there closes the pane first;
// the dialog's close then reopens it with the keys.
let reopenPane = false
let playerNote: PlayerNote | undefined
// From the dialog's last draw: the cover side it shows (0 for none) and whether its surface lacks Clients.
let playerCover = 0
let playerSeekless = false

// Exported for the wiring tests, which drive it with the test engine's $.
export function hostOf($: Engine): Host {
  return {
    run: async (argv, env, timeoutMs) => {
      const r = await $.process.run(argv, env || timeoutMs ? { ...(env && { env }), ...(timeoutMs && { timeoutMs }) } : undefined)
      return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr }
    },
    readFile: path => $.fs.read(path),
    writeFile: (path, text) => $.fs.write(path, text),
    exists: path => $.fs.exists(path),
    stat: path => $.fs.stat(path).then(s => ({ mtimeMs: s.mtimeMs }), () => undefined),
    listDir: async path => (await $.fs.list(path)).map(e => e.name),
    listFiles: async path => (await $.fs.list(path)).map(e => ({ name: e.name, size: e.size })),
    fetchText: url => new Promise((resolve, reject) => {
      // a stalled server must not hold a /ops command open
      const timer = $.clock.after(10_000, () => reject(new Error('timed out after 10 s')))
      // $.http.fetch reads the whole body, so the 64 KB cap is the callers' text.length check
      $.http.fetch(url).then(r => { timer.cancel(); resolve({ ok: r.ok, status: r.status, text: r.text }) },
        err => { timer.cancel(); reject(err) })
    }),
    fetch: (url, init) => new Promise((resolve, reject) => {
      const timer = $.clock.after(init.timeoutMs, () => reject(new Error(`timed out after ${init.timeoutMs / 1000} s`)))
      $.http.fetch(url, { method: init.method ?? 'GET', ...(init.headers && { headers: init.headers }), ...(init.body !== undefined && { body: init.body }) })
        .then(r => { timer.cancel(); init.onSettled?.(); resolve({ status: r.status, headers: r.headers, text: r.text }) }, err => { timer.cancel(); init.onSettled?.(); reject(err) })
    }),
    spawn: (argv, onLine) => {
      const child = $.process.spawn({ argv })
      let killed = false
      const done = (async () => {
        // a piece of output can end mid-line, or hold several lines
        const held = { stdout: '', stderr: '' }
        const line = (s: string) => s.replace(/\r$/, '')
        // an onLine that throws is the caller's bug: it ends the child but must reach done
        let bad: { error: unknown } | undefined
        try {
          for await (const { stream, text } of child) {
            // leaving the loop is what kills the child. return() waits behind a pull already out, so a piece can
            // still arrive after kill(): it would complete a held line, and is dropped.
            if (killed) return null
            const lines = (held[stream] + text).split('\n')
            held[stream] = lines.pop()!
            try { for (const l of lines) onLine(stream, line(l)) } catch (error) { bad = { error }; break }
            if (killed) return null
          }
        } catch { if (!bad) return null }
        if (bad) throw bad.error
        if (killed) return null
        for (const s of ['stdout', 'stderr'] as const) if (held[s]) onLine(s, line(held[s]))
        try { return (await child.result).code } catch { return null }
      })()
      return { done, kill: () => { killed = true; void child.return({ code: null, signal: null }).catch(() => {}) } }
    },
    storeGet: key => $.store.get(key),
    storeSet: (key, value) => $.store.set(key, value),
    storeDelete: key => $.store.delete(key),
    projectStatusLine: async () =>
      (await $.settings.read({ source: 'project' })).statusLine !== undefined ||
      (await $.settings.read({ source: 'local' })).statusLine !== undefined,
    configDir,
    dataHome,
    home,
  }
}

// The takeover script falls back to the person's own command once this file is
// 10 minutes old, so a quiet session still rewrites it every minute.
function writeStatus($: Engine, force: boolean) {
  const line = statusText(model, theme, { fields, now: Date.now(), tzOffset, color: colorMode, meter: setup.meter, split: true })
  if (!takenOver || !sessionId || (!force && line === lastStatusLine)) return
  lastStatusLine = line
  void writeStatusFile(hostOf($), sessionId, line).catch(() => {})
}
// Versions already announced this session; a hot reload starts it over, which only repeats a toast.
const staleShown = new Set<string>()
async function checkStale($: Engine) {
  if (off || !interactive) return
  try {
    const text = staleToast(staleShown, JSON.parse(await hostOf($).readFile(INSTALLED_FILE(configDir))), guardRoot, configDir)
    if (text) $.ui.toast(text)
  } catch {}
}
// After /clear, session.end still reports the ending id and no turn.start comes until the first
// prompt, so the beat is what notices the new id.
async function beatStatus($: Engine) {
  try {
    const id = await $.session.id()
    if (id && id !== sessionId) {
      if (await recheckGuard($, id)) return
      // turn.start may have adopted the id while the guard check was awaited
      if (id === sessionId) return
      await adoptSession($, sessionId)
    }
  } catch {}
  writeStatus($, true)
}
function startBeat($: Engine) {
  beatTimer?.cancel()
  beatTimer = $.clock.every(HEARTBEAT_MS, () => {
    if (guardSid) void touchCopy(hostOf($), guardSid, guardRoot, Date.now()).catch(() => {})
    void beatStatus($)
    void checkStale($)
  })
}
// A winning copy whose store has no backup (the takeover was made by another copy
// or an earlier install) still owns the file settings.json points at.
async function syncTakeover($: Engine) {
  // the first-run timer can fire after recheckGuard turned this copy off
  if (off) return
  const draws = await drawsStatusLine(hostOf($))
  takenOver = (await hostOf($).storeGet(BACKUP_KEY)) !== undefined || draws
  if (draws) await ensureRefresh(hostOf($)).catch(() => {})
  writeStatus($, true)
  $.ui.status(statusEntry())
}

// The engine pins this entry as a "⚠ ops-control:" notice, which reads as an error
// when it never goes away. This copy never shows it; the status line takeover is opt-in.
const statusEntry = (): string | undefined => undefined

// A message is a conclusion when it opens the answer a finished turn ended on: the requests keep each turn's answer
// (clipped), so the first characters of both are compared.
const answerKey = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 160)
function isFinalAnswer(text: string): boolean {
  const key = answerKey(text)
  if (key.length < 12) return false
  return requests.list.some(r => r.turns.some(t => t.reason === 'answer' && answerKey(t.answer) === key))
}

// The model's combo moves on after a reply is drawn, and the engine redraws old rows on every
// invalidate, so each reply keeps the count it first drew with.
const xpByMessage = new Map<string, number>()
function xpFor(messageId: string, isFirstOfReply: boolean): number | undefined {
  if (!look.rowFlags.xp || !isFirstOfReply) return undefined
  if (!xpByMessage.has(messageId)) xpByMessage.set(messageId, model.combo)
  return xpByMessage.get(messageId)
}

// A renderer plugin's answers (ops.field, ops.meter). They are asked outside the draw,
// which may not write state, and the field can take a renderer a while to compute; the answer
// lands in its slot and publish redraws the pane. `key` is what the held value was asked for.
type Asked<T> = { key: string; value: T | null; pending?: string }
const fieldAsk: Asked<Frames> = { key: '', value: null }
const meterAsk: Asked<Seg[][]> = { key: '', value: null }
function ask<T>($: Engine, slot: Asked<T>, key: string, call: () => Promise<T | null>) {
  if (slot.key === key || slot.pending === key) return
  slot.pending = key
  $.clock.after(0, async () => {
    let value: T | null = null
    try { value = await call() } catch { value = null }
    // a newer ask overtook this one while it ran
    if (slot.pending !== key) return
    slot.key = key; slot.value = value; slot.pending = undefined
    publish($)
  })
}
const turns = makeTurns()
const dividerByMessage = new Map<string, { key: string; value: Divider | null }>()
const palette = () => ({ ...theme.colors })
// What a held answer was asked under: both layers' packs and the effects the look picked,
// since a mix can take its colors and its motion from different packs.
const lookKey = () => JSON.stringify([mix.colors, mix.motion, look.meters, look.dividers, look.motion.field])
// Asked while drawing: one short call per prompt and pack, kept for its redraws.
async function dividerFor($: Engine, messageId: string): Promise<Divider | null> {
  const pending = messageId === 'placeholder'
  const turn = turns.turnFor(messageId), pack = mix.colors, colors = palette()
  const key = JSON.stringify([lookKey(), colors])
  const held = pending ? undefined : dividerByMessage.get(messageId)
  if (held?.key === key) return held.value
  let value: Divider | null = null
  try { value = cleanDivider(await $.ops.divider({ pack, turn, colors }), colors.text) } catch { value = null }
  value ??= look.dividers ? turnDivider(turn, colors) : null
  if (!pending) dividerByMessage.set(messageId, { key, value })
  return value
}

const petOn = () => shownPet() !== 'off' && !reducedMotion

const PET_KINDS: readonly string[] = ['read', 'search', 'edit', 'shell', 'agent', 'plan']
// Running subagents are work even when the main loop only waits on them or its turn already ended.
function petKind(): PetKind | undefined {
  const own = model.working ? (PET_KINDS.includes(model.act.kind ?? '') ? model.act.kind as PetKind : 'think') : undefined
  return agentsRunning(model) && (own === undefined || own === 'think' || own === 'agent') ? 'agent' : own
}
const petInput = (): PetInput => ({
  working: isBusy(model),
  sleepMs: setup.pet.sleepMs,
  pantAt: setup.meter.danger,
  kind: petKind(),
  needsYou: !!model.needsYou,
  lastTest: model.lastTest,
  doneAt: model.doneAt,
  doneOk: model.act.tone === 'pass' && !model.working,
  actAt: model.actAt,
  agents: model.agents.filter(a => a.state === 'running').length,
  compactAt: model.compactAt,
  ctx: model.ctxPercent,
  juggleAt: eggJuggleAt,
  music: setup.pet.dance && model.music?.status === 'open' && model.music.playing && !model.music.ad,
})
// Through JSON because Client props refuse undefined fields.
function petSnap(): PetSnap {
  const now = Date.now()
  return JSON.parse(JSON.stringify({
    input: petInput(),
    overlays: overlays(localTime(now, tzOffset), installed === undefined ? undefined : localTime(installed, tzOffset), friday, failed),
    bubble,
    friday,
    level: levelOf(model.xp ?? 0).level,
    outfit: resolveOutfit(shownPet(), levelOf(model.xp ?? 0).level, outfitChoice),
  }))
}
// Writes only when the pet's picture would change, so a 1 s tick costs the pane nothing.
function publishPet($: Engine) {
  const snap = petSnap()
  const key = JSON.stringify(snap)
  if (key === lastPet) return
  lastPet = key
  void $.state.set(PET, { ...snap, at: Date.now() })
}

// Writes the live data the band and the pane draw from; only their readers redraw.
function publish($: Engine) {
  const at = Date.now()
  void $.state.set(BAND, { model, at })
  void $.state.set(PANE, { model, view, at })
  publishPet($)
}

// A change to the requests redraws the Plan tab and is saved for `claude --resume`. busy: a tool call's count
// changed, which a burst of calls writes once a second, the last always landing.
function setRequests($: Engine, next: Requests, busy = false) {
  if (next === requests) return
  requests = next
  if (busy) { requestsTimer ??= $.clock.after(1000, () => { requestsTimer = undefined; publishRequests($) }); return }
  requestsTimer?.cancel(); requestsTimer = undefined
  publishRequests($)
}
// sid: a /clear or /resume goes on in this process under a new id, and its requests start again
function publishRequests($: Engine) {
  void $.state.set(REQS, { requests: withinSize(requests), sid: sessionId, at: Date.now() })
  saveRequests($)
}
const requestsDir = () => `${configDir}/ops-control/requests`
const requestsFile = (sid: string) => `${requestsDir()}/${safeId(sid)}.json`
// A -p run is one prompt and gone: only an interactive session keeps its requests on disk.
function saveRequests($: Engine) {
  const sid = sessionId
  if (!interactive || !sid || !configDir) return
  requestsSave?.cancel()
  requestsSave = $.clock.after(1000, () => { requestsSave = undefined; void writeRequests($, sid) })
}
async function writeRequests($: Engine, sid: string) {
  try {
    await hostOf($).writeFile(requestsFile(sid), JSON.stringify(saved(requests)))
  } catch (err) {
    $.ui.log(`ops-control requests save failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
  }
}
// A session that ends writes at once what its last turn left, rather than a second later when the process may be gone.
async function flushRequests($: Engine) {
  if (!requestsSave) return
  requestsSave.cancel(); requestsSave = undefined
  if (sessionId) await writeRequests($, sessionId)
}
// A hot reload keeps the session's state; a resumed session reads back what it saved. fresh: a new session id in
// this process (a /clear or /resume), whose state still holds the last session's.
async function loadRequests($: Engine, fresh = false) {
  requestsTimer?.cancel(); requestsTimer = undefined
  queuedSettle?.cancel(); queuedSettle = undefined
  if (!fresh) {
    try {
      const live = (await $.state.get(REQS)).value as { requests?: unknown; sid?: unknown } | undefined
      if (live?.requests && live.sid === sessionId) { requests = normalizeRequests(live.requests); return }
    } catch {}
  }
  requests = initialRequests()
  if (sessionId && configDir) {
    try { requests = loadSaved(JSON.parse(await hostOf($).readFile(requestsFile(sessionId)))) } catch {}
  }
  void $.state.set(REQS, { requests: withinSize(requests), sid: sessionId, at: Date.now() })
}
// The project's guardrails for the Guardrails tab: read at start, and again when Claude edits one of their files.
// The Guardrails tab's switches for this project, kept in the store under the project's folder; and the note about
// project rules switched off that rides on the next prompt (and again after a compaction drops it).
let guardSw: GuardSwitches = NO_SWITCHES
let guardNote: string | undefined
const guardKey = () => `guardrails:${cwd}`

async function loadGuardrails($: Engine) {
  if (!cwd) return
  try {
    const host = hostOf($)
    guardSw = readSwitches(await host.storeGet(guardKey()))
    view = { ...view, guardrails: await readGuardrails(host, cwd, Date.now()) }
    publish($)
  } catch (err) {
    $.ui.log(`ops-control guardrails read failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
  }
}

// ops-control's milestones tool, while it offers one: none while another plugin (Control Room) offers its own.
let milestonesTool: string | undefined
async function offerMilestones($: Engine) {
  milestonesTool = undefined
  try {
    const enabled = await $.settings.read({ key: 'enabledPlugins' })
    const tools = (await $.tool.list()).map(t => t.name)
    if (otherOffers(enabled, tools)) return
    milestonesTool = (await $.tool.register(MILESTONES_SPEC)).tool
  } catch (err) {
    $.ui.log(`ops-control milestones tool not offered: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
  }
}
// The tool's policy rides on the session's first prompt, and again after a compaction drops it, rather than in
// the system prompt, which it would change for every request.
let policyGiven = false
function withPolicy(e: PromptSubmitInput): PromptSubmitInput {
  if (e.command) return e
  const add: string[] = []
  if (!policyGiven && milestonesTool) { policyGiven = true; add.push(policy(milestonesTool)) }
  // the Guardrails tab's project rules switched off (or back on) since the last prompt
  if (guardNote) { add.push(guardNote); guardNote = undefined }
  return add.length ? { ...e, context: [...(e.context ?? []), ...add] } : e
}

// Flips a Guardrails switch, keeps it for the project, and tells Claude at the next prompt when a project rule changed.
function flipGuard($: Engine, key: string | undefined) {
  if (!key || !cwd) return
  const isDefault = key.startsWith('d:'), id = key.slice(2)
  guardSw = toggle(guardSw, id, isDefault)
  void hostOf($).storeSet(guardKey(), guardSw).catch(() => {})
  if (!isDefault) guardNote = offNote(view.guardrails, guardSw) ?? 'The person switched every project rule back on in the Ops Control Guardrails tab: follow them all again.'
  publish($)
}
// The milestone the work bar shows as current, and since when: a new title starts its clock.
let workSince = { title: '', at: 0 }

// The requests the session made before ops-control saw it (turned on or reloaded mid-session, or a session resumed from
// before ops-control kept a list) are read once from its transcript. A session with no transcript yet made none.
let filling = ''
async function fillRequests($: Engine) {
  const sid = sessionId
  if (!interactive || !sid || !configDir || requests.filled || filling === sid) return
  filling = sid
  try {
    const host = hostOf($)
    const file = await transcriptOf(host, sid)
    const older = file ? await readTranscriptFile(host, file, await onWindows($)) : []
    if (sessionId === sid) setRequests($, backfill(requests, older))
  } catch (err) {
    $.ui.log(`ops-control backfill failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
  } finally {
    if (filling === sid) filling = ''
  }
}
async function transcriptOf(host: Host, sid: string): Promise<string | undefined> {
  const root = `${configDir}/projects`, name = `${safeId(sid)}.jsonl`
  const own = `${root}/${projectFolder(cwd)}/${name}`
  if (await host.exists(own)) return own
  // a folder name Claude Code shortened, or a session started in another directory
  for (const dir of await host.listDir(root).catch(() => [])) if (await host.exists(`${root}/${dir}/${name}`)) return `${root}/${dir}/${name}`
  return undefined
}
// One read when it fits the engine's 4 MiB; a longer transcript streams a line at a time.
async function readTranscriptFile(host: Host, file: string, windows: boolean) {
  const whole = await host.readFile(file).catch(() => undefined)
  if (whole !== undefined) return readTranscript(whole)
  const reader = new TranscriptReader()
  const argv = windows ? ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', `Get-Content -LiteralPath '${file.replace(/'/g, "''")}' -Encoding UTF8`] : ['cat', '--', file]
  const code = await host.spawn(argv, (stream, line) => { if (stream === 'stdout') reader.line(line) }).done
  if (code !== 0) throw new Error(`reading ${file} exited ${code}`)
  return reader.requests()
}
// The prompts a person sends: notifications, peers, schedules, plugins and the engine's own turns are not requests.
const PERSON_ORIGINS: readonly string[] = ['composer', 'bridge', 'sdk']

// not launch.ts's platformOf, which names the release target
async function musicPlatform($: Engine): Promise<Platform> {
  if (await onWindows($)) return 'windows'
  const r = await hostOf($).run(['uname', '-s'], undefined, 2000).catch(() => undefined)
  return r?.stdout.trim() === 'Darwin' ? 'mac' : 'linux'
}
const musicPlaying = () => model.music?.status === 'open' && model.music.playing
const musicDelay = (shown: boolean) => (musicPlaying() ? (shown ? 1000 : 2000) : 10_000)
// view.tab keeps the last selected tab after the pane closes, so the tab alone does not mean it is on screen.
async function musicShown($: Engine): Promise<{ tab: boolean; player: boolean }> {
  try {
    const panes = await $.ui.panes()
    return { tab: view.tab === 'music' && panes.some(p => p.id === 'ops-control' && p.isShown), player: panes.some(p => p.id === PLAYER_ID && p.isShown) }
  } catch { return { tab: false, player: false } }
}
// A track or play/pause change on this computer is the signal to ask the API now.
const localChanged = (a: Music, b: Music) => a.status !== b.status || (a.status === 'open' && b.status === 'open' && (a.track?.uri !== b.track?.uri || a.playing !== b.playing))
const localUri = () => (localMusic.status === 'open' ? localMusic.track?.uri : undefined)

async function pollMusic($: Engine) {
  const mine = ++musicSeq
  musicTimer?.cancel(); musicTimer = undefined
  if (off || !musicReader) return
  const now = Date.now()
  const read = await musicReader.read(hostOf($), now)
  if (off || mine !== musicSeq) return
  const shown = await musicShown($)
  if (off || mine !== musicSeq) return
  const wasInSight = musicInSight
  musicInSight = shown.tab || shown.player
  const changed = localChanged(localMusic, read)
  localMusic = read
  // the queue is read only in sight, so coming into sight asks too
  if (link && (changed || (musicInSight && !wasInSight))) void pollApi($)
  const next = mergeMusic(read, link, model.music, now, apiDelay(musicPlaying(), musicInSight))
  // The seek bar Client moves itself; where there is none (VS Code, mobile) the static bar needs a redraw per read.
  const seekless = (shown.tab && paneSeekless) || (shown.player && playerSeekless)
  if (!sameMusic(model.music, next, now) || (seekless && next.status === 'open' && next.playing)) feed($, { type: 'music', music: next })
  // a cover is fetched only once someone looks at it, at the size they look at
  const art = next.status === 'open' ? next.track?.artUrl : undefined
  if (art && shown.tab) fetchCover($, art, COVER_COLS)
  if (art && shown.player && playerCover > 0) fetchCover($, art, playerCover)
  musicTimer = $.clock.after(musicDelay(musicInSight), () => void pollMusic($))
}

// Every API answer ends here: the merged state is drawn only when it differs.
function showMusic($: Engine) {
  const now = Date.now()
  const next = mergeMusic(localMusic, link, model.music, now, apiDelay(musicPlaying(), musicInSight))
  if (!sameMusic(model.music, next, now)) feed($, { type: 'music', music: next })
}

function stopApi() {
  apiSeq++; apiTimer?.cancel(); apiTimer = undefined
  apiReading = false; apiAgain = false
}

// Each call bumps apiSeq, so an answer that lands after stopApi or a newer loop is dropped.
async function pollApi($: Engine) {
  const s = spotify
  if (off || !s || !link) return
  if (apiReading) { apiAgain = true; return }
  const mine = ++apiSeq
  apiTimer?.cancel(); apiTimer = undefined
  apiReading = true
  // the local track as the read goes out: without it the merge takes any local track that differs from the API's
  // for a change the API has not seen, and another computer's track flips with this one's on every local poll
  const asked = localUri()
  let r: Awaited<ReturnType<typeof readPlayer>>
  try { r = await readPlayer(s.client) } finally { if (mine === apiSeq) apiReading = false }
  if (mine !== apiSeq) return
  if (off || s !== spotify || !link) return
  const intervalMs = apiDelay(musicPlaying(), musicInSight)
  if (r.ok) link.last = { at: r.at, ...(r.music && { music: r.music }), ...(asked && { localUri: asked }), intervalMs }
  else if (r.error.kind === 'reconnect') return lose($)
  // busy: the last read's request is still out; offline, rate and server: local shows until a read succeeds
  showMusic($)
  const m = model.music
  const uri = m?.status === 'open' && m.source === 'api' ? m.track?.uri : undefined
  if (uri && link.liked?.uri !== uri) void readLiked($, s, uri)
  if (uri && musicInSight && link.upNext?.uri !== uri) void readQueue($, s, uri)
  if (apiAgain) { apiAgain = false; void pollApi($); return }
  apiTimer = $.clock.after(apiDelay(musicPlaying(), musicInSight), () => void pollApi($))
}

// Once per track: the key is set before the read, so a failed read is not tried again for this track.
async function readLiked($: Engine, s: Spotify, uri: string) {
  link!.liked = { uri }
  const a = await s.client.send(likedRequest(uri))
  const on = a.ok ? parseLiked(a.text) : undefined
  if (on === undefined || s !== spotify || link?.liked?.uri !== uri) return
  link.liked = { uri, on }
  showMusic($)
}
async function readQueue($: Engine, s: Spotify, uri: string) {
  link!.upNext = { uri }
  const a = await s.client.send(queueRequest())
  const q = a.ok ? parseQueue(a.text) : undefined
  if (!q?.[0] || s !== spotify || link?.upNext?.uri !== uri) return
  link.upNext = { uri, item: q[0] }
  showMusic($)
}

// A 401 after a refresh, or the refresh token refused: the app on this computer until the person connects again.
function lose($: Engine) {
  stopApi()
  spotify?.keeper.lost()
  link = undefined
  dropLists()
  showMusic($)
  publish($)
}

const refusedText = (why: 'newer' | 'damaged') => why === 'newer'
  ? `${tokenFile(configDir)} was saved by a newer ops-control, so ops-control uses the Spotify app on this computer until you update.`
  : `${tokenFile(configDir)} is damaged. /ops spotify disconnect removes it; then connect again.`

// What the right column shows when no connect is under way.
function restingAccount(): AccountView {
  const st = spotify?.keeper.status()
  if (link) return { step: 'connected', ...(spotifyName && { name: spotifyName }), lists: { shown: lists.shown, state: lists.byId[lists.shown] } }
  if (st === 'reconnect') return { step: 'reconnect' }
  if (st === 'newer' || st === 'damaged') return { step: 'refused', text: refusedText(st) }
  return { step: 'pitch' }
}

// Reads the token file afresh: at session start, after a login and after a disconnect.
async function startSpotify($: Engine) {
  stopApi()
  const host = hostOf($), path = tokenFile(configDir)
  // the refresh token never leaves the file: the helper reads it there, and the mod passes only the generation it saw
  const keeper = new TokenKeeper(host, path, async gen => {
    const bin = await helperPath($)
    if (!bin) return 1
    return (await host.run([bin, 'spotify-refresh', '--file', path, '--if-gen', String(gen)], undefined, 20_000).catch(() => undefined))?.exitCode ?? 1
  })
  const r = await keeper.load()
  const s: Spotify = { keeper, client: new SpotifyClient(host, keeper, () => Date.now()) }
  spotify = s
  link = r.ok ? {} : undefined
  spotifyName = undefined
  // a new connection, a disconnect or another account: no list from before carries over
  dropLists()
  if (r.ok) { void pollApi($); void readName($, s); void loadShown($) }
  showMusic($)
}
async function readName($: Engine, s: Spotify) {
  const a = await s.client.send(meRequest())
  const name = a.ok ? parseMe(a.text) : undefined
  if (!name || s !== spotify) return
  spotifyName = name
  publish($)
}

function setList($: Engine, id: ListId, s: ListState) {
  lists = { ...lists, byId: { ...lists.byId, [id]: s } }
  publish($)
}

async function fetchList(s: Spotify, id: ListId): Promise<{ rows: ListRow[] } | { error: ApiError }> {
  if (id === 'playlists') {
    const a = await allPlaylists(s.client)
    return a.ok ? { rows: playlistRows(a.items) } : { error: a.error }
  }
  const a = await s.client.send(id === 'queue' ? queueRequest() : id === 'recent' ? recentRequest() : devicesRequest())
  if (!a.ok) return { error: a.error }
  let rows: ListRow[] | undefined
  if (id === 'queue') { const q = parseQueue(a.text); rows = q && queueRows(q) }
  else if (id === 'recent') { const r = parseRecent(a.text); rows = r && recentRows(r) }
  else { const d = parseDevices(a.text); rows = d && deviceRows(d) }
  return rows ? { rows } : { error: { kind: 'server', status: a.status } }
}

// Loads the list on screen when its reload rule says so. The dialog's 5 s timer calls it, and so do a list switch and a transfer.
async function loadShown($: Engine) {
  const s = spotify, seq = listSeq
  if (off || !s || !link || !(await musicShown($)).player || seq !== listSeq) return
  // the engine's clock, not Date.now(): mock.clock moves only $.clock, and the 15 s reloads are tested on it.
  // It refuses once the session is torn down, which a timer tick can straddle.
  const now = await $.clock.now().catch(() => undefined)
  if (now === undefined || seq !== listSeq) return
  const id = lists.shown, before = lists.byId[id]
  const m = model.music, uri = m?.status === 'open' ? m.track?.uri : undefined
  if (!needsLoad(id, before, now, uri)) { if (listsDrawn !== lists) publish($); return }
  setList($, id, loadingFrom(before))
  const got = await fetchList(s, id)
  if (seq !== listSeq || s !== spotify) return
  const at = await $.clock.now().catch(() => undefined), forUri = uri ? { forUri: uri } : {}
  if (at === undefined || seq !== listSeq) return
  if ('rows' in got) return setList($, id, { status: 'ready', rows: got.rows, at, ...forUri })
  if (got.error.kind === 'reconnect') return lose($)
  // busy: the tab's own Up next read holds the endpoint; the next tick asks again
  if (got.error.kind === 'busy') return setList($, id, before)
  setList($, id, { status: 'error', rows: rowsOf(before), reason: listError(got.error), at, ...forUri })
}

function startLists($: Engine) {
  listTimer?.cancel()
  listTimer = $.clock.every(5000, () => void loadShown($))
  void loadShown($)
}
function dropLists() { listSeq++; lists = initialLists(model.music) }
function stopLists() { dropLists(); listTimer?.cancel(); listTimer = undefined }

function showList($: Engine, id: ListId) {
  lists = { ...(id === 'devices' ? expire(lists, 'devices') : lists), shown: id }
  publish($)
  void loadShown($)
}

// Values are looked up at press time, so a row a reload removed does nothing.
function pickRow($: Engine, value: string) {
  const row = rowsOf(lists.byId[lists.shown]).find(r => r.value === value)
  if (row) pressMusic($, row.cmd)
}

async function startMusic($: Engine) {
  covers = new ArtCache(20); coversInFlight = new Set(); artBin = undefined
  localMusic = { status: 'closed' }; premiumToasted = false; connectFlow = undefined
  const platform = await musicPlatform($)
  // under WSL the browser and Spotify are Windows apps: their media sessions are read through Windows PowerShell
  const wsl = platform === 'linux' && Boolean((await $.env.get('WSL_DISTRO_NAME')) || (await $.env.get('WSL_INTEROP')))
  musicReader?.stop()
  const reader: MusicReader = new MusicReader(await pickBackend(hostOf($), platform, wsl), platform, () => { if (!off && musicReader === reader) void pollMusic($) })
  musicReader = reader
  await startSpotify($)
  void pollMusic($)
}
function stopMusic($: Engine) {
  musicReader?.stop()
  musicSeq++; musicTimer?.cancel(); musicTimer = undefined; musicReader = undefined
  stopApi()
  stopLists()
  endLogin($)
}
// The login's helper polls its paste file for as long as it lives, so the file goes when the login does.
function endLogin($: Engine, l = login) {
  if (l === login) login = undefined
  if (!l) return
  l.kill()
  void dropPaste($, l.paste)
}
async function dropPaste($: Engine, dest: string) {
  const host = hostOf($), platform = (await onWindows($)) ? 'windows' : 'linux'
  await removeTree(host, dest, platform)
  await removeTree(host, `${dest}.tmp`, platform)
}
// The installer binary, looked up once per session for covers and token refreshes: a missing one stays missing.
const helperPath = ($: Engine) => (artBin ??= installerTarget($).then(t => installerBinary($, t)).then(b => ('path' in b ? b.path : undefined), () => undefined))
// size is the cover's side in pixels: COVER_COLS for the tab, playerCover for the dialog.
function fetchCover($: Engine, url: string, size: number) {
  const key = `${size}:${url}`
  if (off || covers.has(key) || coversInFlight.has(key)) return
  // a picture Windows gave with the session (a video's thumbnail): scaled here, no helper and no download.
  // Until it comes in nothing is cached, so the next read tries again.
  if (url.startsWith(SMTC_ART)) {
    const own = musicReader?.art(url)
    if (own) { covers.set(key, coverRows(scaleArt(own, size))); publish($) }
    return
  }
  coversInFlight.add(key)
  void (async () => {
    try {
      const bin = await helperPath($)
      if (!bin) { covers.set(key, null); return }
      const r = await hostOf($).run([bin, 'spotify-art', '--size', String(size), smallArtUrl(url)], undefined, 15_000)
      // exit 2 is a usage error: a helper from before spotify-art, which will refuse every cover
      if (r.exitCode === 2) artBin = Promise.resolve(undefined)
      // parseArt has already checked rgb holds w*h*3 bytes
      const art = r.exitCode === 0 ? parseArt(r.stdout) : undefined
      covers.set(key, art && art.w === size && art.h === size ? coverRows(art) : null)
      if (!off) publish($)
    } catch { covers.set(key, null) } finally { coversInFlight.delete(key) }
  })()
}
// the controls the player takes: the local app's, or the API's while it runs the player
const musicCapsFor = (m: Model) => capsOf(m.music, musicReader?.caps(), spotify?.client.premium ?? true)
const coverFor = (m: Model, size = COVER_COLS) => { const u = m.music?.status === 'open' ? m.music.track?.artUrl : undefined; return u ? covers.get(`${size}:${u}`) ?? undefined : undefined }
// Inline while the dialog shows, since it holds toasts until it closes; else a toast when toast is true.
async function musicNote($: Engine, text: string, tone: PlayerNote['tone'], toast: boolean) {
  if ((await musicShown($)).player) { playerNote = { text, tone }; publish($) }
  else if (toast) $.ui.toast(text)
}

function pressMusic($: Engine, cmd: MusicCmd) {
  void (async () => {
    const s = spotify, local = musicReader, m = model.music
    const runLocal = async () => { if (local) { await local.control(hostOf($), cmd); void pollMusic($) } }
    const route = routeOf(cmd, m, s?.client.premium ?? true)
    if (route === 'none') return
    if (route === 'local' || !s) return runLocal()
    if (cmd.cmd === 'skipTo') return skipToTrack($, s, cmd.uri)
    const uri = m?.status === 'open' ? m.track?.uri : undefined
    const req = cmd.cmd === 'like' ? (uri ? likeRequest(uri, cmd.on) : undefined) : commandRequest(cmd, m?.status === 'open' && m.playing)
    if (!req) return
    const a = await s.client.send(req)
    if (s !== spotify) return
    if (a.ok) {
      if (cmd.cmd === 'like' && uri && link) { link.liked = { uri, on: cmd.on }; showMusic($) }
      if (cmd.cmd === 'transfer') { lists = expire(lists, 'devices'); void loadShown($) }
      void pollApi($)
      return
    }
    const e = a.error
    // Only a 429 proves Spotify did nothing. After a 5xx, a timeout or a busy endpoint the write may still land, and
    // the local app would apply it twice (next skips two tracks; MPRIS PlayPause toggles an API pause back to playing).
    if (e.kind === 'rate' && route === 'apiThenLocal' && cmd.cmd !== 'like') return runLocal()
    const fromList = cmd.cmd === 'play' || cmd.cmd === 'playContext' || cmd.cmd === 'transfer'
    if (await refused($, e, cmd.cmd === 'like' || fromList ? undefined : runLocal)) return
    if (fromList) return musicNote($, pressError(e), 'error', false)
    if (e.kind === 'busy' || e.kind === 'rate' || e.kind === 'server' || e.kind === 'offline') {
      return musicNote($, 'Spotify is not answering right now. Try again.', 'error', true)
    }
  })()
}

// What a refused API command shows; false when it shows nothing. runLocal is the local fallback for transport after
// PREMIUM_REQUIRED: the list commands have no local form, so for them only the note shows.
// Spotify's error text is never shown: it is the raw body, which nobody vetted for what it carries.
async function refused($: Engine, e: ApiError, runLocal?: () => Promise<void>): Promise<boolean> {
  if (e.kind === 'reconnect') { lose($); return true }
  if (e.kind === 'premium') {
    await musicNote($, runLocal ? 'Spotify playback control needs Premium, so ops-control uses the Spotify app on this computer for it.' : 'Spotify needs Premium for this.', 'error', !premiumToasted)
    premiumToasted = true
    await runLocal?.()
    return true
  }
  if (e.kind === 'noDevice') {
    // Devices is the way out: it can start playback on any device Spotify knows
    if ((await musicShown($)).player) showList($, 'devices')
    await musicNote($, 'Nothing is playing. Pick a device.', 'error', true)
    return true
  }
  if (e.kind === 'refused') { await musicNote($, 'Spotify refused that right now.', 'ok', true); return true }
  return false
}

async function skipToTrack($: Engine, s: Spotify, uri: string) {
  const r = await skipTo(s.client, uri)
  if (s !== spotify) return
  // busy: another queue read was still out (the list's reload or the tab's Up next), so nothing moved; else the queue
  // may have, and Up next reloads
  if (r.kind !== 'busy') lists = expire(lists, 'queue')
  const said = r.kind === 'error' && (await refused($, r.error))
  if (!said && r.kind !== 'done') await musicNote($, skipText(r), r.kind === 'error' ? 'error' : 'ok', false)
  if (r.kind === 'busy') return
  void pollApi($)
  void loadShown($)
}

async function startLogin($: Engine, raw: string) {
  const id = raw.trim().toLowerCase()
  if (!CLIENT_ID.test(id)) { connectFlow = { step: 'steps', error: "A Client ID is 32 hex characters; copy it from your app's page on the dashboard." }; return publish($) }
  // Claimed before the awaits below (a helper download can take seconds), so a dialog close or a second submit in that
  // window cancels this one instead of finding nothing to cancel and spawning a login nobody waits for.
  endLogin($)
  const me = { kill: () => {}, paste: pasteFile(configDir, pasteSession, ++loginSeq) }
  login = me
  const refuse = (error: string) => { login = undefined; connectFlow = { step: 'steps', error }; publish($) }
  const host = hostOf($), out = tokenFile(configDir)
  // spotify-login writes over any file, so a newer ops-control's that appeared since the steps opened is checked here too
  const now = await readTokens(host, out)
  if (login !== me) return
  if (!now.ok && now.why === 'newer') return refuse(refusedText('newer'))
  const bin = await installerBinary($, await installerTarget($))
  if (login !== me) return
  if ('error' in bin) return refuse(`Connecting needs glowup-installer: ${bin.error}`)
  let lastErr = ''
  connectFlow = { step: 'waiting' }
  publish($)
  // The engine's ring keeps its place in the order of the dialog's elements, not the element, and autoFocus applies
  // only as a site takes the keys, which the dialog already holds. Left alone, the ring stays at the Client ID
  // field's old place, on a button or on nothing, and the next letter typed hands the keys to the composer.
  void $.ui.focus({ requestId: PLAYER_ID, key: PASTE_INPUT }).catch(() => {})
  const child = host.spawn([bin.path, 'spotify-login', '--client-id', id, '--out', out, '--paste-file', me.paste], (stream, line) => {
    const l = line.trim()
    if (login !== me || !l) return
    // the helper's own sentences: it never prints a token or a response body
    if (stream === 'stderr') { lastErr = l.slice(0, 300); return }
    if (connectFlow?.step !== 'waiting') return
    // the first stdout line is the authorize address; each later one says why a pasted address was refused
    connectFlow = connectFlow.authUrl ? { ...connectFlow, notice: l } : { step: 'waiting', authUrl: l }
    publish($)
  })
  me.kill = child.kill
  const code = await child.done.catch(() => null)
  if (login !== me) return
  endLogin($, me)
  connectFlow = code === 0 ? undefined : { step: 'steps', error: lastErr || 'The login stopped before Spotify answered.' }
  if (code === 0) await startSpotify($)
  publish($)
}

// spotify-login polls the paste file, since a running child's stdin cannot be written to. Written beside it and moved
// over it, or the helper can read half an address and refuse it as not from this login.
async function pastedAddress($: Engine, text: string) {
  const me = login
  if (!me || connectFlow?.step !== 'waiting') return
  const host = hostOf($), dest = me.paste, tmp = `${dest}.tmp`
  try {
    await host.writeFile(tmp, text.trim())
    const r = await moveFile(host, tmp, dest, (await onWindows($)) ? 'windows' : 'linux')
    if (r.exitCode !== 0) throw new Error(r.stderr.trim() || `exit ${r.exitCode}`)
    // the login ended while the file was being written: nothing will ever read it
    if (login !== me) void dropPaste($, dest)
  } catch (err) {
    $.ui.log(`spotify paste failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
    void dropPaste($, dest)
    if (login !== me || connectFlow?.step !== 'waiting') return
    connectFlow = { ...connectFlow, notice: 'Could not hand the address to the login. Try pasting it again.' }
    publish($)
  }
}

function cancelLogin($: Engine, to: typeof connectFlow) {
  endLogin($)
  connectFlow = to
  publish($)
}

async function disconnectSpotify($: Engine): Promise<string> {
  const host = hostOf($), path = tokenFile(configDir)
  if (!(await host.exists(path))) return 'Spotify is not connected.'
  const bin = await installerBinary($, await installerTarget($))
  if ('error' in bin) return `Disconnecting needs glowup-installer: ${bin.error}`
  // the helper deletes the file, so it stays the only writer of the secret
  const r = await host.run([bin.path, 'spotify-logout', '--file', path]).catch(() => undefined)
  if (r?.exitCode !== 0) return `Could not remove ${path}: ${r?.stderr.trim() || 'glowup-installer failed'}`
  await startSpotify($)
  publish($)
  return 'Disconnected. ops-control uses the Spotify app on this computer again.'
}

async function spotifyCommand($: Engine, action: 'status' | 'connect' | 'disconnect'): Promise<string> {
  if (action === 'disconnect') return disconnectSpotify($)
  const r = await readTokens(hostOf($), tokenFile(configDir))
  const lostIt = spotify?.keeper.status() === 'reconnect'
  if (action === 'connect') {
    // a newer ops-control's file is never overwritten
    if (!r.ok && r.why === 'newer') return refusedText('newer')
    if (r.ok && !lostIt) return 'Spotify is already connected. Run /ops spotify disconnect first to connect another account.'
    // a login already waiting is stopped, so its later exit cannot connect behind the new steps
    cancelLogin($, { step: 'steps' })
    // opens the player, or brings an open one forward at the steps: never the toggle /ops music uses
    return openPlayer($, false, false)
  }
  if (!r.ok) return r.why === 'missing'
    ? 'Spotify: the app on this computer. /ops spotify connect adds your queue, likes and other devices; it needs Spotify Premium and a free developer app of your own.'
    : refusedText(r.why)
  if (lostIt) return 'Spotify needs you to connect again: /ops spotify connect.'
  return `Spotify: connected with Client ID ${r.tokens.clientId.slice(0, 8)}…${spotifyName ? ` as ${spotifyName}` : ''}. /ops spotify disconnect stops it.`
}

function cancelHaiku() {
  haikuAbort?.abort(); haikuAbort = undefined
  haikuGate.reset()
}
// The template is already up; Haiku's line replaces it only if it lands while that bubble is still showing.
// `ctx` was read from the model in say() before its first await: a tool that starts meanwhile must not change what Haiku is told.
async function askHaiku($: Engine, mine: Bubble, ctx: HaikuContext) {
  if (bubbles !== 'haiku' || !interactive || !petOn()) return
  let now: number, lastAt: number
  try {
    now = await $.clock.now()
    // in $.state, not a module variable: a hot reload would otherwise allow one more call in the same window
    lastAt = ((await $.state.get(HAIKU)).value as { lastAt: number } | undefined)?.lastAt ?? -Infinity
  } catch { return }
  if (!haikuGate.take(turnNo, now, lastAt)) return
  void $.state.set(HAIKU, { lastAt: now })
  const stop = new AbortController()
  haikuAbort = stop
  // the abort race below is what ends a call the engine never settles; timeoutMs only bounds the request itself
  const timer = $.clock.after(HAIKU_TIMEOUT_MS, () => stop.abort())
  const limit = ctx.limit ?? bubbleCap
  try {
    const { system, prompt } = haikuPrompt(ctx)
    const maxTokens = haikuMaxTokens(limit)
    const aborted = new Promise<undefined>(r => stop.signal.addEventListener('abort', () => r(undefined)))
    const r = await Promise.race([$.model.complete({ model: HAIKU_MODEL, system, prompt, maxTokens, effort: 'low', timeoutMs: HAIKU_TIMEOUT_MS }, { signal: stop.signal }), aborted])
    if (!r) { $.ui.log('haiku bubble: timed out or cancelled', { to: 'debug' }); return }
    if (!r.isAnswered) { $.ui.log(`haiku bubble: ${r.reason}`, { to: 'debug' }); return }
    // the result has no stop reason; output tokens at the cap mean the reply was cut off
    if (r.usage?.output_tokens >= maxTokens) { $.ui.log('haiku bubble: hit the token cap, template kept', { to: 'debug' }); return }
    const text = sanitizeLine(r.text)
    if (text && !fitsBubble(text, limit)) { $.ui.log('haiku bubble: over the limit, template kept', { to: 'debug' }); return }
    if (!text || off || bubbles !== 'haiku' || !petOn() || bubble !== mine) return
    mine.text = text
    armBubble($, mine)
    publishPet($)
  } catch (err) {
    $.ui.log(`haiku bubble failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
  } finally {
    timer.cancel()
    if (haikuAbort === stop) { haikuAbort = undefined; haikuGate.done() }
  }
}

// One clear timer for the one bubble: arming again (a new bubble, or Haiku's line landing)
// replaces it, and the bubble then shows for the full setup's bubbles.ms from that moment.
function armBubble($: Engine, mine: Bubble) {
  mine.until = Date.now() + setup.bubbles.ms
  bubbleTimer?.cancel()
  bubbleTimer = $.clock.after(setup.bubbles.ms + 100, () => {
    bubbleTimer = undefined
    if (bubble === mine) { bubble = undefined; publishPet($) }
  })
}

async function say($: Engine, mood: Moment, vars: BubbleVars) {
  if (bubbles === 'off' || !petOn() || !speaks(mood, setup.bubbles.moods)) return
  // Kind words only, never the act's label: it holds commands, paths and patterns.
  const ctx: HaikuContext = {
    mood,
    pose: model.working ? (PET_KINDS.includes(model.act.kind ?? '') ? model.act.kind! : 'think') : 'idle',
    label: mood === 'needs-you' ? 'waiting for approval' : model.working ? kindWords(model.act.kind) : undefined,
    tests: mood === 'fail' ? (vars.n === undefined ? 'failed' : `failed ${vars.n}`) : model.lastTest ? (model.lastTest.passed ? 'passed' : 'failed') : undefined,
    daypart: daypart(localTime(Date.now(), tzOffset).hour),
    limit: bubbleCap,
    voice: voiceFor(shownPet(), shownSheet()?.voice),
  }
  let paneShown = false
  try { paneShown = (await $.ui.panes()).some(p => p.id === 'ops-control' && p.isShown) } catch {}
  // A closed pane shows nobody the bubble. The Pane render hook cleared helloDue before scheduling this,
  // so a first draw that ran before the pane was reported shown retries the hello on its next draw.
  if (!paneShown) { if (mood === 'hello') helloDue = true; return }
  helloDue = false
  if (mood === 'hello') void $.state.set(HELLO, { sid: sessionId })
  const hint = mood === 'done' || mood === 'long-done' ? await eggHint($) : undefined
  const now = Date.now(), t = localTime(now, tzOffset)
  const flavours = flavoursOf(t, overlays(t, installed === undefined ? undefined : localTime(installed, tzOffset), friday, failed))
  const line = hint === undefined ? bubbleFor(pool(linesFor(shownPet(), shownSheet()?.lines), mood, flavours, levelOf(model.xp ?? 0).level), vars, lastTemplate, Math.random) : undefined
  if (line) lastTemplate = line.template
  const mine: Bubble = { text: hint ?? line!.text, mood, until: 0 }
  bubble = mine
  armBubble($, mine)
  publishPet($)
  // Haiku never sees a hint turn: it could improvise the code.
  if (hint === undefined && mood !== 'hello' && mood !== 'compact' && mood !== 'level-up') void askHaiku($, mine, ctx)
}
// A character's own famous line while Claude works, said as written: Haiku never rewrites a quote.
async function quip($: Engine) {
  const lines = workingLinesFor(shownPet())
  if (bubbles === 'off' || !petOn() || !lines.length) return
  try { if (!(await $.ui.panes()).some(p => p.id === 'ops-control' && p.isShown)) return } catch { return }
  if (bubble) return
  const line = bubbleFor(lines, {}, lastTemplate, Math.random)
  lastTemplate = line.template
  const mine: Bubble = { text: line.text, mood: 'working', until: 0 }
  bubble = mine
  armBubble($, mine)
  publishPet($)
}
async function eggHint($: Engine): Promise<string | undefined> {
  try {
    const host = hostOf($)
    const eggs = await host.storeGet('eggs') as EggStore | undefined
    const now = await $.clock.now()
    if (!hintDue(eggs, now)) return undefined
    const hints = eggs?.hints ?? 0
    await host.storeSet('eggs', { ...eggs, passRuns: eggs?.passRuns ?? 0, hintAt: now, hints: hints + 1 })
    return EGG_HINTS[hints % EGG_HINTS.length]
  } catch (err) {
    $.ui.log(`egg hint failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
    return undefined
  }
}
function redraw($: Engine) {
  publish($)
  $.ui.status(statusEntry())
  writeStatus($, false)
}
// The one invalidate: the look changed, so every render site draws again.
function relook($: Engine) {
  $.ui.invalidate('ui.render')
  publish($)
}
// Resolves the mix against the packs and themes on disk. Returns the errors it toasted.
async function loadLook($: Engine): Promise<string[]> {
  const host = hostOf($)
  const r = resolveLook(mix, await loadUserPacks(host), await loadUserThemes(host))
  look = r.look
  theme = look.theme
  if (r.errors.length) $.ui.toast(r.errors.join('\n'))
  relook($)
  return r.errors
}
// Elapsed times and agent spinners change with no event behind them, and
// background subagents keep running after the main turn ends.
function syncTicker($: Engine) {
  if (isBusy(model)) ticker ??= $.clock.every(1000, () => { redraw($); void settleTeammates($) })
  else { ticker?.cancel(); ticker = undefined }
}
// A named Agent call starts an in-process teammate, whose loop raises no
// turn.complete of its own: agent.list() going idle is the only sign it is done.
async function settleTeammates($: Engine) {
  if (!agentsRunning(model)) return
  try {
    const status = new Map((await $.agent.list()).map(a => [a.id, a.status]))
    for (const a of model.agents) {
      const s = a.agentId === undefined ? undefined : status.get(a.agentId)
      if (a.state === 'running' && s !== undefined && s !== 'running') feed($, { type: 'agent-done', at: Date.now(), agentId: a.agentId! })
    }
  } catch {}
}
function feed($: Engine, ev: Ev) {
  const old = model
  model = applyEvent(model, ev)
  syncTicker($)
  redraw($)
  let said = momentOf(old, model, ev, { red, moods: setup.bubbles.moods })
  // applyEvent sets lastTest only for main-loop runs, so a subagent's tests never flip this
  if (model.lastTest && model.lastTest.at !== old.lastTest?.at) red = !model.lastTest.passed
  // XP does not depend on the green bubble being on
  if (said?.moment === 'green') turnGain.green++
  if (ev.type === 'turn-done') {
    if (pendingLevelUp && (said === undefined || said.moment === 'done' || said?.moment === 'long-done') && speaks('level-up', setup.bubbles.moods)) said = { moment: 'level-up', vars: { unlock: pendingLevelUp.unlock } }
    pendingLevelUp = undefined
  }
  if (said) void say($, said.moment, said.vars)
  else if (ev.type === 'tool-start' && !bubble && quipDue(model, ev, quipAt)) { quipAt = ev.at; void quip($) }
  // Only the spinner's readers redraw, and only when what it shows changes.
  const next: SpinKey = { turnAt: model.turnAt ?? 0, detail: model.act.label, state: orbStateOf(model) }
  if (next.turnAt !== spinKey.turnAt || next.detail !== spinKey.detail || next.state !== spinKey.state) {
    spinKey = next
    void $.state.set(SPIN, { ...next, at: Date.now() })
  }
}

async function togglePane($: Engine): Promise<string> {
  const open = (await $.ui.panes()).find(p => p.id === 'ops-control')
  if (open?.isShown) { await $.ui.close({ id: 'ops-control' }); return 'ops-control pane closed' }
  const r = await $.ui.open(PANE_OPEN)
  return r.isPlaced ? 'ops-control pane open (Esc closes it)' : `ops-control pane waits: ${r.reason}`
}

// A command is the one close the engine lets a plugin raise on this pane, so /ops music toggles like /ops pane.
// toggle false (the connect flow) opens or brings forward, never closes.
async function openPlayer($: Engine, fromPane: boolean, toggle = !fromPane): Promise<string> {
  const panes = await $.ui.panes()
  if (toggle && panes.some(p => p.id === PLAYER_ID && p.isShown)) { await $.ui.close({ id: PLAYER_ID }); return 'Music player closed' }
  if (fromPane && panes.some(p => p.id === 'ops-control' && p.isShown)) {
    await $.ui.close({ id: 'ops-control' })
    reopenPane = true
  }
  playerNote = undefined
  const r = await $.ui.open(PLAYER_OPEN).catch((err: unknown) => {
    const reason = err instanceof Error ? err.message : String(err)
    $.ui.log(`music player open failed: ${reason}`, { to: 'debug' })
    return { isPlaced: false as const, reason }
  })
  if (!r.isPlaced) {
    if (reopenPane) {
      reopenPane = false
      await $.ui.open(PANE_OPEN).catch((err: unknown) => { $.ui.log(`ops-control pane reopen failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' }) })
    }
    return `Music player waits: ${r.reason}`
  }
  void pollMusic($)
  lists = initialLists(model.music)
  startLists($)
  return 'Music player open (Esc closes it)'
}

async function copyTrackLink($: Engine, url: string, surface: RenderSurface) {
  const r = await $.ui.copy({ text: url, surface }).catch((err: unknown) => ({ isCopied: false as const, reason: err instanceof Error ? err.message : String(err) }))
  playerNote = r.isCopied ? { text: 'Link copied.', tone: 'ok' } : { text: `Could not copy the link: ${r.reason}`, tone: 'error' }
  publish($)
}

async function readConfigLists($: Engine) {
  const host = hostOf($)
  const user = await loadUserPacks(host)
  configPacks = [...new Set([...Object.keys(PACKS), ...Object.keys(user).filter(n => SAFE_NAME.test(n))])]
  const eggs = (await host.storeGet('eggs')) as EggStore | undefined
  configShiny = eggs?.shinyAt !== undefined
  configEgg = eggUnlocked(eggs)
  // a listed pet that does not load would be refused forever, and the Pet row would repeat it
  const pets: string[] = []
  for (const n of await userPetNames(host)) if ('sheet' in await loadUserPet(host, n)) pets.push(n)
  configUserPets = pets
}

async function openConfig($: Engine): Promise<string> {
  await readConfigLists($)
  configNote = undefined
  configFocus = undefined
  const r = await $.ui.open(CONFIG_OPEN)
  return r.isPlaced ? 'ops-control config open (Esc closes it)' : `ops-control config waits: ${r.reason}`
}

const configState = (): ConfigState => ({ packs: configPacks, mix, colors: look.theme.colors, pet, shiny: configShiny, egg: configEgg, userPets: configUserPets, bubbles, reduced: reducedMotion, setup, fields })

// Every change runs as the typed command would; the last command's first line, or its setting's row for a setup, becomes the pane's note.
// A command that leaves the state unchanged was refused, so the rest of the run is dropped: the
// meter cycle's second command must not follow a refused first.
async function runConfig($: Engine, cmds: string[]) {
  let text = '', lastCmd = '', stopped = false
  for (const cmd of cmds) {
    lastCmd = cmd
    const before = JSON.stringify(configState())
    text = await runCommand(hostOf($), cmd, ctlOf($))
    const moved = JSON.stringify(configState()) !== before
    // after the compare: a pack or pet that vanished from disk shrinks the list but was still refused
    if (cmd.startsWith('pack ') || cmd.startsWith('pet ')) await readConfigLists($)
    if (!moved) { stopped = true; break }
  }
  const lines = text.split('\n'), key = lastCmd.match(/^setup (\S+)/)?.[1]
  // every setup command prints the whole table, whose first row is always band
  const line = key ? lines.find(l => l.startsWith(`${key} `)) : undefined
  configNote = { text: line ?? lines[0]!, tone: stopped ? 'error' : 'ok' }
  await syncTakeover($)
  relook($)
}

// runConfig is no use here: it drops the rest of a run after a command that changed nothing, and
// either half of a reset may have nothing to clear.
async function resetConfig($: Engine) {
  if (!(await ctlOf($).confirm('Reset color overrides and your setup (band, tabs, meter, bubbles, pet sleep) to their defaults?'))) return
  await runCommand(hostOf($), 'color reset', ctlOf($))
  await runCommand(hostOf($), 'setup reset', ctlOf($))
  configNote = { text: 'Colors and setup are back to their defaults.', tone: 'ok' }
  await syncTakeover($)
  relook($)
}

async function copyStudioLink($: Engine, link: string, surface: RenderSurface) {
  const r = await $.ui.copy({ text: link, surface }).catch((e: unknown) => ({ isCopied: false as const, reason: e instanceof Error ? e.message : String(e) }))
  configNote = r.isCopied
    ? { text: 'Studio link copied. Open it in a browser to fine-tune this look.', tone: 'ok' }
    : { text: `Could not copy the studio link: ${r.reason}`, tone: 'error' }
  relook($)
}

function stopRemote() {
  remoteTimer?.cancel()
  remoteTimer = undefined
  remote = undefined
}

function startRemote($: Engine, dir: string, cursor: Cursor) {
  stopRemote()
  remote = { dir, cursor, seen: false }
  remoteTimer = $.clock.every(250, () => void pollRemote($))
}

// /ops config runs glowup's prebuilt settings screen, which is released with glowup's own version numbers; Ops Control's
// version (1.0.0 on) says nothing about which of those to download.
const CONFIG_BINARY_VERSION = '1.2.0'

async function versionOf($: Engine): Promise<string> {
  modVersion ??= await hostOf($).readFile(`${$.plugin.root}/.claude-plugin/plugin.json`)
    .then(t => String((JSON.parse(t) as { version?: unknown }).version ?? 'dev'), () => 'dev')
  return modVersion
}

async function writeRemoteState($: Engine) {
  if (!remote) return
  const snap = snapshotOf(configState(), look, { cursor: remote.cursor, version: await versionOf($), cwd, note: configNote })
  await hostOf($).writeFile(`${remote.dir}/state.json`, JSON.stringify(snap))
}

// Applies each new line of the run's commands.jsonl as the pane applied a press, then
// writes state.json. Only this session reads the run, so the store has one writer.
async function pollRemote($: Engine) {
  if (!remote || remotePolling) return
  remotePolling = true
  try {
    const host = hostOf($), r = remote
    const t = await runTimes(host, r.dir)
    // the TUI removes open when it quits; before its first write open is simply not there yet
    if (t.open !== undefined) r.seen = true
    // it writes its last line before removing open, so a quit still owes one read of the file
    const quit = r.seen && t.open === undefined
    if (!isLive(t.open, t.owner, Date.now()) && !quit) { stopRemote(); return }
    const { lines, consumed } = newLines(await host.readFile(`${r.dir}/commands.jsonl`).catch(() => ''), r.cursor.lines)
    if (consumed === r.cursor.lines) { if (quit) stopRemote(); return }
    for (const line of lines) {
      if (!line) { $.ui.log('ops-control config: skipped a line that does not parse', { to: 'debug' }); continue }
      if (line.seq <= r.cursor.seq) continue
      r.cursor.seq = line.seq
      if ('undo' in line) {
        const undo: unknown = await host.readFile(`${r.dir}/undo.json`).then(JSON.parse, () => undefined)
        if (!isUndo(undo)) { configNote = { text: 'ops-control config could not undo: undo.json is missing or damaged.', tone: 'error' }; continue }
        await restoreUndo(host, undo)
        await loadSettings($, host, true)
        await readConfigLists($)
        configNote = { text: 'Back to how it was when ops-control config opened.', tone: 'ok' }
        await syncTakeover($)
        relook($)
        writeStatus($, true)
        publishPet($)
        $.ui.status(statusEntry())
        continue
      }
      const bad = line.cmds.find(c => !allowed(c))
      if (bad) { configNote = { text: `ops-control config cannot run "${shown(bad)}".`, tone: 'error' }; continue }
      await runConfig($, line.cmds)
    }
    r.cursor.lines = consumed
    await writeRemoteState($)
    if (quit) stopRemote()
  } catch (err) {
    $.ui.log(`ops-control config poll failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
  } finally {
    remotePolling = false
  }
}

// the engine has no platform API; Windows sets OS everywhere, and WSL reports Linux
const onWindows = async ($: Engine) => (await $.env.get('OS')) === 'Windows_NT'

// $.env.get takes literal names only
async function termEnv($: Engine): Promise<TermEnv> {
  return {
    TMUX: await $.env.get('TMUX'), KONSOLE_VERSION: await $.env.get('KONSOLE_VERSION'), KITTY_WINDOW_ID: await $.env.get('KITTY_WINDOW_ID'),
    GHOSTTY_RESOURCES_DIR: await $.env.get('GHOSTTY_RESOURCES_DIR'), WEZTERM_PANE: await $.env.get('WEZTERM_PANE'),
    GNOME_TERMINAL_SCREEN: await $.env.get('GNOME_TERMINAL_SCREEN'), TERM_PROGRAM: await $.env.get('TERM_PROGRAM'),
    TERMINAL: await $.env.get('TERMINAL'), DISPLAY: await $.env.get('DISPLAY'), WAYLAND_DISPLAY: await $.env.get('WAYLAND_DISPLAY'),
  }
}

// No uname on native Windows; WSL reports Linux and takes the Unix path.
async function installerTarget($: Engine) {
  const host = hostOf($), windows = await onWindows($)
  const unameS = windows ? 'Windows_NT' : (await host.run(['uname', '-s']).catch(() => undefined))?.stdout ?? ''
  const unameM = windows ? (await $.env.get('PROCESSOR_ARCHITECTURE')) ?? '' : (await host.run(['uname', '-m']).catch(() => undefined))?.stdout ?? ''
  return { windows, platform: platformOf(unameS), target: releaseTarget(unameS, unameM) }
}
const installerBinary = async ($: Engine, t: Awaited<ReturnType<typeof installerTarget>>) =>
  ensureBinary(hostOf($), { opsControlBin: (await $.env.get('OPS_CONTROL_BIN')) || undefined, pluginRoot: $.plugin.root, version: (await versionOf($)) === 'dev' ? 'dev' : CONFIG_BINARY_VERSION, target: t.target, windows: t.windows, onDownload: () => $.ui.toast('Downloading glowup-installer…') })

async function openConfigTui($: Engine): Promise<string> {
  const surfaces = await $.session.surfaces().catch(() => ['terminal'])
  if (!surfaces.includes('terminal')) return openConfig($)
  const host = hostOf($)
  // a run whose TUI never wrote open (a window that did not appear) gives way to a new one
  if (remote) {
    const t = await runTimes(host, remote.dir)
    if (t.open !== undefined && isLive(t.open, undefined, Date.now())) return 'ops-control config is already open.'
  }
  const t = await installerTarget($), platform = t.platform
  const bin = await installerBinary($, t)
  if ('error' in bin) return `ops-control config needs its installer binary: ${bin.error}`
  await readConfigLists($)
  configNote = undefined
  const dir = await createRun(host, sessionId, Math.random().toString(36).slice(2, 10))
  startRemote($, dir, { seq: 0, lines: 0 })
  await writeRemoteState($)
  const cmd = [bin.path, 'config', '--run', dir]
  const manual = `Run this in a terminal: ${shellLine(cmd, platform)}`
  if (!platform) return manual
  const onPath = async (name: string) => platform === 'linux' && (await host.run(['sh', '-c', `command -v ${name}`]).catch(() => undefined))?.exitCode === 0
  const has = { xdgTerminalExec: await onPath('xdg-terminal-exec'), xTerminalEmulator: await onPath('x-terminal-emulator') }
  const term = pickTerminal(await termEnv($), platform, has, cmd)
  if (!term) return manual
  const r = await host.run(detached(term.argv, platform)).catch(() => undefined)
  if (r?.exitCode !== 0) return manual
  return `ops-control config is opening in ${term.name}. If no window appears, ${manual[0]!.toLowerCase()}${manual.slice(1)}`
}

// Not awaited by callers: git must not hold up a tool result. A refresh that
// started before adoptSession must not land in the new session's model.
function refresh($: Engine) {
  refreshQueue(async () => {
    const seq = refreshSeq
    const host = hostOf($)
    const repo = git && await rebase(host, git)
    const asked = model.files
    const files = await refreshCounts(host, asked, repo, Date.now())
    if (seq !== refreshSeq) return
    git = repo
    model = mergeCounts(model, files, asked.map(f => f.path))
    redraw($)
    void readBranch($)
    // the Diff tab is the only reader, so git only produces hunks while it is on screen
    if (visibleTabs(setup.tabs, view.tab).tab === 'diff') {
      const diff = await readDiff(host, repo, model.files)
      if (seq !== refreshSeq || !diff) return
      view = { ...view, diff }
      publish($)
    }
  })
}

async function readBranch($: Engine) {
  if (!fields.includes('branch') || !cwd) return
  const seq = refreshSeq
  const branch = await branchOf(hostOf($), cwd)
  if (seq === refreshSeq) feed($, { type: 'branch', branch })
}

async function readSessionInfo($: Engine) {
  const seq = refreshSeq
  const [modelName, root] = await Promise.all([
    $.session.model().catch(() => undefined),
    $.session.root().catch(() => undefined),
  ])
  if (seq === refreshSeq) feed($, { type: 'session-info', modelName: modelName || undefined, root: root || undefined })
}

// usage() has no percent before the first response of a session, hence the guard.
// The Plan tab's breakdown is fetched here and cached, not on every pane render
// (the ticker redraws each second).
// The context window as the session last reported it; a subagent's requests are measured against it.
let ctxWindow = 200_000
async function feedContext($: Engine) {
  try {
    const u = await $.session.usage({ breakdown: 'summary' })
    if (u.context.window) ctxWindow = u.context.window
    feed($, { type: 'usage', limits: u.rateLimits ?? [], costUsd: u.cost?.usd })
    const b = u.context.breakdown
    view = {
      ...view,
      categories: b?.categories.map(c => ({ name: c.name, tokens: c.tokens, kind: c.kind })),
      maxTokens: b?.maxTokens,
      ctx: b && { autoCompact: b.isAutoCompactEnabled, threshold: b.autoCompactThreshold, window: u.context.window, heavy: heaviest(b), cacheHit: cacheHit(b.apiUsage) },
    }
    if (u.context.percent !== undefined) feed($, { type: 'context', percent: u.context.percent })
    else publish($)
  } catch {}
}

// Claude Code's task list outlives the session, so the plan starts from its files and
// is read again after each main-loop TaskCreate/TaskUpdate (debounced: a burst of calls is one read).
let planTimer: Timer | undefined
async function loadPlan($: Engine) {
  try {
    const id = taskListId(await $.env.get('CLAUDE_CODE_TASK_LIST_ID'), cwd)
    const plan = await loadTasks(hostOf($), id)
    if (plan.length) feed($, { type: 'plan-load', plan })
  } catch {}
}
function schedulePlan($: Engine) {
  planTimer?.cancel()
  planTimer = $.clock.after(150, () => { planTimer = undefined; void loadPlan($) })
}

// A new session id means a new conversation: nothing from the old one carries over.
// cleared: a /clear, which empties the context like a compaction does, so the pet scrunches for it too.
async function adoptSession($: Engine, endedId: string, cleared = false) {
  const id = await $.session.id()
  const { limits, xp, music } = model
  model = { ...initialModel(), limits, xp, music, ...(cleared && { compactAt: Date.now() }) }
  // the music and the connection carry over a /clear; the lists, like everything else on screen, start again
  if (cleared) dropLists()
  turnGain = { green: 0, commits: 0 }
  pendingLevelUp = undefined
  view = { tab: setup.tabs[0]! }
  // a new session's agents are named afresh from the start of the pack's cast
  agentNames = {}
  bubble = undefined
  xpByMessage.clear()
  cancelHaiku()
  friday = false
  failed = false
  red = false
  lastStatusLine = undefined
  refreshSeq++
  // requests made while the id was unknown ('') belong to the new session; the ended session's do not
  const since = sessionId === '' ? requests.list : []
  // at session.end the id may still be the ending one; turn.start re-checks
  sessionId = id === endedId ? '' : id
  await loadRequests($, true)
  if (since.length) setRequests($, adopt(requests, since))
  else publishRequests($)
  void fillRequests($)
  git = await gitBase(hostOf($), cwd)
  void readBranch($)
  void readSessionInfo($)
  syncTicker($)
  redraw($)
  void loadPlan($)
}

// A second session.start (or /clear) while the dialog is open must not stack another.
let asking = false
async function askFirstRun($: Engine) {
  if (asking) return
  asking = true
  try {
    const toast = await firstRun(hostOf($), q => $.ui.ask(q, ['Yes', 'No']).then(label => label, () => undefined), Date.now())
    if (toast) $.ui.toast(toast)
    await syncTakeover($)
  } catch (err) {
    $.ui.log(`first run failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
  } finally {
    asking = false
  }
}

const BUBBLES = BUBBLE_SETTINGS

// The store wins only once a command wrote it. Without a stored mix, the
// 0.1 settings migrate in memory; only a command writes the result back.
async function initialMix(host: Host, options: Readonly<Record<string, unknown>>): Promise<Mix> {
  const stored = await host.storeGet('mix') as Partial<Mix> | undefined
  if (stored && typeof stored.colors === 'string' && typeof stored.motion === 'string') {
    const overrides = cleanOverrides(stored.overrides)
    let theme = typeof stored.theme === 'string' ? stored.theme : undefined
    // arcade was briefly a theme of its own: it is the arcade pack's palette, so a stored one reads as none
    if (theme === ARCADE && !Object.hasOwn(await loadUserThemes(host).catch(() => ({})), ARCADE)) theme = undefined
    return { colors: stored.colors, motion: stored.motion, theme, spinner: typeof stored.spinner === 'string' ? stored.spinner : undefined, ...(overrides && { overrides }) }
  }
  const pack = typeof options.pack === 'string' && options.pack ? options.pack : DEFAULT_MIX.colors
  const storedTheme = await host.storeGet('theme')
  const named = typeof storedTheme === 'string' ? storedTheme : typeof options.theme === 'string' && options.theme !== 'classic' ? options.theme : undefined
  const theme = named === ARCADE && !Object.hasOwn(await loadUserThemes(host).catch(() => ({})), ARCADE) ? undefined : named
  // "pack" is the userConfig default and means the pack's own spinner; an id this build lacks is ignored like a bad pet.
  const spinner = typeof options.spinner === 'string' && (SPINNER_IDS as readonly string[]).includes(options.spinner) ? options.spinner : undefined
  return { ...DEFAULT_MIX, colors: pack, motion: pack, theme, spinner }
}

// The stored choices over the plugin's userConfig. An undo from the config TUI runs it again outside register(),
// and then must not repeat the start-up toasts or reset the docked pane's tab.
async function loadSettings($: Engine, host: Host, undo = false) {
  mix = await initialMix(host, pluginOptions)
  const storedPet = await host.storeGet('pet')
  const eggs = await host.storeGet('eggs') as EggStore | undefined
  const want = typeof storedPet === 'string' ? storedPet : typeof pluginOptions.pet === 'string' && pluginOptions.pet ? pluginOptions.pet : 'clawd'
  pet = 'clawd'
  petSheet = undefined
  if (want === 'clawd-shiny') pet = eggs?.shinyAt === undefined ? 'clawd' : want
  else if (want === 'egg') {
    if (eggUnlocked(eggs)) { pet = 'egg'; petSheet = eggSheet(eggs) }
    // the built-in name wins, so an older pets/egg.json is never loaded
    if (interactive && !undo && await host.exists(`${PET_DIR(configDir)}/egg.json`).catch(() => false)) {
      $.ui.toast('A pet file named egg.json is now the built-in egg\'s name; rename the file and its "name" to keep your pet.')
    }
  }
  else if (want === 'off' || Object.hasOwn(BUILTIN_SHEETS, want)) pet = want
  else {
    const r = await loadUserPet(host, want)
    if ('sheet' in r) { pet = want; petSheet = r.sheet }
    // every loadUserPet error already names the pet or its file
    else if (interactive && !undo) $.ui.toast(`${/[.!?]$/.test(r.error) ? r.error : `${r.error}.`} Showing Clawd.`)
  }
  outfitChoice = parseOutfitStore(await host.storeGet('outfit'))
  const storedBubbles = await host.storeGet('bubbles')
  bubbles = BUBBLES.includes(storedBubbles as BubbleSetting) ? storedBubbles as BubbleSetting : BUBBLES.includes(pluginOptions.bubbles as BubbleSetting) ? pluginOptions.bubbles as BubbleSetting : 'on'
  await loadLook($)
  const motion = await host.storeGet('reducedMotion')
  reducedMotion = typeof motion === 'boolean' ? motion : pluginOptions.reducedMotion === true
  configFields = parseFields(pluginOptions.statusline) ?? DEFAULT_FIELDS
  fields = parseFields(await host.storeGet('statusline')) ?? configFields
  const storedSetup = await host.storeGet('setup')
  const parsed = parseSetup(storedSetup)
  if (setupIsNewer(storedSetup)) parsed.notices.unshift('saved by a newer ops-control, so shown as far as this version reads it and not changed')
  setup = parsed.setup
  if (!undo || !setup.tabs.includes(view.tab)) view = { ...view, tab: setup.tabs[0]! }
  if (parsed.notices.length && !undo) $.ui.toast(`ops-control setup: ${parsed.notices.join('; ')}`)
  petShown = (await host.storeGet('petShown')) !== false
  userNamePacks = await loadPackFiles(host).catch(() => [])
  const storedPack = await host.storeGet('namepack')
  namePackId = typeof storedPack === 'string' && allPacks().some(p => p.id === storedPack) ? storedPack : DEFAULT_NAME_PACK
  await loadPackPet(host)
}

// The pack's character, when it has one: a built-in sheet, or a pet installed under <config>/ops-control/pets.
// One that no longer loads leaves the person's own pet showing.
async function loadPackPet(host: Host) {
  const want = currentPack().pet
  packPet = undefined
  packPetSheet = undefined
  if (!want) return
  if (Object.hasOwn(BUILTIN_SHEETS, want)) { packPet = want; return }
  const r = await loadUserPet(host, want)
  if ('sheet' in r) { packPet = want; packPetSheet = r.sheet }
}

// Each subagent's name under the pack in use, given once per agent and kept for the session.
function namesFor(m: Model): Record<string, string> {
  const pack = currentPack()
  for (const a of m.agents) if (!Object.hasOwn(agentNames, a.key)) agentNames = { ...agentNames, [a.key]: nameAgent(pack, agentNames, a.key, a.name) }
  return agentNames
}

// The Settings tab's actions. Each one says what it did with a toast and redraws the pane.
function settingsActions($: Engine) {
  const host = hostOf($)
  return {
    onBoard: () => { void openBoard($, configDir).then(text => $.ui.toast(text)).catch(() => $.ui.toast('Could not open the Sidequest board.')) },
    // arcade is ops-control's arcade pack, whole; another palette leaves that pack for classic first, so arcade's
    // borders and background never sit under a different palette
    onTheme: (name: string) => {
      const ctl = ctlOf($)
      const steps = name === ARCADE ? ['pack arcade'] : [...(mix.colors === ARCADE ? ['pack classic'] : []), `theme ${name}`]
      void steps.reduce<Promise<string>>((done, step) => done.then(() => runCommand(host, step, ctl)), Promise.resolve('')).then(text => $.ui.toast(text))
    },
    onPet: (on: boolean) => { petShown = on; void host.storeSet('petShown', on); relook($); publishPet($) },
    onPack: (id: string) => {
      namePackId = id
      // names given under the old pack stay with their agents; new agents take the new pack's cast
      settingsUi = {}
      void host.storeSet('namepack', id)
      void loadPackPet(host).then(() => { relook($); publishPet($); publish($) })
    },
    onCreateOpen: (open: boolean) => { settingsUi = { creating: open }; relook($) },
    // a dropdown opens on Enter or a click and closes the same way or on a pick; the ring follows, onto the current
    // option as it opens and back onto the dropdown as it closes
    onDropdown: (which: Dropdown | undefined) => {
      const was = settingsUi.open
      settingsUi = { ...settingsUi, open: which }
      relook($)
      const key = which ? optionKey(which, which === 'theme' ? shownTheme() : namePackId) : was ? dropdownKey(was) : undefined
      if (key) void $.ui.focus({ requestId: 'ops-control', key }).catch(() => {})
    },
    onCreate: (description: string) => {
      const text = description.trim()
      if (!text || settingsUi.making) return
      settingsUi = { making: text }
      relook($)
      const ask = async (prompt: string, opts: { model: string; maxTokens: number }) => {
        const r = await $.model.complete({ model: opts.model, prompt, maxTokens: opts.maxTokens }).catch(() => undefined)
        return r?.isAnswered ? r.text : undefined
      }
      void createPack(host, ask, text, allPacks().map(p => p.id)).then(async made => {
        settingsUi = {}
        if (made.pack) {
          userNamePacks = await loadPackFiles(host).catch(() => userNamePacks)
          namePackId = made.pack.id
          await host.storeSet('namepack', made.pack.id)
          await loadPackPet(host)
          publishPet($)
          publish($)
        }
        $.ui.toast(made.message)
        relook($)
      }).catch(err => { settingsUi = {}; $.ui.toast(`Could not make the pack: ${err instanceof Error ? err.message : String(err)}`); relook($) })
    },
  }
}

function ctlOf($: Engine): Ctl {
  return {
    current: () => theme.name,
    setTheme: async name => { mix = { ...mix, theme: name }; await loadLook($) },
    togglePane: () => togglePane($),
    setMotion: reduced => { reducedMotion = reduced; relook($) },
    // ask rejects when the person dismisses the dialog; that counts as No
    confirm: async question => (await $.ui.ask(question, ['Yes', 'No']).catch(() => 'No')) === 'Yes',
    mix: () => mix,
    setMix: async m => { mix = m; return loadLook($) },
    pet: () => pet,
    setPet: (p, sheet) => { pet = p; petSheet = sheet; relook($) },
    setOutfit: choice => { outfitChoice = choice; relook($); publishPet($) },
    bubbles: () => bubbles,
    setBubbles: b => { bubbles = b; if (b !== 'haiku') cancelHaiku(); relook($) },
    reduced: () => reducedMotion,
    fields: () => fields,
    setFields: f => {
      fields = f ?? configFields
      void readBranch($)
      writeStatus($, true)
      $.ui.status(statusEntry())
    },
    setup: () => setup,
    setSetup: s => { setup = s; relook($); writeStatus($, true); publishPet($) },
    openConfig: () => openConfig($),
    openConfigTui: () => openConfigTui($),
    openPlayer: () => openPlayer($, false),
    spotify: action => spotifyCommand($, action),
    // surfaces() is empty only in a plain -p run
    headless: async () => (await $.session.surfaces().catch(() => ['terminal'])).length === 0,
  }
}

declare function setTimeout(fn: () => void, ms: number): unknown
// Long enough for a copy that started at the same moment to write its entry.
const SETTLE_MS = 150

function goOff($: Engine, winner: string) {
  off = true
  cancelHaiku()
  ticker?.cancel(); ticker = undefined
  beatTimer?.cancel(); beatTimer = undefined
  planTimer?.cancel(); planTimer = undefined
  bubbleTimer?.cancel(); bubbleTimer = undefined
  stopMusic($)
  stopRemote()
  takenOver = false
  $.ui.status(undefined)
  $.ui.toast(`ops-control is loaded twice (${guardRoot} and ${winner}); this copy is off. Disable one: claude plugin disable ops-control@ops-control`)
}

// A copy that registered after our session.start check, or a /clear that gave the session a
// new id, can change the answer. Only active -> off: a copy that lost at session.start never
// ran its init, so it cannot be switched back on. Returns true when this copy went off.
async function recheckGuard($: Engine, id: string): Promise<boolean> {
  const sid = safeId(id)
  if (!sid || !guardRoot) return false
  try {
    const host = hostOf($)
    if (sid !== guardSid) {
      guardSid = sid
      await registerCopy(host, sid, guardRoot, Date.now())
    }
    const d = await decide(host, sid, guardRoot, Date.now())
    if (d.active) return false
    goOff($, d.winner)
    return true
  } catch { return false }
}

// The loader reads `on("<event>", hook)` literally, so no wrapper can gate the hooks:
// each one opens with `if (off) return next(e)`. session.start and session.end run
// the guard and its cleanup themselves.
export const register: Register = (on, options) => {
  wireOpspin(on, () => off)
  wireOpstask(on, () => off)
  pluginOptions = options
  reducedMotion = options.reducedMotion === true

  // Null from ops-control's own methods. When no renderer answers, ops-control draws the effect the pack
  // picked (hooks/effects.ts) in the caller, not here: the test engine never runs these bodies.
  on('engine.create', async (_$, e, next) => {
    const built = await next(e)
    return { ...built, ops: { field: async () => null, meter: async () => null, divider: async () => null } }
  })

  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    interactive = e.isInteractive
    red = false
    helloDue = false
    policyGiven = false
    cancelHaiku()
    // $.env.get takes literal names only; an empty CLAUDE_CONFIG_DIR counts as unset
    // cmd and PowerShell set USERPROFILE, not HOME
    home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE')) || ''
    configDir = (await $.env.get('CLAUDE_CONFIG_DIR')) || `${home}/.claude`
    const xdg = await $.env.get('XDG_DATA_HOME')
    dataHome = xdg && /^([/\\]|[A-Za-z]:[/\\])/.test(xdg) ? xdg : `${home}/.local/share`
    const host = hostOf($)
    off = false
    guardSid = safeId(await $.session.id())
    guardRoot = $.plugin.root
    if (guardSid) {
      try {
        await registerCopy(host, guardSid, guardRoot, Date.now())
        await new Promise<void>(r => setTimeout(r, SETTLE_MS))
        const d = await decide(host, guardSid, guardRoot, Date.now())
        if (!d.active) {
          goOff($, d.winner)
          return next(e)
        }
        void pruneStatus(host, STATUS_DIR(configDir))
      } catch (err) {
        // better two copies than none: a guard that cannot read its files steps aside
        $.ui.log(`two-copies guard failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
      }
    }
    startBeat($)
    void checkStale($)
    await $.command.register({ name: 'ops', description: 'Themes, the ops-control pane and status line', argumentHint: 'config|theme|pack|spinner|color|import|export|pet|bubbles|pane|music|spotify|motion|statusline on|fields|setup|level|outfit|restore' })
    await startOpspin($)
    await startOpstask($)
    // the machine's load, read only while the Context tab shows
    if (e.isInteractive) startSysSampler($, () => !off && view.tab === 'context', load => { view = { ...view, sys: { ...load, tz: tzOffset } }; publish($) })
    // once: what the person made under glowup's folder comes along before the settings read it
    if ((await host.storeGet('carried')) !== true) {
      const copied = await carryOver(host).catch(() => 0)
      await host.storeSet('carried', true)
      if (copied && e.isInteractive) $.ui.toast(`Ops Control brought ${copied} of your files over from ~/.claude/glowup.`)
    }
    await loadSettings($, host)
    await offerMilestones($)
    if (e.isInteractive) void startMusic($)
    sessionId = await $.session.id()
    await loadRequests($)
    void fillRequests($)
    if (e.isInteractive) await loadGuardrails($)
    // saved request lists no session has resumed for a month go
    if (e.isInteractive) void host.run(['find', requestsDir(), '-type', 'f', '-name', '*.json', '-mtime', '+30', '-delete']).catch(() => {})
    try { helloDue = e.isInteractive && (await $.state.get(HELLO)).value?.sid !== sessionId } catch { helloDue = e.isInteractive }
    // A hot reload restarts this module mid-run: pick this session's live run back up, and
    // drop runs nobody has touched for a day.
    try {
      const { live, stale } = await scanRuns(host, sessionId, Date.now())
      const platform = (await onWindows($)) ? 'windows' : 'linux'
      for (const d of stale) await removeTree(host, d, platform)
      if (live[0]) {
        const st = JSON.parse(await host.readFile(`${live[0]}/state.json`).catch(() => '{}')) as { seq?: unknown; lines?: unknown }
        startRemote($, live[0], { seq: Number(st.seq) || 0, lines: Number(st.lines) || 0 })
      }
    } catch (err) {
      $.ui.log(`ops-control config resume failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
    }
    // the sandbox may run in UTC, where getTimezoneOffset() says 0 for everyone
    const tzo = new Date().getTimezoneOffset()
    let zone: string | undefined
    if (tzo === 0) { try { zone = (await host.run(['date', '+%z'])).stdout } catch {} }
    tzOffset = localOffset(tzo, zone)
    const at = await host.storeGet('installed-at')
    installed = typeof at === 'number' ? at : undefined
    turnGain = { green: 0, commits: 0 }
    pendingLevelUp = undefined
    try { feed($, { type: 'level', xp: parseLevelStore(await host.storeGet('level')) }) } catch {}
    // After the saved choices are loaded: the commands read and extend them (a spinner is added to
    // the current mix), and write the new choice to the store by the same path a typed command does.
    try {
      const toast = await syncPlugin(host, options, cmd => runCommand(host, cmd, ctlOf($)))
      if (toast) $.ui.toast(toast)
    } catch (err) {
      $.ui.log(`/plugin sync failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
    }
    const colorterm = await $.env.get('COLORTERM')
    colorMode = colorterm === 'truecolor' || colorterm === '24bit' ? 'truecolor' : '256'
    await syncTakeover($)
    git = await gitBase(host, cwd)
    void readBranch($)
    void readSessionInfo($)
    // a hot reload restarts the module mid-session with an empty model; without this the beat
    // writes a line with no ctx or limits until the next tool call or turn end
    void feedContext($)
    void loadPlan($)
    // a beat after launch, so the dialog does not open over the startup frame
    if (e.isInteractive) $.clock.after(1500, () => void askFirstRun($))
    // a hot reload restarts this module; the live band and pane must not keep an old snapshot
    publish($)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (off) return next(e)
    // belt and braces: session.end may have run before the new id was visible
    const id = await $.session.id()
    if (await recheckGuard($, id)) return next(e)
    if (id !== sessionId) await adoptSession($, sessionId)
    newTurnWord()
    turnNo++
    friday = false
    failed = false
    turnGain = { green: 0, commits: 0 }
    pendingLevelUp = undefined
    feed($, { type: 'turn-start', at: Date.now() })
    if (!e.agentId) {
      setRequests($, startTurn(requests, { turnId: e.turnId, text: e.text, at: Date.now() }))
      // the newest request is the top row: a list scrolled down comes back up to it
      if (view.tab === 'plan' && !view.request && view.offset) { view = { ...view, offset: 0 }; publish($) }
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (!off && !e.agentId) {
      const effort = e.effort === undefined ? undefined : String(e.effort)
      if (effort !== model.effort) feed($, { type: 'effort', effort })
    }
    const r = yield* next(e)
    // a subagent's context is what its latest request was sent with: the main session's usage() never counts it
    if (!off && e.agentId && r?.usage) {
      const u = r.usage, sent = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
      feed($, { type: 'agent-context', agentId: e.agentId, percent: Math.min(100, (sent / ctxWindow) * 100) })
    }
    return r
  })

  on('tool.call', async ($, e, next) => {
    if (off) return next(e)
    // without an id the call cannot be matched to its end (an Agent row would never close)
    if (!e.tool_use_id) return next(e)
    const input = e as unknown as Record<string, unknown>
    const toolUseId = e.tool_use_id
    if (!e.agentId && e.tool === 'Bash' && typeof input.command === 'string' && fridayDeploy(input.command, localTime(await $.clock.now(), tzOffset))) friday = true
    feed($, { type: 'tool-start', at: Date.now(), tool: e.tool, toolUseId, agentId: e.agentId, input })
    // before next(): the subagent's calls arrive while the Agent call runs
    if (!e.agentId && e.tool === 'Agent') setRequests($, agentStart(requests, toolUseId), true)
    const { tool: _t, tool_use_id: _i, agentId: _a, consent: _c, ...args } = input
    flying.set(toolUseId, { tool: e.tool, input: args })
    let ran
    try { ran = await next(e) } finally { flying.delete(toolUseId) }
    const denied = ran.deny !== undefined
    const result = denied || ran.isError ? undefined : ran.result as unknown as { task?: { id?: unknown }; totalTokens?: unknown; type?: unknown } | undefined
    const endAt = Date.now()
    const isError = denied || ran.isError === true, text = ran.text ?? ran.deny ?? ''
    const resultTaskId = e.tool === 'TaskCreate' && result?.task?.id !== undefined ? String(result.task.id) : undefined
    const writeType = e.tool === 'Write' && (result?.type === 'create' || result?.type === 'update') ? result.type : undefined
    feed($, {
      type: 'tool-end', at: endAt, tool: e.tool, toolUseId, agentId: e.agentId, input, isError, text, resultTaskId,
      agentTokens: e.tool === 'Agent' && typeof result?.totalTokens === 'number' ? result.totalTokens : undefined,
      writeType,
    })
    // after the feed, so a TaskCreate's task is in the plan with its title
    setRequests($, requestWork(requests, { tool: e.tool, toolUseId, agentId: e.agentId, input, isError, text, resultTaskId, writeType, ...(denied && { denied }) }, model.plan), true)
    if (!denied && !ran.isError && !e.agentId && e.tool === 'Bash' && typeof input.command === 'string') turnGain.commits += countCommits(input.command)
    if (!e.agentId && model.lastTest?.at === endAt && !model.lastTest.passed) {
      failed = true
      publishPet($)
    }
    if (!e.agentId && model.lastTest?.at === endAt && model.lastTest.passed) {
      try {
        const r = recordPass(await hostOf($).storeGet('eggs') as EggStore | undefined, Date.now())
        await hostOf($).storeSet('eggs', r.next)
        if (pet === 'egg') {
          const cracked = eggSheet(r.next)
          if (cracked !== petSheet) { petSheet = cracked; relook($) }
        }
        if (r.unlocked) $.ui.toast('Clawd went shiny. /ops pet clawd-shiny (see him in /ops pane)')
      } catch (err) {
        $.ui.log(`pass counter failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
      }
    }
    if (!denied && !e.agentId && (e.tool === 'Edit' || e.tool === 'Write' || e.tool === 'NotebookEdit' || e.tool === 'Bash')) refresh($)
    if (!denied && (e.tool === 'Edit' || e.tool === 'Write') && typeof input.file_path === 'string' && isSource(input.file_path, cwd)) void loadGuardrails($)
    if (!e.agentId) void feedContext($)
    if (!denied && !e.agentId && (e.tool === 'TaskCreate' || e.tool === 'TaskUpdate')) schedulePlan($)
    return ran
  })

  // A default switched on in the Guardrails tab is enforced: a call it covers is put to the person (no classifier's
  // allow settles it) or refused. It only tightens: a call already refused stays refused.
  on('tool.check', async ($, e, next) => {
    const r = await next(e)
    if (off || r.decision === 'deny' || !cwd) return r
    const v = verdictFor(e.tool, e.input, cwd, guardSw)
    if (!v) return r
    return { ...r, decision: v.decision, reason: v.reason, ...(v.decision === 'ask' && { decider: 'person' as const }) }
  })

  // ops-control's milestones tool answers here; the hook above, which wraps this one, files the list under the request.
  on('tool.call', { tool: /^mcp__ops-control__milestones$/ }, async ($, e, next) => {
    if (off || !milestonesTool) return next(e)
    const input = e as unknown as Record<string, unknown>
    // the main session's list files under its request (requests.ts); a subagent's is its own
    if (e.agentId) {
      const objective = typeof input.objective === 'string' ? input.objective.replace(/\s+/g, ' ').trim() : ''
      feed($, { type: 'agent-milestones', agentId: e.agentId, milestones: readMilestones(input.milestones), ...(objective && { objective }) })
    }
    return { result: recorded(input) }
  })

  // The one signal that a dialog is on screen. tool.check's `ask` is not it: that hands the call
  // to the mode's decider, and in auto mode the classifier answers with no one asked.
  on('classic.PermissionRequest', async ($, e, next) => {
    if (off) return next(e)
    // A hook below may answer the request itself, and then no dialog opens.
    const r = await next(e)
    if (!r?.decision && modeAsksPerson(e.permission_mode)) {
      const id = dialogCall(flying, e.tool_name, e.tool_input)
      if (id) feed($, { type: 'needs-you', at: Date.now(), toolUseId: id, what: approvalLabel(e.tool_name, (e.tool_input ?? {}) as Record<string, unknown>) })
    }
    return r
  })

  on('agent.spawn', async ($, e, next) => {
    if (off) return next(e)
    // a subagent starts from its own prompt, so it is told about the milestones tool there; a fork carries the
    // session's, and a workflow's or a resumed run's prompt is not ours to change
    const told = milestonesTool && !e.fork && !e.workflow && !e.resume ? { ...e, prompt: `${e.prompt}\n\n${policy(milestonesTool)}` } : e
    const r = await next(told)
    if (r.agentId) {
      // an agent no Agent call announced (/subtask's fork) is listed by what its spawn says
      const name = e.name || e.subagentType || 'agent'
      feed($, { type: 'agent-bind', toolUseId: e.tool_use_id ?? '', agentId: r.agentId, at: Date.now(), name, task: e.description ?? '' })
      if (e.tool_use_id) setRequests($, agentBind(requests, e.tool_use_id, r.agentId), true)
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    if (off) return next(e)
    // the ticker would redraw through the whole wait for next(); feed restarts it
    // while background subagents still run
    if (!e.agentId) { ticker?.cancel(); ticker = undefined }
    const r = await next(e)
    if (e.agentId) {
      // A background Agent call returns before the run, so its result carries no totalTokens.
      const u = e.usage
      const tokens = u ? u.input_tokens + u.output_tokens + u.cache_creation_input_tokens : undefined
      feed($, { type: 'agent-done', at: Date.now(), agentId: e.agentId, tokens })
      refresh($)
      return r
    }
    // the guard heartbeat can flip `off` while next() is awaited
    if (off) return r
    setRequests($, endTurn(requests, { turnId: e.turnId, answer: e.answer, reason: e.reason, durationMs: e.durationMs, at: Date.now(), plan: model.plan }))
    // the final answer was drawn before the turn ended: draw the transcript again so it gets its Conclusion header
    if (e.reason === 'answer' && e.answer.trim()) $.ui.invalidate('ui.render')
    // a prompt typed during this turn that no turn of its own takes soon was taken into this one
    if (hasQueued(requests)) {
      queuedSettle?.cancel()
      queuedSettle = $.clock.after(10_000, () => { queuedSettle = undefined; if (!requests.turnId) setRequests($, settleQueued(requests)) })
    }
    // turn-done leaves combo alone (turn-start resets it), so the model still holds this turn's count
    try {
      const host = hostOf($)
      const stored = await host.storeGet('level')
      if (levelStoreIsNewer(stored)) throw new Error('saved by a newer ops-control; left as it is')
      const before = parseLevelStore(stored)
      const after = before + turnXp({ answered: e.reason === 'answer', combo: model.combo, ...turnGain })
      await host.storeSet('level', levelStore(after))
      feed($, { type: 'level', xp: after })
      pendingLevelUp = levelUp(before, after)
      // Own try: a failed outfit write must not drop the level-up bubble.
      try {
        if (outfitUnlocked(levelOf(before).level, levelOf(after).level) && !outfitStoreIsNewer(await host.storeGet('outfit'))) {
          // With no built-in pet on there is nothing to wear; clearing the choice lets the newest outfit show when one returns.
          const worn = unlockedOutfits(pet, levelOf(after).level).at(-1)
          if (worn) await host.storeSet('outfit', outfitStore(worn))
          else await host.storeDelete('outfit')
          outfitChoice = worn
        }
      } catch (err) {
        $.ui.log(`outfit store failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
      }
    } catch (err) {
      $.ui.log(`level store failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
    }
    feed($, { type: 'turn-done', at: Date.now(), reason: e.reason })
    refresh($)
    await feedContext($)
    void readSessionInfo($)
    // one more redraw after the linger so the band folds away
    $.clock.after(1600, () => publish($))
    return r
  })

  on('session.compact', async ($, e, next) => {
    if (off) return next(e)
    const r = await next(e)
    if (e.agentId || e.trigger === 'precompute' || 'skip' in r) return r
    // the summary leaves the policy's prompt behind, and the note about project rules switched off
    policyGiven = false
    guardNote = offNote(view.guardrails, guardSw) ?? guardNote
    // usage().context.percent is absent until the next response, so a manual
    // /compact would leave the hearts empty; derive it from the result.
    const u = await $.session.usage()
    const percent = u.context.percent ?? (r.tokensAfter !== undefined && u.context.window > 0 ? Math.round(r.tokensAfter / u.context.window * 100) : 0)
    feed($, { type: 'compact', at: Date.now() })
    feed($, { type: 'context', percent })
    return r
  })

  on('session.measure', async ($, e, next) => {
    if (off) return next(e)
    feed($, { type: 'usage', limits: e.rateLimits, costUsd: e.cost?.usd })
    return next(e)
  })

  // /clear and resume continue the process under a new session id with no session.start.
  on('session.end', async ($, e, next) => {
    if (guardSid) await unregisterCopy(hostOf($), guardSid, guardRoot)
    if (off) return next(e)
    await flushRequests($)
    if (e.reason === 'clear' || e.reason === 'resume') await adoptSession($, e.sessionId, e.reason === 'clear')
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (off) return next(e)
    if (e.props.hasSurvey) return next(e)
    const viewed = e.props.view.agentId
    if (viewed) {
      // a subagent's transcript in view: its own work bar, when ops-control knows the agent
      const live = (await $.state.get(BAND)).value as { model: Model } | undefined
      const m = live ? normalizeModel(live.model) : model
      const work = setup.bar === 'work' ? agentWork(m, viewed) : undefined
      if (!work) return next(e)
      const below = await next(e)
      const els = $.ui.resolve(e), { Box } = els
      const c = view.ctx
      const marker = c?.autoCompact && c.threshold && c.window ? (c.threshold / c.window) * 100 : undefined
      const bar = renderWorkBar(els, look?.theme ?? theme, { ...work, ...(marker !== undefined && { marker }), meter: setup.meter, now: Date.now(), columns: e.props.bodyColumns, look })
      return below ? <Box flexDirection="column">{bar}{below}</Box> : bar
    }
    // Asked once. Claude Code places it unasked only from 144 columns (110 once the
    // person has opened it); narrower, it waits and the band shows instead.
    if (e.viewport?.isFullscreen === true && !docked) { docked = true; void $.ui.open(DOCK_OPEN).catch(() => {}) }
    const panes = await $.ui.panes()
    const paneShown = panes.some(p => p.id === 'ops-control' && p.isShown && p.isPlaced)
    // Only a docked pane shows the status the band would repeat; an inline one is a short drawer.
    const tier = tierFor(e.props.bodyColumns, paneShown && panePlacement === 'dock')
    const below = await next(e)
    const els = $.ui.resolve(e)
    const live = (await $.state.get(BAND)).value as { model: Model } | undefined
    const m = live ? normalizeModel(live.model) : model, now = Date.now()
    let mine
    if (setup.bar === 'work') {
      // the work bar stands in for the band: always there, docked pane or not
      const asked = (await $.state.get(REQS)).value as { requests?: Requests } | undefined
      const work = workOf(asked?.requests ?? requests, m.plan)
      const cur = work.steps[currentMilestone(work.steps)]
      if ((cur?.title ?? '') !== workSince.title) workSince = { title: cur?.title ?? '', at: now }
      const c = view.ctx
      const marker = c?.autoCompact && c.threshold && c.window ? (c.threshold / c.window) * 100 : undefined
      mine = renderWorkBar(els, look?.theme ?? theme, { model: m, ...work, issues: workIssues(asked?.requests ?? requests), ...(cur && { since: workSince.at }), ...(marker !== undefined && { marker }), meter: setup.meter, now, columns: e.props.bodyColumns, look })
    } else mine = renderBand(els, m, theme, e.props.bodyColumns, tier, now, { look, band: setup.band })
    const pinned = pinRows(els, look, e.props.bodyColumns)
    if (!mine && !pinned) return below
    // other mods draw bands here too: stack ours on top instead of replacing theirs
    const { Box } = els
    return <Box flexDirection="column">{pinned}{mine}{below}</Box>
  })

  on('ui.render', { component: 'Pane', requestId: 'ops-control' }, async ($, e, next) => {
    if (off) return next(e)
    // The pane is usually closed at session start, so the hello waits for the first draw.
    if (helloDue && !bubble) { helloDue = false; $.clock.after(0, () => void say($, 'hello', {})) }
    // a render hook cannot write state: publish after the draw
    if (panePlacement !== e.props.placement) { panePlacement = e.props.placement; $.clock.after(0, () => publish($)) }
    const live = (await $.state.get(PANE)).value as { model: Model; view: PaneView } | undefined
    const compact = e.props.placement === 'inline' && e.props.bodyColumns < 80
    const box = bubbleBox(e.props.bodyColumns, compact)
    bubbleCap = haikuLimit(box.cols, box.lines)
    const v: PaneView = { ...(live?.view ?? view), reduced: reducedMotion }
    const els = $.ui.resolve(e)
    // the look always applies; the pet and its words only while he is on
    const pid = shownPet(), reduced = reducedMotion, sheetNow = shownSheet()
    let extra: PaneExtra = { look, tabs: setup.tabs }
    if (pid !== 'off' && !reduced && (e.surface === 'terminal' || e.surface === 'desktop')) {
      const snap = ((await $.state.get(PET)).value as PetSnap | undefined) ?? petSnap()
      const { Client } = $.ui.resolve(e)
      const props: PetClientProps = { pet: pid, input: snap.input, overlays: snap.overlays, reduced, compact, width: petStripCols(e.props.bodyColumns), tint: look.pet, level: snap.level, ...(snap.outfit && { outfit: snap.outfit }), ...(sheetNow && { sheet: sheetNow }) }
      const sheet = sheetNow ?? (Object.hasOwn(BUILTIN_SHEETS, pid) ? BUILTIN_SHEETS[pid] : undefined) ?? CLAWD_SHEET
      // unsized, the region shrinks to the sprite and surface.columns leaves no room to walk
      const node = <Client key="ops-control-pet" module="./client/pet.tsx" props={props} width={compact ? undefined : props.width} />
      const bubbleNow = snap.bubble && snap.bubble.until > Date.now() ? snap.bubble : undefined
      extra = { ...extra, pet: { id: pid, node, rows: stripRows(sheet, withLevelOutfit(sheet, snap.overlays, snap.outfit)) }, bubble: bubbleNow, friday: snap.friday }
    }
    // the engine scrolls the whole body, which would carry the pet off with a long tab: budget the tab to bodyRows instead
    extra = { ...extra, bodyRows: e.props.scroll.bodyRows, onRange: (last, win) => { scroll = { last, win } }, onMusic: (cmd: MusicCmd) => pressMusic($, cmd), onPlayer: () => void openPlayer($, true) }
    paneSeekless = e.surface !== 'terminal' && e.surface !== 'desktop'
    if (e.surface === 'terminal' || e.surface === 'desktop') {
      const { Client } = $.ui.resolve(e)
      // Through JSON because Client props refuse undefined fields.
      extra = { ...extra, seek: (props: SeekBarProps) => <Client key="ops-control-seek" module="./client/seekbar.tsx" props={JSON.parse(JSON.stringify(props))} width={props.cols} /> }
    }
    if (e.props.placement === 'dock') extra = { ...extra, minRows: e.props.scroll.bodyRows }
    // read through the state so a change to the requests redraws the pane
    const asked = (await $.state.get(REQS)).value as { requests?: Requests } | undefined
    extra = { ...extra, requests: asked?.requests ?? requests, onRequest: (id?: string) => { view = { ...view, tab: 'plan', request: id, offset: 0 }; publish($) } }
    extra = { ...extra, onAgent: (key?: string) => { view = { ...view, tab: 'agents', agent: key, offset: 0 }; publish($) }, onGuard: (key?: string) => flipGuard($, key) }
    if (v.tab === 'settings') {
      const themes = [...new Set([...Object.keys(PRESETS), ...Object.keys(await loadUserThemes(hostOf($)).catch(() => ({})))])]
      extra = { ...extra, settings: renderSettings(els, theme, {
        theme: shownTheme(), themes, petOn: petShown, pack: namePackId, packs: allPacks().map(p => ({ id: p.id, label: p.label })), ...settingsUi,
      }, settingsActions($), e.props.bodyColumns - 2) }
    }
    const m = live ? normalizeModel(live.model) : model, pack = mix.colors, colors = palette(), picked = lookKey()
    if (!compact) {
      const width = e.props.bodyColumns - 2 - 4, windows = meterWindows(m, Date.now(), tzOffset)
      ask($, meterAsk, JSON.stringify([picked, width, windows, m.ctxPercent, colors]), async () =>
        cleanRows(await $.ops.meter({ pack, width, windows, ctxPercent: m.ctxPercent, colors }), 3, colors.text)
          ?? (look.meters === 'dither' ? ditherMeters(width, windows, m.ctxPercent, colors) : null))
      // between asks the last rows stay up, but never another look's
      if (meterAsk.value && JSON.parse(meterAsk.key)[0] === picked) extra = { ...extra, meter: meterAsk.value }
    }
    if (e.props.placement === 'dock' && !compact && (e.surface === 'terminal' || e.surface === 'desktop')) {
      const cols = e.props.bodyColumns - 2, rows = e.props.scroll.bodyRows, reduced = reducedMotion
      const key = JSON.stringify([picked, cols, rows, colors, reduced])
      ask($, fieldAsk, key, async () => cleanFrames(await $.ops.field({ pack, cols, rows, colors, reduced }), rows, colors.text))
      // a plugin's frames win; else the pack's own shape, which the Client draws live, so it sends no frames
      const got = fieldAsk.key === key ? fieldAsk.value : null, field = look.motion.field
      if (got || field.shape !== 'none') {
        const { Client } = $.ui.resolve(e)
        extra = { ...extra, field: (open: number) => {
          const fit = got && fitField(got, open)
          if (got && !fit) return null
          const props: FieldClientProps = fit ? { frames: fit.frames, ms: fit.ms, reduced } : { live: { cols, rows: open, colors, field }, reduced }
          return <Client key="ops-control-field" module="./client/field.tsx" props={props} width={cols} />
        } }
      }
    }
    const caps = musicCapsFor(m)
    const drawn = renderPane(els, m, theme, { ...v, meter: setup.meter, cover: coverFor(m), ...(caps && { musicCaps: caps }), names: namesFor(m), mainName: currentPack().main, mainWork: workOf(asked?.requests ?? requests, m.plan), guardSwitches: guardSw }, e.props.bodyColumns, compact, Date.now(), (id: TabId) => {
      showTab($, id)
      // a tab pressed from the prompt (its Alt+digit) hands the shown pane the keyboard, so the arrows and Enter work in it at once
      void $.ui.panes().then(ps => {
        if (ps.some(p => p.id === 'ops-control' && p.isShown && !p.isFocused)) return $.ui.open({ ...DOCK_OPEN, focus: true })
      }).catch(() => {})
    }, extra)
    paneRing = focusablesOf(drawn, els as unknown as Record<string, unknown>)
    return drawn
  })

  // No next(): the pane draws its own window, and the engine moving the whole body would carry the pet and status box off.
  on('ui.scroll', { component: 'Pane', requestId: 'ops-control' }, async ($, e, next) => {
    if (off) return next(e)
    // ← and → are bound to the engine's page scroll in this pane (keybindings.json), and the page keys, Home and End
    // arrive alike (the pane fills its body): a key's page-sized move is a tab step. The wheel carries a pointer.
    if (e.origin.kind === 'person' && !e.pointer && Math.abs(e.by) >= e.bodyRows) {
      const tabs = visibleTabs(setup.tabs, view.tab).tabs.map(([id]) => id)
      const to = tabStep(tabs, view.tab, e.by > 0 ? 1 : -1)
      if (to && to !== view.tab) {
        showTab($, to)
        void $.ui.focus({ requestId: 'ops-control', key: `tab-${to}` }).catch(() => {})
      }
      return {}
    }
    const by = e.by
    const offset = Math.max(0, Math.min(Math.min(view.offset ?? 0, scroll.last) + by, scroll.last))
    if (offset !== view.offset) { view = { ...view, offset }; publish($) }
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PLAYER_ID }, async ($, e, next) => {
    if (off) return next(e)
    // read through the PANE key so every publish redraws the dialog too
    const live = (await $.state.get(PANE)).value as { model: Model } | undefined
    const m = live ? normalizeModel(live.model) : model
    const els = $.ui.resolve(e) as any
    const clients = e.surface === 'terminal' || e.surface === 'desktop'
    playerSeekless = !clients
    playerCover = playerCoverSize(e.props.scroll.bodyRows)
    const cover = playerCover > 0 ? coverFor(m, playerCover) : undefined
    // A paused track polls every 10 s, and the poll that opened the dialog may have run before playerCover was set.
    const art = m.music?.status === 'open' ? m.music.track?.artUrl : undefined
    if (art && playerCover > 0 && !cover) fetchCover($, art, playerCover)
    // Through JSON because Client props refuse undefined fields.
    const client = (key: string) => (props: SeekBarProps) => <els.Client key={key} module="./client/seekbar.tsx" props={JSON.parse(JSON.stringify(props))} width={props.cols} />
    const caps = musicCapsFor(m)
    listsDrawn = lists
    return renderPlayer(els, m, theme, {
      width: e.props.bodyColumns,
      bodyRows: e.props.scroll.bodyRows,
      ...(cover && { cover }),
      ...(caps && { caps }),
      ...(playerNote && { note: playerNote }),
      account: connectFlow ?? restingAccount(),
    }, Date.now(), {
      onMusic: cmd => pressMusic($, cmd),
      onCopy: url => void copyTrackLink($, url, e.surface),
      onConnect: () => { connectFlow = { step: 'steps' }; playerNote = undefined; publish($) },
      onClientId: id => void startLogin($, id),
      onPaste: text => void pastedAddress($, text),
      onCancel: () => cancelLogin($, { step: 'steps' }),
      onList: id => showList($, id),
      onPick: value => pickRow($, value),
      ...(clients && { seek: client('ops-control-seek'), volume: client('ops-control-volume') }),
    })
  })

  on('ui.close', async ($, e, next) => {
    if (off || e.id !== PLAYER_ID) return next(e)
    const r = await next(e)
    playerNote = undefined
    stopLists()
    // the connect flow belongs to the dialog: closing it stops a waiting login
    if (connectFlow) cancelLogin($, undefined)
    // an unload is the mod going away, and a hot-reloaded module has nothing to reopen
    if (reopenPane && e.origin.kind !== 'unload') await $.ui.open(PANE_OPEN).catch(() => {})
    reopenPane = false
    return r
  })

  on('ui.render', { component: 'Pane', requestId: CONFIG_ID }, async ($, e, next) => {
    if (off) return next(e)
    const els = $.ui.resolve(e) as any
    const s = configState()
    const link = encodeLink({ pack: exportMix(look, exportName(mix.colors)), setup })
    return renderConfig(els, s, look, e.props.bodyColumns, {
      cycle: (id: CycleId) => void runConfig($, cycleCommands(id, configState())),
      input: (id: InputId, text: string) => {
        const now = configState()
        const r = inputCommand(id, text, now)
        if ('error' in r) { configNote = { text: r.error, tone: 'error' }; relook($); return }
        // Enter on an untouched field would run a no-op command and report it as refused.
        const same = inputCommand(id, inputValue(id, now), now)
        if ('cmd' in same && same.cmd === r.cmd) return
        void runConfig($, [r.cmd])
      },
      done: () => void $.ui.close({ id: CONFIG_ID }),
      reset: () => void resetConfig($),
      copyLink: () => void copyStudioLink($, link, e.surface),
    }, { focus: configFocus, note: configNote, link })
  })

  on('ui.focus', async ($, e, next) => {
    if (!off && e.component === 'Pane' && e.requestId === 'ops-control') {
      // ↑/↓ (and Tab) arrive as a one-stop ring move: they walk the tab's own controls, the tab strip above the first,
      // and scroll the tab's window where there is none further; an open Settings dropdown keeps them on its options
      const step = e.origin.kind === 'person' ? stepOf(paneRing, paneFocus, e.element) : undefined
      if (step && paneFocus) {
        const open = view.tab === 'settings' ? settingsUi.open : undefined
        const go = steer(paneRing, paneFocus, step, view.tab, open && (k => withinDropdown(open, k)))
        if (go.scroll) {
          const offset = Math.max(0, Math.min((view.offset ?? 0) + go.scroll, scroll.last))
          if (offset !== view.offset) { view = { ...view, offset }; publish($) }
        }
        if (!go.focus) return {}
        const r = await next({ ...e, element: go.focus })
        if (!r.deny) paneFocus = go.focus
        return r
      }
      const r = await next(e)
      if (!r.deny) paneFocus = e.element
      return r
    }
    if (!off && e.component === 'Pane' && e.requestId === CONFIG_ID) {
      const was = configFocus
      configFocus = e.element
      // only a color row changes the preview's marker, so other moves skip the redraw
      if ([was, configFocus].some(k => k?.startsWith('input-color:'))) $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (off) return next(e)
    const word = spinnerWord(theme, e.props.word, reducedMotion)
    if (!usesOwnSpinner(look, reducedMotion, e.props.message) || (e.surface !== 'terminal' && e.surface !== 'desktop')) {
      return next({ ...e, props: { ...e.props, word } })
    }
    try {
      const live = (await $.state.get(SPIN)).value
      const input = { word, turnAt: live?.turnAt || Date.now(), detail: live?.detail ?? model.act.label, state: (live?.state ?? orbStateOf(model)) as OrbState }
      const props = checkedSpinnerProps(look, input, reducedMotion, Date.now())
      if (!props) return next(e)
      const { Client } = $.ui.resolve(e)
      return <Client key="ops-control-spinner" module="./client/spinner.tsx" props={props} />
    } catch {
      return next(e)
    }
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (off) return next(e)
    const row = await next(e)
    if (e.surface !== 'terminal') return row
    const p = e.props
    const own = p.origin.kind === 'composer' && !p.from && !p.task
    const els = $.ui.resolve(e)
    const styled = styleRow(els, look, { site: 'UserMessage', text: p.text, isExpanded: p.isExpanded, own, turn: own && !p.isExpanded ? turns.turnFor(e.requestId) : undefined }, row) as RenderElement
    if (!own || p.isExpanded) return styled
    const rule = await dividerFor($, e.requestId)
    if (!rule) return styled
    const { Box, Text } = els
    const side = (segs: Seg[], k: string) => <Box key={k} flexShrink={0}>{segs.map(s => <Text color={s.color} bold={s.bold}>{s.text}</Text>)}</Box>
    // Laid over the blank margin line Claude Code opens the row with (see card() in rows.tsx), so
    // the rule sits right above the prompt. The fill is long and its one-row box clips it, since a
    // truncating Text would end it in "…"; neither box is above the engine node.
    return (
      <Box flexDirection="column">
        {styled}
        <Box position="absolute" top={0} left={0} right={0} height={1} flexDirection="row">
          {side(rule.left, 'l')}
          <Box flexGrow={1} flexShrink={1} height={1} overflow="hidden"><Text color={rule.fill.color}>{rule.fill.text.repeat(400)}</Text></Box>
          {side(rule.right, 'r')}
        </Box>
      </Box>
    )
  })
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (off) return next(e)
    const row = await next(e)
    if (e.surface !== 'terminal') return row
    const conclusion = e.props.isFirstOfReply && isFinalAnswer(e.props.text)
    return styleRow($.ui.resolve(e), look, { site: 'AssistantMessage', isFirstOfReply: e.props.isFirstOfReply, xp: xpFor(e.requestId, e.props.isFirstOfReply), ...(conclusion && { conclusion }) }, row) as RenderElement
  })
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (off) return next(e)
    const row = await next(e)
    if (e.surface !== 'terminal') return row
    const p = e.props
    return styleRow($.ui.resolve(e), look, { site: 'ToolUse', tool: p.tool, input: p.input, isRunning: p.isRunning, isErrored: p.isErrored, isInterrupted: p.isInterrupted, seq: turns.toolSeq(e.requestId) }, row) as RenderElement
  })
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (off) return next(e)
    const row = await next(e)
    if (e.surface !== 'terminal') return row
    return styleRow($.ui.resolve(e), look, { site: 'ToolResult' }, row) as RenderElement
  })

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (off) return next(e)
    const p = e.props
    if ((e.surface !== 'terminal' && e.surface !== 'desktop') || p.command !== 'ops' || p.isErrored) return next(e)
    // Matched on the exact text the command printed, so an error or a changed answer stays the engine's row.
    const args = p.args.trim()
    if ((args === '' || args === 'help') && p.text === SHORT_TEXT) return renderHelp($.ui.resolve(e), look, false)
    if (args === 'help all' && p.text === FULL_TEXT) return renderHelp($.ui.resolve(e), look, true)
    if (args === 'color' || args === 'color list') {
      const card = renderColorList($.ui.resolve(e), look, p.text)
      if (card) return card
    }
    return next(e)
  })

  on('command.run', { command: 'ops' }, async ($, e, next) => {
    if (off) return next(e)
    const text = await runCommand(hostOf($), e.args, ctlOf($))
    await syncTakeover($)
    return { text }
  })

  on('ui.message', async ($, e, next) => {
    if (off) return next(e)
    if (e.element === 'ops-control-seek' || e.element === 'ops-control-volume') {
      const d = e.data as { kind?: unknown; ms?: unknown; level?: unknown } | null
      if (d?.kind === 'seek' && typeof d.ms === 'number' && Number.isFinite(d.ms)) pressMusic($, { cmd: 'seek', ms: d.ms })
      else if (d?.kind === 'volume' && typeof d.level === 'number' && Number.isFinite(d.level)) pressMusic($, { cmd: 'volume', level: d.level })
      return {}
    }
    // e.module is the path under the plugin folder (hooks/client/pet.tsx), not the string the pane passes as module
    const data = e.data as { konami?: unknown; click?: unknown } | null
    if (e.element !== 'ops-control-pet' || (data?.konami !== true && data?.click !== true)) return next(e)
    if (data.click === true) {
      if (!clickToasted) { clickToasted = true; $.ui.toast('The pet has the keyboard now. Esc gives it back.') }
      return {}
    }
    try {
      const host = hostOf($)
      const unlocked = unlockEgg(await host.storeGet('eggs') as EggStore | undefined, Date.now())
      if (!unlocked) return {}
      await host.storeSet('eggs', unlocked)
      eggJuggleAt = Date.now()
      publishPet($)
      $.ui.toast('An egg! Press Esc, then /ops pet egg')
    } catch (err) {
      $.ui.log(`egg unlock failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
    }
    return {}
  })

  on('prompt.submit', async ($, e, next) => {
    const args = off ? undefined : pastedOpsControl(e.text, e.origin)
    if (args === undefined) {
      if (off) return next(e)
      const given = withPolicy(e)
      const r = await trackRequest($, given, next)
      if (given !== e && 'drop' in r) policyGiven = false
      return r
    }
    const text = await runCommand(hostOf($), args, ctlOf($))
    await syncTakeover($)
    // the engine shows this as "Prompt dropped by a hook: <reason>", on one line: a newline draws as �
    return { drop: `ops-control ran the pasted command. ${text.split('\n').map(l => l.trim()).filter(Boolean).join('; ')}` }
  })

  // A prompt typed during a turn may be delivered into it: the row the engine appends then holds its text, and
  // the running turn answers it.
  on('session.append', async ($, e, next) => {
    if (off || e.agentId || !requests.turnId || !hasQueued(requests)) return next(e)
    const r = await next(e)
    const text = e.message.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('\n')
    if (text) setRequests($, foldIn(requests, text, Date.now()))
    return r
  })
}

// Each prompt the person sends becomes a request, listed before it goes on: its turn can start before the
// submission settles.
async function trackRequest($: Engine, e: PromptSubmitInput, next: (e: PromptSubmitInput) => Promise<PromptSubmitResult>): Promise<PromptSubmitResult> {
  if (e.isMeta || !PERSON_ORIGINS.includes(e.origin.kind) || (!e.text.trim() && !e.command)) return next(e)
  const typed = e.command ? `/${e.command.name}${e.command.args ? ' ' + e.command.args : ''}` : e.text
  const made = submit(requests, { text: typed, at: Date.now(), ...(e.turnId && { turnId: e.turnId }), ...(e.command && { command: true }) })
  setRequests($, made.rs)
  const id = made.id
  const r = await next(e)
  if ('drop' in r) { setRequests($, drop(requests, id)); return r }
  if (!e.command && r.text.trim() && r.text.trim() !== e.text.trim()) setRequests($, retext(requests, id, r.text))
  // still waiting with nothing running: no turn came of it (a command that answers by itself), so it is no request
  if (unstarted(requests, id)) $.clock.after(2000, () => { if (unstarted(requests, id)) setRequests($, drop(requests, id)) })
  return r
}
