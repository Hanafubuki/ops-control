import { expect } from 'claude-code/testing'
import { test } from './kit.ts'
import { renderConfig, previewRows, type ConfigHandlers } from '../hooks/configpane.tsx'
import { inputValue, type ConfigState } from '../hooks/configrows.ts'
import { resolveLook, DEFAULT_MIX } from '../hooks/packs.ts'
import { DEFAULT_SETUP } from '../hooks/setup.ts'
import { DEFAULT_FIELDS } from '../hooks/fields.ts'
import { COLOR_KEYS } from '../hooks/themes.ts'

// The global `h` builds { type, props, children }, keeps map() results as nested arrays and hoists handlers onto the node (Button onPress, Input onEvent).
const EL = { Box: 'Box', Text: 'Text', Button: 'Button', Input: 'Input', Link: 'Link' }
const look = resolveLook(DEFAULT_MIX, {}, {}).look
const s: ConfigState = { packs: ['classic', 'cozy'], mix: DEFAULT_MIX, colors: look.theme.colors, pet: 'clawd', shiny: false, egg: false, userPets: [], bubbles: 'on', reduced: false, setup: DEFAULT_SETUP, fields: DEFAULT_FIELDS }
const noop: ConfigHandlers = { cycle() {}, input() {}, done() {}, reset() {}, copyLink() {} }
const walk = (n: any, out: any[] = []): any[] => {
  if (Array.isArray(n)) for (const c of n) walk(c, out)
  else if (n && typeof n === 'object') { out.push(n); walk(n.children, out) }
  return out
}
const keyOf = (n: any) => n.props?.key ?? n.key
const keys = (tree: unknown) => walk(tree).map(keyOf).filter(Boolean)
const byKey = (tree: unknown, k: string) => walk(tree).find(n => keyOf(n) === k)

test('every cycle and every role has its element, and Pack takes the first focus', () => {
  const tree = renderConfig(EL, s, look, 90, noop, {})
  const k = keys(tree)
  for (const id of ['pack', 'spinner', 'pet', 'bubbles', 'motion', 'meter', 'bubbleMs', 'sleep', 'dance']) expect(k).toContain(`cycle-${id}`)
  for (const r of COLOR_KEYS) expect(k).toContain(`input-color:${r}`)
  for (const id of ['band', 'tabs', 'moods', 'fields']) expect(k).toContain(`input-${id}`)
  expect(byKey(tree, 'cycle-pack').props.autoFocus).toBe(true)
  const others = walk(tree).filter(n => keyOf(n)?.startsWith('cycle-') && keyOf(n) !== 'cycle-pack')
  expect(others.every(n => !('autoFocus' in n.props))).toBe(true)
})

test('a color Input holds the hex and its swatch paints in it', () => {
  const tree = renderConfig(EL, s, look, 90, noop, {})
  expect(byKey(tree, 'input-color:accent').props.value).toBe(look.theme.colors.accent)
  expect(walk(tree).some(n => n.type === 'Text' && n.props?.color === look.theme.colors.accent && JSON.stringify(n).includes('██'))).toBe(true)
})

test('pressing and submitting call the handlers with the row id', () => {
  const got: string[] = []
  const tree = renderConfig(EL, s, look, 90, { ...noop, cycle: id => got.push(id), input: (id, t) => got.push(`${id}=${t}`) }, {})
  byKey(tree, 'cycle-meter').onPress({})
  byKey(tree, 'input-tabs').onEvent({ kind: 'submit', value: 'plan' })
  expect(got).toEqual(['meter', 'tabs=plan'])
})

test('without Input (mobile) the values draw as text', () => {
  const { Input: _, ...mobile } = EL
  const tree = renderConfig(mobile, s, look, 50, noop, {})
  expect(keys(tree).some(k => k.startsWith('input-'))).toBe(false)
  expect(walk(tree).every(n => n.type !== 'Input')).toBe(true)
  expect(JSON.stringify(tree)).toContain(inputValue('band', s))
})

test('a narrow pane drops the role descriptions, a wide one shows them', () => {
  expect(JSON.stringify(renderConfig(EL, s, look, 90, noop, {}))).toContain('read & search')
  expect(JSON.stringify(renderConfig(EL, s, look, 50, noop, {}))).not.toContain('read & search')
})

test('an error note draws in the fail color', () => {
  const tree = renderConfig(EL, s, look, 90, noop, { note: { text: 'bad', tone: 'error' } })
  expect(walk(tree).some(n => n.props?.color === look.theme.colors.fail && JSON.stringify(n).includes('bad'))).toBe(true)
})

test('the preview marks the rows the focused role paints and no others', () => {
  const marked = (rows: any[][]) => rows.filter(r => r.some(seg => seg.text.includes('◂'))).length
  expect(marked(previewRows(look, undefined, 60))).toBe(0)
  expect(marked(previewRows(look, 'read', 60))).toBe(1)
  for (const row of previewRows(look, 'accent', 30)) expect(row.reduce((n, seg) => n + seg.text.length, 0)).toBeLessThanOrEqual(30)
})

test('a link over 2048 characters is not drawn as a Link', () => {
  const long = 'https://glowup.khimani.dev/studio#v=1&p=' + 'a'.repeat(2100)
  expect(walk(renderConfig(EL, s, look, 90, noop, { link: long })).some(n => n.type === 'Link')).toBe(false)
  expect(walk(renderConfig(EL, s, look, 90, noop, { link: 'https://glowup.khimani.dev/studio#v=1' })).some(n => n.type === 'Link')).toBe(true)
})
