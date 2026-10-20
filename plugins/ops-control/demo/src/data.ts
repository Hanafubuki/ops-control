import packsJson from '../../installer/internal/packs/packs.json';
import {CLAWD_SHEET as sheet} from '../../hooks/sprites/clawd.ts';
import {CLAWD_SAY, fill, type Mood} from '../../hooks/bubbles.ts';
import {PACKS as PRESETS} from '../../hooks/packpresets.ts';

export type Colors = (typeof packsJson.packs)[number]['colors'];
export type PackData = (typeof packsJson.packs)[number];
export type SpinnerCell = {ch: string; fg: string; bg?: string};
export type SpinnerAnim = {id: string; name: string; ms: number; text: boolean; frames: SpinnerCell[][][]};

export const PACKS = packsJson.packs as PackData[];
export const THEMES = packsJson.themes;
export const SPINNERS = packsJson.spinners as SpinnerAnim[];
export const CLAWD_SHEET = sheet;

// Clawd's line for a mood, filled the way the mod fills it. The mod picks a template at
// random; the demo pins one by index so the video is the same every render.
export function say(mood: Mood, index: number, vars: Parameters<typeof fill>[1] = {}): string {
  const template = CLAWD_SAY[mood][index];
  if (template === undefined) throw new Error(`hooks/bubbles.ts has no ${mood} line ${index}`);
  return fill(template, vars);
}

export type RowFlags = {labels: boolean; markers: boolean; xp: boolean};
// Same defaults as hooks/packs.ts: labels on, markers and xp off unless the pack says so.
export const rowFlagsOf = (name: string): RowFlags => {
  const c = PRESETS[name]?.colors;
  const f = typeof c === 'object' ? c.rowFlags : undefined;
  return {labels: f?.labels ?? true, markers: f?.markers ?? false, xp: f?.xp ?? false};
};

// The arcade packs swap the hearts for a life bar (extras.hp).
export const hpOf = (name: string): boolean => {
  const c = PRESETS[name]?.colors;
  return typeof c === 'object' && c.extras?.hp === true;
};

export const pack = (n: string) => PACKS.find(p => p.name === n) ?? PACKS[0];
export const spinner = (id: string) => SPINNERS.find(s => s.id === id) ?? SPINNERS[0];

export type Look = {
  name: string;
  description: string;
  rows: string;
  rowFlags: RowFlags;
  hp: boolean;
  border: string;
  gradient: string[] | null;
  bg: string;
  borderColor: string;
  c: Colors;
  word: string;
  spinner: SpinnerAnim;
  spinTint: string;
  ownColors: boolean;
  ownSpinner: boolean;
};

// Mirrors installer/internal/tui/preview.go LookOf: a theme or spinner picked in Customize
// goes on top of the pack, and "classic" / "pack" mean the pack's own.
export function lookOf(packName: string, theme = 'classic', spin = 'pack'): Look {
  const p = pack(packName);
  const t = THEMES.find(x => x.name === theme);
  const ownColors = !t || theme === 'classic';
  const s = SPINNERS.find(x => x.id === spin);
  const sp = s ?? spinner(p.spinner.id);
  const c = ownColors ? p.colors : t!.colors;
  return {
    name: p.name,
    description: p.description,
    rows: p.rows,
    rowFlags: rowFlagsOf(p.name),
    hp: hpOf(p.name),
    border: p.border,
    gradient: p.gradient,
    bg: ownColors ? p.bg : t!.colors.panel,
    borderColor: ownColors ? p.borderColor : t!.colors.faint,
    c,
    word: ownColors ? p.spinner.word : t!.word,
    spinner: sp,
    spinTint: p.spinner.color ?? c.accent,
    ownColors,
    ownSpinner: !s,
  };
}

const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

// Spinner frames are white on black: a gray is a brightness, a colored cell (Clawd's own
// orange) stays as drawn. Same rule as shade() in preview.go.
export function shade(hex: string, tint: string, bg: string): string {
  const [r, g, b] = rgb(hex);
  return r !== g || g !== b ? hex : mix(bg, tint, r / 255);
}
