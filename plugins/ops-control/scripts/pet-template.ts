// Writes docs/assets/pet-template.png: Clawd's right-facing frames laid out as the pet sprite spec
// asks, one row per animation, each 24 × 12 frame centred in its 32 × 16 cell and standing on the
// cell's floor. The studio's converter test decodes it back to Clawd.
// Run: node scripts/pet-template.ts
import { writeFileSync } from 'node:fs'
import { CLAWD_SHEET } from '../hooks/sprites/clawd.ts'
import { PET_ANIMS, FRAME_W, FRAME_H } from '../hooks/petfile.ts'
import { encodePng } from './png.ts'

// A sheet has 12 rows, or 14 once Clawd draws his idle variants. Rows run up to the last animation he has,
// and one he lacks stays blank, so a later row never shifts into an earlier row's place.
const last = PET_ANIMS.findLastIndex(n => CLAWD_SHEET.animations[n])
const rows = PET_ANIMS.slice(0, last + 1).map(n => CLAWD_SHEET.animations[n]?.frames.map(f => f.px) ?? [])
const width = FRAME_W * Math.max(...rows.map(r => r.length)), height = FRAME_H * rows.length
const ox = (FRAME_W - CLAWD_SHEET.w) / 2, oy = FRAME_H - CLAWD_SHEET.h
const rgba = new Uint8Array(width * height * 4)
rows.forEach((frames, r) => frames.forEach((px, c) => px.forEach((line, y) => [...line].forEach((k, x) => {
  const hex = CLAWD_SHEET.palette[k]
  if (k === '.' || !hex) return
  const i = ((r * FRAME_H + oy + y) * width + c * FRAME_W + ox + x) * 4
  rgba.set([1, 3, 5].map(j => parseInt(hex.slice(j, j + 2), 16)), i)
  rgba[i + 3] = 255
}))))
writeFileSync(new URL('../docs/assets/pet-template.png', import.meta.url), encodePng(width, height, rgba))
console.log(`docs/assets/pet-template.png ${width}×${height}`)
