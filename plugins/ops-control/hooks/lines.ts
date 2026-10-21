// JSX-free: the studio imports it.
import { daypart, type LocalTime } from './eggs.ts'

export const MOMENTS = ['done', 'fail', 'needs-you', 'green', 'hello', 'long-done', 'compact', 'level-up'] as const
export type Moment = (typeof MOMENTS)[number]
export const FLAVOURS = ['morning', 'afternoon', 'evening', 'night', 'friday', 'christmas', 'halloween', 'birthday'] as const
export type Flavour = (typeof FLAVOURS)[number]
// Keys are a moment ("done"), optionally with a flavour ("done@night") and/or a level from which
// they apply ("done@lv4", "done@night@lv4").
export type PetLines = Partial<Record<string, string[]>>

// The vars moodOf fills for each moment; any other slot would draw as "…".
export const MOMENT_SLOTS: Record<Moment, readonly ('file' | 'n' | 'command' | 'unlock')[]> = {
  done: ['file'], 'long-done': ['file'], fail: ['n'], 'needs-you': ['command'], green: [], hello: [], compact: [], 'level-up': ['unlock'],
}

export const DEFAULT_LINES: Record<Moment, string[]> = {
  done: ['all done', 'finished', 'done!', 'that worked', 'wrapped up', 'done for now'],
  fail: ['{n} failed', 'tests failed', 'not quite', 'red this time', 'try again?', 'hmm'],
  'needs-you': ['need you', 'your turn', 'approve {command}?', 'waiting on you', 'a yes, please?', 'over to you'],
  green: ['green again', 'tests pass', 'fixed!', 'all passing', 'back to green', 'nice'],
  hello: ['hi!', 'hello', 'welcome back', 'ready', 'hey', 'here again'],
  'long-done': ['long one, done', 'finally!', 'all done at last', 'that took a while', 'done, phew', 'finished at last'],
  compact: ['context compacted', 'tidied up', 'lighter now', 'memory trimmed', 'squeezed it down', 'fresh start-ish'],
  'level-up': ['level up!', 'new level!', 'we leveled up', 'stronger now', 'unlocked: {unlock}', 'new: {unlock}', 'level up! {unlock}', 'you unlocked {unlock}'],
}

export const BUILTIN_LINES: Record<'clawd' | 'robot' | 'ghost' | 'egg', PetLines> = {
  clawd: {
    done: ['all done', "that's a wrap", 'done and dusted', 'shipped it. sort of.', 'done. {file} looks better', 'that one went smoothly'],
    'done@morning': ['done before coffee'],
    'done@night': ['done. go to bed', 'finished. the moon approves'],
    'done@friday': ['done. weekend unlocked?'],
    'done@christmas': ['done. cocoa time'],
    fail: ['ouch, {n} failed', 'hmm, red', 'back at it', '{n} down. we regroup', 'that stung', 'red again. tea?'],
    'fail@night': ['red at this hour?'],
    'fail@halloween': ['spooky red'],
    'needs-you': ['hey, need you', 'your call', 'need a yes on {command}', 'psst, {command}?', 'waiting on you', 'a quick yes?'],
    green: ['back to green', 'green again!', 'fixed it. probably us', 'all passing now', 'red no more', 'look at that green'],
    hello: ['oh, hi', 'hey there', 'back again?', 'ready when you are', 'hello hello', 'what are we making?'],
    'hello@morning': ['morning!', 'early start, huh'],
    'hello@night': ['late one tonight?', 'night shift again'],
    'hello@christmas': ['happy holidays!'],
    'hello@halloween': ['boo.'],
    'hello@birthday': ['hey, our anniversary!'],
    'long-done': ['finally done', 'that was a long one', 'done. I aged a bit', 'marathon over', 'phew. done', 'done. {file} got a lot'],
    compact: ['tidied up my notes', 'memory squeezed', 'lighter now', 'compacted. where were we?', 'fresh-ish context', 'packed it down'],
    'level-up': ['level up. look at us', 'ding. we grew', 'new level, same crab', 'ooh, a level', 'unlocked {unlock}. fancy', 'we earned {unlock}', 'level up! {unlock}, hm?', '{unlock}? we earned it'],
    'done@lv2': ['done. we make a decent team', 'done. I could get used to this'],
    'hello@lv2': ['oh, you again. good', 'back for more? nice'],
    'green@lv2': ['green. we did that', 'green! told you so'],
    'done@lv4': ['done. just like old times', "done. you're good company"],
    'hello@lv4': ['there you are!', 'missed you. a little'],
    'green@lv4': ['green. we make this look easy', 'green again. our usual'],
    'done@lv7': ['done. best crew I know', 'done, partner. as ever'],
    'hello@lv7': ['my favorite human is back', "oh good, it's you"],
    'green@lv7': ['green. never doubted us', 'green! we are unstoppable'],
  },
  robot: {
    done: ['TASK COMPLETE.', 'JOB DONE. AWAITING INPUT.', 'PROCESS EXITED 0.', 'OUTPUT DELIVERED.', 'COMPLETE. {file} UPDATED.', 'END OF LINE.'],
    'done@friday': ['WEEKEND.EXE LOADING.'],
    fail: ['FAULT: {n} TESTS', 'ERROR DETECTED.', 'TESTS: RED.', 'RECALIBRATING.', 'ANOMALY LOGGED.', 'RETRYING SOON.'],
    'needs-you': ['INPUT REQUIRED: {command}', 'AWAITING OPERATOR.', 'CONFIRM: Y/N?', 'PERMISSION REQUEST.', 'HUMAN NEEDED.', 'AUTHORIZE {command}?'],
    green: ['ALL SYSTEMS NOMINAL.', 'TESTS: GREEN.', 'FAULT CLEARED.', 'STATUS: PASSING.', 'REPAIR SUCCESSFUL.', 'GREEN ACROSS THE BOARD.'],
    hello: ['BOOT COMPLETE.', 'HELLO, OPERATOR.', 'SYSTEMS ONLINE.', 'RESUMING.', 'READY.', 'WAKE SIGNAL RECEIVED.'],
    'hello@morning': ['GOOD MORNING, OPERATOR.'],
    'hello@night': ['NIGHT MODE ENGAGED.'],
    'hello@christmas': ['SEASON GREETINGS.EXE'],
    'hello@halloween': ['BOO.WAV'],
    'long-done': ['LONG JOB COMPLETE.', 'UPTIME EXCEEDED. DONE.', 'BATCH FINISHED.', 'COMPLETE AT LAST.', 'DONE. FANS COOLING.', 'MARATHON PROCESS ENDED.'],
    compact: ['MEMORY DEFRAGMENTED.', 'BUFFER COMPACTED.', 'CACHE CLEARED.', 'CONTEXT COMPRESSED.', 'FREE MEMORY: MORE.', 'GARBAGE COLLECTED.'],
    'level-up': ['LEVEL UP.', 'UPGRADE COMPLETE.', 'RANK INCREASED.', 'FIRMWARE UPDATED.', 'UNLOCKED: {unlock}', 'NEW MODULE: {unlock}', 'UPGRADE: {unlock}', 'LEVEL UP. {unlock} ONLINE.'],
    'done@lv2': ['TASK COMPLETE. EFFICIENCY UP.', 'DONE. SYNC IMPROVING.'],
    'hello@lv2': ['OPERATOR RECOGNIZED.', 'WELCOME BACK, OPERATOR.'],
    'green@lv2': ['TESTS: GREEN. EFFICIENT.', 'FAULT CLEARED. GOOD WORK.'],
    'done@lv4': ['TASK COMPLETE, PARTNER.', 'DONE. TEAM PERFORMANCE: HIGH.'],
    'hello@lv4': ['HELLO, PARTNER.', 'PARTNER DETECTED. ONLINE.'],
    'green@lv4': ['TESTS: GREEN, PARTNER.', 'GREEN. PARTNER SYNC: STRONG.'],
    'done@lv7': ['DONE, PARTNER. OPTIMAL.', 'MISSION COMPLETE, PARTNER.'],
    'hello@lv7': ['PARTNER. I MISSED YOU.', 'BOOT COMPLETE. PARTNER PRESENT.'],
    'green@lv7': ['GREEN. PARTNER, WE ARE ELITE.', 'ALL GREEN. BEST TEAM ON RECORD.'],
  },
  egg: {
    done: ['*tap tap*', '*wiggle*', '…!', '*happy wobble*', '*warm*', 'done?'],
    fail: ['*wobble*', '…', '*shiver*', 'uh oh', '*rattle*', '*sad tilt*'],
    'needs-you': ['*tap tap tap*', '?', '*nudge*', 'psst', '*rock rock*', 'you?'],
    green: ['!!', '*spin*', 'yay', '*bounce*', '*glow*', '*happy wobble*'],
    hello: ['*peep*', '…hi?', '*tap*', '*stir*', 'hello?', '*yawn*'],
    'hello@night': ['*zzz*'],
    'long-done': ['*sleepy wobble*', 'long…', '*stretch*', '*tired tap*', 'phew', '*sigh*'],
    compact: ['*shrink*', '*hum*', '*settle*', '*snug*', '*tidy tap*', '*smaller*'],
    'level-up': ['*crack*', '*wobble wobble*', '!!!', '*glow*', '*tap* {unlock}!', '{unlock}?!', '*shiver* {unlock}', '*peep!* {unlock}'],
    'done@lv2': ['*tap tap*', '*warm wiggle*'],
    'hello@lv2': ['*peep peep*', '*tap* hi'],
    'green@lv2': ['*happy tap*', '*wiggle*'],
    'done@lv4': ['*tap tap tap*', '*content wobble*'],
    'hello@lv4': ['*excited peep*', '*wobble* hi!'],
    'green@lv4': ['*bounce bounce*', '*glow glow*'],
    'done@lv7': ['*tap* almost hatching', '*crack* soon…'],
    'hello@lv7': ['*peep* hatching soon?', '*wobble* nearly hatched'],
    'green@lv7': ['*crack!* hatching…', '*glow* hatch soon!'],
  },
  ghost: {
    done: ['done… quietly', 'finished. no ghosts in it', 'laid that one to rest', 'done. {file} feels lighter', 'all done. I barely helped', 'done. floating off now'],
    'done@friday': ['done. haunting the weekend now'],
    fail: ['oh… {n} failed', 'eek. red', '{n} gave me a fright', 'something went bump', "I'll just fade a bit", 'red… not the cozy kind'],
    'needs-you': ['um… need you', 'psst… {command}?', 'may I {command}?', 'a tiny yes, please?', 'waiting, like ghosts do', 'still there? {command}?'],
    green: ['green… oh, lovely', 'all clear. no spooks', 'the red has passed on', 'green. I feel less see-through', 'tests at peace now', 'boo-tiful green'],
    hello: ['oh… hello', 'boo. sorry. hi', 'still haunting this repo', 'you came back', 'hi… I kept it warm', 'floating by to say hi'],
    'hello@morning': ['morning… ghosts are up too'],
    'hello@night': ['ah. my hours'],
    'hello@christmas': ['hi from the ghost of christmas now'],
    'hello@halloween': ['my big night!'],
    'long-done': ['done. that took ages, and I would know', 'finally. I waited centuries', 'long one. laid to rest', 'done at last. so floaty', 'done. even I got tired', 'done. {file} haunted us a while'],
    compact: ['faded out the old bits', 'lighter than air now', 'let some memories go', 'more see-through now', 'compacted. ghost of a context', 'forgot a little. it happens'],
    'level-up': ['level up… oh my', 'I feel more solid', 'a stronger haunt', 'oh. a new level', 'unlocked {unlock}… for me?', 'new: {unlock}. eek', 'level up! {unlock}, ooh', '{unlock}? spooky good'],
    'done@lv2': ['done. I like haunting with you', 'done. you make this less lonely'],
    'hello@lv2': ["oh, it's you. good", 'back. I hoped you would'],
    'green@lv2': ['green. we scared the red off', 'green… we did that'],
    'done@lv4': ['done. like old haunts', "done. you're my favorite visitor"],
    'hello@lv4': ['there you are… I waited', 'hello, old friend'],
    'green@lv4': ['green. our usual haunt', 'green again. easy as boo'],
    'done@lv7': ["done. I'd haunt anywhere with you", 'done. stay forever?'],
    'hello@lv7': ['you! I lit up a little', 'oh good, my human is back'],
    'green@lv7': ['green. nothing haunts us now', 'green. we are the legend now'],
  },
}

// A bubble's mood: a moment, or a quip said mid-turn while Claude works.
export type BubbleMood = Moment | 'working'

// What the name packs' characters say while Claude works: their own famous lines, said as written.
// A pet with none says nothing mid-turn.
export const WORKING_LINES: Record<string, string[]> = {
  lelouch: ['Lelouch vi Britannia commands you!', 'All hail Britannia!', 'Checkmate.', "If the king doesn't move…", 'Destroy the world, create it anew.', 'Zero has returned.', 'I am Zero!', 'The ones who should kill…'],
  shikamaru: ['What a drag…', 'Troublesome…', "I'd rather watch the clouds.", 'Shadow Possession Jutsu… success.', 'This is such a pain.', 'Ugh, why me?'],
  gojo: ["Nah, I'd win.", 'Domain Expansion: Infinite Void.', "Don't worry, I'm the strongest.", 'Are you the strongest because…', 'Yowai mo.', "I hope you don't mind if I show off a little.", 'Love is the most twisted curse of all.'],
  levi: ['Tch.', 'Give up on your dreams and die.', 'This place is filthy.', 'Clean it again. Properly.', 'Choose what you regret least.', 'Oi. Stop slacking.'],
}
export const workingLinesFor = (pet: string): string[] => Object.hasOwn(WORKING_LINES, pet) ? WORKING_LINES[pet]! : []

export function linesFor(pet: string, user?: PetLines): PetLines {
  if (pet === 'clawd' || pet === 'clawd-shiny') return BUILTIN_LINES.clawd
  if (pet === 'robot' || pet === 'ghost' || pet === 'egg') return BUILTIN_LINES[pet]
  return user ?? {}
}

// Order is base, flavour lines, then level lines by ascending level, whatever the table's key order.
export function pool(lines: PetLines, moment: Moment, flavours: readonly Flavour[], level = 1): string[] {
  const base = lines[moment]?.length ? lines[moment]! : DEFAULT_LINES[moment]
  const tier: [number, string[]][] = []
  for (const [key, list] of Object.entries(lines)) {
    const m = /^([^@]+)(?:@([^@]+?))?@lv(\d+)$/.exec(key)
    if (!m || m[1] !== moment || (m[2] !== undefined && !flavours.includes(m[2] as Flavour)) || Number(m[3]) > level) continue
    tier.push([Number(m[3]), list ?? []])
  }
  tier.sort((a, b) => a[0] - b[0])
  return [...base, ...flavours.flatMap(f => lines[`${moment}@${f}`] ?? []), ...tier.flatMap(([, l]) => l)]
}

// Holidays follow the outfits, so the hat and the line change on the same day. The "friday"
// overlay means a Friday-afternoon deploy; this flavour is any Friday.
const HOLIDAY: Record<string, Flavour> = { santa: 'christmas', pumpkin: 'halloween', party: 'birthday' }
export function flavoursOf(t: LocalTime, overlays: readonly string[]): Flavour[] {
  const out: Flavour[] = [daypart(t.hour) as Flavour]
  if (t.day === 5) out.push('friday')
  for (const o of overlays) if (HOLIDAY[o]) out.push(HOLIDAY[o]!)
  return out
}
