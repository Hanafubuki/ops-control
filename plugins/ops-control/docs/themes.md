---
title: Making a theme
description: Write a theme file, try it, and share it with other people.
---

A theme is the color part of a [pack](packs.md). Applying a theme with `/ops theme <name>` recolors the pack you are using and keeps its row style, borders and extras. Besides colors, a theme can set the spinner words, the heart characters and the small glyphs Ops Control puts on tool rows.

Ops Control ships seven themes. `classic`, the default, uses Claude Code's own colors; the others are `ops-control`, `aurora`, `dusk`, `cyberpunk`, `vaporwave` and `high-contrast`. Themes color Ops Control's text and leave the terminal background alone.

## Making one

A theme is a JSON file (comments allowed) in `~/.claude/ops-control/themes`, or `$CLAUDE_CONFIG_DIR/ops-control/themes` if you set that variable. The file name is the theme's name, so `sunset.json` is applied with `/ops theme sunset`.

You only need to write what differs from an existing theme: name it in `extends` and Ops Control fills in the rest. A theme without `extends` starts from `classic`.

This one starts from `vaporwave`, changes six colors, and sets its own spinner words, hearts and two glyphs:

```jsonc title="~/.claude/ops-control/themes/sunset.json"
{
  // The name is what `/ops theme add` uses to save the file.
  "name": "sunset",
  "extends": "vaporwave",

  "colors": {
    "accent": "#ff8a4c",
    "text": "#fff1e6",
    "dim": "#b89a8c",
    "faint": "#4a2f2a",
    "read": "#ffd166",
    "fail": "#ff5d73"
  },

  "spinner": { "words": ["Basking", "Setting", "Glowing"] },

  "glyphs": { "edit": "✦", "agent": "❖" },

  "band": { "hearts": ["♦", "♢"] }
}
```

Every field is optional. The [theme reference](theme-reference.md) lists them all with their limits.

## When it does not load

If something in the file is wrong, `/ops theme <name>` prints the reason and keeps your current theme; at session start, Ops Control falls back to `classic` and shows the reason in a notice. The usual causes are a color that is not written as six hex digits (`#d77757`, not `#d77`), a glyph that is an emoji or more than one character, a trailing comma, or a spinner word over 24 characters.

## Sharing

Host the file anywhere it can be fetched over `https://`, such as a gist. Anyone can then install it:

```text title="claude code"
/ops theme add https://example.com/sunset.json
/ops theme sunset
```

For `theme add` the file needs a `"name"` of lowercase letters, digits and dashes that is not one of the built-in names. A theme is plain data limited to 64 KB, so installing one cannot run code, and Ops Control rejects characters that could move the cursor or hide text.

To get a theme included in Ops Control itself, open a theme submission issue on GitHub with the file and a screenshot, or a pull request that adds it.
