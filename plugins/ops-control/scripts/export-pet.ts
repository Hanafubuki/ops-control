// Writes every frame of a built-in pet as SVG and PNG under docs/assets/<pet>/,
// one sprite-sheet PNG per animation, and (with ffmpeg on PATH) each animation as
// an MP4 on a dark background, a WebM with transparency, and a transparent GIF
// for the markdown docs, which cannot play video. All are timed by each
// frame's ms. Run: node scripts/export-pet.ts <pet> [scale]
import { mkdirSync, writeFileSync, rmSync, readdirSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { BUILTIN_SHEETS } from '../hooks/pets.ts'
import { encodePng } from './png.ts'

type Frame = { ms: number; px: string[] }
const pet = process.argv[2] ?? ''
const sheet = Object.hasOwn(BUILTIN_SHEETS, pet) ? BUILTIN_SHEETS[pet] : undefined
if (!sheet) {
  console.error(`unknown pet '${pet}'; one of: ${Object.keys(BUILTIN_SHEETS).join(', ')}`)
  process.exit(1)
}
const OUT = new URL(`../docs/assets/${pet}/`, import.meta.url).pathname
const scale = Number(process.argv[3] ?? 16)
if (!Number.isInteger(scale) || scale < 1) {
  console.error('usage: node scripts/export-pet.ts <pet> [scale]  (scale: a positive whole number)')
  process.exit(1)
}
const { w, h } = sheet

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))

function svg(px: string[], pal: Record<string, string>) {
  const rects = px.flatMap((row, y) => [...row].map((k, x) => (pal[k] ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[k]}"/>` : ''))).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * scale}" height="${h * scale}" shape-rendering="crispEdges">${rects}</svg>\n`
}

// RGBA PNG of frames laid side by side, each pixel scaled up.
function png(frames: string[][], pal: Record<string, string>) {
  const W = w * scale * frames.length, H = h * scale
  const rgba = new Uint8Array(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const f = frames[Math.floor(x / (w * scale))]!, k = f[Math.floor(y / scale)]![Math.floor((x % (w * scale)) / scale)]!
      const c = pal[k]
      if (c) rgba.set([...rgb(c), 255], (y * W + x) * 4)
    }
  }
  return encodePng(W, H, rgba)
}

const sets: [string, Record<string, { frames: Frame[] }>][] = [['', sheet.animations]]
if (sheet.transitions) sets.push(['transitions/', sheet.transitions])
const variants: [string, Record<string, string>][] = [['', sheet.palette]]
if (sheet.shiny) variants.push(['shiny/', { ...sheet.palette, ...sheet.shiny }])

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0
// Looping animations play three times so a short clip still reads as a loop.
function video(dir: string, anim: { loop?: boolean; frames: Frame[] }) {
  const reps = anim.loop ? 3 : 1, list: string[] = []
  for (let r = 0; r < reps; r++) anim.frames.forEach((f, i) => list.push(`file '${String(i).padStart(2, '0')}.png'`, `duration ${f.ms / 1000}`))
  // the concat demuxer ignores the last duration unless the last file repeats
  list.push(list[list.length - 2]!)
  writeFileSync(`${dir}frames.txt`, list.join('\n') + '\n')
  const base = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'frames.txt']
  const mp4 = spawnSync('ffmpeg', [...base, '-f', 'lavfi', '-i', 'color=c=0x1e1e1e:s=16x16', '-filter_complex', '[1][0]scale2ref[bg][fg];[bg][fg]overlay=shortest=1,setsar=1,fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '18', '-movflags', '+faststart', 'clip.mp4'], { cwd: dir })
  const webm = spawnSync('ffmpeg', [...base, '-vf', 'fps=30,format=yuva420p', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '20', '-auto-alt-ref', '0', 'clip.webm'], { cwd: dir })
  // GIF delays are in centiseconds, so 50 fps keeps 80 ms frames exact; the GIF loops by itself, so one pass.
  writeFileSync(`${dir}frames.txt`, list.slice(0, anim.frames.length * 2).concat(list[anim.frames.length * 2 - 2]!).join('\n') + '\n')
  const gif = spawnSync('ffmpeg', [...base, '-vf', 'fps=50,scale=iw/2:-1:flags=neighbor,split[a][b];[a]palettegen=reserve_transparent=1:stats_mode=single[p];[b][p]paletteuse=dither=none', '-loop', '0', 'clip.gif'], { cwd: dir })
  rmSync(`${dir}frames.txt`)
  for (const r of [mp4, webm, gif]) if (r.status !== 0) throw new Error(`ffmpeg failed in ${dir}: ${r.stderr}`)
}

// Only subdirectories: clawd-reel.ts keeps its tracked reels as files beside them.
if (existsSync(OUT)) for (const e of readdirSync(OUT, { withFileTypes: true })) if (e.isDirectory()) rmSync(`${OUT}${e.name}`, { recursive: true })
let count = 0
for (const [vdir, pal] of variants) for (const [sdir, anims] of sets) for (const [name, anim] of Object.entries(anims)) {
  const dir = `${OUT}${vdir}${sdir}${name}/`
  mkdirSync(dir, { recursive: true })
  anim.frames.forEach((f, i) => {
    const n = String(i).padStart(2, '0')
    writeFileSync(`${dir}${n}.svg`, svg(f.px, pal))
    writeFileSync(`${dir}${n}.png`, png([f.px], pal))
    count++
  })
  writeFileSync(`${dir}sheet.png`, png(anim.frames.map(f => f.px), pal))
  if (hasFfmpeg) video(dir, anim)
}
console.log(`wrote ${count} frames to ${OUT} at ${scale}x${hasFfmpeg ? ', with clip.mp4, clip.webm and clip.gif per animation' : '; no ffmpeg, so no video'}`)
