# Ops Control pack reference

Every field Ops Control's loaders accept. A test checks this file against the code, so a field missing here or listed here and not accepted fails CI.

A pack is a JSON file at `~/.claude/ops-control/packs/<name>.json` (`$CLAUDE_CONFIG_DIR/ops-control/packs/` when that variable is set). The file name is the pack name. `//` and `/* */` comments are allowed, trailing commas are not. At most 64 KB. Colors are `#rrggbb` only: no `#fff`, no names. Unknown keys and unknown values of the lists below are skipped with a notice. `sound` and `voice` at the top level must be objects.

## Pack file

| Field | Values | Meaning |
| --- | --- | --- |
| `format` | `1` | Required. |
| `name` | text, 1 to 40 characters | Required. Same as the file name: lowercase letters, digits and dashes, starting with a letter or digit, not `classic`, `crt`, `cozy` or `arcade`. |
| `extends` | a pack name | Start from another pack, built-in or yours. Your keys replace its keys. |
| `description` | printable text, at most 80 characters | One line about the look. |
| `colors` | object, or a pack name | The colors layer. A name uses that pack's colors layer. |
| `motion` | object, or a pack name | The motion layer. A name uses that pack's motion layer. |
| `sound` | anything | Reserved. Ignored. Leave it out. |
| `voice` | anything | Reserved. Ignored. Leave it out. |

## Colors layer

| Field | Values | Meaning |
| --- | --- | --- |
| `theme` | a theme name | Start the palette from this theme: `classic`, `ops-control`, `aurora`, `dusk`, `cyberpunk`, `vaporwave`, `high-contrast`, or a file in `~/.claude/ops-control/themes`. Default `classic`. |
| `palette` | object of theme color keys | Colors that replace the theme's. Keys are listed under Theme colors. Set only what differs. |
| `bg` | `#rrggbb` | The terminal background Ops Control fades toward. Match the user's terminal background. Default: the palette's `panel`. |
| `rows` | `classic`, `cards`, `minimal`, `retro`, `slab` | Transcript row style. `classic` leaves rows alone, `cards` draws side bars and bordered tool cards, `minimal` is quiet one-liners, `retro` uses `[TAG]` labels, `slab` draws your prompt as an accent bar numbered by turn and numbers each tool call. Default `classic`. |
| `border` | `round`, `single`, `double`, `bold`, `classic` | Border shape around cards. Also the shape of the status box and of the pane's section boxes. Default `round`. |
| `borderColor` | `#rrggbb` | Border color. Default: the palette's `faint`. |
| `gradient` | array of exactly two `#rrggbb` | Start and end color of the card gradient and spinner shimmer. Default: none. |
| `extras` | object | Optional extras, below. |
| `extras.hp` | `true`, `false` | Show an HP bar for context instead of hearts. Default `false`. |
| `extras.combo` | `true`, `false` | Show `COMBO x3` after three tool calls in a row succeed. Default `false`. |
| `rowFlags` | object | How message rows are drawn, below. Only `cards` uses `markers` and `xp`; `cards` and `retro` use `labels`. |
| `rowFlags.labels` | `true`, `false` | Show the `you` and `claude` labels (`[YOU]` and `[CLAUDE]` in `retro`). Default `true`. |
| `rowFlags.markers` | `true`, `false` | In `cards`, mark your prompt with `▶ ` in `accent` and Claude's reply with `◆ ` in `read`, instead of the side bar. Default `false`. |
| `rowFlags.xp` | `true`, `false` | In `cards`, draw `+N XP` right-aligned above a reply, N being the successful tool calls in a row so far this turn. Left out at 0, in `edit` color. Default `false`. |
| `meters` | `default`, `dither` | The usage rows in the pane's status box. `default` is hearts, or the HP bar with `extras.hp`; `dither` draws a bar per 5-hour and weekly window that ramps from `accent` to `text` and dissolves through `▓▒░` into `faint` dots. Default `default`. |
| `dividers` | `true`, `false` | Draw a numbered rule, `░▒▓━━ 03 ━━━▓▒░` in `faint` with the number in `accent`, above each of your prompts. Default `false`. |
| `glyphs` | object | Tool-kind glyphs by key, the keys in Theme glyphs below, each one width-1 character. Keys left out keep the theme's glyph. Ignored while `/ops theme` overrides the pack's theme. |
| `hearts` | two strings | Full then empty heart, each one width-1 character. Ignored under a theme override. |
| `words` | list of strings | Spinner words, each at most 24 characters. An empty list keeps the theme's words. Ignored under a theme override. |
| `pet` | object | Clawd's colors: `body`, `light` and `shade`, each `#rrggbb`, replacing `#d77757`, `#ee9f7b` and `#a8553b`. Keys left out keep the default. The shiny pet stays gold: the unlock wins over a pack. Survives a theme override. |

`glyphs` merges key by key and `pet` merges per key down `extends`. A Ops Control that predates `glyphs`, `hearts`, `words` and `pet` refuses a pack that uses them.

## Motion layer

| Field | Values | Meaning |
| --- | --- | --- |
| `spinner` | `stock`, `comet`, `eyes`, `orb-states`, `clawd`, `shimmer`, `scanline`, `ring`, `glitch`, `signal` | The spinner. `stock` is Claude Code's own. Use only these: an id Ops Control lacks falls back to `stock` with a notice. Default `stock`. `scanline` and `glitch` also light or glitch the spinner word. |
| `shimmer` | `0`, `1`, `2` | Shimmer across the spinner word: none, soft, fast. Default `1`. |
| `color` | `#rrggbb` | Spinner color. Default: the palette's `accent`. |
| `field` | `none`, `warp`, `simplex`, or an object | An animated texture in the docked pane's open rows, between the tab and the status box, dithered into braille dots of one color, the palette's `faint` unless `field.color` sets it. `simplex` is Paper's dithering shader's simplex shape, and Paper settings for it carry over as they are, except `size`; `warp` is noise folded through itself. A name uses the default knobs; an object takes a `shape` and any of the knobs below. It holds still under reduced motion. Default `none`. |
| `field.shape` | `none`, `warp`, `simplex` | Required in the object form. |
| `field.speed` | number, `0` to `4` | How fast it moves. `0` holds still. Default `1`. |
| `field.scale` | number, `0.05` to `4` | Feature size: smaller packs in more, finer shapes. Default `1`. |
| `field.rotation` | number, `0` to `360` | Degrees the pattern is turned. Default `0`. |
| `field.offsetX` | number, `-1` to `1` | Shifts the pattern sideways, in the pane's shorter side. Default `0`. |
| `field.offsetY` | number, `-1` to `1` | Shifts the pattern up or down, in the pane's shorter side. Default `0`. |
| `field.density` | number, `0.2` to `2` | How much of the field is lit. Default `1`. |
| `field.warp` | number, `0` to `8` | How far `warp` folds the noise; ignored by `simplex`. Default `4`. |
| `field.size` | whole number, `1` to `4` | Braille dots per side of one dither pixel: `1` is finest, `4` lights whole cells. Not Paper's pixel size: keep `1` when copying Paper settings, since Paper's pixels are far finer than a braille dot. Default `1`. |
| `field.dither` | `2x2`, `4x4`, `8x8` | The ordered (Bayer) dither matrix. Default `8x8`. |
| `field.fps` | number, `1` to `12` | Frames a second. Claude Code repaints the whole field each frame, about a quarter of one CPU core at `10` on an 88×24 pane, so a slow field can run lower. Default `10`. |
| `field.color` | `#rrggbb` | The dots' color. Check it reads at 3:1 or less against `bg`, so it stays background. Default: the palette's `faint`. |

## Theme colors

These are the keys of `colors.palette`, and of `colors` in a theme file. All 14 are always set by the base theme, so list only the ones you change.

| Key | Used for |
| --- | --- |
| `accent` | Current plan item, progress pips, spinner, card side bar of your prompts. |
| `text` | Main text. |
| `dim` | Secondary text, separators, files that were only read. |
| `faint` | Empty parts of bars, borders, pane section borders, tree lines. |
| `read` | Read and search rows, running subagent work, low context. |
| `edit` | Edit rows, medium context, the context warning. |
| `shell` | Shell rows. |
| `agent` | Subagent rows. |
| `pass` | Passing tests, finished subagents, added-line counts. |
| `fail` | Failures, high context, removed-line counts. |
| `panel` | Panel and card fill. |
| `addBg` | Background of added lines. Dark tint of green. |
| `delBg` | Background of removed lines. Dark tint of red. |
| `sel` | Selection background. |

## Theme file

A theme is a separate file at `~/.claude/ops-control/themes/<name>.json`, for what a pack cannot hold: glyphs, spinner words and hearts. A pack uses it through `colors.theme`. Unknown top-level keys in a theme file are ignored.

| Field | Values | Meaning |
| --- | --- | --- |
| `name` | lowercase letters, digits, dashes | Only `/ops theme add` reads it. |
| `extends` | a theme name | Build on another theme. |
| `colors` | object of Theme colors keys | Same keys as `palette`. |
| `glyphs` | object of Theme glyphs keys | Tool-row marks. |
| `spinner.words` | array of strings, each at most 24 characters | Words for the spinner. |
| `band.hearts` | array of two single characters | Full and empty heart. |

## Theme glyphs

Each glyph is exactly one character, one cell wide, in the Basic Multilingual Plane. No emoji, no wide CJK, no control or zero-width characters.

| Key | Tool kind | Default |
| --- | --- | --- |
| `read` | Read | `▸` |
| `search` | Grep, Glob | `⌕` |
| `edit` | Edit, Write | `✎` |
| `shell` | Bash | `$` |
| `agent` | Subagent | `◆` |
| `plan` | Plan | `◇` |

## Worked example

A dusk-purple pack that starts from the `dusk` theme, uses cards and the `orb-states` spinner. It loads with no errors.

```json
{
  "format": 1,
  "name": "ember-dusk",
  "description": "ember orange on dusk purple",
  "colors": {
    "theme": "dusk",
    "palette": {
      "accent": "#ff8a5c",
      "text": "#f3e9f7",
      "dim": "#a898b8",
      "faint": "#7a6a8c",
      "read": "#6fd0ff",
      "edit": "#ffd166",
      "shell": "#7be0a0",
      "agent": "#d0a2ff",
      "pass": "#7be0a0",
      "fail": "#ff6b81",
      "panel": "#261d33",
      "addBg": "#1f3a2c",
      "delBg": "#40202c",
      "sel": "#33284a"
    },
    "bg": "#1c1526",
    "rows": "cards",
    "border": "round",
    "borderColor": "#7a6a8c",
    "gradient": ["#ff8a5c", "#ffd166"],
    "extras": { "hp": false, "combo": true }
  },
  "motion": {
    "spinner": "orb-states",
    "shimmer": 1,
    "color": "#ff8a5c"
  }
}
```
