import type { Look } from './packs.ts'
import { gradient, mix } from './color.ts'
import { describeTool } from './events.ts'
import { toolGlyph } from './restyle.ts'
import { MARKS, retroTag, slabTag } from './rows-text.ts'

export type RowInput =
  | { site: 'ToolUse'; tool: string; input: unknown; isRunning: boolean; isErrored: boolean; isInterrupted: boolean; seq?: number }
  | { site: 'ToolResult' }
  | { site: 'UserMessage'; text: string; isExpanded: boolean; own: boolean; turn?: number }
  | { site: 'AssistantMessage'; isFirstOfReply: boolean; xp?: number }

type Els = { Box: any; Text: any }

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
  return (
    <Box flexDirection={direction} paddingX={2} paddingBottom={1}>
      {kids}
      <Box position="absolute" top={0} bottom={0} left={0} right={0} borderStyle={look.border} borderColor={color} />
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

export function styleRow(els: Els, look: Look, row: RowInput, engine: unknown, opts: { prefixCards?: boolean } = {}): unknown {
  const out = draw(els, look, row, engine, opts)
  if (look.rows === 'classic') return out
  const { Box } = els
  // Column, not Ink's default row: a row wrapper shrinks bordered cards to content width.
  return <Box flexDirection="column" marginLeft={1}>{out}</Box>
}

function draw(els: Els, look: Look, row: RowInput, engine: unknown, opts: { prefixCards?: boolean }): unknown {
  try {
    const { Box, Text } = els
    if (row.site === 'UserMessage' && (!row.own || row.isExpanded)) return engine
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
        if (row.site === 'ToolResult') return <Box paddingLeft={2}>{engine}</Box>
        if (row.site === 'ToolUse') {
          const m = mark(look, row, MARKS.cards)
          return card(els, look, 'row', [shrinker(Box, engine), fixed(els, m.color, ' ' + m.mark)], c.faint, opts.prefixCards)
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
