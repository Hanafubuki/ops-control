import { PACKS } from './packpresets.ts'

export const DOCS_URL = 'https://glowup.khimani.dev/'
export type HelpRow = readonly [command: string, what: string]

// The column the command text is padded to, in both the plain text and the drawn card.
export const COMMAND_COLS = 36

export const SHORT_ROWS: HelpRow[] = [
  ['/ops config', 'open the config TUI in a new terminal window'],
  ['/ops pack <name>', `switch look: ${Object.keys(PACKS).sort().join(' ')}`],
  ['/ops pet clawd|robot|ghost|off', 'pick a pet, or none'],
  ['/ops pane', 'open or close the side pane'],
  ['/ops motion reduced', 'calm everything down'],
]

export const SECTIONS: readonly (readonly [title: string, rows: HelpRow[]])[] = [
  ['Start here', [
    ['/ops config', 'open the config TUI in a new terminal window'],
    ['/ops config pane', 'the same settings in a pane inside Claude'],
    ['/ops pane', 'open or close the side pane (plan, agents, diff, changes and Spotify tabs)'],
    ['/ops music', 'the Spotify player: cover, seek, shuffle, repeat'],
    ['/ops spotify [connect|disconnect]', 'your Spotify account: queue, likes, other devices'],
  ]],
  ['Look', [
    ['/ops pack <name>', 'switch the whole look'],
    ['/ops pack list', 'packs you have'],
    ['/ops spinner <name|list|default>', 'just the spinner'],
    ['/ops theme <name|list|default>', 'just the colors'],
    ['/ops color <role> <#hex>', 'override one color, kept across packs'],
    ['/ops color list', 'every role, with overrides marked'],
    ['/ops color reset [role]', 'clear one override, or all'],
  ]],
  ['Pet', [
    ['/ops pet clawd|robot|ghost|off', 'pick a pet, or none'],
    ['/ops pet add <file|url>', 'install a pet from the studio'],
    ['/ops bubbles on|off|haiku', 'his speech bubbles, templates or Haiku lines'],
  ]],
  ['Comfort', [
    ['/ops motion reduced|full', 'animation off or on'],
  ]],
  ['Level', [
    ['/ops level', 'your level, XP and what unlocks next'],
    ['/ops outfit [name|off]', 'level outfits: list, wear one, or take it off'],
  ]],
  ['Layout', [
    ['/ops setup', 'band, tabs, meter, bubbles, pet sleep'],
    ['/ops setup <key> <value>', 'change one, e.g. meter.danger 90'],
    ['/ops setup reset', 'back to the defaults'],
  ]],
  ['Make your own', [
    ['/ops pack save <name>', 'save the current look'],
    ['/ops pack <url>', 'install a shared pack'],
    ['/ops theme add <url>', 'install a shared theme'],
    ['/ops import <file>', 'Ghostty or base16 scheme → pack'],
    ['/ops export konsole', 'your look as a Konsole scheme'],
  ]],
  ['Status line', [
    ['/ops statusline on', 'let ops-control draw it'],
    ['/ops statusline fields <ids>', 'pick what it shows'],
    ['/ops statusline fields music', 'add the Spotify track to it'],
    ['/ops statusline restore', 'put yours back'],
  ]],
]

const line = ([cmd, what]: HelpRow) => `  ${cmd.padEnd(COMMAND_COLS)} ${what}`

export const SHORT_TEXT = ['ops-control', '', ...SHORT_ROWS.map(line), '', `more: /ops help all   docs: ${DOCS_URL}`].join('\n')
export const FULL_TEXT = ['ops-control', ...SECTIONS.flatMap(([title, rows]) => ['', title, ...rows.map(line)])].join('\n')
