---
title: Theme reference
description: Every theme field with its type, default, limits and validation rules, plus the values of the built-in themes.
---

## File format

A theme is a JSON file with comments allowed. Ops Control accepts `//` line comments and `/* */` block comments. Trailing commas are not allowed.

| Rule | Value |
| --- | --- |
| Location | `~/.claude/ops-control/themes/<name>.json`, or `$CLAUDE_CONFIG_DIR/ops-control/themes/` when that variable is set |
| Extension | Only files that end in `.json` are read |
| Theme name | The file name without `.json`. The `name` field is used only by `/ops theme add`. |
| Size limit | 65536 bytes (64 KB) |
| Top level | Must be a JSON object |
| Unknown top-level keys | Ignored |
| Unknown color roles and glyph keys | Skipped, with a notice |

A theme made for a later 1.x may use a color role or a glyph key this release does not know. Ops Control skips it, shows a notice that names the key and its path, such as `theme "mine": unknown key "colors.glow" skipped`, and loads the rest. A key it knows with a bad value is still an error.

A file in the folder with the name of a built-in theme replaces that theme for you.

## Fields

| Field | Type | Default | What it does |
| --- | --- | --- | --- |
| `name` | string | none | The name `theme add` saves the file under. Lowercase letters, digits and dashes, 1 to 40 characters, starting with a letter or digit. Not a built-in name. |
| `extends` | string | none | Name of the theme to build on. See [The extends chain](#the-extends-chain). |
| `colors` | object | `classic` colors | Colors by key. Each value is `#rrggbb`. |
| `spinner.words` | array of strings | `["Thinking"]` | Words for the spinner. See [Spinner words](#spinner-words). |
| `glyphs` | object | `classic` glyphs | One glyph per tool kind. |
| `band.hearts` | array of two strings | `["♥", "♡"]` | The full and empty heart in the context meter. |

## Colors

Every value must match `#rrggbb`: a hash and six hex digits, upper or lower case. Short forms like `#fff` are refused. An unknown key is skipped with a notice: `unknown key "colors.<key>" skipped`. A bad value is an error: `color "<key>" must be #rrggbb`.

| Key | Used for |
| --- | --- |
| `accent` | plan item, progress pips, plan glyphs |
| `text` | main text |
| `dim` | secondary text, separators, empty hearts |
| `faint` | empty bar parts, box and section borders |
| `read` | read & search rows, running subagent work |
| `edit` | edit rows, context warnings |
| `shell` | shell rows |
| `agent` | subagent rows |
| `pass` | passing tests, finished subagents, added lines |
| `fail` | failures, full hearts, removed lines |
| `panel` | the background fades blend toward |
| `addBg` | background of added lines in the Diff tab |
| `delBg` | background of removed lines in the Diff tab |
| `sel` | not drawn yet |

Percentages in the status line read in `pass` below `meter.warn`, `edit` from it, and `fail` from `meter.danger` (50 and 80 unless you change them with [`/ops setup`](commands.md#setup)).

## Glyphs

Glyphs are the marks Ops Control adds to a tool row after the call finishes. The keys are `read`, `search`, `edit`, `shell`, `agent` and `plan`. A tool of any other kind gets no glyph.

Each glyph, and each heart, must be exactly one character in the Basic Multilingual Plane (U+0000 to U+FFFF) that is one cell wide. Ops Control refuses:

- Control characters (U+0000 to U+001F, U+007F to U+009F).
- Zero-width and bidirectional marks (U+200B to U+200F, U+2028 to U+202F, U+2060 to U+206F, U+FEFF).
- Surrogates (U+D800 to U+DFFF).
- Wide East Asian characters, which take two cells.
- Anything above U+FFFF, which includes emoji.

An unknown glyph key is skipped with a notice: `unknown key "glyphs.<key>" skipped`. Errors: `glyph "<key>" must be one width-1 character`, `"glyphs" must be an object`, and `band.hearts must be two width-1 characters`.

## Spinner words

`spinner.words` is an array of strings. Each string can be at most 24 characters. Ops Control rejects a word that contains control, bidirectional or zero-width characters. An empty array is ignored and the parent's words stay. A bad value is an error: `spinner.words must be short strings`.

Ops Control picks one word at random at the start of each turn and uses it for the whole turn. A theme named `classic` keeps Claude Code's own rotating words, so `classic` ignores its words. With reduced motion on, every theme keeps Claude Code's word. Ops Control can change the word only; the spinner frames are Claude Code's.

## The extends chain

`extends` names another theme: a built-in, or a file in your themes folder. Ops Control resolves it like this:

1. It starts from the `classic` values.
2. It follows `extends` to the end of the chain, then applies the files from the root of the chain down to your theme.
3. Within each file, `colors` and `glyphs` replace only the keys they set. `spinner.words` and `band.hearts` replace the whole value.

A theme with no `extends` still starts from `classic`, so any field the file leaves out takes the `classic` value.

Every file in the chain is validated. Errors:

| Message | Cause |
| --- | --- |
| `theme "<name>": no theme named "<other>"` | `extends` names a theme that does not exist. |
| `theme "<name>": "extends" loops: a -> b -> a` | The chain comes back to a theme already in it. |
| `theme "<name>": "extends" must be a theme name` | `extends` is not a string. |
| `theme "<name>": a theme must be a JSON object` | The file is not an object. |

When any of these happen, `/ops theme <name>` prints the message and keeps your current theme. At session start, Ops Control shows the message and uses `classic`.

## Built-in themes

`classic` is the default theme. `ops-control`, `aurora`, `dusk`, `cyberpunk`, `vaporwave` and `high-contrast` extend `classic`. They set all 14 colors. All of them except `high-contrast` set spinner words.

| Key | Ops Control | aurora | dusk |
| --- | --- | --- | --- |
| `accent` | `#ffc857` | `#5ef1c6` | `#b69cff` |
| `text` | `#ece6f2` | `#e2eef2` | `#e6e6f6` |
| `dim` | `#8e86a0` | `#7f97a3` | `#8a8cad` |
| `faint` | `#2f2a3a` | `#22313b` | `#272a44` |
| `read` | `#8ecbff` | `#7cc7ff` | `#7fd6ff` |
| `edit` | `#ffa94d` | `#ffd479` | `#ffcf7a` |
| `shell` | `#7ee0a1` | `#5ef1c6` | `#8ef0b0` |
| `agent` | `#c9a7ff` | `#b49cff` | `#ff9ad5` |
| `pass` | `#7ee0a1` | `#5ef1c6` | `#8ef0b0` |
| `fail` | `#ff6f7d` | `#ff7a8a` | `#ff7088` |
| `panel` | `#1d1924` | `#131c23` | `#171a2b` |
| `addBg` | `#1d3326` | `#123329` | `#18322a` |
| `delBg` | `#3f1f27` | `#3a1d26` | `#3b1f2f` |
| `sel` | `#2a2433` | `#1c2933` | `#222640` |

| Key | classic | cyberpunk | vaporwave | high-contrast |
| --- | --- | --- | --- | --- |
| `accent` | `#d77757` | `#ff2bd6` | `#ff71ce` | `#ffff00` |
| `text` | `#e4e4e7` | `#e4dcff` | `#ffe3f6` | `#ffffff` |
| `dim` | `#8b8b94` | `#7d7398` | `#a08bc0` | `#d0d0d0` |
| `faint` | `#3a3a42` | `#2d1f45` | `#4a2d70` | `#808080` |
| `read` | `#7dc4e4` | `#00e5ff` | `#01cdfe` | `#00ffff` |
| `edit` | `#e5b567` | `#ffb000` | `#fffb96` | `#ffaa00` |
| `shell` | `#4eba65` | `#39ff88` | `#05ffa1` | `#00ff00` |
| `agent` | `#b39ddb` | `#b388ff` | `#b967ff` | `#ff80ff` |
| `pass` | `#4eba65` | `#39ff88` | `#05ffa1` | `#00ff00` |
| `fail` | `#ff6b80` | `#ff3b5c` | `#ff6b6b` | `#ff4040` |
| `panel` | `#1f1f24` | `#140c22` | `#24123f` | `#000000` |
| `addBg` | `#1f3a26` | `#0f3324` | `#123a3a` | `#003300` |
| `delBg` | `#4a2228` | `#3d1020` | `#4a1a3a` | `#440000` |
| `sel` | `#2a2a33` | `#24123a` | `#3a1d5c` | `#333333` |

Other values:

| Field | classic | Ops Control | aurora | dusk |
| --- | --- | --- | --- | --- |
| `spinner.words` | `Thinking` | `Glowing`, `Kindling`, `Polishing` | `Drifting`, `Shimmering`, `Charting` | `Dreaming`, `Musing`, `Wandering` |
| `glyphs` | `read ▸`, `search ⌕`, `edit ✎`, `shell $`, `agent ◆`, `plan ◇` | from `classic` | from `classic` | from `classic` |
| `band.hearts` | `♥` `♡` | from `classic` | from `classic` | from `classic` |

| Field | cyberpunk | vaporwave | high-contrast |
| --- | --- | --- | --- |
| `spinner.words` | `Jacking in`, `Compiling`, `Glowing` | `Vibing`, `Drifting`, `Glowing` | from `classic` |
| `glyphs` | from `classic` | from `classic` | from `classic` |
| `band.hearts` | from `classic` | from `classic` | from `classic` |
