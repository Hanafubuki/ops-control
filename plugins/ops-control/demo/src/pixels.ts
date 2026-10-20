import {BBox, useTime} from '@revideo/core';
import {Node, NodeProps} from '@revideo/2d';
import {CLAWD_SHEET} from './data';

type Frame = {ms: number; dx?: number; px: string[]};
type Anim = {loop: boolean; frames: Frame[]};
const anims = CLAWD_SHEET.animations as Record<string, Anim>;
const W = CLAWD_SHEET.w;
const H = CLAWD_SHEET.h;

// Clawd's sprite is drawn straight onto the canvas, one fillRect per same-color run, so it
// stays sharp at any camera zoom. A sprite pixel is one terminal cell wide and half a cell
// tall, which is how the mod draws it with half-block characters.
export class PixelSprite extends Node {
  frame: Frame = anims.idle.frames[0];
  readonly pw: number;
  readonly ph: number;

  constructor(props: NodeProps & {pw: number; ph: number}) {
    super(props);
    this.pw = props.pw;
    this.ph = props.ph;
  }

  protected override getCacheBBox() {
    return new BBox(0, 0, W * this.pw, H * this.ph);
  }

  protected override async draw(ctx: CanvasRenderingContext2D) {
    const pal = CLAWD_SHEET.palette as Record<string, string>;
    const e = 0.6; // overlap, so neighbouring runs leave no hairline seam
    this.frame.px.forEach((row, y) => {
      for (let x = 0; x < row.length; ) {
        const ch = row[x];
        let n = 1;
        while (x + n < row.length && row[x + n] === ch) n++;
        if (ch !== '.' && pal[ch]) {
          ctx.fillStyle = pal[ch];
          ctx.fillRect(x * this.pw, y * this.ph, n * this.pw + e, this.ph + e);
        }
        x += n;
      }
    });
    await super.draw(ctx);
  }
}

// Plays Clawd's animations from the real sprite sheet. update() is called once per video
// frame with the scene time, so the same time always gives the same picture.
export class Pet {
  readonly sprite: PixelSprite;
  private name = 'idle';
  private t0 = 0;
  private lastIdx = 0;
  x: number;
  // Walking steps this many sprite pixels per frame; the title screen uses it to cross the frame quickly.
  speed = 1;
  readonly minX: number;
  readonly maxX: number;

  constructor(pw: number, ph: number, x = 0, minX = -1e9, maxX = 1e9) {
    this.sprite = new PixelSprite({pw, ph});
    this.x = x;
    this.minX = minX;
    this.maxX = maxX;
    this.sprite.x(x);
  }

  get playing() {
    return this.name;
  }

  play(name: string, t = useTime()) {
    this.name = name;
    this.t0 = t;
    this.lastIdx = 0;
  }

  duration(name: string) {
    return anims[name].frames.reduce((a, f) => a + f.ms, 0) / 1000;
  }

  update(t: number): void {
    const a = anims[this.name];
    const total = a.frames.reduce((s, f) => s + f.ms, 0);
    let el = (t - this.t0) * 1000;
    if (el >= total && !a.loop) {
      this.play('idle', this.t0 + total / 1000);
      this.update(t);
      return;
    }
    el %= total;
    let i = 0;
    while (el >= a.frames[i].ms) el -= a.frames[i++].ms;
    if (i !== this.lastIdx) {
      // Walking moves a cell per step; step through every frame skipped since the last call.
      for (let k = this.lastIdx; k !== i; k = (k + 1) % a.frames.length) {
        this.x = Math.min(this.maxX, Math.max(this.minX, this.x + (a.frames[(k + 1) % a.frames.length].dx ?? 0) * this.sprite.pw * this.speed));
      }
      this.lastIdx = i;
      this.sprite.x(this.x);
    }
    this.sprite.frame = a.frames[i];
  }
}
