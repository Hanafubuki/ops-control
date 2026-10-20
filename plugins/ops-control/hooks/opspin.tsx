// /opspin: notes the person pins over the prompt, kept per session so a resume brings them back.
// `/opspin <text>` pins, `/opspin remove <n>` unpins one, `/opspin clear` (or `/opspinclear`) all, `/opspin` lists them.
import type { EngineInterface, Register } from 'claude-code'
import { fit, renderSegs } from './layout.tsx'
import type { Look } from './packs.ts'

type Engine = EngineInterface
type On = Parameters<Register>[0]
export type Pins = string[]

const MAX_PINS = 20
const MAX_TEXT = 300
const keyOf = (sid: string) => `opspin:${sid || 'none'}`
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

// What a command line does to the list: the list after it and what the command answers.
export function runPin(pins: Pins, args: string): { pins: Pins; text: string } {
  const a = args.trim()
  if (!a || a === 'list') return { pins, text: pins.length ? pins.map((p, i) => `${i + 1} · ${p}`).join('\n') : 'No pins. /opspin <text> pins one.' }
  if (a === 'clear') return { pins: [], text: pins.length ? `Unpinned ${pins.length}.` : 'No pins.' }
  const rm = /^(?:remove|rm|unpin)\s+(\d+)$/.exec(a)
  if (rm) {
    const i = Number(rm[1]) - 1
    if (i < 0 || i >= pins.length) return { pins, text: `No pin #${rm[1]}.` }
    return { pins: pins.filter((_, j) => j !== i), text: `Unpinned #${i + 1}.` }
  }
  if (a === 'help') return { pins, text: '/opspin <text> · /opspin remove <n> · /opspin clear · /opspinclear · /opspin (list)' }
  if (pins.length >= MAX_PINS) return { pins, text: `${MAX_PINS} pins already; /opspin remove <n> first.` }
  const text = oneLine(a).slice(0, MAX_TEXT)
  return { pins: [...pins, text], text: `Pinned #${pins.length + 1}.` }
}

const readPins = (v: unknown): Pins => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX_PINS) : [])

let pins: Pins = []
let sid = ''
async function load($: Engine) {
  sid = await $.session.id()
  try { pins = readPins(await $.store.get(keyOf(sid))) } catch { pins = [] }
}

// From ops-control's session.start: the commands, and this session's pins. Both run mid-turn, like /btw:
// they only touch the pin list and never reach Claude.
export async function startOpspin($: Engine) {
  await $.command.register({ name: 'opspin', description: 'Pin a note over the prompt', argumentHint: '<text>|remove <n>|clear|list', immediate: true })
  await $.command.register({ name: 'opspinclear', description: 'Unpin every /opspin note', immediate: true })
  await load($)
}

// A command line run against this session's pins: saved and redrawn when the list changed.
async function pin($: Engine, args: string) {
  if ((await $.session.id()) !== sid) await load($)
  const r = runPin(pins, args)
  if (r.pins !== pins) {
    pins = r.pins
    await $.store.set(keyOf(sid), pins)
    $.ui.invalidate('ui.render')
  }
  return { text: r.text }
}

export function wireOpspin(on: On, off: () => boolean) {
  on('command.run', { command: 'opspin' }, async ($, e, next) => {
    if (off()) return next(e)
    return pin($, e.args)
  })
  on('command.run', { command: 'opspinclear' }, async ($, e, next) => {
    if (off()) return next(e)
    return pin($, 'clear')
  })
}

// From ops-control's AbovePrompt render: the pins, one row each, in a box drawn in the pack's border,
// to sit over every band.
export function pinRows(els: { Box: any; Text: any }, look: Look, columns: number) {
  if (!pins.length) return null
  const { Box } = els
  const c = look.theme.colors
  const w = Math.max(10, columns)
  // the border and a cell of padding on each side leave w - 4 for a row
  return (
    <Box key="opspin" flexDirection="column" width={w} borderStyle={look.border} borderColor={look.borderColor} paddingX={1}>
      {pins.map((p, i) => renderSegs(els, fit([{ text: `▍ ${i + 1} `, color: c.accent, bold: true }, { text: p, color: c.text }], w - 4), `opspin-${i}`))}
    </Box>
  )
}
