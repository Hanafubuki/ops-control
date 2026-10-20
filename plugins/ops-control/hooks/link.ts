// JSX-free: the docs site imports it.
// Hand-written base64url: the mod runtime's atob/btoa and CompressionStream are unverified.
export const STUDIO_URL = 'https://glowup.khimani.dev/studio'
export const LINK_VERSION = 1
// A pet bigger than this goes as a file; chat clients cut long links.
export const PET_LINK_MAX = 4096
// Over the 64 KB file cap once base64 grows it by a third.
const MAX_FRAGMENT = 90_000

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function toBase64Url(b: Uint8Array): string {
  let out = ''
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i]! << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0)
    out += ABC[(n >> 18) & 63]! + ABC[(n >> 12) & 63]!
    if (i + 1 < b.length) out += ABC[(n >> 6) & 63]!
    if (i + 2 < b.length) out += ABC[n & 63]!
  }
  return out
}

export function fromBase64Url(s: string): Uint8Array {
  s = s.replace(/=+$/, '')
  if (s.length % 4 === 1) throw new Error('cut off')
  const out: number[] = []
  let acc = 0, bits = 0
  for (const ch of s) {
    const v = ABC.indexOf(ch)
    if (v < 0) throw new Error('bad character')
    acc = (acc << 6) | v; bits += 6
    if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255) }
  }
  return Uint8Array.from(out)
}

export type LinkParts = { pack?: unknown; setup?: unknown; pet?: unknown }
const KEYS = [['p', 'pack'], ['s', 'setup'], ['pet', 'pet']] as const

// The engine's typings omit the `fatal` option the runtime honors, and a global var cannot be re-declared to add it.
const strictUtf8 = () => new (TextDecoder as unknown as new (label: string, opts: { fatal: boolean }) => TextDecoder)('utf-8', { fatal: true })

const part = (v: unknown) => toBase64Url(new TextEncoder().encode(JSON.stringify(v)))

export function encodeLink(parts: LinkParts): string {
  const q = [`v=${LINK_VERSION}`]
  for (const [k, name] of KEYS) if (parts[name] !== undefined) q.push(`${k}=${part(parts[name])}`)
  return `${STUDIO_URL}#${q.join('&')}`
}

export const isStudioLink = (s: string) => s.startsWith(STUDIO_URL + '#')

export function decodeLink(url: string): { parts: LinkParts; errors: string[] } {
  if (!isStudioLink(url)) return { parts: {}, errors: ['not a ops-control studio link'] }
  const frag = url.slice(STUDIO_URL.length + 1)
  if (frag.length > MAX_FRAGMENT) return { parts: {}, errors: ['this link is over 64 KB'] }
  const q = new Map(frag.split('&').map(kv => { const i = kv.indexOf('='); return i < 0 ? [kv, ''] as const : [kv.slice(0, i), kv.slice(i + 1)] as const }))
  const v = q.get('v')
  if (v === undefined) return { parts: {}, errors: ['this link has no version'] }
  if (!/^\d+$/.test(v)) return { parts: {}, errors: ['this link has a bad version'] }
  if (Number(v) > LINK_VERSION) return { parts: {}, errors: ['this link was made for a newer ops-control'] }
  const parts: LinkParts = {}, errors: string[] = []
  for (const [k, name] of KEYS) {
    const raw = q.get(k)
    if (raw === undefined) continue
    try {
      parts[name] = JSON.parse(strictUtf8().decode(fromBase64Url(raw)))
    } catch (err) {
      errors.push(`${name} part: ${err instanceof SyntaxError ? 'not valid JSON (the link may be cut off)' : (err as Error).message}`)
    }
  }
  return { parts, errors }
}
