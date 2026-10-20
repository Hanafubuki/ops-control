import {Color, ColorSignal, all, createSignal, easeInOutCubic} from '@revideo/core';
import {Look, lookOf} from './data';

const KEYS = ['accent', 'text', 'dim', 'faint', 'read', 'edit', 'shell', 'agent', 'pass', 'fail', 'panel', 'addBg', 'delBg', 'sel'] as const;
export type ColorKey = (typeof KEYS)[number] | 'bg' | 'borderColor' | 'spinTint';

// The live colors of one window. Every node binds to these signals, so a pack switch is
// one tween and the whole window recolors together.
export class LookSig {
  readonly sig = {} as Record<ColorKey, ColorSignal<void>>;
  readonly word = createSignal('Thinking');
  readonly title = createSignal('');
  readonly desc = createSignal('');
  look: Look;

  constructor(look: Look) {
    this.look = look;
    for (const k of [...KEYS, 'bg', 'borderColor', 'spinTint'] as ColorKey[]) this.sig[k] = Color.createSignal(this.value(look, k));
    this.word(look.word);
    this.title(look.name);
    this.desc(look.description);
  }

  private value(look: Look, k: ColorKey): string {
    if (k === 'bg') return look.bg;
    if (k === 'borderColor') return look.borderColor;
    if (k === 'spinTint') return look.spinner.text ? look.c.text : look.spinTint;
    return look.c[k];
  }

  // Colors tween; discrete parts (rows style, border, spinner) switch at once, which is
  // when the caller rebuilds whatever depends on them.
  to(look: Look, seconds = 0.45) {
    this.look = look;
    this.word(look.word);
    this.title(look.name);
    this.desc(look.description);
    return all(...(Object.keys(this.sig) as ColorKey[]).map(k => this.sig[k](this.value(look, k), seconds, easeInOutCubic)));
  }

  set(look: Look) {
    this.look = look;
    for (const k of Object.keys(this.sig) as ColorKey[]) this.sig[k](this.value(look, k));
    this.word(look.word);
    this.title(look.name);
    this.desc(look.description);
  }

  static of(pack: string, theme?: string, spin?: string) {
    return new LookSig(lookOf(pack, theme, spin));
  }
}
