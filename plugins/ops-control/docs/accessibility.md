---
title: Accessibility
description: Reduced motion, the high-contrast theme, narrow terminals and terminals without color.
---

## Reduced motion

`/ops motion reduced` (or the `reducedMotion` setting, or the Motion row in `/ops config`) stops all of Ops Control's animation. The spinner goes back to Claude Code's own, with its own words and no shimmer, Clawd is hidden, and running subagents show a still mark instead of a spinner. Your pack's colors and row styles stay. `/ops motion full` turns animation back on.

Ops Control cannot follow your operating system's reduced-motion setting, because Claude Code does not pass it to mods, so it has to be turned on here.

With motion on, nothing flashes more than 2.5 times a second, color flashes last at least 400 ms, and Clawd's frames change at most every 80 ms. Elapsed times still count up once a second under reduced motion.

## High contrast

`/ops theme high-contrast` switches to pure white text, light grey secondary text and fully saturated colors for each kind of action. To adjust it, write a theme that extends it:

```json title="my-contrast.json"
{ "name": "my-contrast", "extends": "high-contrast", "colors": { "accent": "#00ffff" } }
```

## Narrow terminals

Under 80 columns Ops Control switches to compact forms of the band and the drawer. A line that does not fit ends in an ellipsis. See [Layout](layout.md).

## Without color

No state is shown by color alone. The band names the action in words (`Editing`, `Running`), passes and failures carry `✓` and `✗` with a count, a request for your approval says `Needs you`, and added and removed lines are marked `+` and `−`. Full and empty hearts (`♥` and `♡`) and plan states (`✓`, `◉`, `○`) differ in shape as well as color.

## Screen readers

The band, the pane and the status entry are plain text. Clawd and the animated spinners are made of block and braille characters, which a screen reader may read out as symbols; `/ops motion reduced` hides Clawd and switches to the stock spinner.
