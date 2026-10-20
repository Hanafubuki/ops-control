import { test, expect } from 'claude-code/testing'
import { konsoleScheme, KONSOLE_FALLBACK_BG } from '../hooks/konsole.ts'
import { resolveTheme } from '../hooks/themes.ts'

const colors = resolveTheme('classic', {}).theme.colors
const sections = (t: string) => [...t.matchAll(/^\[(\w+)\]$/gm)].map(m => m[1])
const value = (t: string, s: string) => new RegExp(`^\\[${s}\\]\\nColor=(.*)$`, 'm').exec(t)?.[1]

test('the scheme has exactly the Konsole sections', () => {
  const t = konsoleScheme('arcade', colors, '#000000')
  const want = ['Background', 'BackgroundFaint', 'BackgroundIntense', 'Foreground', 'ForegroundFaint', 'ForegroundIntense']
  for (let i = 0; i < 8; i++) want.push(`Color${i}`, `Color${i}Faint`, `Color${i}Intense`)
  expect(sections(t)).toEqual([...want, 'General'])
  expect(t).toContain('[General]\nDescription=ops-control arcade\nOpacity=1')
})

test('colors map onto the ANSI slots as r,g,b', () => {
  const t = konsoleScheme('x', { ...colors, fail: '#ff0000', pass: '#00ff00', edit: '#0000ff', text: '#102030' }, '#112233')
  expect(value(t, 'Background')).toBe('17,34,51')
  expect(value(t, 'Color0')).toBe('17,34,51')
  expect(value(t, 'Foreground')).toBe('16,32,48')
  expect(value(t, 'Color7')).toBe('16,32,48')
  expect(value(t, 'Color1')).toBe('255,0,0')
  expect(value(t, 'Color2')).toBe('0,255,0')
  expect(value(t, 'Color3')).toBe('0,0,255')
  for (const [i, k] of [[4, 'read'], [5, 'agent'], [6, 'shell']] as const) {
    const h = colors[k]
    expect(value(t, `Color${i}`)).toBe([1, 3, 5].map(j => parseInt(h.slice(j, j + 2), 16)).join(','))
  }
})

test('intense is 30% toward white, faint 40% toward the background', () => {
  const t = konsoleScheme('x', { ...colors, fail: '#ff0000' }, '#000000')
  expect(value(t, 'Color1Intense')).toBe('255,77,77')
  expect(value(t, 'Color1Faint')).toBe('153,0,0')
  expect(value(t, 'BackgroundIntense')).toBe('77,77,77')
})

test('a missing background falls back to #1e1e1e', () => {
  expect(KONSOLE_FALLBACK_BG).toBe('#1e1e1e')
  expect(value(konsoleScheme('x', colors, undefined), 'Background')).toBe('30,30,30')
})
