---
title: Pack reference
description: The pack file format, validation rules, row styles and flags, extras, effects and spinner ids.
---

For what packs are and how to use them, see [Packs](packs.md).

## File format

Packs are read from `~/.claude/ops-control/packs`, or `$CLAUDE_CONFIG_DIR/ops-control/packs` when that variable is set. The file name is the pack name, and comments are allowed.

```jsonc title="~/.claude/ops-control/packs/neon.json"
{
  "format": 1,                      // required
  "name": "neon",                   // lowercase letters, digits, dashes; 1-40
  "extends": "classic",             // another pack to start from
  "description": "neon on deep purple",
  "colors": {
    "theme": "classic",             // a theme to start the palette from
    "palette": { "accent": "#ff3ec8", "text": "#f0e6ff" },
    "bg": "#1a0b33",                // what braille and half-block fades blend toward
    "rows": "cards",                // classic | cards | minimal | retro | slab
    "border": "bold",               // round | single | double | bold | classic
    "borderColor": "#ff3ec8",
    "gradient": ["#ff3ec8", "#38e8ff"],
    "extras": { "hp": true, "combo": true },
    "rowFlags": { "labels": false, "markers": true, "xp": true },
    "meters": "dither",             // default | dither
    "dividers": true,               // a numbered rule above each prompt
    "glyphs": { "read": "»" },      // tool-kind glyphs, by key
    "hearts": ["●", "○"],           // full, then empty
    "words": ["Brewing", "Dialing in"], // spinner words
    "pet": { "body": "#7aa2f7", "light": "#a9c1ff", "shade": "#4a6fc4" } // Clawd's colors
  },
  "motion": {
    "spinner": "orb-states",        // stock | comet | eyes | orb-states | clawd | shimmer | scanline | ring | glitch | signal
    "shimmer": 2,                   // 0 none, 1 soft, 2 fast
    "color": "#38e8ff",             // defaults to the palette's accent
    "field": { "shape": "simplex", "speed": 0.3, "scale": 0.36, "dither": "4x4" }
  },
  "sound": {},                      // reserved for a later release; an object or nothing
  "voice": {}                       // reserved for a later release; an object or nothing
}
```

Every field except `format` and `name` is optional. `palette` takes the color roles listed in the [theme reference](theme-reference.md). A layer can also be the name of another pack: `"motion": "crt"` uses `crt`'s motion layer.

## Checks and limits

- The file is at most 64 KB.
- `format` must be `1`. A higher number is the one hard refusal for a file's shape: the pack is rejected with `made for a newer ops-control`.
- Colors are `#rrggbb`.
- Names and the description must be printable, with no control, zero-width or bidirectional characters. A description is at most 80 characters.
- `sound` and `voice` must be objects. Any other value is ignored with a notice.
- `extends` and layer references together go at most 8 deep. A loop or a ninth level is refused, with the chain named in the message.
- Any other bad value for a key Ops Control knows refuses the layer it is in, and that layer falls back to `classic`.

### Keys and values from a later release

A pack made for a later 1.x may use a key or a value this release does not know. Ops Control skips it, tells you in a notice that names the key and its path, such as `unknown key "colors.sparkle" skipped` or `unknown value "hologram" for colors.rows skipped`, and loads the rest. This holds at every level of the file: unknown keys anywhere, unknown values of `rows`, `border`, `meters`, `shimmer`, `field`, `field.shape` and `field.dither`, and unknown palette colors, glyph keys and `pet` colors. An unknown spinner id falls back to `stock` in the same way.

A key it knows with the wrong type is still an error, so a typo in a known value is caught.

`/ops pack <url>` accepts `https://` only, waits up to 10 seconds, and validates the whole file and its `extends` chain before writing. It refuses a built-in name, or the name of an installed pack unless `--force` is given.

## Glyphs, hearts and spinner words

A pack can carry what a [theme file](theme-reference.md) carries beyond colors, laid over the theme the pack starts from.

- `colors.glyphs` is an object of glyph keys, each one width-1 character. Keys you leave out keep the theme's glyph. The keys are the ones in the theme reference.
- `colors.hearts` is two width-1 characters, full then empty.
- `colors.words` is a list of spinner words, each at most 24 characters. An empty list keeps the theme's words.

A Ops Control that predates these keys refuses the pack's colors layer as an unknown key. They are ignored while `/ops theme <name>` overrides the pack's theme. A studio link or `/ops pack save` writes them only when they differ from the theme.

## Clawd's colors

`colors.pet` recolors Clawd with `body`, `light` and `shade`, each `#rrggbb`. They replace his orange body, its highlight and its shadow (`#d77757`, `#ee9f7b`, `#a8553b`); a key you leave out keeps its default, and the eyes and outfits do not change. The shiny pet stays gold: the unlock wins over a pack. Unlike glyphs, hearts and words, `colors.pet` survives a `/ops theme` override. `pet` merges per key down an `extends` chain, and a studio link or `/ops pack save` writes it only when it is set. A Ops Control that predates it refuses the pack's colors layer as an unknown key.

## Row styles

Styles wrap or prefix a transcript row; the content Claude Code draws inside it is unchanged. Every style except `classic` adds a one-column left margin.

| Style | Your prompt | Claude's reply | Tool call |
| --- | --- | --- | --- |
| `classic` | Claude Code's | Claude Code's | Claude Code's, plus the theme's kind glyph |
| `cards` | An accent side bar `▎` and a `you` label | A dim side bar, and a `claude` label on the first block of a reply | A dim bordered card with a mark: `✓`, `✗`, `■` for interrupted, `…` while running |
| `minimal` | A `› text` line | Claude Code's | A dim one-line `· Read src/auth.ts` once it finishes cleanly |
| `retro` | A `[YOU]` tag on its own line above your prompt | A `[CLAUDE]` tag on the first block | A `[READ  ]`-style tag, then `[ OK ]`, `[FAIL]`, `[STOP]` or `[....]` |
| `slab` | A full-width bar in `accent` with your prompt in the background color and `PROMPT 03` on the right | An 8-cell `─` rule in `accent` above the first block | `01  READ   ` before the row, then `OK`, `FAIL`, `STOP` or `…` on the right; results indented under their call |

Not styled: notifications, messages from other agents, prompts expanded with ctrl+o or `--verbose`, the folded "Read 3 files" line, and tool progress. Outside fullscreen, rows already in scrollback keep the style they were printed with.

## Row flags

`colors.rowFlags` holds three booleans.

| Flag | Default | Effect |
| --- | --- | --- |
| `labels` | `true` | The `you` and `claude` labels in `cards`, and `[YOU]` and `[CLAUDE]` in `retro`. |
| `markers` | `false` | In `cards`, your prompt starts with `▶ ` in the accent color and Claude's reply with `◆ ` in the `read` color, instead of the side bar. Later blocks of one reply are indented to line up. |
| `xp` | `false` | In `cards`, a `+N XP` tag in the `edit` color, right-aligned above Claude's reply. N is the number of successful tool calls in a row this turn when the reply first drew; the tag is omitted at 0. |

`cozy` turns `labels` off. `arcade` turns `labels` off and `markers` and `xp` on.

## Extras

- `hp` replaces the hearts with an HP bar: `HP ████████░░ 38% context left` in the band, `HP ████████░░ 38% weekly limit left` in the pane's status box.
- `combo` shows `COMBO x3` once three tool calls in a row succeed in one turn. An error, a failed test or a new turn resets it.

## Effects

Three effects are drawn by Ops Control itself, so a pack switches them on from its JSON and still installs from a URL.

- `colors.meters: "dither"` replaces the hearts or HP bar in the pane's status box with one bar per usage window, `5h` and `wk`, or one `ctx` bar when the session reports no windows. Each bar ramps from `accent` to `text`, dissolves through `▓▒░`, and shows what is used as `faint` dots, followed by the percent left and the reset time.
- `colors.dividers: true` draws `░▒▓━━ 03 ━━━▓▒░` above each of your prompts, numbered by turn, in `faint` with the number in `accent`.
- `motion.field` fills the docked pane's open rows, between the tab and the status box, with animated noise dithered into braille dots of one color, the palette's `faint` unless `color` sets it. `"simplex"` is Paper's simplex shape, two layers of noise drifting past each other, and `"warp"` is noise folded through itself. Ops Control draws it live, 10 frames a second by default, and holds it still under `/ops motion reduced`. The inline drawer has no open rows, so it shows no field.

  The object form takes the knobs of [Paper's dithering shader](https://shaders.paper.design/dithering), so a `simplex` look tuned there carries over: `speed` (0 to 4), `scale` (0.05 to 4, smaller is finer), `rotation` (degrees), `offsetX` and `offsetY` (-1 to 1, in the pane's shorter side), `density` (0.2 to 2), `warp` (0 to 8, the `warp` shape only), `size` and `dither` (`2x2`, `4x4` or `8x8`). The pane's height stands for Paper's 720 px canvas, so copy `scale`, `rotation` and the offsets as they are. Paper's front color is `color`; its back color is the terminal background. `fps` (1 to 12) sets the frame rate.

  `size` is not Paper's: it counts braille dots per side of one dither pixel, from 1 to 4. A 24-row pane is 96 dots tall, where Paper's 720 px canvas at size 3 is 240 dither pixels tall, so leave `size` at its default of `1` to come closest to Paper.

  ```json title="a simplex field"
  "motion": { "field": { "shape": "simplex", "speed": 0.3, "scale": 0.36, "rotation": 24, "offsetX": -0.22, "offsetY": 0.26, "dither": "4x4" } }
  ```

  The field has a cost: Claude Code repaints all of it every frame. On an 88×24 pane at 10 frames a second it takes about a quarter of one CPU core more than the same pack without a field. A slow field looks the same at a lower `fps`.

A [renderer plugin](packs.md#drawing-with-a-plugin) that answers for the pack draws its own version in place of these.

## Spinners

| Id | Cells | Looks like |
| --- | --- | --- |
| `stock` | Claude Code's | Claude Code's own line, untouched. |
| `comet` | 3×2 | A comet circling a faint ring, in braille dots. |
| `eyes` | 9×2 | Two eyes that look around and blink, in half blocks. |
| `orb-states` | 4×2 | A braille orb whose motion follows the activity: thinking, searching, working, running, agents. |
| `clawd` | 5×2 | Clawd waving, in his own color. |
| `shimmer` | 1×1 | A still `✻` with a shimmering word. |
| `scanline` | 10×1 | A bright sweep across a bar, and the spinner word lights as it passes. |
| `ring` | 6×2 | A bright braille arc with a fading tail circling an oval. |
| `glitch` | 1×1 | A still `◆` with a glitching word. |
| `signal` | 10×2 | A braille wave trace that scrolls and is brightest at its right edge. |

The shimmer is a wave of color across the spinner word, between the gradient's two colors, or the accent and text colors when there is no gradient. `1` is soft and `2` is fast.

A non-stock spinner replaces Claude Code's whole spinner line, and Claude Code gives a mod no way to show its token count there, so the line shows elapsed time and `esc to interrupt` instead. The `stock` spinner keeps the token count. While Claude Code shows its own message, such as `Compacting conversation…`, its line is shown instead of the pack's.
