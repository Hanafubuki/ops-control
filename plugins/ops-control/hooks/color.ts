// JSX-free: the docs site imports it.
export type Span = { text: string; color: string; bold?: boolean; bg?: string }

const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
export function mix(a: string, b: string, t: number): string {
  const k = Math.max(0, Math.min(1, t)), x = rgb(a), y = rgb(b)
  return '#' + x.map((v, i) => Math.round(v + (y[i]! - v) * k).toString(16).padStart(2, '0')).join('')
}
export function gradient(text: string, c1: string, c2: string): Span[] {
  const ch = [...text]
  return ch.map((c, i) => ({ text: c, color: mix(c1, c2, ch.length > 1 ? i / (ch.length - 1) : 0) }))
}
export function wave(text: string, c1: string, c2: string, tMs: number, speed: number): Span[] {
  return [...text].map((c, k) => ({ text: c, color: mix(c1, c2, (Math.sin(k * 0.5 - (tMs * speed) / 170) + 1) / 2) }))
}
// The shimmer spinner's word: the crest of each pulse is also bold.
export function wave3(text: string, c1: string, c2: string, tMs: number, speed: number): Span[] {
  return [...text].map((c, k) => {
    const ph = (tMs / 1000) * speed * 6 - k * 0.55
    return { text: c, color: mix(c1, c2, (Math.sin(ph) + 1) / 2), bold: Math.sin(ph + 1.1) > 0.55 }
  })
}
