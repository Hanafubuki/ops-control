import { expect } from 'claude-code/testing'
import { fakeHost, test } from './kit.ts'

test('fakeHost lists a folder that only holds folders, and stats files', async () => {
  const { host } = fakeHost({ files: { '/r/a/owner': 's1', '/r/b/open': '' }, mtimes: { '/r/a/owner': 5 } })
  expect((await host.listDir('/r')).sort()).toEqual(['a', 'b'])
  expect(await host.stat('/r/a/owner')).toEqual({ mtimeMs: 5 })
  expect(await host.stat('/r/missing')).toBeUndefined()
})

test('fakeHost answers fetch from its handler and records each request; spawn streams lines and can be killed', async () => {
  const { host, requests, spawned, killed } = fakeHost({
    http: req => ({ status: req.url.endsWith('/a') ? 200 : 404, headers: {}, text: 'x' }),
    spawns: async (_argv, emit) => { emit('stdout', 'first'); return new Promise<number | null>(() => {}) },
  })
  expect(await host.fetch('https://h/a', { method: 'PUT', headers: { A: '1' }, timeoutMs: 5000 })).toEqual({ status: 200, headers: {}, text: 'x' })
  expect(requests).toEqual([{ method: 'PUT', url: 'https://h/a', headers: { A: '1' } }])
  const lines: string[] = []
  const child = host.spawn(['gi', 'spotify-login'], (s, l) => lines.push(`${s}:${l}`))
  expect(lines).toEqual(['stdout:first'])
  child.kill()
  expect(await child.done).toBeNull()
  expect(spawned).toEqual(['gi spotify-login'])
  expect(killed).toEqual(['gi spotify-login'])
  expect(await fakeHost().host.fetch('https://h', { timeoutMs: 1 }).catch((e: Error) => e.message)).toBe('offline')
})

test('fakeHost spawn resolves null when the child could not start', async () => {
  const { host } = fakeHost({ spawns: async () => { throw new Error('ENOENT') } })
  expect(await host.spawn(['nope'], () => {}).done).toBeNull()
})
