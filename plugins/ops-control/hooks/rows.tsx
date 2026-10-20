import type { Look } from './packs.ts'
import { gradient, mix } from './color.ts'
import { describeTool } from './events.ts'
import { toolGlyph } from './restyle.ts'
import { MARKS, retroTag, slabTag } from './rows-text.ts'
import type { FramePlace } from './frames.ts'

// frame: the row's place in the box around its reply (frames.ts), drawn in every row style; a row without one keeps
// the per-row cards and the grey rule between replies.
// changes: a file-changing tool's toggle for its diff; hidden: the diff is folded away until it is pressed.
export type RowInput = (
  | { site: 'ToolUse'; tool: string; input: unknown; isRunning: boolean; isErrored: boolean; isInterrupted: boolean; seq?: number; changes?: ChangesToggle }
  | { site: 'ToolResult'; hidden?: boolean }
  | { site: 'UserMessage'; text: string; isExpanded: boolean; own: boolean; turn?: number }
  // conclusion: the block is a finished turn's final answer
  | { site: 'AssistantMessage'; isFirstOfReply: boolean; xp?: number; conclusion?: boolean }
  | { site: 'ToolGroup' }
  | { site: 'TurnDuration' }
  // a row only framed, never restyled: a hook's notice, a running tool's progress line
  | { site: 'Notice' }
) & { frame?: FramePlace }

export type ChangesToggle = { shown: boolean; onToggle: () => void }

type Els = { Box: any; Text: any; Button?: any }

function mark(look: Look, row: Extract<RowInput, { site: 'ToolUse' }>, set: typeof MARKS.cards) {
  const c = look.theme.colors
  if (row.isErrored) return { mark: set.fail, color: c.fail }
  if (row.isInterrupted) return { mark: set.stop, color: c.dim }
  if (row.isRunning) return { mark: set.run, color: c.dim }
  return { mark: set.done, color: c.pass }
}

// Per-character spans cost a Text each, hence the cap.
function label({ Text }: Els, text: string, look: Look, color: string, bold?: boolean) {
  if (look.gradient && [...text].length <= 48) {
    return <Text>{gradient(text, look.gradient[0], look.gradient[1]).map(s => <Text color={s.color} bold={bold}>{s.text}</Text>)}</Text>
  }
  return <Text color={color} bold={bold}>{text}</Text>
}

// Built-in renderers size text from the terminal width, not their container, so only a little
// slack exists beside an engine row. The engine box is the one that gives up width; tags and
// marks keep theirs, or "[ OK ]" wraps its "]" onto the next line. Claude Code refuses an engine
// node under a Box with width, height, min sizes, overflow, display or position, so only the
// flex props go here (test/engine-tree.ts).
const shrinker = (Box: any, engine: unknown) => <Box flexGrow={1} flexShrink={1}>{engine}</Box>
// down a line by default: the engine row beside it opens with a blank margin line (see card())
const fixed = ({ Box, Text }: Els, color: string, s: string, down = 1) => <Box flexShrink={0} marginTop={down}><Text color={color} wrap="truncate">{s}</Text></Box>

// Messages are always a bar; tool rows are boxed unless prefixCards asks for the bar too.
// Claude Code opens each message and tool row with a blank margin line inside its engine node,
// and a mod cannot see or change it. Drawn in the flow, the bar sat alone on that line and a
// border boxed it in. So both are absolute overlays sized by top/bottom: the bar starts a line
// down, and the frame's top edge lies on the blank line. Neither can sit above the engine node,
// which refuses position and overflow on its ancestors (test/engine-tree.ts).
const BAR_ROWS = '▎\n'.repeat(400)
function card({ Box, Text }: Els, look: Look, direction: 'row' | 'column', kids: unknown[], color: string, prefix?: boolean) {
  if (prefix) {
    return (
      <Box flexDirection="row" paddingLeft={2}>
        <Box flexDirection={direction}>{kids}</Box>
        <Box position="absolute" top={1} bottom={0} left={0} width={1} overflow="hidden"><Text color={color}>{BAR_ROWS}</Text></Box>
      </Box>
    )
  }
  // The frame is drawn first and the row over it: a row that opens without the blank line (a tool call after another
  // block of the same reply) then writes its title across the top edge instead of having the edge cover it.
  return (
    <Box flexDirection={direction} paddingX={2} paddingBottom={1}>
      <Box position="absolute" top={0} bottom={0} left={0} right={0} borderStyle={look.border} borderColor={color} />
      {kids}
    </Box>
  )
}

// A glyph marker replaces the bar: the glyph column keeps the body aligned on every block of a reply.
function marked({ Box, Text }: Els, mark: string, color: string, kids: unknown[]) {
  return <Box flexDirection="row"><Text color={color}>{mark}</Text><Box flexDirection="column">{kids}</Box></Box>
}

// Right-aligned with flex alone: the engine refuses width props on an ancestor of its node, and this box is a sibling, not one.
function xpTag({ Box, Text }: Els, xp: number, color: string) {
  return <Box flexDirection="row" justifyContent="flex-end"><Text color={color}>{`+${xp} XP`}</Text></Box>
}

function roleColor(look: Look, tool: string, input: Record<string, unknown>): string {
  const c = look.theme.colors
  switch (describeTool(tool, input).kind) {
    case 'read': case 'search': return c.read
    case 'edit': return c.edit
    case 'shell': return c.shell
    case 'agent': return c.agent
    case 'plan': return c.accent
    default: return c.dim
  }
}

// The grey rule between Claude's messages, and the colour of nothing in any theme so it reads as a plain divider.
export const DIVIDER_GREY = '#6c6c78'
const RULE = '─'.repeat(400), DOUBLE = '═'.repeat(400)

// Above a message that opens a reply: a grey rule, or for the turn's final answer a double rule in the theme's
// accent with a "Conclusion" title. Long rules truncated to the row: no width props sit above the engine node.
function opener({ Box, Text }: Els, look: Look, row: RowInput): unknown {
  if (row.site !== 'AssistantMessage' || !row.isFirstOfReply) return null
  const accent = look.theme.colors.accent
  if (row.conclusion) {
    return (
      <Box key="opener" flexDirection="column" marginTop={1}>
        <Text color={accent} wrap="truncate">{DOUBLE}</Text>
        <Text color={accent} wrap="truncate">{DOUBLE}</Text>
        <Text color={accent} bold wrap="truncate">Conclusion</Text>
      </Box>
    )
  }
  return <Box key="opener" flexDirection="column" marginTop={1}><Text color={DIVIDER_GREY} wrap="truncate">{RULE}</Text></Box>
}

// The edges of the reply box, by the pack's border style.
const FRAME_GLYPHS: Record<string, { h: string; v: string; tl: string; tr: string; bl: string; br: string }> = {
  round: { h: '─', v: '│', tl: '╭', tr: '╮', bl: '╰', br: '╯' },
  single: { h: '─', v: '│', tl: '┌', tr: '┐', bl: '└', br: '┘' },
  bold: { h: '━', v: '┃', tl: '┏', tr: '┓', bl: '┗', br: '┛' },
  double: { h: '═', v: '║', tl: '╔', tr: '╗', bl: '╚', br: '╝' },
  classic: { h: '-', v: '|', tl: '+', tr: '+', bl: '+', br: '+' },
}
const frameGlyphs = (look: Look) => FRAME_GLYPHS[look.border] ?? FRAME_GLYPHS.round
const FILL = 400

// One row's slice of the reply box: both sides, absolute overlays drawn before the row as in card(), so nothing
// positioned sits above the engine node. The top edge is a line of its own (frameEdge): a message row does not always
// open with the blank margin line an overlay could lie on.
function framed({ Box, Text }: Els, look: Look, kids: unknown) {
  const glyphs = frameGlyphs(look), color = look.theme.colors.faint
  const side = (edge: { left: 0 } | { right: 0 }) => (
    <Box position="absolute" top={0} bottom={0} {...edge} width={1} overflow="hidden">
      <Text color={color}>{(glyphs.v + '\n').repeat(FILL)}</Text>
    </Box>
  )
  return (
    <Box flexDirection="column" paddingX={2}>
      {side({ left: 0 })}
      {side({ right: 0 })}
      {kids}
    </Box>
  )
}

// The top or bottom edge of a box, on a line of its own: the bottom of the box before a row, the top of the one a
// prompt opens under itself.
export function frameEdge({ Box, Text }: Els, look: Look, which: 'top' | 'bottom') {
  const glyphs = frameGlyphs(look), color = look.theme.colors.faint
  return (
    <Box key={`frame-${which}`} flexDirection="row">
      <Text color={color}>{which === 'top' ? glyphs.tl : glyphs.bl}</Text>
      <Box flexGrow={1} flexShrink={1} height={1} overflow="hidden"><Text color={color}>{glyphs.h.repeat(FILL)}</Text></Box>
      <Text color={color}>{which === 'top' ? glyphs.tr : glyphs.br}</Text>
    </Box>
  )
}

// A file-changing tool's toggle for its diff, pressed with a click (fullscreen) or from the focus ring.
function changesButton({ Box, Text, Button }: Els, look: Look, toolUseId: string, changes: ChangesToggle) {
  if (!Button) return null
  return (
    <Box flexShrink={0} marginTop={1}>
      <Button key={`changes:${toolUseId}`} plain onPress={() => changes.onToggle()}><Text color={look.theme.colors.accent}>{changes.shown ? ' ▾ hide changes' : ' ▸ changes'}</Text></Button>
    </Box>
  )
}

const isFramed = (row: RowInput): row is RowInput & { frame: FramePlace } =>
  !!row.frame && (row.frame.inside || row.frame.closes || row.frame.opensAfter)

// A row with a part in a reply box, in any row style: its own drawing, the box's sides around it, and the edges it
// draws before or after itself. The cards style drops its per-row frames inside the box (drawFramed).
function styleFramed(els: Els, look: Look, row: RowInput & { frame: FramePlace }, engine: unknown, opts: { prefixCards?: boolean; toolUseId?: string }): unknown {
  const { Box } = els
  const { frame } = row
  const out = frame.inside && look.rows === 'cards' ? drawFramed(els, look, row, engine, opts.toolUseId) : withToggle(els, look, row, draw(els, look, row, engine, opts), opts)
  // the final answer is in no box (frames.ts): it keeps the double rule and the Conclusion title
  const conclusion = row.site === 'AssistantMessage' && row.conclusion
  const body = frame.inside ? framed(els, look, out) : out
  return (
    <Box flexDirection="column" marginLeft={1}>
      {frame.closes ? frameEdge(els, look, 'bottom') : null}
      {conclusion ? opener(els, look, row) : null}
      {frame.opens ? frameEdge(els, look, 'top') : null}
      {body}
      {frame.opensAfter ? frameEdge(els, look, 'top') : null}
    </Box>
  )
}

// A file change's toggle beside the row each style drew; the cards style puts it in its own row (drawFramed, the card).
function withToggle(els: Els, look: Look, row: RowInput, out: unknown, opts: { toolUseId?: string }): unknown {
  if (look.rows === 'cards' || row.site !== 'ToolUse' || !row.changes || !opts.toolUseId) return out
  return <els.Box flexDirection="row">{shrinker(els.Box, out)}{changesButton(els, look, opts.toolUseId, row.changes)}</els.Box>
}

export function styleRow(els: Els, look: Look, row: RowInput, engine: unknown, opts: { prefixCards?: boolean; toolUseId?: string } = {}): unknown {
  if (isFramed(row)) return styleFramed(els, look, row, engine, opts)
  const out = withToggle(els, look, row, draw(els, look, row, engine, opts), opts)
  const { Box } = els
  // classic keeps Claude Code's own rows, all but the final answer's Conclusion header, as every style has it
  if (look.rows === 'classic') return row.site === 'AssistantMessage' && row.conclusion ? <Box flexDirection="column">{opener(els, look, row)}{out}</Box> : out
  // Column, not Ink's default row: a row wrapper shrinks bordered cards to content width.
  return <Box flexDirection="column" marginLeft={1}>{opener(els, look, row)}{out}</Box>
}

function draw(els: Els, look: Look, row: RowInput, engine: unknown, opts: { prefixCards?: boolean; toolUseId?: string }): unknown {
  try {
    const { Box, Text } = els
    if (row.site === 'UserMessage' && (!row.own || row.isExpanded)) return engine
    // a file change's folded diff, until its toggle is pressed
    if (row.site === 'ToolResult' && row.hidden) return null
    const input = row.site === 'ToolUse' && row.input !== null && typeof row.input === 'object' && !Array.isArray(row.input) ? row.input as Record<string, unknown> : {}
    const c = look.theme.colors

    switch (look.rows) {
      case 'classic': {
        if (row.site !== 'ToolUse' || row.isRunning) return engine
        const g = toolGlyph(look.theme, row.tool)
        if (!g) return engine
        return <Box flexDirection="row">{shrinker(Box, engine)}<Box marginTop={1} flexShrink={0}><Text color={g.color} wrap="truncate">{'  ' + g.glyph}</Text></Box></Box>
      }

      case 'cards': {
        if (row.site === 'ToolGroup' || row.site === 'TurnDuration' || row.site === 'Notice') return engine
        if (row.site === 'ToolResult') return <Box paddingLeft={2}>{engine}</Box>
        if (row.site === 'ToolUse') {
          const m = mark(look, row, MARKS.cards)
          const toggle = row.changes && opts.toolUseId ? changesButton(els, look, opts.toolUseId, row.changes) : null
          return card(els, look, 'row', [shrinker(Box, engine), fixed(els, m.color, ' ' + m.mark), toggle], c.faint, opts.prefixCards)
        }
        const { labels, markers, xp } = look.rowFlags
        if (row.site === 'UserMessage') {
          const kids = labels ? [label(els, 'you', look, c.accent), engine] : [engine]
          return markers ? marked(els, '▶ ', c.accent, kids) : card(els, look, 'column', kids, c.accent, true)
        }
        const kids = row.isFirstOfReply && labels ? [label(els, 'claude', look, c.accent), engine] : [engine]
        const body = markers ? marked(els, row.isFirstOfReply ? '◆ ' : '  ', c.read, kids) : card(els, look, 'column', kids, c.faint, true)
        return xp && row.isFirstOfReply && row.xp ? <Box flexDirection="column">{xpTag(els, row.xp, c.edit)}{body}</Box> : body
      }

      case 'minimal': {
        if (row.site === 'UserMessage') return <Text><Text color={c.accent}>{'› '}</Text><Text color={c.text}>{row.text}</Text></Text>
        if (row.site === 'ToolUse' && !row.isRunning && !row.isErrored && !row.isInterrupted) {
          return <Text color={c.dim}>{'· ' + describeTool(row.tool, input).label}</Text>
        }
        return engine
      }

      case 'retro': {
        if (row.site === 'ToolResult') return <Box paddingLeft={3}>{engine}</Box>
        if (row.site === 'UserMessage') return look.rowFlags.labels ? <Box flexDirection="column">{label(els, '[YOU]', look, c.accent, true)}{engine}</Box> : engine
        if (row.site === 'AssistantMessage') {
          const body = <Box paddingLeft={3}>{engine}</Box>
          return row.isFirstOfReply && look.rowFlags.labels ?<Box flexDirection="column">{label(els, '[CLAUDE]', look, c.accent, true)}{body}</Box> : body
        }
        if (row.site !== 'ToolUse') return engine
        const m = mark(look, row, MARKS.retro)
        return <Box flexDirection="row"><Box flexShrink={0} marginTop={1}>{label(els, retroTag(row.tool), look, c.accent)}</Box>{shrinker(Box, engine)}{fixed(els, m.color, ' ' + m.mark)}</Box>
      }

      case 'slab': {
        if (row.site === 'UserMessage') {
          // The engine row opens with a blank margin line (see card()); marginTop keeps that gap,
          // where a divider overlay can still sit.
          return (
            <Box flexDirection="row" marginTop={1} backgroundColor={c.accent}>
              <Box flexGrow={1} flexShrink={1} paddingX={1}><Text color={look.bg} backgroundColor={c.accent} bold>{row.text}</Text></Box>
              {row.turn ? <Box flexShrink={0}><Text color={mix(look.bg, c.accent, 0.3)} backgroundColor={c.accent}>{` PROMPT ${String(row.turn).padStart(2, '0')} `}</Text></Box> : null}
            </Box>
          )
        }
        if (row.site === 'ToolResult') return <Box paddingLeft={3}>{engine}</Box>
        if (row.site === 'AssistantMessage') {
          if (!row.isFirstOfReply) return engine
          return (
            <Box flexDirection="column">
              {engine}
              <Box position="absolute" top={0} left={0} height={1}><Text color={c.accent}>{'─'.repeat(8)}</Text></Box>
            </Box>
          )
        }
        if (row.site !== 'ToolUse') return engine
        const m = mark(look, row, MARKS.slab)
        const n = row.seq ? String(row.seq).padStart(2, '0') + '  ' : ''
        return (
          <Box flexDirection="row">
            <Box flexShrink={0} marginTop={1}><Text><Text color={c.faint}>{n}</Text><Text color={roleColor(look, row.tool, input)} bold>{slabTag(row.tool)}</Text><Text>{' '}</Text></Text></Box>
            {shrinker(Box, engine)}
            {fixed(els, m.color, ' ' + m.mark)}
          </Box>
        )
      }
    }
    return engine
  } catch {
    return engine
  }
}

// Inside a reply box the box is the only frame: tool rows are plain with their mark, messages keep their marker and
// lose the side bar, and a folded diff draws nothing.
function drawFramed(els: Els, look: Look, row: RowInput, engine: unknown, toolUseId: string | undefined): unknown {
  const { Box } = els
  const c = look.theme.colors
  switch (row.site) {
    case 'ToolUse': {
      const m = mark(look, row, MARKS.cards)
      const toggle = row.changes && toolUseId ? changesButton(els, look, toolUseId, row.changes) : null
      return <Box flexDirection="row">{shrinker(Box, engine)}{fixed(els, m.color, ' ' + m.mark)}{toggle}</Box>
    }
    case 'ToolResult':
      return row.hidden ? null : <Box paddingLeft={2}>{engine}</Box>
    case 'AssistantMessage': {
      const { labels, markers, xp } = look.rowFlags
      const kids = row.isFirstOfReply && labels ? [label(els, 'claude', look, c.accent), engine] : [engine]
      const body = markers ? marked(els, row.isFirstOfReply ? '◆ ' : '  ', c.read, kids) : <Box flexDirection="column">{kids}</Box>
      return xp && row.isFirstOfReply && row.xp ? <Box flexDirection="column">{xpTag(els, row.xp, c.edit)}{body}</Box> : body
    }
    default:
      return engine
  }
}
