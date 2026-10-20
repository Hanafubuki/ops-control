import type { Colors } from './themes.ts'

export type Scheme = { name: string; palette: Colors; bg: string }

const MAX_BYTES = 65536
const HEX = /^#?([0-9a-fA-F]{6})$/

function blend(a: string, b: string, t: number): string {
  const ch = (s: string, i: number) => parseInt(s.slice(1 + i * 2, 3 + i * 2), 16)
  return '#' + [0, 1, 2].map(i => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')).join('')
}

const hex = (v: string): string | undefined => { const m = HEX.exec(v.trim().replace(/^["']|["']$/g, '')); return m ? '#' + m[1]!.toLowerCase() : undefined }

// Names come from downloaded files and reach toasts, so only [a-z0-9-] survives.
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '')
}

const BASE16_ANSI: Record<number, string> = { 0: '00', 1: '08', 2: '0B', 3: '0A', 4: '0D', 5: '0E', 6: '0C', 7: '05', 8: '03', 13: '0E' }

type Raw = { ansi: Record<number, string>; fg?: string; bg?: string; own?: string }

function ghostty(text: string): Raw {
  const raw: Raw = { ansi: {} }
  for (const line of text.split(/\r?\n/)) {
    const p = /^\s*palette\s*=\s*(\d+)\s*=\s*(\S+)/.exec(line)
    if (p) { const c = hex(p[2]!); if (c) raw.ansi[Number(p[1])] = c; continue }
    const k = /^\s*(background|foreground)\s*=\s*(\S+)/.exec(line)
    if (k) { const c = hex(k[2]!); if (c) raw[k[1] === 'background' ? 'bg' : 'fg'] = c }
  }
  return raw
}

function base16(text: string): Raw {
  const base: Record<string, string> = {}
  const raw: Raw = { ansi: {} }
  for (const line of text.split(/\r?\n/)) {
    const b = /^\s*base(0[0-9A-Fa-f])\s*:\s*(\S+)/.exec(line)
    if (b) { const c = hex(b[2]!); if (c) base[b[1]!.toUpperCase()] = c; continue }
    const n = /^\s*(?:scheme|name)\s*:\s*"?([^"\r\n]*)"?/.exec(line)
    if (n && !raw.own) raw.own = n[1]
  }
  for (const [i, k] of Object.entries(BASE16_ANSI)) if (base[k]) raw.ansi[Number(i)] = base[k]
  raw.fg = base['05']
  raw.bg = base['00']
  return raw
}

export function parseScheme(text: string, fileName: string): Scheme {
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('file is over 64 KB')
  const raw = /^\s*palette\s*=\s*\d+\s*=/m.test(text) ? ghostty(text)
    : /^\s*base0[0-9A-Fa-f]\s*:/m.test(text) ? base16(text)
    : undefined
  if (!raw) throw new Error('not a Ghostty or base16 color scheme')
  const { ansi, fg, bg } = raw
  for (let i = 0; i < 8; i++) if (!ansi[i]) throw new Error(`the scheme has no color ${i}`)
  if (!fg || !bg) throw new Error('the scheme needs a foreground and a background')
  const a = (i: number) => ansi[i]!
  const base = fileName.split(/[\\/]/).pop()!.replace(/\.[^.]*$/, '')
  const name = slug(raw.own ?? '') || slug(base) || 'imported'
  const palette: Colors = {
    text: fg,
    dim: ansi[8] ?? blend(bg, fg, 0.55),
    faint: blend(bg, fg, 0.22),
    accent: a(5),
    read: a(6),
    edit: a(3),
    shell: a(2),
    agent: a(4),
    pass: a(2),
    fail: a(1),
    panel: blend(bg, fg, 0.06),
    sel: blend(bg, fg, 0.12),
    addBg: blend(bg, a(2), 0.2),
    delBg: blend(bg, a(1), 0.2),
  }
  return { name, palette, bg }
}
