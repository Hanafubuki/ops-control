# Ops Control launch video

A 34 s product video built entirely in code, styled as an 8-bit game ("Clawd's game"). Nothing in
it is captured: the Claude Code session, the Ops Control pane, the spinners and Clawd are drawn each
frame from Ops Control's own data. There are no captions anywhere; everything you read is the
session itself, Clawd's bubbles, the game HUD, or the title and high-score screens.

```
just demo-editor    # live preview in the Revideo editor
just demo-render    # out/launch.mp4 (1920x1080) and out/launch-square.mp4 (1080x1080)
```

`just demo-stills` renders the README's pane images (`pane-wide.png`, `agents.png`, `context.png`, `compact.png`) into `docs/assets`: the classic pack on the bare `Screen`, no HUD or camera, one frame each (`src/scenes/stills.tsx`).

Render one file with `pnpm render launch.mp4` (or `launch-square`). The render runs headless
Chromium (it uses `/usr/bin/chromium`; set `CHROMIUM=/path` to override) and ffmpeg, one worker.
`demo-render` wraps it in `systemd-run` with a 6G memory cap.

## The storyboard

`src/scenes/launch.tsx`, one scene:

1. Title: OPS_CONTROL over the dimmed session, PRESS START blinks, Clawd walks on, a pixel dissolve lights the session.
2. Turn 1: the prompt is typed at human cadence, Claude's reply streams, Read and Edit rows land, Clawd works, the Changes tab fills.
3. A failed `just test`: focus on the row, then on Clawd and "ouch, 1 failed"; a heart blinks and goes dark.
4. The fix passes: focus on the `+40 XP` tag, the XP bar fills, LEVEL UP flashes the HUD, Clawd hops, "all done".
5. The Plan & context tab, then `/ops pack crt` and back to arcade; the session repaints in place through a pixel dissolve.
6. High scores over the dimmed session; the install line is the INSERT COIN line; Clawd dances.

## Camera and effects (`src/game.tsx`)

- Game camera: the terminal is the world. It cuts between 1x (15 px per terminal cell) and 2x (30 px) and
  pans to the beat, clamped to the terminal edges. No drift, tilt or blur. The HUD is screen-fixed.
- Focus is a spotlight: a flat dither (one pixel in four, a checkerboard, then flat dark) steps in over
  six frames around the focused rectangle, which gets a 4 px frame.
- Everything outside the terminal text is `fillRect` on a 4 px grid: HUD, hearts, plates, ground, dissolve.
- The square cut uses the real narrow layout (the pane becomes a drawer under the chat, Clawd is his one-row
  glyph) and re-frames each beat; the HUD drops its XP number.

## Where the pictures come from

- Pack colors, themes, spinner frames: `installer/internal/packs/packs.json`; the arcade pack's row flags
  (`▶` you, `◆` Claude, "+N XP" above the reply) from `hooks/packpresets.ts`.
- Clawd: `hooks/sprites/clawd.ts`. Its pixel rows are drawn as canvas rectangles and animated from the sheet's
  own frame timings. In the docked pane a sprite pixel is exactly 15 x 16 screen pixels.
- The pane: `hooks/pane.tsx`, `hooks/ctxchart.ts` (re-implemented in `src/pane.tsx`: importing it drags in
  `layout.tsx`, which this project's JSX settings cannot type), `hooks/trend.ts` (imported as is), `hooks/tasks.ts`, `hooks/band.tsx`.
  The video draws the arcade HP bar as three flat colour bands instead of the mod's gradient.
- Clawd's speech bubbles: `say(mood, index)` in `src/data.ts` fills a template from `CLAWD_SAY` in
  `hooks/bubbles.ts` and throws if the line does not exist.
- Fonts: JetBrains Mono from `@fontsource/jetbrains-mono` for the session; Press Start 2P (CodeMan38, SIL OFL 1.1)
  in `fonts/` with its `OFL.txt`, from github.com/google/fonts `ofl/pressstart2p`, for the game layer. Use it at
  multiples of 8 px so its pixels land on the screen grid.

## How it is built

| file | job |
| --- | --- |
| `src/scenes/launch.tsx` | the storyboard and the camera |
| `src/game.tsx` | HUD, spotlight, dither veil, pixel dissolve, hearts, ground |
| `src/term.tsx` | bare terminal grid, conversation rows per pack style, spinner |
| `src/screen.tsx` | Claude Code screen: prompt, spinner, docked pane or drawer, Clawd's bubble |
| `src/pane.tsx` | the Ops Control pane's tab rows, status box and band |
| `src/pixels.ts` | Clawd's sprite node and animation player |
| `src/stage.tsx` | the per-frame loop |
| `src/look.ts` | the colors of one window as tweenable signals |

Everything that changes per frame is updated from one loop in `Stage.run`, driven by the scene clock, so any
frame renders the same regardless of where playback started. The conversation scrolls by page: a beat
clears the rows and redraws the ones still on screen.

## Tooling choices

- **Revideo 0.11.0** (MIT, fork of Motion Canvas with headless rendering). Last release 2026-07-10, renders
  headlessly on Linux through puppeteer. Motion Canvas (MIT) was the fallback; its last npm release is from
  February 2025, so Revideo wins. Remotion was dropped by the owner's choice.
- Versions are pinned exactly in `package.json`.
- pnpm 10+ blocks dependency build scripts by default; `pnpm-workspace.yaml` lists the ones this project needs.
  Install with plain `pnpm -C demo install`: `--ignore-workspace` also skips that file, so the install stops on ignored build scripts.
  Puppeteer's own Chrome download is not needed when system Chromium is present
  (`PUPPETEER_SKIP_DOWNLOAD=1 pnpm install`).
- On a fresh `node_modules` the first render fails once while vite re-optimizes its dependencies; `render.ts` retries.
- `render.ts` remuxes each output to set sample_aspect_ratio 1:1 (the encoder leaves it unset).
