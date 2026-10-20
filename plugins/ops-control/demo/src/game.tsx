import {BBox} from '@revideo/core';
import {Node, NodeProps, Rect, Txt} from '@revideo/2d';

// The game layer. Every size is a multiple of U screen pixels and nothing is drawn with a
// blur, a gradient or a soft shadow: fillRect only, so edges stay hard.
export const U = 4;
export const PF = "'Press Start 2P'";
export const HUD_H = 80;

// Frame size in screen pixels; the scene sets it before anything is drawn.
export const screen = {w: 1920, h: 1080};

export const C = {
  bg: '#1a0b33',
  deep: '#0e0620',
  panel: '#2a1450',
  faint: '#4a2a85',
  dim: '#9b86c9',
  text: '#f0e6ff',
  pink: '#ff3ec8',
  cyan: '#38e8ff',
  yellow: '#ffd23e',
  green: '#39ff88',
  red: '#ff4d6d',
};

export type Rectangle = {x: number; y: number; w: number; h: number};
const frameArea = (): Rectangle => ({x: 0, y: HUD_H, w: screen.w, h: screen.h - HUD_H});

type BitmapProps = NodeProps & {rows: string[]; palette: Record<string, string>; px: number};

export class Bitmap extends Node {
  rows: string[];
  palette: Record<string, string>;
  readonly px: number;

  constructor(props: BitmapProps) {
    super(props);
    this.rows = props.rows;
    this.palette = props.palette;
    this.px = props.px;
  }

  protected override getCacheBBox() {
    return new BBox(0, 0, this.rows[0].length * this.px, this.rows.length * this.px);
  }

  protected override async draw(ctx: CanvasRenderingContext2D) {
    this.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const col = this.palette[row[x]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x * this.px, y * this.px, this.px, this.px);
      }
    });
    await super.draw(ctx);
  }
}

const HEART = ['.XX.XX.', 'XHXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
export const heart = (full: boolean, px = U) =>
  (<Bitmap rows={HEART} px={px} palette={full ? {X: C.red, H: '#ffd0d8'} : {X: C.faint}} />) as Bitmap;

const patterns = new Map<string, CanvasPattern>();
// An ordered pattern in whole screen pixels: level 1 lights one pixel in four, 2 two (a checkerboard).
function pattern(ctx: CanvasRenderingContext2D, color: string, level: number) {
  const key = `${color}${level}`;
  let p = patterns.get(key);
  if (!p) {
    const c = document.createElement('canvas');
    c.width = c.height = U * 2;
    const g = c.getContext('2d')!;
    g.fillStyle = color;
    for (const [x, y] of [[0, 0], [1, 1]].slice(0, level)) g.fillRect(x * U, y * U, U, U);
    p = ctx.createPattern(c, 'repeat')!;
    patterns.set(key, p);
  }
  return p;
}

abstract class Overlay extends Node {
  protected override getCacheBBox() {
    return new BBox(-screen.w / 2, -screen.h / 2, screen.w, screen.h);
  }
  // Runs fn in screen pixels, origin at the frame's top left.
  protected inScreen(ctx: CanvasRenderingContext2D, fn: () => void) {
    ctx.save();
    ctx.translate(-screen.w / 2, -screen.h / 2);
    fn();
    ctx.restore();
  }
}

// Darkens the playfield, optionally leaving one rectangle lit inside a 4 px frame. level 1 and
// 2 are dither steps, 3 is flat; the focus snaps through them in two frames each.
export class Spot extends Overlay {
  level = 0;
  hole: Rectangle | null = null;
  color = C.deep;
  frame = C.pink;

  protected override async draw(ctx: CanvasRenderingContext2D) {
    if (this.level > 0) {
      const a = frameArea();
      this.inScreen(ctx, () => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(a.x, a.y, a.w, a.h);
        if (this.hole) ctx.rect(this.hole.x, this.hole.y, this.hole.w, this.hole.h);
        ctx.clip('evenodd');
        if (this.level >= 3) {
          // Text under a heavier dither turns to noise, so the last step is flat.
          ctx.globalAlpha = 0.74;
          ctx.fillStyle = this.color;
        } else {
          ctx.fillStyle = pattern(ctx, this.color, this.level);
        }
        ctx.fillRect(a.x, a.y, a.w, a.h);
        ctx.restore();
        if (this.hole) {
          const {x, y, w, h} = this.hole;
          ctx.fillStyle = this.frame;
          ctx.fillRect(x - U, y - U, w + 2 * U, U);
          ctx.fillRect(x - U, y + h, w + 2 * U, U);
          ctx.fillRect(x - U, y, U, h);
          ctx.fillRect(x + w, y, U, h);
        }
      });
    }
    await super.draw(ctx);
  }
}

// Dithers the whole playfield (the title and high-score backdrop).
export class Veil extends Overlay {
  level = 2;

  protected override async draw(ctx: CanvasRenderingContext2D) {
    if (this.level > 0) {
      const a = frameArea();
      this.inScreen(ctx, () => {
        ctx.fillStyle = pattern(ctx, C.deep, this.level);
        ctx.fillRect(a.x, a.y, a.w, a.h);
      });
    }
    await super.draw(ctx);
  }
}

// A pixel dissolve: blocks of 40 px cover the playfield in a fixed scatter as p goes 0 to 1.
export class Dissolve extends Overlay {
  p = 0;

  protected override async draw(ctx: CanvasRenderingContext2D) {
    if (this.p > 0) {
      const a = frameArea();
      const B = 40;
      this.inScreen(ctx, () => {
        ctx.fillStyle = C.deep;
        for (let y = Math.floor(a.y / B); y * B < a.y + a.h; y++) {
          for (let x = 0; x * B < a.w; x++) {
            const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
            if ((hash % 1000) / 1000 < this.p) ctx.fillRect(x * B, Math.max(y * B, a.y), B, Math.min(B, a.y + a.h - y * B));
          }
        }
      });
    }
    await super.draw(ctx);
  }
}

export type HudState = {
  lives: number;
  maxLives: number;
  level: number;
  levelLabel: string;
  xp: number;
  xpNext: number;
  score: number;
  ghost: number;
  ghostOn: boolean;
  flash: boolean;
};

const pad = (n: number, w: number) => String(n).padStart(w, '0');

// Screen-fixed bar at the top: lives, level, an XP bar, score. The compact layout (a square
// frame) drops the XP number.
export class Hud {
  readonly node: Node;
  readonly s: HudState;

  constructor(init: Partial<HudState> = {}) {
    this.s = {lives: 3, maxLives: 3, level: 1, levelLabel: 'LEVEL', xp: 0, xpNext: 100, score: 0, ghost: -1, ghostOn: false, flash: false, ...init};
    this.node = (<Node x={-screen.w / 2} y={-screen.h / 2} />) as Node;
    this.draw();
  }

  set(patch: Partial<HudState>) {
    Object.assign(this.s, patch);
    this.draw();
  }

  private draw() {
    const s = this.s;
    const W = screen.w;
    const compact = W < 1500;
    const root = this.node;
    root.removeChildren();
    const mid = (HUD_H - U) / 2;
    root.add(<Rect x={W / 2} y={HUD_H / 2} width={W} height={HUD_H} fill={s.flash ? C.yellow : C.deep} />);
    root.add(<Rect x={W / 2} y={HUD_H - U} width={W} height={U} fill={C.faint} />);
    const text = (t: string, x: number, size: number, fill: string) =>
      root.add(<Txt text={t} x={x} y={mid} offset={[-1, 0]} fontFamily={PF} fontSize={size} fill={fill} />);
    const label = s.flash ? C.deep : C.dim;

    text('LIFE', 24, 16, label);
    for (let i = 0; i < s.maxLives; i++) {
      const h = heart(i < s.lives || (i === s.ghost && s.ghostOn));
      h.position([24 + 64 + 24 + i * (7 * U + 12), mid - 3 * U]);
      root.add(h);
    }

    const lx = compact ? 270 : 440;
    text(s.levelLabel, lx, 16, label);
    text(pad(s.level, 2), lx + s.levelLabel.length * 16 + 16, 24, s.flash ? C.deep : C.yellow);

    const xx = compact ? 490 : 800;
    text('XP', xx, 16, label);
    const segs = compact ? 10 : 16;
    const bx = xx + 32 + 24;
    const lit = Math.round((s.xp / s.xpNext) * segs);
    for (let i = 0; i < segs; i++) {
      root.add(<Rect x={bx + i * 20 + 8} y={mid} width={16} height={24} fill={i < lit ? (s.flash ? C.deep : C.yellow) : C.panel} />);
    }
    if (!compact) text(`${pad(s.xp, 4)}/${pad(s.xpNext, 4)}`, bx + segs * 20 + 16, 16, s.flash ? C.deep : C.text);

    const sx = compact ? 780 : 1440;
    text('SCORE', sx, 16, label);
    text(pad(s.score, 6), sx + 80 + 16, compact ? 24 : 24, s.flash ? C.deep : C.text);
  }
}

// Ground strip: a grass line over rows of alternating bricks, all in 16 px tiles.
export function ground(y: number, h: number): Node {
  const W = screen.w;
  const g = (<Node x={-W / 2} y={y - screen.h / 2} />) as Node;
  g.add(<Rect x={W / 2} y={h / 2} width={W} height={h} fill={C.panel} />);
  g.add(<Rect x={W / 2} y={U} width={W} height={2 * U} fill={C.green} />);
  g.add(<Rect x={W / 2} y={3 * U} width={W} height={U} fill="#1c7a47" />);
  for (let r = 0; r < Math.floor((h - 16) / 16); r++) {
    for (let x = (r % 2) * 16; x < W; x += 32) {
      g.add(<Rect x={x + 16} y={16 + r * 16 + 8} width={28} height={12} fill={C.bg} />);
    }
    g.add(<Rect x={W / 2} y={16 + r * 16 + 16} width={W} height={U / 2} fill={C.faint} />);
  }
  return g;
}
