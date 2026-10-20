// Theme, light/dark mode and corner style. index.html applies the stored choice before the first paint with a
// copy of readAppearance + applyAppearance; keep the two in step when palettes or keys change.
export const PALETTE_STORAGE_KEY = 'sq_arcade_palette';
export const MODE_STORAGE_KEY = 'sq_arcade_theme';
export const CORNERS_STORAGE_KEY = 'sq_arcade_corners';

export type Mode = 'light' | 'dark';
export type Corners = 'soft' | 'hard';

export interface Palette {
  id: string;
  name: string;
  modeNote: string;
  // Set when the palette exists in one mode only (each Catppuccin flavor); the dark-mode switch is then off.
  fixedMode?: Mode;
}

export interface Appearance {
  palette: string;
  mode: Mode;
  corners: Corners;
}

const CATPPUCCIN_NOTE = 'Each Catppuccin flavor has its own mode: Latte is light, the others are dark.';

export const PALETTES: readonly Palette[] = [
  { id: 'arcade', name: 'Arcade', modeNote: 'Dark is glowup arcade, neon on deep purple. Off uses arcade light.' },
  { id: 'clean', name: 'Clean', modeNote: 'The stock sidequest palette and fonts, light or dark.' },
  { id: 'tokyo-night', name: 'Tokyo Night', modeNote: 'Dark is Tokyo Night. Off uses Tokyo Night Day.' },
  { id: 'catppuccin-mocha', name: 'Catppuccin Mocha', modeNote: CATPPUCCIN_NOTE, fixedMode: 'dark' },
  { id: 'catppuccin-latte', name: 'Catppuccin Latte', modeNote: CATPPUCCIN_NOTE, fixedMode: 'light' },
  { id: 'catppuccin-frappe', name: 'Catppuccin Frappé', modeNote: CATPPUCCIN_NOTE, fixedMode: 'dark' },
  { id: 'catppuccin-macchiato', name: 'Catppuccin Macchiato', modeNote: CATPPUCCIN_NOTE, fixedMode: 'dark' }
];

export const DEFAULT_APPEARANCE: Appearance = { palette: 'arcade', mode: 'dark', corners: 'hard' };

export function paletteById(id: string): Palette | undefined {
  return PALETTES.find((palette) => palette.id === id);
}

// The mode a palette is shown in: its own for a one-mode palette, otherwise the chosen one.
export function effectiveMode(paletteId: string, mode: Mode): Mode {
  return paletteById(paletteId)?.fixedMode ?? mode;
}

function storedValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function readAppearance(): Appearance {
  const palette = storedValue(PALETTE_STORAGE_KEY);
  return {
    palette: palette && paletteById(palette) ? palette : DEFAULT_APPEARANCE.palette,
    mode: storedValue(MODE_STORAGE_KEY) === 'light' ? 'light' : 'dark',
    corners: storedValue(CORNERS_STORAGE_KEY) === 'soft' ? 'soft' : 'hard'
  };
}

export function writeAppearance(appearance: Appearance): void {
  try {
    localStorage.setItem(PALETTE_STORAGE_KEY, appearance.palette);
    localStorage.setItem(MODE_STORAGE_KEY, appearance.mode);
    localStorage.setItem(CORNERS_STORAGE_KEY, appearance.corners);
  } catch {
    // Private windows and blocked storage: the choice lasts until the page reloads.
  }
}

export function applyAppearance(appearance: Appearance, root: { dataset: DOMStringMap } = document.documentElement): void {
  root.dataset.palette = appearance.palette;
  root.dataset.theme = effectiveMode(appearance.palette, appearance.mode);
  root.dataset.corners = appearance.corners;
}
