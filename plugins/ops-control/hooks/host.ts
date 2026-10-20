// The engine as the other modules see it. The loader refuses $ passed across an
// import, so register.tsx builds this from $ in hostOf.
export type RunResult = { exitCode: number; stdout: string; stderr: string }
export type FetchInit = { method?: string; headers?: Record<string, string>; body?: string; timeoutMs: number
  // called once when the engine's request ends, answered or failed: after timeoutMs the promise has rejected but the request, which cannot be aborted, may still be out
  onSettled?: () => void }
export type FetchResult = { status: number; headers: Record<string, string>; text: string }
export type Spawned = { done: Promise<number | null>; kill(): void }
export type Host = {
  // env is set over the engine's own environment; timeoutMs defaults to the engine's 30 s
  run(argv: readonly string[], env?: Record<string, string>, timeoutMs?: number): Promise<RunResult>
  readFile(path: string): Promise<string>
  writeFile(path: string, text: string): Promise<void>
  exists(path: string): Promise<boolean>
  // undefined when nothing is at path
  stat(path: string): Promise<{ mtimeMs: number } | undefined>
  listDir(path: string): Promise<string[]>
  // size is in bytes, for a file
  listFiles(path: string): Promise<{ name: string; size: number }[]>
  fetchText(url: string): Promise<{ ok: boolean; status: number; text: string }>
  // rejects on a network error and once timeoutMs passes: the engine's fetch has no timeout of its own
  fetch(url: string, init: FetchInit): Promise<FetchResult>
  // starts argv and hands its output over a line at a time; done is the exit code, null when killed or never started
  spawn(argv: readonly string[], onLine: (stream: 'stdout' | 'stderr', line: string) => void): Spawned
  storeGet(key: string): Promise<unknown>
  storeSet(key: string, value: unknown): Promise<void>
  storeDelete(key: string): Promise<void>
  // true when project or local settings set their own statusLine, which wins over the user's
  projectStatusLine(): Promise<boolean>
  // $CLAUDE_CONFIG_DIR, else $HOME/.claude
  configDir: string
  // $XDG_DATA_HOME, else $HOME/.local/share
  dataHome: string
  // $HOME
  home: string
}
