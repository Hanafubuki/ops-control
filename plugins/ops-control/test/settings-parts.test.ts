import { expect } from 'claude-code/testing'
import { boardUrl, openArgv, serveArgv, sidequestRoot } from '../hooks/sqboard.ts'
import { SIDEQUEST_THEMES } from '../hooks/sqthemes.ts'
import { CREATE_PACK, dropdownKey, optionKey, packOptions, renderSettings, themeLabel, themeOptions } from '../hooks/settingstab.tsx'
import { COLOR_KEYS, resolveTheme } from '../hooks/themes.ts'
import { test } from './kit.ts'

test('every Sidequest palette resolves as a full theme with no error', () => {
  for (const name of Object.keys(SIDEQUEST_THEMES)) {
    const r = resolveTheme(name, {})
    expect(r.error, name).toBeUndefined()
    expect(r.theme.name).toBe(name)
    for (const k of COLOR_KEYS) expect(r.theme.colors[k], `${name}.${k}`).toMatch(/^#[0-9a-f]{6}$/)
  }
  // arcade is the arcade pack's palette, not a theme of its own
  expect(resolveTheme('arcade', {}).error).toMatch(/arcade/)
})

test('the board is found, started detached and opened per platform', () => {
  const installed = JSON.stringify({ plugins: { 'sidequest@eigenwise-toolshed': [{ installPath: '/c/sq/6.0.2' }] } })
  expect(sidequestRoot(installed)).toBe('/c/sq/6.0.2')
  expect(sidequestRoot('{}')).toBeUndefined()
  // this marketplace's copy wins; one from any other marketplace is found too
  expect(sidequestRoot(JSON.stringify({ plugins: { 'sidequest@eigenwise-toolshed': [{ installPath: '/c/e' }], 'sidequest@ops-control': [{ installPath: '/c/o' }] } }))).toBe('/c/o')
  expect(sidequestRoot(JSON.stringify({ plugins: { 'sidequest@mine': [{ installPath: '/c/m' }] } }))).toBe('/c/m')
  expect(sidequestRoot('not json')).toBeUndefined()
  expect(boardUrl('sidequest dashboard already running at http://127.0.0.1:41730 (pid 1) — reusing it.')).toBe('http://127.0.0.1:41730')
  expect(boardUrl('sidequest dashboard running at http://127.0.0.1:41731\n')).toBe('http://127.0.0.1:41731')
  expect(boardUrl('starting…')).toBeUndefined()
  expect(openArgv('wsl', 'http://127.0.0.1:1')).toEqual(['/mnt/c/Windows/explorer.exe', 'http://127.0.0.1:1'])
  expect(openArgv('darwin', 'u')).toEqual(['open', 'u'])
  expect(openArgv('linux', 'u')).toEqual(['xdg-open', 'u'])
  const argv = serveArgv('/c/sq/bin/sidequest.js', '/l/sq.log')
  expect(argv.slice(0, 2)).toEqual(['sh', '-c'])
  expect(argv.slice(3)).toEqual(['sh', '/c/sq/bin/sidequest.js', '/l/sq.log'])
})

test('theme options list the Sidequest palettes first, arcade leading, named in words', () => {
  const o = themeOptions(['classic', 'ops-control', 'tokyo-night', 'mine'])
  expect(o.map(x => x.value)).toEqual(['arcade', 'tokyo-night', 'classic', 'ops-control', 'mine'])
  expect(o.map(x => x.label)).toEqual(['Arcade', 'Tokyo Night', 'Classic', 'Ops Control', 'Mine'])
  expect(themeLabel('catppuccin-mocha')).toBe('Catppuccin Mocha')
})

const walk = (n: any, out: any[] = []): any[] => {
  if (Array.isArray(n)) for (const c of n) walk(c, out)
  else if (n && typeof n === 'object') { out.push(n); walk(n.children, out) }
  return out
}
const keyOf = (n: any) => n.props?.key ?? n.key
const ELS = { Box: 'Box', Text: 'Text', Button: 'Button' }
const PACKS = { pack: 'code-geass', packs: [{ id: 'default', label: 'Default' }, { id: 'code-geass', label: 'Code Geass' }, { id: 'naruto', label: 'Naruto' }] }
const actions = (did: string[]) => ({
  onBoard: () => did.push('board'), onTheme: (n: string) => did.push('theme ' + n), onPet: (on: boolean) => did.push('pet ' + on),
  onPack: (id: string) => did.push('pack ' + id), onCreateOpen: (o: boolean) => did.push('create ' + o), onCreate: (d: string) => did.push('make ' + d),
  onDropdown: (w?: string) => did.push('dropdown ' + (w ?? 'closed')),
})

test('the Settings tab reads plainly: Open board, the theme and pack by name alone, Package, Show and Hide', () => {
  const t = resolveTheme('arcade', {}).theme
  const did: string[] = []
  const tree = renderSettings(ELS, t, { theme: 'arcade', themes: ['classic', 'arcade'], petOn: true, ...PACKS }, actions(did), 40)
  const by = (k: string) => walk(tree).find(n => keyOf(n) === k)
  expect(by('settings-board').props.label).toBe('Open board')
  expect(by('settings-theme').props.label).toBe('Arcade ▾')
  expect(by('settings-pack').props.label).toBe('Code Geass ▾')
  expect(JSON.stringify(tree)).toContain('Package')
  expect(JSON.stringify(tree)).not.toContain('Name pack')
  expect(by('settings-pet').props.label).toBe('Shown · Hide')
  // closed, no option is drawn, so the arrows pass from control to control
  expect(by('settings-theme-classic')).toBeUndefined()
  by('settings-board').onPress({})
  by('settings-pet').onPress({})
  expect(did).toEqual(['board', 'pet false'])
  const hidden = renderSettings(ELS, t, { theme: 'arcade', themes: ['classic', 'arcade'], petOn: false, ...PACKS }, actions(did), 40)
  expect(walk(hidden).find(n => keyOf(n) === 'settings-pet').props.label).toBe('Hidden · Show')
})

test('a dropdown opens and closes on its own press, and only a pressed option changes anything', () => {
  const t = resolveTheme('classic', {}).theme
  const did: string[] = []
  const base = { theme: 'arcade', themes: ['classic', 'arcade'], petOn: true, ...PACKS }
  const by = (tree: unknown, k: string) => walk(tree).find(n => keyOf(n) === k)
  by(renderSettings(ELS, t, base, actions(did), 40), 'settings-theme').onPress({})
  const open = renderSettings(ELS, t, { ...base, open: 'theme' }, actions(did), 40)
  expect(by(open, 'settings-theme').props.label).toBe('Arcade ▴')
  expect(by(open, 'settings-theme-arcade').props.label).toBe('● Arcade')
  expect(by(open, 'settings-theme-classic').props.label).toBe('○ Classic')
  // the other dropdown stays closed
  expect(by(open, 'settings-pack-naruto')).toBeUndefined()
  by(open, 'settings-theme').onPress({})
  by(open, 'settings-theme-classic').onPress({})
  expect(did).toEqual(['dropdown theme', 'dropdown closed', 'dropdown closed', 'theme classic'])
  expect([dropdownKey('pack'), optionKey('pack', 'naruto')]).toEqual(['settings-pack', 'settings-pack-naruto'])
})

test('the pack list switches packs, and its last entry opens the description field that makes one', () => {
  const t = resolveTheme('classic', {}).theme
  const did: string[] = []
  const els = { ...ELS, Input: 'Input' }
  const base = { theme: 'classic', themes: ['classic'], petOn: true, ...PACKS, open: 'pack' as const }
  const by = (tree: unknown, k: string) => walk(tree).find(n => keyOf(n) === k)
  const open = renderSettings(els, t, base, actions(did), 40)
  expect(by(open, 'settings-pack-' + CREATE_PACK).props.label).toBe('○ + Create pack…')
  expect(by(open, 'settings-create')).toBeUndefined()
  by(open, 'settings-pack-naruto').onPress({})
  by(open, 'settings-pack-' + CREATE_PACK).onPress({})
  const creating = renderSettings(els, t, { ...base, open: undefined, creating: true }, actions(did), 40)
  by(creating, 'settings-create').onEvent({ kind: 'submit', value: 'One Piece, Luffy leads' })
  by(creating, 'settings-create-cancel').onPress({})
  expect(did).toEqual(['dropdown closed', 'pack naruto', 'dropdown closed', 'create true', 'make One Piece, Luffy leads', 'create false'])
  const making = renderSettings(els, t, { ...base, open: undefined, creating: true, making: 'One Piece' }, actions(did), 40)
  expect(by(making, 'settings-create')).toBeUndefined()
  expect(JSON.stringify(by(making, 'settings-making'))).toContain('Making a pack from')
  // without an Input there is nowhere to describe one, so the entry is left out
  expect(packOptions({ ...base }, false).map(o => o.value)).toEqual(['default', 'code-geass', 'naruto'])
})
