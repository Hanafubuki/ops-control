import { test, expect } from 'claude-code/testing'
import { momentOf, LONG_TURN_MS, WELCOME_BACK_MS } from '../hooks/moments.ts'
import { initialModel, applyEvent } from '../hooks/model.ts'
import { MOMENTS } from '../hooks/lines.ts'

const s = (o: Partial<{ red: boolean; moods: readonly string[] }> = {}) => ({ red: false, moods: MOMENTS, ...o }) as never
const pass = { passed: true, at: 50 }, fail = { passed: false, at: 50 }
const m = (o: object) => ({ ...initialModel(), ...o })

test('green: a pass after a failure in the session; a plain pass says nothing', async () => {
  const ev = { type: 'tool-end', at: 50 } as never
  expect(momentOf(m({}), m({ lastTest: pass }), ev, s({ red: true }))?.moment).toBe('green')
  expect(momentOf(m({}), m({ lastTest: pass }), ev, s({ red: false }))).toBeUndefined()
  expect(momentOf(m({}), m({ lastTest: fail, act: { label: '3 tests failed' } }), ev, s({ red: true }))).toEqual({ moment: 'fail', vars: { n: 3 } })
})

test('long-done at five minutes, done just under; done when long-done is off', async () => {
  const end = (ms: number) => ({ type: 'turn-done', at: 1_000_000 + ms, reason: 'answer' }) as never
  const old = m({ turnAt: 1_000_000, working: true })
  expect(momentOf(old, m({}), end(LONG_TURN_MS), s())?.moment).toBe('long-done')
  expect(momentOf(old, m({}), end(LONG_TURN_MS - 1), s())?.moment).toBe('done')
  expect(momentOf(old, m({}), end(LONG_TURN_MS), s({ moods: ['done'] }))?.moment).toBe('done')
})

test('hello when a turn starts after 30 minutes away, not after a short nap', async () => {
  const old = m({ actAt: 1000, working: false })
  const start = (at: number) => ({ type: 'turn-start', at }) as never
  const back = 1000 + WELCOME_BACK_MS
  expect(momentOf(old, applyEvent(old, start(back)), start(back), s())?.moment).toBe('hello')
  expect(momentOf(old, applyEvent(old, start(back - 1)), start(back - 1), s())).toBeUndefined()
  expect(momentOf(m({ actAt: 0 }), m({}), start(back), s())).toBeUndefined()
})

test('compact on the compact event', async () => {
  expect(momentOf(m({}), m({ compactions: 1 }), { type: 'compact', at: 5 } as never, s())?.moment).toBe('compact')
})
