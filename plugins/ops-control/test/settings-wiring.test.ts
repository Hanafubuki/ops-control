import { withinDropdown } from '../hooks/settingstab.tsx'
import { TAB_ACTIONS } from '../hooks/pane.tsx'
import { expect, mock } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { fakeFs, test } from './kit.ts'

const ENGINE_ROW = { type: 'Text', props: {}, children: ['engine row'] } as RenderElement
const scroll = { offset: 0, bodyRows: 40 }
const PANE = { title: 'ops-control', isFocused: false, bodyColumns: 80, placement: 'dock', scroll, view: {} } as never
const walk = (n: any, out: any[] = []): any[] => { if (typeof n === 'string') out.push(n); else if (n && typeof n === 'object') { out.push(n); for (const c of n.children ?? []) walk(c, out) } return out }
const petClient = (tree: any) => walk(tree).find(n => n?.type === 'Client' && String(n.props?.module).endsWith('client/pet.tsx'))
const textOf = (tree: any) => walk(tree).filter(n => typeof n === 'string').join(' ')

function base(on: any, store: Record<string, unknown>, toasts: string[] = []) {
  store.eggs ??= { passRuns: 1, eggAt: 1, eggRuns: 0 }
  fakeFs(on, {})
  on('store.get', async (_$: unknown, e: any) => ({ value: store[e.key] }) as never)
  on('store.set', async (_$: unknown, e: any) => { store[e.key] = e.value; return { value: undefined } as never })
  on('store.delete', async (_$: unknown, e: any) => { delete store[e.key]; return { value: undefined } as never })
  on('store.keys', async () => ({ value: Object.keys(store) }) as never)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: unknown, e: any) => ({ cwd: e.cwd }) as never)
  on('ui.render', async () => ENGINE_ROW)
  on('ui.panes', async () => ({ value: [{ id: 'ops-control', isShown: true, isPlaced: true }] }))
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async (_$: unknown, e: any) => { toasts.push(e.text); return { value: undefined } as never })
  on('session.id', async () => ({ value: 's1' }))
  on('session.usage', async () => ({ value: { context: { window: 1000, percent: 10 } } as never }))
  on('turn.start', async (_$: unknown, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: '' }) as never)
  on('tool.call', async () => ({ result: {}, text: 'ok' }) as never)
  return mock.clock(on)
}

// A dropdown is opened with its own press (Enter), then an option is pressed.
const pick = async (pane: any, which: string, value: string) => {
  await pane.press({ key: 'settings-' + which })
  await pane.press({ key: `settings-${which}-${value}` })
}
const start = ($: any) => $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
const mount = ($: any) => $.ui.mount({ plugin: 'ops-control', surface: 'terminal', component: 'Pane', requestId: 'ops-control', props: PANE })

test('the Settings tab picks a name pack: its character becomes the pet and the choice is kept', async ($, on) => {
  const store: Record<string, unknown> = {}
  base(on, store)
  await start($)
  const pane = await mount($)
  expect(petClient(await pane.drawn()).props.props.pet).toBe('clawd')
  await pane.press({ key: 'tab-settings' })
  const drawn = await pane.drawn()
  expect(walk(drawn).find(n => n?.props?.key === 'settings-pack')).toBeDefined()
  await pick(pane, 'pack', 'code-geass')
  expect(store.namepack).toBe('code-geass')
  expect(petClient(await pane.drawn()).props.props.pet).toBe('lelouch')
  // Default puts the person's own pet back
  await pick(pane, 'pack', 'default')
  expect(petClient(await pane.drawn()).props.props.pet).toBe('clawd')
  await pane.unmount()
})

test('the character switch hides the pet and shows it again, and is kept', async ($, on) => {
  const store: Record<string, unknown> = {}
  base(on, store)
  await start($)
  const pane = await mount($)
  await pane.press({ key: 'tab-settings' })
  await pane.press({ key: 'settings-pet' })
  expect(store.petShown).toBe(false)
  expect(petClient(await pane.drawn())).toBeUndefined()
  await pane.press({ key: 'settings-pet' })
  expect(store.petShown).toBe(true)
  expect(petClient(await pane.drawn())).toBeDefined()
  await pane.unmount()
})

test('a stored pack names the main session and each new agent in the Agents tab; a row opens the agent', async ($, on) => {
  const store: Record<string, unknown> = { namepack: 'naruto' }
  base(on, store)
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.tool.call({ tool: 'Agent', subagent_type: 'Explore', description: 'Find the tab code', prompt: 'Look at pane.tsx' } as never)
  await $.tool.call({ tool: 'Agent', subagent_type: 'Plan', description: 'Plan the change', prompt: 'Plan it' } as never)
  const pane = await mount($)
  await pane.press({ key: 'tab-agents' })
  const list = textOf(await pane.drawn())
  expect(list).toContain('★ Shikamaru')
  expect(list).toContain('◆ Naruto')
  expect(list).toContain('◆ Sasuke')
  expect(list).not.toContain('◆ Explore')
  const link = walk(await pane.drawn()).find(n => typeof n?.props?.key === 'string' && n.props.key.startsWith('req-') && n.props.key !== 'req-main')
  await pane.press({ key: link.props.key })
  const detail = textOf(await pane.drawn())
  expect(detail).toContain('NARUTO')
  expect(detail).toContain('Find the tab code')
  await pane.press({ key: 'agent-back' })
  expect(textOf(await pane.drawn())).toContain('★ Shikamaru')
  await pane.unmount()
})

test('arcade in the theme picker is ops-control\'s whole arcade pack; another palette leaves it for classic', async ($, on) => {
  const store: Record<string, unknown> = {}
  base(on, store)
  await start($)
  const pane = await mount($)
  await pane.press({ key: 'tab-settings' })
  await pick(pane, 'theme', 'arcade')
  expect(store.mix).toEqual({ colors: 'arcade', motion: 'arcade' })
  expect(walk(await pane.drawn()).find(n => n?.props?.key === 'settings-theme').props.label).toBe('Arcade ▾')
  await pick(pane, 'theme', 'tokyo-night')
  expect(store.mix).toEqual({ colors: 'classic', motion: 'classic', theme: 'tokyo-night' })
  await pane.unmount()
})

test('a stored arcade theme, from when arcade was a theme of its own, loads as the arcade pack alone', async ($, on) => {
  const store: Record<string, unknown> = { mix: { colors: 'arcade', motion: 'arcade', theme: 'arcade' }, theme: 'arcade' }
  const toasts: string[] = []
  base(on, store, toasts)
  await start($)
  const pane = await mount($)
  await pane.press({ key: 'tab-settings' })
  expect(walk(await pane.drawn()).find(n => n?.props?.key === 'settings-theme').props.label).toBe('Arcade ▾')
  expect(toasts.filter(t => /theme/.test(t))).toEqual([])
  await pane.unmount()
})

test('an open dropdown keeps the ring on itself and its options; a tab press closes it and asks for the keyboard', async ($, on) => {
  const store: Record<string, unknown> = {}
  base(on, store)
  const opened: unknown[] = []
  on('ui.open', async (_$, e) => { opened.push(e); return { value: {} } as never })
  await start($)
  const pane = await mount($)
  await pane.press({ key: 'tab-settings' })
  expect(opened).toEqual([expect.objectContaining({ id: 'ops-control', focus: true })])
  await pane.press({ key: 'settings-theme' })
  expect(walk(await pane.drawn()).some(n => n?.props?.key === 'settings-theme-classic')).toBe(true)
  // the person's arrows stay with the open dropdown (register.tsx's ui.focus hook asks this)
  expect(withinDropdown('theme', 'settings-theme-classic')).toBe(true)
  expect(withinDropdown('theme', 'settings-theme')).toBe(true)
  expect(withinDropdown('theme', 'settings-pet')).toBe(false)
  expect(withinDropdown('theme', 'settings-pack-naruto')).toBe(false)
  expect(withinDropdown('theme', undefined)).toBe(false)
  await pane.press({ key: 'tab-plan' })
  await pane.press({ key: 'tab-settings' })
  expect(walk(await pane.drawn()).some(n => n?.props?.key === 'settings-theme-classic')).toBe(false)
  await pane.unmount()
})

test('the tabs carry the actions F1-F7 are bound to, first tab first', async ($, on) => {
  base(on, {})
  await start($)
  const pane = await mount($)
  const tabs = walk(await pane.drawn()).filter(n => typeof n?.props?.key === 'string' && n.props.key.startsWith('tab-'))
  expect(tabs.map(n => n.props.action)).toEqual([...TAB_ACTIONS])
  expect(tabs.map(n => n.props.hotkey)).toEqual(['1', '2', '3', '4', '5', '6', '7'])
  await pane.unmount()
})
