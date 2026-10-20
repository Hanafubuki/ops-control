import type { Host } from './host.ts'
import { takeOver, drawsStatusLine, BACKUP_KEY } from './statusline.ts'

export const FIRST_RUN_KEY = 'first-run'
export const TRIES_KEY = 'first-run-tries'
export const INSTALLED_KEY = 'installed-at'
export const MAX_TRIES = 3
const KEPT = "Kept your status line. `/ops statusline on` switches to ops-control's any time."

// ask resolves the label the person chose (free text typed under "Other" too), or
// undefined when the dialog was dismissed or couldn't show. Returns the toast to show.
export async function firstRun(host: Host, ask: (question: string) => Promise<string | undefined>, now: number): Promise<string | undefined> {
  if ((await host.storeGet(INSTALLED_KEY)) === undefined) await host.storeSet(INSTALLED_KEY, now)
  if ((await host.storeGet(FIRST_RUN_KEY)) !== undefined) return undefined
  // an upgrade from 0.1 with the takeover already on: the person has answered
  if ((await host.storeGet(BACKUP_KEY)) !== undefined) { await host.storeSet(FIRST_RUN_KEY, 'yes'); return undefined }
  // another copy of ops-control already draws it: nothing to ask, nothing to back up
  if (await drawsStatusLine(host)) { await host.storeSet(FIRST_RUN_KEY, 'yes'); return undefined }
  let asked = false, label: string | undefined
  const out = await takeOver(host, async q => { asked = true; label = await ask(q); return label === 'Yes' })
  // takeOver returns before asking when settings.json can't be read: try again next launch
  if (!asked) return undefined
  if (label === undefined) {
    const tries = Number((await host.storeGet(TRIES_KEY)) ?? 0) + 1
    await host.storeSet(TRIES_KEY, tries)
    if (tries >= MAX_TRIES) await host.storeSet(FIRST_RUN_KEY, 'gave-up')
    return undefined
  }
  await host.storeSet(FIRST_RUN_KEY, label === 'Yes' ? 'yes' : 'no')
  return label === 'Yes' ? out : KEPT
}
