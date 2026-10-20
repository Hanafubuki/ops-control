import type { Host } from './host.ts'

// head is portable and bounded, so a FIFO or device cannot hang or flood the read.
export async function readLocal(host: Host, rawPath: string, max: number): Promise<{ text: string; path: string } | { error: string }> {
  const path = rawPath.startsWith('~/') ? `${host.home}${rawPath.slice(1)}` : rawPath
  const head = await host.run(['head', '-c', String(max + 1), path]).catch(() => undefined)
  if (!head || head.exitCode !== 0) return { error: `Could not read ${path}.` }
  if (new TextEncoder().encode(head.stdout).length > max) return { error: `${path} is over ${Math.round(max / 1024)} KB.` }
  return { text: head.stdout, path }
}
