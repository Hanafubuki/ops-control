import { test, expect } from 'claude-code/testing'
import { parseScheme } from '../hooks/schemes.ts'

const ANSI = ['#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2', '#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff']
const GHOSTTY = ['# Dracula', ...ANSI.map((c, i) => `palette = ${i}=${c}`), 'background = 282a36', 'foreground = #F8F8F2', 'cursor-color = #f8f8f2'].join('\n')
const BASE16 = ['scheme: "Ocean"', 'author: "x"', ...['2b303b', '343d46', '4f5b66', '65737e', 'a7adba', 'c0c5ce', 'dfe1e8', 'eff1f5', 'bf616a', 'd08770', 'ebcb8b', 'a3be8c', '96b5b4', '8fa1b3', 'b48ead', 'ab7967'].map((c, i) => `base0${i.toString(16).toUpperCase()}: "${c}"`)].join('\n')

test('ghostty: palette, background and foreground', async () => {
  const s = parseScheme(GHOSTTY, 'Dracula.conf')
  expect(s.name).toBe('dracula')
  expect(s.bg).toBe('#282a36')
  expect(s.palette.text).toBe('#f8f8f2')
  expect([s.palette.accent, s.palette.read, s.palette.edit, s.palette.shell, s.palette.agent, s.palette.pass, s.palette.fail, s.palette.dim])
    .toEqual(['#ff79c6', '#8be9fd', '#f1fa8c', '#50fa7b', '#bd93f9', '#50fa7b', '#ff5555', '#6272a4'])
  for (const v of Object.values(s.palette)) expect(v).toMatch(/^#[0-9a-f]{6}$/)
  expect([s.palette.panel, s.palette.addBg]).toEqual(['#343641', '#305444'])
})

test('ghostty: a scheme without color 8 gets a blended dim', async () => {
  const s = parseScheme(GHOSTTY.replace(/^palette = 8=.*$/m, ''), 'x')
  expect(s.palette.dim).toBe('#9a9b9d')
})

test('base16: base00-0F', async () => {
  const s = parseScheme(BASE16, 'base16-ocean.yaml')
  expect(s.name).toBe('ocean')
  expect([s.bg, s.palette.text, s.palette.fail, s.palette.pass, s.palette.accent, s.palette.dim]).toEqual(['#2b303b', '#c0c5ce', '#bf616a', '#a3be8c', '#b48ead', '#65737e'])
})

test('base16: read, edit and agent come from 0C, 0A and 0D', async () => {
  const s = parseScheme(BASE16, 'x.yaml')
  expect([s.palette.read, s.palette.edit, s.palette.agent]).toEqual(['#96b5b4', '#ebcb8b', '#8fa1b3'])
})

test('base16: single-quoted values work', async () => {
  const s = parseScheme(BASE16.replace(/"([0-9a-f]{6})"/g, "'$1'"), 'x.yaml')
  expect([s.bg, s.palette.text]).toEqual(['#2b303b', '#c0c5ce'])
})

test('size is measured in bytes, before parsing', async () => {
  expect(() => parseScheme('é'.repeat(33_000), 'x')).toThrow('64 KB')
})

test('garbage, missing colors and oversize files are refused', async () => {
  expect(() => parseScheme('hello', 'x.txt')).toThrow('not a Ghostty or base16 color scheme')
  expect(() => parseScheme('palette = 0=#000000\nbackground = #000000\nforeground = #ffffff', 'x')).toThrow('no color 1')
  expect(() => parseScheme(GHOSTTY.replace(/^background.*$/m, ''), 'x')).toThrow('background')
  expect(() => parseScheme(GHOSTTY + '\n#' + 'x'.repeat(70_000), 'x')).toThrow('64 KB')
})

test('names are slugged and capped', async () => {
  expect(parseScheme(GHOSTTY, '/a/b/My Fancy Theme!!.conf').name).toBe('my-fancy-theme')
  expect(parseScheme(GHOSTTY, '???').name).toBe('imported')
})

test('control and bidi characters in a scheme name never survive', async () => {
  const evil = BASE16.replace('Ocean', `Oc\u001b[2Jean${String.fromCharCode(0x202e, 0x200b)}X`)
  expect(parseScheme(evil, 'x').name).toBe('oc-2jean-x')
})
