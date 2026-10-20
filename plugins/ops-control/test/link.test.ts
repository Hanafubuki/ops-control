import { test, expect } from 'claude-code/testing'
import { toBase64Url, fromBase64Url, encodeLink, decodeLink, isStudioLink, STUDIO_URL } from '../hooks/link.ts'

const bytes = (s: string) => new TextEncoder().encode(s)

test('base64url round-trips every length and stays URL-safe', () => {
  for (const s of ['', 'a', 'ab', 'abc', 'abcd', '{"x":"✓ ünï"}', 'ÿþ>>??']) {
    const enc = toBase64Url(bytes(s))
    expect(enc).toMatch(/^[A-Za-z0-9_-]*$/)
    expect(new TextDecoder().decode(fromBase64Url(enc))).toBe(s)
  }
  expect(toBase64Url(bytes('hi?>'))).toBe('aGk_Pg')
})

test('fromBase64Url refuses bad characters and impossible lengths', () => {
  expect(() => fromBase64Url('ab$c')).toThrow()
  expect(() => fromBase64Url('abcde')).toThrow()
})

test('a part with trailing = padding still decodes', () => {
  expect(new TextDecoder().decode(fromBase64Url('aGk_Pg=='))).toBe('hi?>')
  const p = toBase64Url(bytes('{"a":1}'))
  expect(decodeLink(`${STUDIO_URL}#v=1&p=${p}==`).parts.pack).toEqual({ a: 1 })
})

test('a link round-trips its parts', () => {
  const pack = { format: 1, name: 'sunset', colors: { palette: { accent: '#ff8c42' } } }
  const setup = { band: ['plan'] }
  const url = encodeLink({ pack, setup })
  expect(url.startsWith(STUDIO_URL + '#v=1&p=')).toBe(true)
  expect(isStudioLink(url)).toBe(true)
  expect(decodeLink(url)).toEqual({ parts: { pack, setup }, errors: [] })
})

test('a link from a newer ops-control or with no version is refused', () => {
  const p = toBase64Url(bytes('{}'))
  expect(decodeLink(`${STUDIO_URL}#v=2&p=${p}`).errors).toEqual(['this link was made for a newer ops-control'])
  expect(decodeLink(`${STUDIO_URL}#p=${p}`).errors).toEqual(['this link has no version'])
  expect(decodeLink('https://example.com/studio#v=1').errors).toEqual(['not a ops-control studio link'])
})

test('a part that is not UTF-8 is refused, not decoded to replacement characters', () => {
  const r = decodeLink(`${STUDIO_URL}#v=1&p=${toBase64Url(Uint8Array.of(0x22, 0xff, 0x22))}`)
  expect(r.parts.pack).toBeUndefined()
  expect(r.errors).toHaveLength(1)
  expect(r.errors[0]).toMatch(/^pack part: /)
})

test('a cut-off part fails alone and names itself', () => {
  const url = encodeLink({ pack: { format: 1, name: 'a' }, setup: { band: ['plan', 'meter', 'agents'] } })
  const cut = url.slice(0, -6)
  const r = decodeLink(cut)
  expect(r.parts.pack).toEqual({ format: 1, name: 'a' })
  expect(r.parts.setup).toBeUndefined()
  expect(r.errors).toHaveLength(1)
  expect(r.errors[0]).toMatch(/^setup part: /)
})
