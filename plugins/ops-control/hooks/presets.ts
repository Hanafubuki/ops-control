import type { ThemeFile } from './themes.ts'
import { SIDEQUEST_THEMES } from './sqthemes.ts'

// classic is Claude Code's own palette; every other preset extends it.
export const DEFAULT_THEME = 'classic'

export const PRESETS: Record<string, ThemeFile> = {
  classic: {
    name: 'classic',
    colors: {
      accent: '#d77757', text: '#e4e4e7', dim: '#8b8b94', faint: '#3a3a42',
      read: '#7dc4e4', edit: '#e5b567', shell: '#4eba65', agent: '#b39ddb',
      pass: '#4eba65', fail: '#ff6b80', panel: '#1f1f24', addBg: '#1f3a26', delBg: '#4a2228', sel: '#2a2a33',
    },
    spinner: { words: ['Thinking'] },
    glyphs: { read: '▸', search: '⌕', edit: '✎', shell: '$', agent: '◆', plan: '◇' },
    band: { hearts: ['♥', '♡'] },
  },
  'ops-control': {
    name: 'ops-control', extends: 'classic',
    colors: { accent: '#ffc857', text: '#ece6f2', dim: '#8e86a0', faint: '#2f2a3a', read: '#8ecbff', edit: '#ffa94d', shell: '#7ee0a1', agent: '#c9a7ff', pass: '#7ee0a1', fail: '#ff6f7d', panel: '#1d1924', addBg: '#1d3326', delBg: '#3f1f27', sel: '#2a2433' },
    spinner: { words: ['Glowing', 'Kindling', 'Polishing'] },
  },
  aurora: {
    name: 'aurora', extends: 'classic',
    colors: { accent: '#5ef1c6', text: '#e2eef2', dim: '#7f97a3', faint: '#22313b', read: '#7cc7ff', edit: '#ffd479', shell: '#5ef1c6', agent: '#b49cff', pass: '#5ef1c6', fail: '#ff7a8a', panel: '#131c23', addBg: '#123329', delBg: '#3a1d26', sel: '#1c2933' },
    spinner: { words: ['Drifting', 'Shimmering', 'Charting'] },
  },
  dusk: {
    name: 'dusk', extends: 'classic',
    colors: { accent: '#b69cff', text: '#e6e6f6', dim: '#8a8cad', faint: '#272a44', read: '#7fd6ff', edit: '#ffcf7a', shell: '#8ef0b0', agent: '#ff9ad5', pass: '#8ef0b0', fail: '#ff7088', panel: '#171a2b', addBg: '#18322a', delBg: '#3b1f2f', sel: '#222640' },
    spinner: { words: ['Dreaming', 'Musing', 'Wandering'] },
  },
  cyberpunk: {
    name: 'cyberpunk', extends: 'classic',
    colors: { accent: '#ff2bd6', text: '#e4dcff', dim: '#7d7398', faint: '#2d1f45', read: '#00e5ff', edit: '#ffb000', shell: '#39ff88', agent: '#b388ff', pass: '#39ff88', fail: '#ff3b5c', panel: '#140c22', addBg: '#0f3324', delBg: '#3d1020', sel: '#24123a' },
    spinner: { words: ['Jacking in', 'Compiling', 'Glowing'] },
  },
  vaporwave: {
    name: 'vaporwave', extends: 'classic',
    colors: { accent: '#ff71ce', text: '#ffe3f6', dim: '#a08bc0', faint: '#4a2d70', read: '#01cdfe', edit: '#fffb96', shell: '#05ffa1', agent: '#b967ff', pass: '#05ffa1', fail: '#ff6b6b', panel: '#24123f', addBg: '#123a3a', delBg: '#4a1a3a', sel: '#3a1d5c' },
    spinner: { words: ['Vibing', 'Drifting', 'Glowing'] },
  },
  'high-contrast': {
    name: 'high-contrast', extends: 'classic',
    colors: { accent: '#ffff00', text: '#ffffff', dim: '#d0d0d0', faint: '#808080', read: '#00ffff', edit: '#ffaa00', shell: '#00ff00', agent: '#ff80ff', pass: '#00ff00', fail: '#ff4040', panel: '#000000', addBg: '#003300', delBg: '#440000', sel: '#333333' },
  },
  ...SIDEQUEST_THEMES,
}
