// tsconfig loads no Node types. test/pack-skill.check.ts runs under plain Node, outside the
// engine's test runner (which cannot read files), and needs just these.
interface ImportMeta { url: string }
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string
  export function writeFileSync(path: string, text: string): void
  export function mkdirSync(path: string): void
  export function mkdtempSync(prefix: string): string
  export function chmodSync(path: string, mode: number): void
}
declare module 'node:os' {
  export function tmpdir(): string
}
declare module 'node:child_process' {
  interface Child {
    pid?: number
    stdin: { end(text: string): void }
    stdout: { on(ev: 'data', fn: (d: unknown) => void): void }
    on(ev: 'close', fn: () => void): void
  }
  export function spawn(cmd: string, args: string[], opts: { detached: boolean; stdio: string[] }): Child
  export function execFileSync(cmd: string, args: string[], opts: { encoding: 'utf8' }): string
}
declare const process: { kill(pid: number, signal: string): void }
declare function setInterval(fn: () => void, ms: number): number
declare function clearInterval(id: number): void
declare function setTimeout(fn: () => void, ms: number): number
declare function clearTimeout(id: number): void
declare module 'node:test' {
  export function test(name: string, fn: () => void | Promise<void>): void
}
declare module 'node:assert/strict' {
  function assert(v: unknown, message?: string): asserts v
  namespace assert {
    function ok(v: unknown, message?: string): asserts v
    function equal(a: unknown, b: unknown, message?: string): void
    function deepEqual(a: unknown, b: unknown, message?: string): void
    function match(s: string, re: RegExp, message?: string): void
  }
  export default assert
}
