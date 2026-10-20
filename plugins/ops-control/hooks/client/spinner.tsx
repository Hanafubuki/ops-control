import type { ClientSurface } from 'claude-code'
import { spinnerLine, type SpinnerProps } from '../spinner.ts'

// Animates on the surface's own frame clock: the hooks send new props only when the
// activity changes, so no host redraw runs per frame.
export default function SpinnerClient(p: SpinnerProps, surface: ClientSurface<number>) {
  const { Box, Text } = surface.elements
  if (surface.state === undefined && !p.reduced) {
    surface.setState(Date.now())
    surface.every(33, () => surface.setState(Date.now()))
  }
  const line = spinnerLine(p.look, p.input, p.reduced ? p.input.turnAt : surface.state ?? Date.now())
  const spans = (row: { text: string; color: string; bold?: boolean; bg?: string }[]) =>
    row.map(s => <Text color={s.color} backgroundColor={s.bg} bold={s.bold}>{s.text}</Text>)
  return (
    <Box flexDirection="row" paddingLeft={2}>
      <Box flexDirection="column">{line.badge.map(r => <Box flexDirection="row">{spans(r)}</Box>)}</Box>
      <Box flexDirection="column" marginLeft={1}>
        <Box flexDirection="row">{spans(line.word)}<Text color={p.look.theme.colors.dim}>{' ' + line.tail}</Text></Box>
        {line.detail ? <Text color={p.look.theme.colors.dim} wrap="truncate">{line.detail}</Text> : null}
      </Box>
    </Box>
  )
}
