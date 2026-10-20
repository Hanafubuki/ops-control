import { expect } from 'claude-code/testing'
import { test } from './kit.ts'
import { staleCopy, staleToast } from '../hooks/update.ts'

const CFG = '/home/u/.claude'
const at = (market: string, plugin: string, v: string) => `${CFG}/plugins/cache/${market}/${plugin}/${v}`
const file = (installPath: string, version: string, key = 'ops-control@ops-control') => ({ plugins: { [key]: [{ scope: 'user', installPath, version }] } })

test('an installed copy that is the recorded one is not stale', () => {
  expect(staleCopy(file(at('ops-control', 'ops-control', '0.4.0'), '0.4.0'), at('ops-control', 'ops-control', '0.4.0'), CFG)).toBeUndefined()
})

test('an installed copy whose folder differs from the recorded one is stale, and names the recorded version', () => {
  expect(staleCopy(file(at('ops-control', 'ops-control', '0.4.1'), '0.4.1'), at('ops-control', 'ops-control', '0.4.0'), CFG)).toBe('0.4.1')
})

test('a trailing slash does not make the same folder different', () => {
  expect(staleCopy(file(at('ops-control', 'ops-control', '0.4.0') + '/', '0.4.0'), at('ops-control', 'ops-control', '0.4.0'), CFG)).toBeUndefined()
})

test('a --plugin-dir copy is never stale', () => {
  expect(staleCopy(file(at('ops-control', 'ops-control', '0.4.1'), '0.4.1'), '/home/u/src/ops-control', CFG)).toBeUndefined()
})

test('missing or malformed JSON gives nothing', () => {
  const root = at('ops-control', 'ops-control', '0.4.0')
  for (const j of [undefined, null, 'text', 3, [], {}, { plugins: 3 }, { plugins: { 'ops-control@ops-control': 'x' } }, { plugins: { 'ops-control@ops-control': [] } }, { plugins: { 'ops-control@ops-control': [{ version: '1' }] } }]) {
    expect(staleCopy(j, root, CFG)).toBeUndefined()
  }
})

test('no entry for this plugin gives nothing', () => {
  expect(staleCopy(file(at('other', 'other', '1.0.0'), '1.0.0', 'other@other'), at('ops-control', 'ops-control', '0.4.0'), CFG)).toBeUndefined()
})

test('the entry is matched by the marketplace and plugin in the root, not by ops-control@ops-control', () => {
  const j = { plugins: { ...file(at('ops-control', 'ops-control', '9.9.9'), '9.9.9').plugins, ...file(at('mine', 'ops-control', '0.5.0'), '0.5.0', 'ops-control@mine').plugins } }
  expect(staleCopy(j, at('mine', 'ops-control', '0.4.0'), CFG)).toBe('0.5.0')
  expect(staleCopy(j, at('mine', 'ops-control', '0.5.0'), CFG)).toBeUndefined()
})

test('a different marketplace name with no entry of its own gives nothing', () => {
  expect(staleCopy(file(at('ops-control', 'ops-control', '0.4.1'), '0.4.1'), at('mine', 'ops-control', '0.4.0'), CFG)).toBeUndefined()
})

test('the user-scope entry is preferred over another scope', () => {
  const j = { plugins: { 'ops-control@ops-control': [{ scope: 'project', installPath: at('ops-control', 'ops-control', '0.1.0'), version: '0.1.0' }, { scope: 'user', installPath: at('ops-control', 'ops-control', '0.4.1'), version: '0.4.1' }] } }
  expect(staleCopy(j, at('ops-control', 'ops-control', '0.4.0'), CFG)).toBe('0.4.1')
})

test('without a version the folder name stands in, unless it is a commit sha', () => {
  const root = at('ops-control', 'ops-control', '0.4.0')
  expect(staleCopy(file(at('ops-control', 'ops-control', '0.4.1'), undefined as never), root, CFG)).toBe('0.4.1')
  expect(staleCopy(file(at('ops-control', 'ops-control', 'a'.repeat(40)), undefined as never), root, CFG)).toBeUndefined()
})

test('a cache root with no version segment falls back to the ops-control@ops-control entry', () => {
  expect(staleCopy(file(at('ops-control', 'ops-control', '0.4.1'), '0.4.1'), `${CFG}/plugins/cache/ops-control`, CFG)).toBe('0.4.1')
})

test('the toast names both versions and shows once per installed version', () => {
  const shown = new Set<string>()
  const root = at('ops-control', 'ops-control', '0.4.0')
  expect(staleToast(shown, file(at('ops-control', 'ops-control', '0.4.1'), '0.4.1'), root, CFG)).toBe('ops-control 0.4.1 is installed, but this session runs 0.4.0. Run /reload-plugins to switch.')
  expect(staleToast(shown, file(at('ops-control', 'ops-control', '0.4.1'), '0.4.1'), root, CFG)).toBeUndefined()
  expect(staleToast(shown, file(at('ops-control', 'ops-control', '0.4.2'), '0.4.2'), root, CFG)).toContain('ops-control 0.4.2 is installed')
  expect(staleToast(shown, file(root, '0.4.0'), root, CFG)).toBeUndefined()
})
