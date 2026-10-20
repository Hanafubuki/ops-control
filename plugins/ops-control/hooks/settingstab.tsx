// The pane's Settings tab: open the Sidequest board, pick the theme, pick the name pack (or describe a new one),
// show or hide the character. `els` is the table from $.ui.resolve(e); without an Input a pack cannot be described here.
// Each picker is a dropdown of Buttons, not a Select: Enter (or a click) opens and closes it, the arrows walk its options
// (register.tsx keeps the ring inside them while it is open), and nothing changes until an option is pressed.
import type { Theme } from './themes.ts'
import { ARCADE, SIDEQUEST_THEMES } from './sqthemes.ts'
import { renderSegs } from './layout.tsx'

type Els = { Box: any; Text: any; Button: any; Input?: any }
export type Dropdown = 'theme' | 'pack'
// pack: the name pack in use; packs: every pack as id and label; open: the dropdown showing its options;
// creating: the description field is open; making: a pack is being made from `making`'s description
export type SettingsView = {
  theme: string; themes: readonly string[]; petOn: boolean; note?: string
  pack: string; packs: readonly { id: string; label: string }[]; open?: Dropdown; creating?: boolean; making?: string
}
export type SettingsActions = {
  onBoard: () => void; onTheme: (name: string) => void; onPet: (on: boolean) => void
  onPack: (id: string) => void; onCreateOpen: (open: boolean) => void; onCreate: (description: string) => void
  onDropdown: (which: Dropdown | undefined) => void
}
// The pack list's last entry: not a pack, it opens the description field.
export const CREATE_PACK = '__create__'
// The Button keys of a dropdown and of its options, which register.tsx keeps the focus ring on while it is open.
export const dropdownKey = (which: Dropdown) => `settings-${which}`
export const optionKey = (which: Dropdown, value: string) => `settings-${which}-${value}`
// Whether a focus move onto `element` stays with the open dropdown: on it or one of its options.
export const withinDropdown = (which: Dropdown, element: string | undefined) => element === dropdownKey(which) || !!element?.startsWith(dropdownKey(which) + '-')

// A theme's name as words: tokyo-night reads Tokyo Night.
export const themeLabel = (name: string) => name.split(/[-_\s]+/).filter(Boolean).map(w => w[0]!.toUpperCase() + w.slice(1)).join(' ')

// The Sidequest board's palettes first, the way it lists them (arcade, ops-control's arcade pack, leads), then ops-control's
// own themes and the person's.
export function themeOptions(themes: readonly string[]): { value: string; label: string }[] {
  const sq = [ARCADE, ...Object.keys(SIDEQUEST_THEMES).filter(n => themes.includes(n))]
  return [...sq, ...themes.filter(n => !sq.includes(n))].map(n => ({ value: n, label: themeLabel(n) }))
}

export function packOptions(v: SettingsView, canDescribe: boolean): { value: string; label: string }[] {
  return [...v.packs.map(p => ({ value: p.id, label: p.label })), ...(canDescribe ? [{ value: CREATE_PACK, label: '+ Create pack…' }] : [])]
}

export function renderSettings(els: Els, t: Theme, v: SettingsView, a: SettingsActions, width: number) {
  const { Box, Button, Input } = els
  const c = t.colors
  const head = (text: string, key: string) => renderSegs(els, [{ text, color: c.accent, bold: true }], key)
  const pickPack = (id: string) => (id === CREATE_PACK ? a.onCreateOpen(true) : a.onPack(id))
  return (
    <Box key="settings" flexDirection="column" width={width}>
      {head('Sidequest', 'settings-h-board')}
      <Box key="settings-board-row" flexDirection="row">
        <Button key="settings-board" label="Open board" hotkey="b" onPress={() => a.onBoard()} />
      </Box>
      {v.note ? renderSegs(els, [{ text: v.note, color: c.dim }], 'settings-note') : null}
      <Box key="settings-gap-1" height={1} />
      {head('Theme', 'settings-h-theme')}
      {dropdown(els, 'theme', themeOptions(v.themes), v.theme, v.open === 'theme', a, name => a.onTheme(name))}
      <Box key="settings-gap-2" height={1} />
      {head('Package', 'settings-h-pack')}
      {dropdown(els, 'pack', packOptions(v, !!Input), v.pack, v.open === 'pack', a, pickPack)}
      {v.making
        ? renderSegs(els, [{ text: `Making a pack from "${v.making}"…`, color: c.dim }], 'settings-making')
        : v.creating && Input
          ? <Box key="settings-create-row" flexDirection="column">
              <Input key="settings-create" autoFocus label="Describe the pack" placeholder="e.g. One Piece, Luffy leads" value="" submitLabel="create" onSubmit={(d: string) => a.onCreate(d)} />
              <Button key="settings-create-cancel" label="Cancel" plain onPress={() => a.onCreateOpen(false)} />
            </Box>
          : null}
      <Box key="settings-gap-3" height={1} />
      {head('Character', 'settings-h-pet')}
      <Box key="settings-pet-row" flexDirection="row">
        <Button key="settings-pet" label={v.petOn ? 'Shown · Hide' : 'Hidden · Show'} hotkey="c" onPress={() => a.onPet(!v.petOn)} />
      </Box>
    </Box>
  )
}

// The current choice on a Button that opens and closes the list; open, every option below it, the current one marked.
// Pressing an option picks it and closes the list.
function dropdown(els: Els, which: Dropdown, options: { value: string; label: string }[], value: string, open: boolean, a: SettingsActions, pick: (value: string) => void) {
  const { Box, Button } = els
  const current = options.find(o => o.value === value)?.label ?? value
  return (
    <Box key={`settings-${which}-box`} flexDirection="column">
      <Box key={`settings-${which}-row`} flexDirection="row">
        <Button key={dropdownKey(which)} label={`${current} ${open ? '▴' : '▾'}`} onPress={() => a.onDropdown(open ? undefined : which)} />
      </Box>
      {open
        ? options.map(o => (
            <Button key={optionKey(which, o.value)} label={`${o.value === value ? '●' : '○'} ${o.label}`} plain
              {...(o.value === value && { variant: 'primary' })} onPress={() => { a.onDropdown(undefined); pick(o.value) }} />
          ))
        : null}
    </Box>
  )
}
