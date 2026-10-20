// JSX-free: covers as Segs, so the pane's box rows carry them like any text.
import type { Seg } from '../segs.ts'
import { fromBase64Url } from '../link.ts'

export type Art = { w: number; h: number; rgb: Uint8Array }

// The local artUrl is the 640 px cover (~130 KB); the 64 px one (~3 KB) is enough for 20×20.
export function smallArtUrl(url: string): string {
  const m = /^https:\/\/open\.spotify\.com\/image\/([0-9a-f]+)$/.exec(url)
  return (m ? `https://i.scdn.co/image/${m[1]}` : url).replace(/^(https:\/\/i\.scdn\.co\/image\/)ab67616d0000b273/, '$1ab67616d00004851')
}

export function parseArt(stdout: string): Art | undefined {
  try {
    const o = JSON.parse(stdout) as { w?: unknown; h?: unknown; rgb?: unknown }
    if (!Number.isInteger(o.w) || !Number.isInteger(o.h) || typeof o.rgb !== 'string') return undefined
    const w = o.w as number, h = o.h as number, rgb = fromBase64Url(o.rgb)
    return w > 0 && h > 0 && rgb.length === w * h * 3 ? { w, h, rgb } : undefined
  } catch { return undefined }
}

const hex = (b: Uint8Array, i: number) => '#' + [b[i]!, b[i + 1]!, b[i + 2]!].map(v => v.toString(16).padStart(2, '0')).join('')

export function coverRows(a: Art): Seg[][] {
  const rows: Seg[][] = []
  for (let y = 0; y + 1 < a.h; y += 2) {
    const row: Seg[] = []
    for (let x = 0; x < a.w; x++) {
      const color = hex(a.rgb, (y * a.w + x) * 3), bg = hex(a.rgb, ((y + 1) * a.w + x) * 3), last = row.at(-1)
      if (last && last.color === color && last.bg === bg) last.text += '▀'
      else row.push({ text: '▀', color, bg })
    }
    rows.push(row)
  }
  return rows
}

export function coverPlaceholder(cols: number, rows: number, color: string): Seg[][] {
  const mid = Math.floor((cols - 1) / 2)
  return Array.from({ length: rows }, (_, y) => [{ text: y === 1 ? ' '.repeat(mid) + '♪' + ' '.repeat(cols - mid - 1) : ' '.repeat(cols), color }])
}

// null marks a cover that failed, so it is not fetched again this session.
export class ArtCache {
  private m = new Map<string, Seg[][] | null>()
  constructor(private max = 20) {}
  has(k: string) { return this.m.has(k) }
  get(k: string) { return this.m.get(k) }
  set(k: string, v: Seg[][] | null) {
    this.m.delete(k)
    this.m.set(k, v)
    if (this.m.size > this.max) this.m.delete(this.m.keys().next().value!)
  }
}
