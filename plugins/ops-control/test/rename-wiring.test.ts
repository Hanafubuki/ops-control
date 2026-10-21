import { expect, mock } from 'claude-code/testing'
import { fakeFs, test } from './kit.ts'

const SCRIPT = '/fake/.claude/sidequest-sessions/refresh.sh'
const STASK = '/fake/.claude/skills/stask/session-info.py'
const AT = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } } as const

async function start($: any, on: any, files: Record<string, string>) {
  const ran: string[][] = []
  fakeFs(on, files, argv => { ran.push(argv) })
  mock.store(on)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.panes', async () => ({ value: [] }))
  on('session.id', async () => ({ value: 's1' }))
  on('command.run', async () => ({ text: 'Session renamed to: john' }) as never)
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/fake/proj', surface: 'terminal', isInteractive: true })
  await clock.advance(10)
  return { ran, clock }
}

test('/rename rebuilds the Sidequest sessions page, so the new name shows without waiting for a turn to end', async ($, on) => {
  const { ran, clock } = await start($, on, { [SCRIPT]: '#!/usr/bin/env bash\n' })
  const r = await $.command.run({ command: 'rename', args: 'john', ...AT })
  await clock.advance(10)
  expect(r).toEqual({ text: 'Session renamed to: john' })
  expect(ran).toContainEqual(['bash', SCRIPT])
})

test('/rename retags the session\'s /stask tickets with the new name', async ($, on) => {
  const { ran, clock } = await start($, on, { [STASK]: '#!/usr/bin/env python3\n' })
  await $.command.run({ command: 'rename', args: 'john', ...AT })
  await clock.advance(10)
  expect(ran).toContainEqual(['python3', STASK, 's1', '--sync-tickets'])
})

test('/rename runs nothing when neither the sessions page nor /stask is installed', async ($, on) => {
  const { ran, clock } = await start($, on, {})
  await $.command.run({ command: 'rename', args: 'john', ...AT })
  await clock.advance(10)
  expect(ran.some(argv => argv.includes(SCRIPT) || argv.includes(STASK))).toBe(false)
})
