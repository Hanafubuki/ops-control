---
name: ops-control-pack
description: Use when the user asks for a new Ops Control pack, theme or look, wants a palette, color scheme, image, screenshot or mood turned into one, wants to change an existing pack, theme or color, or wants to change what Ops Control's status line shows, for example "make me a Ops Control theme", "turn this palette into a Ops Control pack", "make arcade less pink", "drop the labels in cozy", "show my usage limits in the status line".
---

# Make a Ops Control pack

A pack is one JSON file that sets a whole look: palette, transcript row style, spinner and shimmer. Every field and allowed value is in [reference.md](reference.md). Use only what it lists. Ops Control skips unknown keys and values with a notice and refuses bad values.

## Steps

1. **Source.** A mood or description, a palette, an image the user shows, or a terminal color scheme. If the request has none, ask for one in a single question. Otherwise do not ask.
2. **Terminal scheme file** (Ghostty or base16): run `/ops import <file>` first. It saves a pack with a palette and `bg`. Then edit that file for rows, spinner and contrast. Other formats, an image or a description: read the colors yourself and write the pack.
3. **Name.** Lowercase letters, digits and dashes, 1 to 40 characters, starting with a letter or digit, not `classic`, `crt`, `cozy` or `arcade`. Check `~/.claude/ops-control/packs` so you do not overwrite a pack the user made.
4. **Write** `~/.claude/ops-control/packs/<name>.json` (`$CLAUDE_CONFIG_DIR/ops-control/packs/` if set). Start the palette from a built-in theme with `colors.theme` and set only the colors that differ. Set `bg` to the user's terminal background if known. Pick `rows`, `spinner` and `shimmer` to fit the mood.
5. **Check contrast** and fix colors before you save. See below.
6. **Apply.** Tell the user to run `/ops pack <name>`. If it prints errors, fix the file from the message and ask them to run it again. To match the terminal background in Konsole they can run `/ops export konsole`.

For glyphs, hearts and spinner words, set `colors.glyphs`, `colors.hearts` and `colors.words` in the pack. A theme file (see Theme file in reference.md) is only for a reusable theme.

## Change an existing pack or theme

Built-in packs (`classic`, `crt`, `cozy`, `arcade`) and built-in themes live in Ops Control's code, so there is no file to edit. Do not write a file with a built-in's name: Ops Control ignores it.

1. **Small color tweak** ("make the accent greener", "dimmer text"): do not write a file. Tell the user to run `/ops color <role> <#hex>`. It is saved, sits on top of any pack or theme, and survives `/ops pack <name>`. `/ops color list` shows the roles, `/ops color reset [role]` undoes it. Use a file when the change is several colors, or anything that is not a color.
2. **Change a built-in**: write a new user pack that `extends` it and sets only the differences, for example `{ "format": 1, "name": "arcade-soft", "extends": "arcade", "colors": { "palette": { "accent": "#d46fb0" } } }`. `palette`, `extras`, `rowFlags`, `glyphs` and `pet` merge key by key; every other key you set replaces the parent's. The user needs `/ops pack arcade-soft` to apply it. To start from the look they have now, with their overrides, run `/ops pack save <name>`: it writes a self-contained file you can edit.
3. **Change one of their packs**: read `~/.claude/ops-control/packs/<name>.json`, edit it in place, keep every key you were not asked to change, and tell them to run `/ops pack <name>` again.
4. **What the pack can change**: `colors.palette`, `bg`, `border`, `borderColor`, `gradient`, `rows`, `extras`, `rowFlags` (`labels`, `markers`, `xp`), `glyphs`, `hearts`, `words`, `pet` (Clawd's `body`, `light`, `shade`), and `motion.spinner`, `shimmer`, `color`. `rowFlags.labels: false` drops the `you` and `claude` labels; `markers` swaps the side bar for `▶` (accent) and `◆` (`read`) in `cards`; `xp` adds a `+N XP` tag above replies in `cards`. A spinner alone can also be changed with `/ops spinner <id>`.
5. **Glyphs and spinner words** go in the pack: `colors.glyphs`, `colors.hearts`, `colors.words`, and `colors.pet` for Clawd's colors. Write a theme file `~/.claude/ops-control/themes/<name>.json` (`"extends": "<built-in or their theme>"`, only the `glyphs` or `spinner.words` you change) only when the user wants a reusable theme, and then set `colors.theme` to its name in the pack. Each glyph is one character, one cell wide.
6. **Check contrast** again for any palette color you changed, then have the user apply it.

## Status line fields

The status line fields are a personal setting, not part of a pack. They are an ordered list of ids, and the built-in default is `activity ctx effort 5h week`. A field with no data is left out.

| Id | Shows |
| --- | --- |
| `activity` | what Claude is doing: `◆ editing` |
| `ctx` | context used: `ctx 48%` |
| `5h` | 5-hour usage and reset: `5h 23% ↻2h10m` |
| `week` | weekly usage and reset: `wk 61% ↻Thu` |
| `cost` | session cost: `$1.24` |
| `model` | the model, as `/model` names it |
| `effort` | the effort level of Claude's last request: `◐ high` |
| `agents` | running subagents: `2 agents` |
| `plan` | plan progress: `plan 3/7` |
| `branch` | git branch |
| `changes` | lines added and removed: `+42 −7` |
| `cwd` | the project folder name |

When the person describes what they want on the line, tell them to run `/ops statusline fields <ids>` with the ids they describe, in the order they name them. "Show my usage limits and branch" becomes `/ops statusline fields activity 5h week branch`. `/ops statusline fields default` goes back to the default. An unknown id refuses the whole command and lists the valid ids. To put fields on a second line, tell them to add a `/` where it should start: "usage on its own line" becomes `/ops statusline fields activity ctx / 5h week`. Only one `/` is allowed.

Ops Control draws the whole line only after `/ops statusline on`. Without it, the fields show in the entry under the prompt while Claude works.

## Contrast

Check against `bg`, and against `panel` when `rows` is `cards`.

- `text` at least 4.5:1. `dim` at least 4.5:1. `faint` at least 3:1.
- `accent`, `read`, `edit`, `shell`, `agent`, `fail` at least 3:1 each, and no two of them close in hue and lightness. `pass` may equal `shell`.
- `text` at least 4.5:1 on `addBg`, `delBg` and `sel`.

Relative luminance of `#rrggbb`: for each channel `c` in 0 to 255, `s = c / 255`, then `lin = s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ^ 2.4`. `L = 0.2126 R + 0.7152 G + 0.0722 B`. Contrast is `(Llighter + 0.05) / (Ldarker + 0.05)`. Compute it with a short script, not by eye. If a color fails, move its lightness, keep its hue, and compute again.
