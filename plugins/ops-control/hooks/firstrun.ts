import type { Host } from './host.ts'
import { drawsStatusLine, BACKUP_KEY } from './statusline.ts'

export const FIRST_RUN_KEY = 'first-run'
export const INSTALLED_KEY = 'installed-at'

// The status line is ops-control's only when the person asks for it (`/ops statusline on`): the first launch records
// when ops-control was installed and whether it already draws the status line, and asks nothing.
export async function firstRun(host: Host, now: number): Promise<void> {
  if ((await host.storeGet(INSTALLED_KEY)) === undefined) await host.storeSet(INSTALLED_KEY, now)
  if ((await host.storeGet(FIRST_RUN_KEY)) !== undefined) return
  // a takeover from an earlier version, or another copy's, stays as the person chose it
  const drawn = (await host.storeGet(BACKUP_KEY)) !== undefined || (await drawsStatusLine(host))
  await host.storeSet(FIRST_RUN_KEY, drawn ? 'yes' : 'no')
}
