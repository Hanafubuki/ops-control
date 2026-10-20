// Cuts the per-animation clips from export-pet.ts into one captioned reel per
// aspect ratio for social posts: docs/assets/clawd/reel-square.mp4 (1080x1080)
// and reel-wide.mp4 (1920x1080). Run after `just clawd-export`.
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const DIR = new URL('../docs/assets/clawd/', import.meta.url).pathname
const FONT = process.env.REEL_FONT ?? spawnSync('fc-match', ['-f', '%{file}', 'JetBrains Mono:bold']).stdout.toString()
const SECONDS = 2.6
const SHOTS: [string, string][] = [
  ['idle', 'meet Clawd'],
  ['walk', 'walks while Claude reads'],
  ['working', 'types while Claude edits'],
  ['hop', 'hops when your tests pass'],
  ['fail', 'sweats when they fail'],
  ['alert', 'startles only when Claude needs you'],
  ['done', 'dances when a turn ends'],
  ['sleep', 'naps after a minute idle'],
  ['shiny/idle', 'goes shiny after 100 green runs'],
]

const ff = (args: string[], cwd?: string) => {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { cwd })
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`)
}
// drawtext reads ' and : as syntax
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "’").replace(/:/g, '\\:')

function reel(name: string, W: number, H: number, spriteW: number) {
  const tmp = mkdtempSync(`${tmpdir()}/clawd-reel-`)
  const parts = SHOTS.map(([anim, caption], i) => {
    const out = `${tmp}/${i}.mp4`
    const vf = [
      // a non-square SAR on an input clip carries through and players squash the reel
      `scale=${spriteW}:-1:flags=neighbor`,
      'setsar=1',
      `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2-${Math.round(H * 0.06)}:color=0x1e1e1e`,
      `drawtext=fontfile='${FONT}':text='${esc(caption)}':fontcolor=0xfff4ec:fontsize=${Math.round(H * 0.05)}:x=(w-tw)/2:y=h*0.78`,
      `drawtext=fontfile='${FONT}':text='ops-control':fontcolor=0xd77757:fontsize=${Math.round(H * 0.035)}:x=(w-tw)/2:y=h*0.08`,
      'fade=t=in:st=0:d=0.15',
      `fade=t=out:st=${SECONDS - 0.15}:d=0.15`,
      'format=yuv420p',
    ].join(',')
    ff(['-stream_loop', '-1', '-i', `${DIR}${anim}/clip.mp4`, '-t', String(SECONDS), '-vf', vf, '-r', '30', '-c:v', 'libx264', '-crf', '18', out])
    return out
  })
  writeFileSync(`${tmp}/list.txt`, parts.map(p => `file '${p}'`).join('\n') + '\n')
  ff(['-f', 'concat', '-safe', '0', '-i', `${tmp}/list.txt`, '-c', 'copy', '-movflags', '+faststart', `${DIR}${name}`])
  rmSync(tmp, { recursive: true, force: true })
}

reel('reel-square.mp4', 1080, 1080, 864)
reel('reel-wide.mp4', 1920, 1080, 1152)
console.log(`wrote ${DIR}reel-square.mp4 and reel-wide.mp4 (${SHOTS.length} shots, ${(SHOTS.length * SECONDS).toFixed(1)} s)`)
