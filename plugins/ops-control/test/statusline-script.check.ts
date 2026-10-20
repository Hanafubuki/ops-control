// Not *.test.ts on purpose: the engine's test runner has no process access. This runs the
// generated script in a real `sh`, because a script that calls itself forked shells until
// the machine ran out of memory and no mocked test could have seen it.
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { script, SCRIPT_PATH } from '../hooks/statusline.ts'

const TIMEOUT = 5000
// A good run lasts about 20 ms, shorter than the 25 ms sampler tick, so the sampler mostly sees
// nothing. It only catches a loop that has already run for a while; the timeout is the real test.
const MAX_SAMPLED_PROCS = 8

// Runs `sh <path>` as its own process group. Resolves with its stdout and the most processes
// the group held at any sample, killing the whole group at the timeout.
function run(path: string) {
  return new Promise<{ out: string; timedOut: boolean; peak: number }>(resolve => {
    const child = spawn('sh', [path], { detached: true, stdio: ['pipe', 'pipe', 'ignore'] })
    const pgid = child.pid!
    let out = '', peak = 0, timedOut = false
    child.stdout.on('data', d => { out += String(d) })
    child.stdin.end('{"session_id":"s1"}')
    const count = () => {
      try { return execFileSync('ps', ['-o', 'pid=', '-g', String(pgid)], { encoding: 'utf8' }).split('\n').filter(Boolean).length } catch { return 0 }
    }
    const sampler = setInterval(() => { peak = Math.max(peak, count()) }, 25)
    const killer = setTimeout(() => { timedOut = true; try { process.kill(-pgid, 'SIGKILL') } catch {} }, TIMEOUT)
    child.on('close', () => { clearInterval(sampler); clearTimeout(killer); resolve({ out, timedOut, peak }) })
  })
}

function install(fallback: (self: string) => string) {
  const dir = mkdtempSync(`${tmpdir()}/ops-control-sl-`)
  mkdirSync(`${dir}/ops`)
  const path = SCRIPT_PATH(dir)
  // script() refuses a self-referencing fallback, so rewrite the fallback line the way the
  // buggy build wrote it. That leaves the recursion guard as the only thing stopping the loop.
  const text = script(dir, 'placeholder').replace(/^.*sh -c 'placeholder'$/m, fallback(path))
  writeFileSync(path, text)
  chmodSync(path, 0o755)
  return { dir, path, text }
}

test('a fallback that calls the script itself stops at once and forks only a handful of shells', async () => {
  const { path, text } = install(self => `printf '%s' "$input" | sh -c 'sh '\\''${self}'\\'''`)
  assert.match(text, /sh -c 'sh '/)
  assert.ok(text.includes('OPS_CONTROL_STATUSLINE'))
  const r = await run(path)
  assert.equal(r.timedOut, false, 'the script was still running at the timeout')
  assert.ok(r.peak <= MAX_SAMPLED_PROCS, `the process group peaked at ${r.peak}`)
})

test('script() itself drops a self-referencing fallback', async () => {
  const dir = mkdtempSync(`${tmpdir()}/ops-control-sl-`)
  const text = script(dir, `sh '${SCRIPT_PATH(dir)}'`)
  assert.ok(!text.includes('sh -c'))
})

test('a normal fallback still runs the original command with the same stdin', async () => {
  const { path } = install(() => `printf '%s' "$input" | sh -c 'printf ok'`)
  const r = await run(path)
  assert.equal(r.timedOut, false)
  assert.equal(r.out, 'ok')
})
