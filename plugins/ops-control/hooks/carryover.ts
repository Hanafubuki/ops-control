// Ops Control was glowup. On its first start the person's own packs, themes, pets and name packs come along from
// <config>/glowup: copied, never moved, and a file already under <config>/ops-control is kept as it is.
// Engine-free, so it tests on a fake host.
import type { Host } from './host.ts'

export const CARRIED = ['packs', 'themes', 'pets', 'namepacks'] as const

// The number of files copied; 0 when there is no glowup folder.
export async function carryOver(host: Host): Promise<number> {
  const from = `${host.configDir}/glowup`, to = `${host.configDir}/ops-control`
  if (!(await host.exists(from))) return 0
  let copied = 0
  for (const dir of CARRIED) {
    const files = await host.listFiles(`${from}/${dir}`).catch(() => [])
    for (const file of files) {
      const target = `${to}/${dir}/${file.name}`
      if (await host.exists(target)) continue
      await host.writeFile(target, await host.readFile(`${from}/${dir}/${file.name}`))
      copied++
    }
  }
  return copied
}
