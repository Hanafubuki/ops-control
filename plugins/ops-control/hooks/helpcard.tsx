import type { Look } from './packs.ts'
import { renderSegs, type Seg } from './layout.tsx'
import { SHORT_ROWS, SECTIONS, COMMAND_COLS, DOCS_URL, type HelpRow } from './help.ts'

// `els` is the table from $.ui.resolve(e).
type Els = { Box: any; Text: any }

export function renderHeader(els: Els, look: Look) {
  const { Box } = els
  const c = look.theme.colors
  const word = (look.theme.spinnerWords[0] ?? 'Thinking') + '…'
  const swatches = [c.accent, c.read, c.edit, c.shell, c.pass].flatMap((color, i): Seg[] => [...(i ? [{ text: ' ', color }] : []), { text: '██', color }])
  const header: Seg[] = [{ text: 'ops-control', color: c.accent, bold: true }, { text: '  ', color: c.text }, ...swatches, { text: '  ✻ ' + word, color: c.accent }]
  return <Box key="header" flexDirection="column" borderStyle={look.border} borderColor={look.borderColor} paddingX={1}>{renderSegs(els, header)}</Box>
}

const LIST_ROW = /^([●○]) (\S+)\s+(#[0-9a-fA-F]{6})  (.+?)(  \(override\))?$/

// The same lines /ops color list printed, with a swatch drawn in each role's color.
export function renderColorList(els: Els, look: Look, text: string) {
  const { Box, Text } = els
  const c = look.theme.colors
  // The engine puts the plugin's name in front of the row's first line.
  const lines = text.replace(/^ops-control: /, '').split('\n')
  const rows = lines.map(l => LIST_ROW.exec(l))
  if (!rows.some(Boolean)) return undefined
  const fixed = (color: string, s: string, key: string) => <Text key={key} color={color} wrap="truncate">{s}</Text>
  return (
    <Box flexDirection="column">
      {lines.map((l, i) => {
        const m = rows[i]
        if (!m) return renderSegs(els, [{ text: l, color: c.dim }], 'l' + i)
        const [, mark, role, hex, label, over] = m
        // Only the label may shrink: in a narrow column it ellipsizes while mark, swatch, role and hex stay whole.
        return (
          <Box key={'l' + i} flexDirection="row">
            <Box flexShrink={0}>
              {fixed(over ? c.accent : c.dim, mark + ' ', 'm')}
              {fixed(hex!, '██ ', 's')}
              {fixed(c.text, role!.padEnd(7), 'r')}
              {fixed(c.dim, hex! + '  ', 'h')}
            </Box>
            <Box flexShrink={1}><Text color={c.dim} wrap="truncate">{label!}</Text></Box>
            {over && <Box flexShrink={0}>{fixed(c.accent, over, 'o')}</Box>}
          </Box>
        )
      })}
    </Box>
  )
}

export function renderHelp(els: Els, look: Look, full: boolean) {
  const { Box } = els
  const c = look.theme.colors
  const cmd = ([name, what]: HelpRow, key: string) => renderSegs(els, [
    { text: '  ' + name.padEnd(COMMAND_COLS) + ' ', color: c.text, bold: true }, { text: what, color: c.dim },
  ], key)
  const gap = (key: string) => renderSegs(els, [], key)
  return (
    <Box flexDirection="column">
      {renderHeader(els, look)}
      {full
        ? SECTIONS.map(([title, rows]) => (
          <Box key={title} flexDirection="column">
            {gap('gap')}
            {renderSegs(els, [{ text: title, color: c.accent, bold: true }])}
            {rows.map(r => cmd(r, r[0]))}
          </Box>
        ))
        : <Box key="short" flexDirection="column">
          {gap('gap')}
          {SHORT_ROWS.map(r => cmd(r, r[0]))}
          {gap('gap2')}
          {renderSegs(els, [
            { text: 'more: ', color: c.dim }, { text: '/ops help all', color: c.accent },
            { text: '   docs: ', color: c.dim }, { text: DOCS_URL, color: c.accent },
          ])}
        </Box>}
    </Box>
  )
}
