// Clawd, the Claude Code mascot, as pixel art on a 16 × 10 grid: the block art of the Claude Code welcome screen.
// The sidebar logo and the desktop notification icon draw it from here; public/favicon.svg holds the same paths,
// and test/clawd.test.ts keeps the two identical.
export type PixelRect = readonly [x: number, y: number, width: number, height: number];

export const CLAWD_WIDTH = 16;
export const CLAWD_HEIGHT = 10;
export const CLAWD_BODY_COLOR = '#d77757';
export const CLAWD_EYE_COLOR = '#1f1e1d';

export const CLAWD_BODY: readonly PixelRect[] = [
  [2, 0, 12, 8],
  [0, 4, 2, 2], [14, 4, 2, 2],
  [3, 8, 1, 2], [5, 8, 1, 2], [10, 8, 1, 2], [12, 8, 1, 2]
];

export const CLAWD_EYES: readonly PixelRect[] = [[4, 2, 1, 2], [11, 2, 1, 2]];

export function clawdPath(rects: readonly PixelRect[]): string {
  return rects.map(([x, y, width, height]) => `M${x} ${y}h${width}v${height}h-${width}z`).join('');
}

// Clawd centered on a square canvas of `size` pixels, scaled by a whole number so the pixels stay sharp.
export function drawClawd(context: Pick<CanvasRenderingContext2D, 'fillStyle' | 'fillRect'>, size: number): void {
  const scale = Math.max(1, Math.floor((size * 7) / 8 / CLAWD_WIDTH));
  const left = Math.floor((size - CLAWD_WIDTH * scale) / 2);
  const top = Math.floor((size - CLAWD_HEIGHT * scale) / 2);
  const layers: [string, readonly PixelRect[]][] = [[CLAWD_BODY_COLOR, CLAWD_BODY], [CLAWD_EYE_COLOR, CLAWD_EYES]];
  for (const [color, rects] of layers) {
    context.fillStyle = color;
    for (const [x, y, width, height] of rects) context.fillRect(left + x * scale, top + y * scale, width * scale, height * scale);
  }
}
