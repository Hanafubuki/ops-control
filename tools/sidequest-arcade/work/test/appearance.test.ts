import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyAppearance,
  CORNERS_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  effectiveMode,
  MODE_STORAGE_KEY,
  PALETTE_STORAGE_KEY,
  PALETTES,
  readAppearance,
  writeAppearance,
  type Appearance
} from '../app/src/lib/state/appearance';

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); })
  };
}

// The pre-paint script in index.html, run against a stored choice; returns the attributes it set.
function prePaint(stored: Record<string, string>) {
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error('index.html has no inline pre-paint script');
  const rootElement = { dataset: { palette: 'arcade', theme: 'dark', corners: 'hard' } as Record<string, string> };
  new Function('localStorage', 'document', script)(storage(stored), { documentElement: rootElement });
  return rootElement.dataset;
}

afterEach(() => vi.unstubAllGlobals());

describe('appearance', () => {
  it('defaults to dark arcade with hard corners when nothing is stored', () => {
    vi.stubGlobal('localStorage', storage());
    expect(readAppearance()).toEqual(DEFAULT_APPEARANCE);
  });

  it('round trips a choice through localStorage', () => {
    const store = storage();
    vi.stubGlobal('localStorage', store);
    const appearance: Appearance = { palette: 'tokyo-night', mode: 'light', corners: 'soft' };
    writeAppearance(appearance);
    expect(store.setItem).toHaveBeenCalledWith(PALETTE_STORAGE_KEY, 'tokyo-night');
    expect(readAppearance()).toEqual(appearance);
  });

  it('falls back to the default palette for an unknown stored id and keeps the light choice of older installs', () => {
    vi.stubGlobal('localStorage', storage({ [PALETTE_STORAGE_KEY]: 'solarized', [MODE_STORAGE_KEY]: 'light' }));
    expect(readAppearance()).toEqual({ palette: 'arcade', mode: 'light', corners: 'hard' });
  });

  it('survives a browser with throwing localStorage', () => {
    const throwing = () => { throw new Error('blocked'); };
    vi.stubGlobal('localStorage', { getItem: throwing, setItem: throwing, removeItem: throwing });
    expect(readAppearance()).toEqual(DEFAULT_APPEARANCE);
    expect(() => writeAppearance(DEFAULT_APPEARANCE)).not.toThrow();
  });

  it('shows each Catppuccin flavor in its own mode and the others in the chosen one', () => {
    expect(effectiveMode('catppuccin-latte', 'dark')).toBe('light');
    expect(effectiveMode('catppuccin-mocha', 'light')).toBe('dark');
    expect(effectiveMode('catppuccin-frappe', 'light')).toBe('dark');
    expect(effectiveMode('catppuccin-macchiato', 'light')).toBe('dark');
    expect(effectiveMode('arcade', 'light')).toBe('light');
    expect(effectiveMode('clean', 'dark')).toBe('dark');
  });

  it('writes palette, effective mode and corners onto the root element', () => {
    const rootElement = { dataset: {} as DOMStringMap };
    applyAppearance({ palette: 'catppuccin-latte', mode: 'dark', corners: 'soft' }, rootElement);
    expect({ ...rootElement.dataset }).toEqual({ palette: 'catppuccin-latte', theme: 'light', corners: 'soft' });
  });

  it('pre-paints exactly what the app applies for every palette, mode and corner style', () => {
    for (const palette of PALETTES) {
      for (const mode of ['light', 'dark'] as const) {
        for (const corners of ['soft', 'hard'] as const) {
          const stored = { [PALETTE_STORAGE_KEY]: palette.id, [MODE_STORAGE_KEY]: mode, [CORNERS_STORAGE_KEY]: corners };
          vi.stubGlobal('localStorage', storage(stored));
          const applied = { dataset: {} as DOMStringMap };
          applyAppearance(readAppearance(), applied);
          expect(prePaint(stored)).toEqual({ ...applied.dataset });
        }
      }
    }
    expect(prePaint({ [PALETTE_STORAGE_KEY]: 'solarized' })).toEqual({ palette: 'arcade', theme: 'dark', corners: 'hard' });
  });
});
