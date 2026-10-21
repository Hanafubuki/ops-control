# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Every prompt you send is a request in the Plan tab, newest on top, with its status, milestones done of all and time worked. Click one to see what you asked, its status, objective and current milestone, every milestone, what was done (files, commands, tests, agents and Claude's answer), and the questions and action items left for you. Requests are saved per session for `claude --resume`.
- On Windows and under WSL the Music tab and player show whatever plays on the computer, a YouTube tab in a browser included, read from Windows' media sessions through Windows PowerShell, with the app's name in the header and the session's picture as the cover. Play, Prev, Next and seek act on that session.
- On Linux the Music tab reads any MPRIS player (a browser tab, VLC, mpv, Spotify) through busctl or playerctl: the one playing, else the one paused, named by its app. On macOS, with `media-control` installed (`brew install media-control`), it reads and controls Now Playing of any app; without it, Spotify through AppleScript as before.
- The work bar over the prompt (`/ops setup bar work`, the default; `bar band` brings back the one-row band): what Claude is doing toward the work's milestones, the step it is at and how long that step has run, then the milestones as a track, the context meter with the auto-compact point marked, and the 5-hour limit with its reset.
- The work bar's track ends with a time-left guess while Claude works (`2/4 · ETA ~6m`, `ETA --` until a milestone is done), worked out from the pace of the milestones done so far. Ops Control stamps when each milestone starts and finishes, and saves those times with the request. Without milestones it times Claude's task list the same way. With neither, it guesses from finished requests, this session's and earlier saved sessions', that ran longer than this one so far (drawn dim).
- Ops Control offers its own `milestones` tool, and tells Claude how to use it, while no other plugin (Control Room) offers one.
- Each request keeps its issues: failed calls nothing fixed yet, and refused calls. The request row shows the open count, its summary lists them with the ones fixed later, and the work bar shows the open count.
- A Guardrails tab: the project's rules for agents, read from CLAUDE.md, AGENTS.md, GUARDRAILS.md, `.claude/rules`, `.claude/agents`, skills, `agent_rules` and Cursor rules; with none, a default set (Ask first for installs, pushes and deploys; Never for force pushes and dangerous commands). Shown, not enforced.
- Requests made before Ops Control loaded in a session (turned on or reloaded mid-session, or resumed from before it kept a list) are read back once from the session's transcript.
- A prompt taken into another request's turn shows that turn's milestones and objective.
- `/opspin` pins notes over the prompt; `/opstask` files a Sidequest task without working on it. A fork started by `/subtask` shows in the Agents tab.

### Changed

- The Plan & context tab is two tabs: Plan, and Context, which holds the context box. A stored tab list that was the old default gains the Context tab.
- The Changes tab is gone: the Diff tab lists the same files. A stored tab list naming `changes` drops it without a notice.
- A request's summary counts its commands instead of listing them.
- The bundled engine types are this Claude Code build's (2.1.304).

## [1.2.0] - 2026-10-16

### Added

- `/ops music`, or `o: Player` on the Music tab, opens a music player: a pane with a bigger cover, the seek bar, the controls, Open Spotify (`o`) and Copy link (`c`), and on macOS a volume bar.
- `/ops spotify connect` connects your own Spotify developer app (Premium needed). The Music tab and player then follow playback on any device, show a heart to like the track (`l`) and the next track in your queue, and fall back to the local app while the Web API is not answering. Windows gets the player this way. See docs/spotify.md.
- With Spotify connected, the music player lists Up next, Recent, Playlists and Devices (`1` to `4`). Enter skips forward to a queued track, replays a recent one in its playlist or album, starts a playlist, or moves playback to another device.
- The Pets page and the landing page show Clawd dancing to music and his two idle variants.

### Changed

- The ghost and the robot walk left with hand-drawn frames instead of a mirrored right walk, so they stay lit from the top left like Clawd.

### Fixed

- The landing page's hop, fail and scrunch cards replay instead of freezing on their last frame.

## [1.1.0] - 2026-10-12

### Added

- The status line can span two lines: a `/` in the field list starts the second one (`/ops statusline fields activity ctx / 5h week`). The `/plugin` setting takes it as an item, and `/ops config` shows it as a movable "line 2" item. The entry under the prompt stays one line and joins both halves.
- `/ops setup pet.dance off` stops the pet dancing while Spotify plays. The config TUI and the in-pane config have a matching row.
- The Music tab shows the album cover beside the track, drawn in half-block pixels by Ops Control's helper binary, which downloads on first use.
- Click the Music tab's progress bar to jump to that point in the track, or drag along it.
- Shuffle (`s`) and repeat (`e`) buttons on the Music tab, for the local Spotify app on macOS. On Linux the card shows the state, but Spotify ignores those writes over MPRIS, so the buttons are left out.

## [1.0.1] - 2026-10-12

### Changed

- Pack, theme and pet files now load when they hold a key or value a later 1.x added. Ops Control skips it and shows a notice that names the key and its path, instead of refusing the file or the layer. This covers unknown keys at every level, unknown values of the pack enums (`rows`, `border`, `meters`, `shimmer`, `field`), unknown theme color roles and glyph keys, and unknown pet animations, moments and flavours. A `format` newer than Ops Control reads is still refused, and a known key with the wrong type is still an error.
- The reserved `sound` and `voice` pack keys must be objects; any other value is ignored with a notice.
- `/ops pack <name>` applies a pack that only produced notices, and prints them after the result. Notices show where you act (the command or a link import), not again at every session start; a layer that falls back to classic still toasts its error.

### Fixed

- An older Ops Control no longer overwrites data a newer one saved. A level or outfit record with a newer format is left as it is: no XP is added, no outfit is worn, and `/ops level` and `/ops outfit` say so. A setup with a newer format is shown as far as it can be read and refuses `/ops setup` and a studio link's setup; a format 4 setup keeps keys a later release added, at the top level and inside `meter`, `bubbles` and `pet`, when it is rewritten.
- A `/plugin` setting that a later release adds no longer replaces your `/ops` choice the first time you upgrade. Ops Control records its value and applies nothing.

## [1.0.0] - 2026-10-12

### Added

- `/ops outfit` lists a pet's level outfits, `/ops outfit <name>` wears an unlocked one and `/ops outfit off` takes it off. Clawd, the robot, the ghost and the egg each have three, unlocked at levels 3, 6 and 8, and a level-up wears the newest one. A Santa hat, party hat, nightcap or the dance headphones keep the head while they last.
- Idle variants. A pet sheet may carry `idle2` and `idle3` as rows 13 and 14; from level 5 the pet plays `idle2` in place of `idle` about one time in eight when it settles, and from level 10 either variant. 12-row sheets stay valid, and the studio and PNG import take 1 to 14 rows, with only `idle` required.

## [0.13.0] - 2026-10-11

### Added

- The ghost, a new built-in pet beside Clawd and the robot: `/ops pet ghost`. It has the full set of reactions, its own dance, and headphones while Claude works.
- Clawd, the robot, the ghost and the egg each speak in their own voice, with about six lines per moment.
- Four new bubble moments: `green` (a passing test run after a failed one), `hello` (when the pane first opens in a session unless another bubble spoke first, and when a turn starts after 30 minutes away), `long-done` (a turn of 5 minutes or more) and `compact`.
- Lines that join the pool by time of day, on Fridays, and at Christmas, Halloween and your install anniversary.
- A Music tab in the pane shows the track playing in the Spotify desktop app with a progress bar and Prev, Pause and Next buttons (`r`, `p`, `n`). It reads the app on your machine through `busctl` or `playerctl` on Linux and `osascript` on macOS, so it needs no login. Windows is not supported.
- Pets dance while Spotify plays, with a speaker beside them, and wear headphones while Claude works. Clawd, the robot and the egg have their own dances; a custom pet without one keeps its idle and working poses.
- A `music` status line field, `♪ Title — Artist`, off by default.
- Pet files with `"format": 2` can carry `lines` and a Haiku `voice`. Ops Control 0.12 and earlier refuse them.
- Levels. Answered turns, combos, passing tests and commits Claude makes earn XP, shared by all pets and kept across sessions. Level 2 unlocks new lines; the outfits and moves up to level 10 are earned now and arrive in a later release. `/ops level` shows your progress, the opt-in `level` status field draws `Lv 7 ▰▰▰▱▱`, and the pane shows an XP bar on the activity row.
- The `level-up` bubble moment, the eighth, replaces the done line on the turn that reaches a new level and names the unlock. It never uses Haiku.
- Pet files can add lines by level with an `@lvN` key suffix, such as `done@lv4`, and `level-up` lines can use `{unlock}`.

### Changed

- The pet scrunches after `/clear` as it does after a compaction.
- The default `bubbles.moods` includes all eight moments. A saved list that holds every moment its version knew, including the old default `needs-you,fail,done`, now counts as all moments, so new ones reach you. Any other list is kept.
- The default `tabs` setting gains `music`. A setup saved before this release that still holds the old default, `plan,agents,diff,changes`, gets it; typing those four tabs yourself keeps four.
- Haiku bubble lines speak in each pet's own voice instead of always as Clawd.
- The website's landing page and studio share one set of buttons, toggles, selects and popovers, and they all follow the pack you pick. The studio's selects open a themed list instead of the browser's own, and its Send to my Claude popover takes keyboard focus when it opens.

## [0.12.1] - 2026-10-08

### Fixed

- The `/ops config` window shows the robot and the egg, not only Clawd, and plays each pet's idle animation. With reduced motion on, the pet stands still. The egg is always drawn uncracked there.

## [0.12.0] - 2026-10-08

### Added

- `/ops config` opens a settings screen in its own terminal window, and changes show in the session as you make them. Esc undoes everything since it opened. It has been run live on Linux; the macOS and Windows launches are new and have not had a live run yet.

### Changed

- The in-Claude config pane is now `/ops config pane`, and still what `/ops config` opens in the desktop Code tab.

## [0.11.0] - 2026-10-07

### Added

- Four spinners: `scanline` sweeps a bright column across a checkered bar and on through the spinner word, `ring` circles nine dots round an ellipse, `glitch` flickers the spinner word's letters into blocks in the pack's `read` and `agent` colors, and `signal` scrolls an oscilloscope trace. Each speeds up or changes shape while commands run or subagents work. Pick one with `motion.spinner` or `/ops spinner <name>`.
- A `slab` row style: your prompt is a full-width bar in the pack's accent, numbered by turn; tool calls are numbered within the turn with the tool in capitals and `OK` or `FAIL` on the right; a short rule opens each reply.
- Hints that a secret pet exists: `???` in `/ops pet list`, and now and then a line from Clawd.
- A Diff tab shows this session's changes as themed hunks.

### Changed

- The pane's tabs now open on Plan & context: plan, agents, diff, changes.
- A commit drops the committed files from the Changes tab, and a finished plan folds to one line at the next prompt.
- The Changes and Diff tabs list the most recently changed file first.
- Long tabs scroll with the mouse wheel and the scroll keys instead of the `↑ more` / `↓ more` buttons.

## [0.10.0] - 2026-10-07

### Added

- A secret egg pet: click the pet in the pane and type the code to unlock it, then pick it with `/ops pet egg`. It wobbles while Claude works and gets a crack every 10 passing test runs, up to three.
- Clicking the pet in the pane makes it hop; the pet then has the keyboard until you press Esc.

### Changed

- `egg` is now a built-in pet name; an installed pet called `egg` needs a new name.

## [0.9.0] - 2026-10-07

### Added

- `/ops config` opens a config pane instead of a series of questions. Enter cycles the pack, spinner, pet, meter, bubbles and motion; color rows take an exact hex; band, tabs, bubble moods and status line fields take a typed list, which can also reorder them. A preview shows the look, and the pane can copy a studio link or reset everything to defaults.
- Packs can set `colors.glyphs`, `colors.hearts` and `colors.words`, and a studio link's setup can carry the status line fields. Older glowups refuse a pack that uses the new keys.
- Packs can recolor Clawd with `colors.pet` (`body`, `light`, `shade`). The shiny pet keeps its gold.
- The studio at glowup.khimani.dev/studio is a full-viewport page with collapsible Theme, Colors, Rows & meters, Motion, Status line and Setup sections. It has a color wheel, labeled color groups (Clawd's colors included), field knobs and status line fields, beside a live preview with working tabs. Copy a share link or a `/ops pack` command, or download `pack.json`; a link from `/ops config` opens there.
- A CRT-monitor robot joins Clawd as a pet: `/ops pet robot`.
- Your own pets: draw a PNG sprite sheet (see Pet sprites), convert it in the studio's new Pet section, and install it with `/ops pet add <file|url>` or a studio link. A studio link that carries a pet installs it and switches to it; `pet add` only installs. Installed pets show in `/ops pet list` and the config pane.
- The studio's stage draws the look's own field behind the preview.

### Changed

- The status line shows the effort level (`◐ high`) by default, as Claude Code's own footer does.

### Fixed

- After `/clear` the status line kept showing your previous one until the first prompt, because Ops Control only noticed the new session on the first turn. The heartbeat now picks up the new session within a minute, and Ops Control sets `refreshInterval: 30` on the status line it owns (a value you set yourself stays, existing installs included), so the line shows within about a minute and a half of `/clear`, and within 30 seconds of launch or a reload.
- A Ops Control restart in the middle of a session (a hot reload) wrote a status line without `ctx`, `5h` and `wk` until the next tool call or turn ended. It now reads them back at start.
- A studio link copied from `/ops config` while on a built-in pack was refused by `/ops pack`; the pack in it is now named `my-<pack>`.
- Pasting a `/ops pack` command longer than about 700 characters, which includes every studio link that carries a pet, sent it to Claude as a prompt instead of running it: Claude Code shows a long paste as `[Pasted text #N]` and does not read it as a slash command. Ops Control now runs a prompt that is only a `/ops` line.

## [0.8.1] - 2026-10-05

### Fixed

- A `simplex` field tuned in Paper's dithering shader looked nothing like it in the pane: Ops Control drew blocky value noise with its own contrast and framing. It now runs Paper's simplex noise, contrast curve and drift, with Paper's rotation and offsets and the pane's height standing for Paper's 720 px canvas, so `scale`, `rotation`, `offsetX` and `offsetY` copy across. Offsets are now measured in the pane's shorter side, and every dither matrix lights pixels in Paper's order. `size` still counts braille dots; keep it at `1` for a Paper look.

## [0.8.0] - 2026-10-05

### Added

- `/ops setup`: pick and order the band's parts and the pane's tabs, set when context and usage turn warning and danger colors, choose which moments get a speech bubble and how long it stays, and how soon the pet falls asleep. Your setup is never changed by installing a pack.
- `/ops pack <studio link>` installs a look straight from a Ops Control studio link, with nothing downloaded.
- `/ops color list` draws each color and says what it paints.
- `motion.field` takes a `simplex` shape and an object form with the knobs of Paper's dithering shader: `speed`, `scale`, `rotation`, `offsetX`, `offsetY`, `density`, `warp`, `size` and `dither`, plus `fps` and `color`. See [Effects](docs/pack-reference.md#effects).

### Changed

- The pane's context warning now appears at the danger threshold, 80% by default (it was 70%).

### Fixed

- The pane field stuttered on panes wider than about 60 columns and cost about half a second to build on every resize. Ops Control now draws it live, 10 frames a second by default, at a few milliseconds a frame.
- In the `cards` row style, a message's side bar sat alone on a line above the message, and tool cards had an empty line inside their top edge. In `retro`, the tool tag sat a line above the tool name. Each now lines up with the text.

## [0.7.0] - 2026-10-05

### Added

- Three effects a pack switches on from its JSON, so it still installs from a URL: `motion.field: "warp"` animates a dithered braille field in the docked pane's open rows, `colors.meters: "dither"` draws the 5-hour and weekly usage as dithered bars, and `colors.dividers: true` puts a numbered rule above each of your prompts. A renderer plugin that answers for the pack still takes precedence. See [Effects](docs/pack-reference.md#effects).

## [0.6.0] - 2026-10-05

### Added

- A pack can come with a companion plugin that draws parts of the look in code: an animated field in the docked pane's open rows, the meters in the status box, and a rule above each of your prompts. Ops Control asks for them through the `ops.field`, `ops.meter` and `ops.divider` events, checks every answer, and falls back to its own drawing when nothing answers. See [Drawing with a plugin](docs/packs.md#drawing-with-a-plugin).

## [0.5.0] - 2026-10-05

### Added

- Ops Control shows a toast when a session runs an older copy than the one installed, for example after `claude plugin update`, and says to run `/reload-plugins`.
- The Plan & context tab says more about the context. The bar marks where auto-compact runs. A two-row braille chart replaces the sparkline and draws the auto-compact point as a dashed rule. A line under it gives the growth per turn and how many turns are left before auto-compact. The tab lists the three heaviest sources you can trim, such as an MCP server's tools, a `CLAUDE.md` or the skill listing, and shows the prompt cache hit rate.

### Changed

- The last change wins between the `/plugin` settings and the `/ops` commands. A value changed in `/plugin` is applied at the next session start or after `/reload-plugins`, as if you had typed the matching command; before, a saved `/ops` choice always won.
- `/ops config` ends on a card in the pack's look, with what you picked and three commands to try next, in place of the one-line summary.
- The README shows the Plan & context tab with its new context box.

## [0.4.1] - 2026-10-05

### Changed

- The README describes the 0.4 pane, Clawd's new reactions and the `/plugin` settings, and its screenshots and animation show the boxed pane.

## [0.4.0] - 2026-10-05

### Added

- Clawd juggles while three or more subagents run, crumples up a sheet of paper when the context is compacted, and pants while he stands or walks once the context window is 80% full.

### Changed

- The pane's tabs are drawn as boxes in the shape of your pack's border, and Plan & context has room to breathe: the loose divider is gone, rows line up, and free context is a solid faint track.
- Clawd stretches and yawns when he wakes up.
- While Claude waits on you, Clawd shows a `?` and has his own waiting animation, so it no longer replays the startle.
- The hearts beside the pet in the pane's status box show the usage you have left, the 5-hour or weekly limit, whichever is tighter. On an API key, where there are no limits, they give way to what the session has spent. The band's hearts still track context.

## [0.3.5] - 2026-10-05

### Added

- Pick the status line's fields and their order with `/ops statusline fields <ids>`, the `/ops config` "Status line fields?" question, or the `statusline` setting. New fields show your 5-hour and weekly usage with reset times, cost, model, running subagents, plan progress, branch, changes and folder. The status line Ops Control draws now uses your theme's colors; the entry under the prompt stays plain.

### Changed

- `/ops config` ends at Extras when you press Esc there, as on every other question.

### Fixed

- The Changes tab lists only files Claude edited or created. Files it only read no longer appear there, and the "done" speech bubble names an edited file.
- Haiku speech bubbles are no longer cut off mid-word or mid-sentence. A Haiku line that is too long or hit its token cap is dropped and the template line stays.

## [0.3.4] - 2026-10-05

### Fixed

- A long Changes, Agents or Plan & context tab no longer pushes Clawd and the status box off the bottom of the pane. The tab now scrolls inside the rows left over, with `↑ N more` and `↓ N more` buttons (hotkeys `k` and `j`).
- The installer prints `Checking Claude Code...` while it asks `claude` about its version and plugins, which takes a few seconds, instead of showing a blank terminal. If `claude` has not answered after 60 seconds, the installer stops and says so.
- The installer's pack list no longer disappears in xterm: unselected packs were drawn in a fixed light gray that matched xterm's white background. They now use the terminal's own text color.
- The installer no longer drops to 16 colors under `TERM=xterm`, which turned the preview pure blue, red and magenta. It uses 256 colors, or 24-bit when xterm says it has them.

## [0.3.3] - 2026-10-04

### Added

- Packs can set `colors.rowFlags`: `labels`, `markers` and `xp`, so any pack can drop the `you` and `claude` labels, mark rows with `▶` and `◆`, and show a `+N XP` tag above a reply.
- `/ops color`: list every color role with its hex, set one with `/ops color <role> <#hex>`, or clear with `/ops color reset [role]`. Overrides are saved and stay on top of any pack or theme, and `/ops export konsole` and `/ops pack save` use them.
- `/ops config` has a "Tweak colors" extra that asks for a role and a hex.
- The pack-making skill can change an existing pack or theme: it extends a built-in with only your changes, edits your own packs, and suggests `/ops color` for a small color tweak.

### Changed

- `arcade` marks your prompt with a pink `▶` and Claude's reply with a cyan `◆`, with no labels or bars, and shows `+N XP` above a reply after tool calls succeed.
- `cozy` keeps its bars and no longer shows the `you` and `claude` labels.

## [0.3.2] - 2026-10-04

### Fixed

- Restyled tool rows draw again. Claude Code refused them because of a box setting around its own row, so every tool row fell back to the stock look.
- The pane and band no longer fail to draw after an update or reload when the saved state comes from an older Ops Control.
- Updating Ops Control no longer shows the "Ops Control is loaded twice" toast or turns the new version off.

## [0.3.1] - 2026-10-04

### Added

- Speech bubbles written by Haiku. `/ops bubbles haiku`, the `bubbles` setting, the config questions and the installer's `--bubbles haiku` turn it on. It is opt-in: each line is a small Haiku call on your account, at most one per turn and one per 90 seconds, built from Ops Control's own state only, with the template line as the fallback.

### Fixed

- "Needs you" no longer shows when nobody is being asked, as in auto mode. Ops Control used to guess the permission mode from the footer labels, which never name it, so it always guessed "ask". It now alerts only when Claude Code actually opens a permission dialog in a mode that asks you, and stays quiet when unsure.
- In auto mode Ops Control does not alert, even when the auto-mode check hands a call to you. It alerts only for a dialog Claude Code opens, and not when another hook has already decided the request.
- Speech bubbles wrap onto a second line in the pane instead of running past the edge. A Haiku line that arrives late now shows for the full 3 seconds instead of a blink, and Haiku is told only the kind of work, never a command, path or search pattern.
- The plan tab reads the newest 200 task files, so a long-running list no longer hides the task in progress.
- Clawd keeps his working pose while subagents run, including after the main turn has ended and while you view a subagent's transcript.
- `/ops pack`, `theme`, `pet`, `bubbles`, `motion`, `statusline` and `import` with no argument now show the current setting or how to use them, instead of "Unknown" and the help card.
- The Plan & context tab shows Claude Code's saved task list. It loads when the session starts and again after each `TaskCreate` or `TaskUpdate`, so tasks from earlier sessions no longer leave the plan empty.

### Changed

- The context section has a new chart: one stacked bar with a colored segment per part of the context, a wrapping legend, and a sparkline of the percent over the session with the peak and compactions. The plan and context sections now have ruled headers and a divider between them.

## [0.3.0] - 2026-10-04

### Added

- A one-line installer: `curl -fsSL https://glowup.khimani.dev/install.sh | sh`. It previews each pack while you pick a pack, a pet and extras, then installs the mod with `claude plugin`. Each release now carries the installer for Linux and macOS, and a Windows download.
- The installer lets you pick a pack's colors and spinner on their own, and shows Clawd and a wider preview while you choose. It also takes `--theme` and `--spinner`, backed by a new `spinner` setting for the mod (`pack`, the default, keeps the pack's own; `/ops spinner` still wins).
- A pack-making skill ships with Ops Control: ask your agent for a Ops Control pack from a mood, palette, image or terminal scheme.
- `/ops export konsole` saves your current colors as a Konsole color scheme you can pick in your profile.

### Changed

- Clawd's nightcap now shows from 23:00 to 04:59, and a failed test run gives him the sweat drop until your next prompt.
- The `cards` row style now puts your prompts and Claude's replies on a side bar instead of a box, and draws tool calls in a dim box.
- Clawd's done dance now lasts 4 seconds instead of 1.5.
- Chat rows in every row style except `classic` now keep a one-column margin on the left.
- In the `retro` row style, the `[YOU]` tag now sits on its own line above your prompt, and bodies are indented 3 columns instead of 9.
- `/ops config` now asks which spinner you want, right after the pack, and the summary line names a spinner you set.
- Ops Control's own spinner now sits 2 columns in from the left edge instead of touching it.
- The docs site moved to https://glowup.khimani.dev.
- The installer sends an installed Ops Control only the settings that version has (it failed on one without `spinner`) and says which picks it skipped. It also refuses to install while another Ops Control copy is loaded.

### Fixed

- Two copies of Ops Control in one session (installed plus `claude --plugin-dir .`) showed false "Needs you" alerts. Now one copy stays on (a `--plugin-dir` copy wins) and the other turns itself off with a toast. Old status files are cleaned up, and session ids are cleaned before they reach a file name.
- Ops Control's status line script could call itself when two copies of Ops Control were loaded, starting shells until the machine ran out of memory. It now never falls back to itself, and the first-run question no longer takes over a status line Ops Control already draws.
- Tool results no longer clip at the right edge, and the `[ OK ]` mark no longer wraps, because rows now take less width around Claude Code's own output.

## [0.2.2] - 2026-10-04

### Added

- `/ops spinner <name|list|default>` sets just the spinner on top of the current pack, lists the spinners, or goes back to the pack's own.

### Changed

- `/ops` now shows a short card with the five commands most people need, drawn in your pack's colors on the terminal and desktop app. `/ops help all` lists every command in groups.
- Clawd now falls asleep after one minute with nothing happening, not ten.
- `/ops config` offers "Keep <name>" first when your look is a user pack or has a theme or spinner on top, so you can move on without losing it. Picking an unchanged pack or pet no longer rewrites your saved settings, and an old summary row keeps the colors of the pack it names.
- `/ops config` now asks up to three questions (pack, pet, extras) instead of opening a settings view in the pane. Each answer applies at once, Esc stops, and the command ends with a one-line summary. The spinner and per-layer pickers and the save-as-pack field are gone from it; `/ops pack save <name>` still saves a look.

## [0.2.1] - 2026-10-04

### Fixed

- "Needs you" and Clawd's alert pose no longer show in auto, bypass and don't-ask modes, where no dialog opens.
- The docked pane now pushes the status box and Clawd to the bottom instead of leaving them right under the tab content.
- Clawd now walks sideways along the pane instead of stepping in place.

## [0.2.0] - 2026-10-04

### Added

- Themes: three new presets, `ops-control`, `aurora` and `dusk`.
- Packs: one name or `https://` URL sets a whole look in two layers, colors and motion. Four built-in packs: `classic` (still the default), `crt`, `cozy` and `arcade`. Commands: `/ops pack`, `pack list`, `pack save`.
- Row styles for your prompts, Claude's replies and tool calls: `classic`, `cards`, `minimal` and `retro`, plus an optional HP bar and COMBO tag.
- Pack spinners (`comet`, `eyes`, `orb-states`, `clawd`, `shimmer`) and a shimmering spinner word.
- `/ops import <file>` turns a Ghostty or base16 color scheme into a pack.
- Clawd, a pixel pet at the bottom of the Ops Control pane, with reactions to work, tests and requests for you, and a one-row form in the narrow drawer. `/ops pet clawd|off`.
- Speech bubbles for Clawd. `/ops bubbles on|off`.
- Easter eggs, including a shiny Clawd and a few outfits.
- A first-run question that asks once whether Ops Control should draw the status line. `/ops statusline restore` undoes it.
- `/ops config`, an interactive settings view in the pane with a live preview.

### Changed

- Ops Control redraws only what changed, driven by state, instead of redrawing every hooked row on each event.
- Reduced motion now also means the stock spinner, no shimmer and no pet.
- Types and CI moved to Claude Code 2.1.289.

## [0.1.0] - 2026-10-04

### Added

- Cockpit pane with three tabs: Changes (files Claude touched, with line counts from git), Agents (subagents and what each is doing) and Plan & context (the task list and what fills the context window).
- Activity band above the prompt: what Claude is doing, running subagents, context hearts and plan progress.
- Themes: four presets (classic, cyberpunk, vaporwave, high-contrast), user theme files that extend them, and `/ops theme add <url>` to install one.
- Theme-driven spinner words and tool glyphs on finished tool rows.
- A status entry while Claude works, and an opt-in takeover of the status line (`/ops statusline on`, undone by `/ops statusline restore`).
- The `/ops` command for themes, the pane, motion and the status line.
- Reduced motion, from the plugin setting or `/ops motion reduced`.
