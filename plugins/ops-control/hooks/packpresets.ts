// JSX-free: the docs site imports it. Values from docs/superpowers/mockups/ops-control-packs.html.
import type { PackFile } from './packs.ts'

export const PACKS: Record<string, PackFile> = {
  classic: { format: 1, name: 'classic', description: 'stock Claude Code', colors: { theme: 'classic', rows: 'classic', border: 'round', extras: { hp: false, combo: false } }, motion: { spinner: 'stock', shimmer: 1 } },
  crt: { format: 1, name: 'crt', extends: 'classic', description: 'green phosphor',
    colors: { palette: { accent: '#8dffb0', text: '#33ff66', dim: '#1f9944', faint: '#14501f', read: '#8dffb0', edit: '#d8ff66', shell: '#33ff66', agent: '#66ffcc', pass: '#33ff66', fail: '#ff6a3d', panel: '#0a1a0c', addBg: '#0b3a14', delBg: '#3a1a0a', sel: '#0f2a14' }, bg: '#040a05', rows: 'retro', border: 'bold', borderColor: '#1f9944' },
    motion: { spinner: 'comet', shimmer: 0 } },
  cozy: { format: 1, name: 'cozy', extends: 'classic', description: 'warm pastels',
    colors: { palette: { accent: '#f4a6b8', text: '#f5e6d3', dim: '#b0997f', faint: '#5a4a42', read: '#9ccfe0', edit: '#ffd9a0', shell: '#a8d5a2', agent: '#d7b4f3', pass: '#a8d5a2', fail: '#f28b82', panel: '#38302c', addBg: '#34503a', delBg: '#5a3438', sel: '#463a35' }, bg: '#2a2220', rows: 'cards', border: 'round', borderColor: '#8a6f64', gradient: ['#f4a6b8', '#ffd9a0'], rowFlags: { labels: false } },
    motion: { spinner: 'eyes', shimmer: 1, color: '#ffd9a0' } },
  arcade: { format: 1, name: 'arcade', extends: 'classic', description: 'neon on deep purple',
    colors: { palette: { accent: '#ff3ec8', text: '#f0e6ff', dim: '#9b86c9', faint: '#4a2a85', read: '#38e8ff', edit: '#ffd23e', shell: '#39ff88', agent: '#b388ff', pass: '#39ff88', fail: '#ff4d6d', panel: '#2a1450', addBg: '#0f4a3a', delBg: '#5a1030', sel: '#3a1d6b' }, bg: '#1a0b33', rows: 'cards', border: 'bold', borderColor: '#ff3ec8', gradient: ['#ff3ec8', '#38e8ff'], extras: { hp: true, combo: true }, rowFlags: { labels: false, markers: true, xp: true } },
    motion: { spinner: 'orb-states', shimmer: 2, color: '#38e8ff' } },
}
