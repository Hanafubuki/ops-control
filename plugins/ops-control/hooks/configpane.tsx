import { COLOR_KEYS, ROLE_LABELS } from './themes.ts'
import type { Look } from './packs.ts'
import { fit, hearts, renderSegs, type Seg } from './layout.tsx'
import { cycleValue, inputValue, type ConfigState, type CycleId, type InputId, type Role } from './configrows.ts'

export type ConfigNote = { text: string; tone: 'ok' | 'error' }
export type ConfigHandlers = { cycle(id: CycleId): void; input(id: InputId, text: string): void; done(): void; reset(): void; copyLink(): void }
type Els = { Box: any; Text: any; Button: any; Input?: any; Link?: any }

const LABEL = 11
// A longer href is drawn as plain text (LinkProps in the engine types).
const LINK_MAX = 2048
// Below this the role descriptions crowd out the hex field.
const WIDE = 60

// Each sample row lists the roles it shows, so the focused role's rows get the marker.
function samples(look: Look): [Role[], Seg[]][] {
  const c = look.theme.colors
  return [
    [['accent', 'text'], [{ text: '❯ ', color: c.accent }, { text: 'fix the login bug', color: c.text }]],
    [['read', 'dim'], [{ text: '✓ Read ', color: c.read }, { text: 'src/auth.ts', color: c.dim }]],
    [['edit', 'addBg', 'delBg'], [{ text: '✎ Edit ', color: c.edit }, { text: '+ok ', color: c.text, bg: c.addBg }, { text: '-bug', color: c.text, bg: c.delBg }]],
    [['shell', 'faint'], [{ text: '$ npm test ', color: c.shell }, { text: '┄┄', color: c.faint }]],
    [['agent'], [{ text: '◆ explorer working', color: c.agent }]],
    [['pass', 'fail'], [{ text: '✓ 41 passed ', color: c.pass }, { text: '✗ 1 failed', color: c.fail }]],
    [['panel', 'sel'], [{ text: ' panel ', color: c.text, bg: c.panel }, { text: ' selected ', color: c.text, bg: c.sel }]],
    [[], hearts(30, look.theme)],
  ]
}

export function previewRows(look: Look, focus: Role | undefined, width: number): Seg[][] {
  return samples(look).map(([roles, segs]) =>
    fit(focus && roles.includes(focus) ? [...segs, { text: `  ◂ ${focus}`, color: look.theme.colors.dim }] : segs, width))
}

export function renderConfig(els: Els, s: ConfigState, look: Look, width: number, act: ConfigHandlers, o: { focus?: string; note?: ConfigNote; link?: string }) {
  // The handlers are not named h: the JSX factory is the global h.
  const { Box, Text, Button, Input, Link } = els
  const c = look.theme.colors
  const over = s.mix.overrides ?? {}
  const title = (t: string) => <Text key={'t-' + t} bold color={c.accent}>{t}</Text>
  // The engine refuses an undefined prop, so autoFocus is spread in rather than passed as undefined.
  const cycle = (id: CycleId, name: string, first?: true) => (
    <Button key={`cycle-${id}`} plain {...(first ? { autoFocus: true as const } : {})} label={`${name.padEnd(LABEL)}‹ ${cycleValue(id, s)} ›`} onPress={() => act.cycle(id)} />
  )
  const field = (id: InputId, name: string) => Input
    ? <Input key={`input-${id}`} label={name.padEnd(LABEL)} value={inputValue(id, s)} submitLabel="set" onSubmit={(v: string) => act.input(id, v)} />
    : <Text key={`input-${id}`} color={c.text}>{name.padEnd(LABEL)}{inputValue(id, s)}</Text>
  const colorRow = (role: Role) => (
    <Box key={'row-' + role} flexDirection="row">
      <Text color={c[role]}>{'██ '}</Text>
      {field(`color:${role}`, role + (role in over ? ' ●' : ''))}
      {width >= WIDE && <Text color={c.dim} wrap="truncate">{'  ' + ROLE_LABELS[role]}</Text>}
    </Box>
  )
  const focusRole = o.focus?.startsWith('input-color:') ? o.focus.slice('input-color:'.length) as Role : undefined
  return (
    <Box flexDirection="column" width={width}>
      {title('LOOK')}
      {cycle('pack', 'Pack', true)}
      {cycle('spinner', 'Spinner')}
      {COLOR_KEYS.map(colorRow)}
      {title('SETUP')}
      {field('band', 'Band')}
      {field('tabs', 'Tabs')}
      {cycle('meter', 'Meter')}
      {cycle('pet', 'Pet')}
      {cycle('sleep', 'Sleeps')}
      {cycle('dance', 'Dances')}
      {cycle('bubbles', 'Bubbles')}
      {cycle('bubbleMs', 'Bubble')}
      {field('moods', 'Moods')}
      {cycle('motion', 'Motion')}
      {field('fields', 'Status')}
      {title('PREVIEW')}
      {previewRows(look, focusRole, width).map((r, i) => renderSegs(els, r, 'p' + i))}
      <Box key="actions" flexDirection="row" gap={2} marginTop={1}>
        <Button key="done" variant="primary" label="Done" onPress={() => act.done()} />
        <Button key="copy-link" label="Copy studio link" onPress={() => act.copyLink()} />
        <Button key="reset" label="Reset" onPress={() => act.reset()} />
        {Link && o.link && o.link.length <= LINK_MAX && <Link key="studio" href={o.link} label="Open the studio ↗" />}
      </Box>
      {o.note && <Text key="note" color={o.note.tone === 'error' ? c.fail : c.dim} wrap="truncate">{o.note.text}</Text>}
    </Box>
  )
}
