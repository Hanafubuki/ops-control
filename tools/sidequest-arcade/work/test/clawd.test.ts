import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CLAWD_BODY,
  CLAWD_BODY_COLOR,
  CLAWD_EYE_COLOR,
  CLAWD_EYES,
  CLAWD_HEIGHT,
  CLAWD_WIDTH,
  clawdPath,
  drawClawd
} from '../app/src/lib/components/shell/clawd';

function recordingContext() {
  const fills: { color: string; x: number; y: number; width: number; height: number }[] = [];
  const context = {
    fillStyle: '' as string | CanvasGradient | CanvasPattern,
    fillRect(x: number, y: number, width: number, height: number) { fills.push({ color: String(context.fillStyle), x, y, width, height }); }
  };
  return { context, fills };
}

describe('clawd', () => {
  it('keeps every pixel on the 16 × 10 grid, with the eyes inside the body', () => {
    for (const [x, y, width, height] of [...CLAWD_BODY, ...CLAWD_EYES]) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(CLAWD_WIDTH);
      expect(y + height).toBeLessThanOrEqual(CLAWD_HEIGHT);
    }
    const [bodyX, bodyY, bodyWidth, bodyHeight] = CLAWD_BODY[0];
    for (const [x, y, width, height] of CLAWD_EYES) {
      expect(x).toBeGreaterThanOrEqual(bodyX);
      expect(y).toBeGreaterThanOrEqual(bodyY);
      expect(x + width).toBeLessThanOrEqual(bodyX + bodyWidth);
      expect(y + height).toBeLessThanOrEqual(bodyY + bodyHeight);
    }
  });

  it('draws the same shape as the favicon', () => {
    const favicon = readFileSync(new URL('../app/public/favicon.svg', import.meta.url), 'utf8');
    expect(favicon).toContain(`<path fill="${CLAWD_BODY_COLOR}" d="${clawdPath(CLAWD_BODY)}"/>`);
    expect(favicon).toContain(`<path fill="${CLAWD_EYE_COLOR}" d="${clawdPath(CLAWD_EYES)}"/>`);
  });

  it('centers Clawd on a canvas at a whole-number scale, body first and eyes on top', () => {
    const { context, fills } = recordingContext();
    drawClawd(context, 128);
    expect(fills).toHaveLength(CLAWD_BODY.length + CLAWD_EYES.length);
    expect(fills.slice(0, CLAWD_BODY.length).every((fill) => fill.color === CLAWD_BODY_COLOR)).toBe(true);
    expect(fills.slice(CLAWD_BODY.length).every((fill) => fill.color === CLAWD_EYE_COLOR)).toBe(true);
    const left = Math.min(...fills.map((fill) => fill.x));
    const right = Math.max(...fills.map((fill) => fill.x + fill.width));
    const top = Math.min(...fills.map((fill) => fill.y));
    const bottom = Math.max(...fills.map((fill) => fill.y + fill.height));
    expect([left, 128 - right]).toEqual([8, 8]);
    expect([top, 128 - bottom]).toEqual([29, 29]);
    expect(fills.every((fill) => Number.isInteger(fill.x) && Number.isInteger(fill.width))).toBe(true);
  });

  it('still draws at a scale of one on a tiny canvas', () => {
    const { context, fills } = recordingContext();
    drawClawd(context, 8);
    expect(fills[0]).toMatchObject({ width: 12, height: 8 });
  });
});
