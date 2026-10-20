import type { ThemeFile } from './themes.ts'

// The palettes of the arcade-restyled Sidequest dashboard (~/.claude/sidequest-arcade, its theme.css),
// as ops-control themes, so the pane and the board can wear the same one. Each extends classic for its glyphs.
// Its arcade palette is ops-control's own arcade pack (packpresets.ts), so it is not repeated here: the Settings
// tab applies that pack, borders, background and all.
export const ARCADE = 'arcade'
export const SIDEQUEST_THEMES: Record<string, ThemeFile> = {
  clean: {
    name: 'clean', extends: 'classic',
    colors: { accent: '#9eaaff', text: '#ece9e0', dim: '#9a978e', faint: '#3a4048', read: '#8ec5e0', edit: '#e0af4e', shell: '#76b393', agent: '#c3a6f0', pass: '#76b393', fail: '#f08a79', panel: '#171a1e', addBg: '#1d3329', delBg: '#43241f', sel: '#242a30' },
  },
  'tokyo-night': {
    name: 'tokyo-night', extends: 'classic',
    colors: { accent: '#7aa2f7', text: '#c0caf5', dim: '#737aa2', faint: '#3b4261', read: '#7dcfff', edit: '#e0af68', shell: '#9ece6a', agent: '#bb9af7', pass: '#9ece6a', fail: '#f7768e', panel: '#1a1b26', addBg: '#20303b', delBg: '#37222c', sel: '#24283b' },
  },
  'catppuccin-mocha': {
    name: 'catppuccin-mocha', extends: 'classic',
    colors: { accent: '#cba6f7', text: '#cdd6f4', dim: '#a6adc8', faint: '#45475a', read: '#89b4fa', edit: '#f9e2af', shell: '#a6e3a1', agent: '#f5c2e7', pass: '#a6e3a1', fail: '#f38ba8', panel: '#1e1e2e', addBg: '#25352f', delBg: '#3c2633', sel: '#313244' },
  },
  'catppuccin-macchiato': {
    name: 'catppuccin-macchiato', extends: 'classic',
    colors: { accent: '#c6a0f6', text: '#cad3f5', dim: '#a5adcb', faint: '#494d64', read: '#8aadf4', edit: '#eed49f', shell: '#a6da95', agent: '#f5bde6', pass: '#a6da95', fail: '#ed8796', panel: '#24273a', addBg: '#2a3b37', delBg: '#41303f', sel: '#363a4f' },
  },
  'catppuccin-frappe': {
    name: 'catppuccin-frappe', extends: 'classic',
    colors: { accent: '#ca9ee6', text: '#c6d0f5', dim: '#a5adce', faint: '#51576d', read: '#8caaee', edit: '#e5c890', shell: '#a6d189', agent: '#f4b8e4', pass: '#a6d189', fail: '#e78284', panel: '#303446', addBg: '#344a42', delBg: '#4a3a4a', sel: '#414559' },
  },
  'catppuccin-latte': {
    name: 'catppuccin-latte', extends: 'classic',
    colors: { accent: '#8839ef', text: '#4c4f69', dim: '#6c6f85', faint: '#bcc0cc', read: '#1e66f5', edit: '#df8e1d', shell: '#40a02b', agent: '#ea76cb', pass: '#40a02b', fail: '#d20f39', panel: '#eff1f5', addBg: '#d5ecd0', delBg: '#f5d0d8', sel: '#ccd0da' },
  },
}
