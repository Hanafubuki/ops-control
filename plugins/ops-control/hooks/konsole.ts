import type { Colors } from './themes.ts'
import { mix } from './color.ts'

export const KONSOLE_FALLBACK_BG = '#1e1e1e'

const ANSI: (keyof Colors | 'bg')[] = ['bg', 'fail', 'pass', 'edit', 'read', 'agent', 'shell', 'text']
const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(',')

export function konsoleScheme(pack: string, c: Colors, bg: string = KONSOLE_FALLBACK_BG): string {
  const slot = (name: string, hex: string) =>
    `[${name}]\nColor=${rgb(hex)}\n\n[${name}Faint]\nColor=${rgb(mix(hex, bg, 0.4))}\n\n[${name}Intense]\nColor=${rgb(mix(hex, '#ffffff', 0.3))}\n\n`
  return slot('Background', bg) + slot('Foreground', c.text)
    + ANSI.map((k, i) => slot(`Color${i}`, k === 'bg' ? bg : c[k])).join('')
    + `[General]\nDescription=ops-control ${pack}\nOpacity=1\n`
}
