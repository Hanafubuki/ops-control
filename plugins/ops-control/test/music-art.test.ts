import { test, expect } from 'claude-code/testing'
import { smallArtUrl, parseArt, coverRows, coverPlaceholder, ArtCache } from '../hooks/music/art.ts'
import { toBase64Url } from '../hooks/link.ts'

const art = (w: number, h: number, px: number[]) => JSON.stringify({ w, h, rgb: toBase64Url(Uint8Array.from(px)) })

test('smallArtUrl asks for the 64 px cover and maps open.spotify.com/image to the CDN', () => {
  expect(smallArtUrl('https://i.scdn.co/image/ab67616d0000b27304802a3a9e155e4eaed25520')).toBe('https://i.scdn.co/image/ab67616d0000485104802a3a9e155e4eaed25520')
  expect(smallArtUrl('https://open.spotify.com/image/ab67616d0000b273ff')).toBe('https://i.scdn.co/image/ab67616d00004851ff')
  expect(smallArtUrl('https://mosaic.scdn.co/640/aa')).toBe('https://mosaic.scdn.co/640/aa')
  expect(smallArtUrl('https://i.scdn.co/image/ab6761610000e5ebcc')).toBe('https://i.scdn.co/image/ab6761610000e5ebcc')
})

test('parseArt checks the byte count; junk is undefined', () => {
  expect(parseArt(art(1, 2, [1, 2, 3, 4, 5, 6]))).toEqual({ w: 1, h: 2, rgb: Uint8Array.from([1, 2, 3, 4, 5, 6]) })
  expect(parseArt(art(2, 2, [1, 2, 3]))).toBeUndefined()
  expect(parseArt('nope')).toBeUndefined()
  expect(parseArt('{"w":0,"h":2,"rgb":""}')).toBeUndefined()
})

test('coverRows: ▀ in the top pixel over the bottom one; matching neighbours share a Seg', () => {
  const a = parseArt(art(2, 2, [255, 0, 0, 0, 0, 255, 0, 255, 0, 0, 255, 0]))!
  expect(coverRows(a)).toEqual([[{ text: '▀', color: '#ff0000', bg: '#00ff00' }, { text: '▀', color: '#0000ff', bg: '#00ff00' }]])
  const flat = parseArt(art(3, 2, Array(18).fill(16)))!
  expect(coverRows(flat)).toEqual([[{ text: '▀▀▀', color: '#101010', bg: '#101010' }]])
})

test('coverPlaceholder is cols wide and rows tall with a ♪', () => {
  const rows = coverPlaceholder(8, 4, '#ff8800')
  expect(rows.map(r => r.map(s => s.text).join(''))).toEqual(['        ', '   ♪    ', '        ', '        '])
})

test('ArtCache keeps the newest 20 and remembers a failure as null', () => {
  const c = new ArtCache(2)
  c.set('a', []); c.set('b', null); c.get('a'); c.set('c', [])
  expect([c.has('a'), c.has('b'), c.has('c')]).toEqual([false, true, true])
  expect(c.get('b')).toBeNull()
})
