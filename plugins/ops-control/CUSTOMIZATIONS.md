# Ops Control: what it adds to glowup

Ops Control is [glowup](https://github.com/NovusEdge/glowup) v1.2.0, renamed and extended. This file lists everything added or changed since then, and explains how to make your own packs. The main [README](README.md) describes Ops Control as a whole.

To load the latest code into a running session:

```text
/reload-plugins
```

If the old behavior still shows after that, restart Claude Code.

---

## Commands

| Command | What it does |
|---|---|
| `/opstask <request>` | Claude **does** the request in this session (reads the code, runs read-only checks, works out the answer), then files the result as one Sidequest ticket. The ticket has the same layout as SQ-1: a `## Background` section, numbered steps (`## 1. …`) with the exact commands in code blocks and what a correct result looks like, labels, a priority, a short "why", and a manual check. Outside a folder with a Sidequest board, it asks which board to use. It can be typed while Claude is working; the work starts as soon as the session is idle. |
| `/opspin <text>` | Pins a note in a box above the prompt. Works mid-turn. |
| `/opspinclear` | Removes all pinned notes. |
| `/subtask` | A fork started this way shows up in the Agents tab. |
| `/ops statusline restore` | Removes Ops Control's status line (the `◆ running · ctx … · 5h … · wk …` row under the prompt) and brings back the one you had before, if any. `/ops statusline on` turns it on again. |

The `◆ running · ctx …` entry Ops Control adds under the prompt while Claude works is never shown in this copy. The status line takeover (`/ops statusline on`) still works if you turn it on.

## The pane

The tabs are Plan, Context, Guardrails, Agents, Diff, Music and Settings. The old Changes tab is gone: its file list is now at the top of the Diff tab.

### Keyboard
| Key | Where | What it does |
|---|---|---|
| **Alt+1 … Alt+7** | anywhere, the prompt included | switch to the 1st–7th tab and give the pane the keyboard |
| **← / →** | in the pane | previous / next tab (wraps around) |
| **↑ / ↓** | in the pane | previous / next control inside the tab; ↑ from the first control goes to the tab strip, ↓ from the strip goes into the tab; where there is no further control the tab's content scrolls |
| **1 … 7** | in the pane | jump to that tab |
| **Enter** | on a control | press it; on a dropdown, open or close it |
| **Esc** | in the pane | give the keyboard back to the prompt |
| mouse wheel | over the pane | scroll as before |

How it is wired, in `~/.claude/keybindings.json`:
- **Alt+1–7** (`Global` context) are bound to seven engine actions that the engine only handles inside its diff, model-picker and effort dialogs. Each Ops Control tab button is linked to one of them, so the key presses the tab. Inside one of those dialogs, the key does the dialog's action instead.
- **← / →** (`Pane` context) are bound to the engine's page scroll; Ops Control turns a key-sized page move into a tab step. PageUp/PageDown and Home/End therefore also switch tabs in the pane.
- **F1–F7 can't be used:** the engine only passes keys with a modifier (Alt, Ctrl, …) on to a mod's buttons, so a plain F-key never reaches Ops Control.

### Plan tab
- Lists every request you made this session, newest on top. Click one to see its status, objective, milestones, issues, what was done, and the questions or action items left for you.
- **Issues** are tool calls that failed and haven't been fixed yet, or were refused. Ones fixed later are listed as fixed.
- Requests made before Ops Control loaded (a reload, a resumed session) are read back from the session's transcript.
- A prompt you send while Claude is busy with another request shows that request's milestones.

### Context tab
- Context bar split by what fills the window, a chart over the session, turns left before auto-compact, and the heaviest sources you can trim.
- **Machine load** (new): CPU and RAM bars, sampled every 3 seconds and only while this tab is showing.
  - **Linux and WSL:** read from `/proc`. Under WSL the numbers are for the WSL VM, not Windows.
  - **macOS:** CPU is every process's CPU use (from `ps`) spread over the cores (`sysctl hw.ncpu`). RAM is wired, active and compressed memory (from `vm_stat`) against the installed memory (`sysctl hw.memsize`), close to Activity Monitor's "Memory Used". CPU shows from the first reading.
  - **Native Windows:** not shown.
- **Plan usage** (new): 5-hour and weekly bars with their reset times. With an API key it shows the cost of this session instead.

### Guardrails tab
- Lists the rules the project gives agents, read from CLAUDE.md, AGENTS.md, GUARDRAILS.md, `.claude/rules`, `.claude/agents`, skills, `agent_rules` and Cursor rules.
- A project with none shows a default set: ask before installs, pushes and deploys; never force push or run dangerous commands.
- Ops Control only shows the rules; it does not enforce them.

### Agents tab
- The main session comes first (`★ <name>`), then every subagent with its elapsed time, tokens and current step.
- Click a row for its **detail view**:
  - the agent's original name, task and prompt
  - **Context**: how full the agent's own context window is (subagents show "not measured yet" until they send their first request)
  - a dividing line
  - **Milestones**: done count, objective, each milestone, and what the current one is doing
  - **Now**: what it is doing right now
  - **Steps**: its latest steps, newest first
  - `‹ All agents` (or `q`) goes back
- Subagents are named by the active name pack (see below).

### Music tab
Shows what is playing on your machine from any player, not only Spotify:
- **Linux:** any MPRIS player.
- **Windows and WSL:** Windows' media sessions, including a YouTube tab.
- **macOS:** `media-control` if installed, otherwise Spotify.

### Settings tab (new)
| Control | What it does | Saved as |
|---|---|---|
| **Open board** (`b`) | Starts the Sidequest board if it isn't running and opens it in your browser. Its log goes to `~/.claude/ops-control/sqboard.log`. Needs Sidequest installed; on native Windows use `/sidequest:board` instead. | – |
| **Theme** (a dropdown showing the current theme, e.g. `Arcade ▾`) | Picks the palette. The Sidequest board's palettes come first: `arcade` (Ops Control's whole arcade pack: colors, borders, background), clean, tokyo-night and the four Catppuccin flavors. Ops Control's own themes and yours follow. | Ops Control's normal theme setting |
| **Package** (a dropdown showing the current pack, e.g. `Code Geass ▾`) | Picks how the main session and subagents are named, and which character the pet shows. **+ Create pack…** makes a new one from a description. | `namepack` |
| **Character** (`c`) | `Shown · Hide` / `Hidden · Show`: shows or hides the pet, whichever one it is. | `petShown` |

**Dropdowns:** Enter (or a click) opens a dropdown and lists its options, with the current one marked `●`. While it is open, the arrows move only through its options. Enter on an option picks it and closes the list; Enter on the dropdown itself closes it without changing anything. Nothing changes while you are only moving through the options.

## The work bar (above the prompt)

- **Divider line (new):** a full-width line on top separates the bar from Claude's thinking and text above it.
- **Row 1:** what Claude is doing toward the current milestone, the step number and how long it has run. Open issues and running subagents show at the right end.
- **Row 2:** the milestones as a track (`●━●━◉─○─○ 2/5`), the context meter with the auto-compact point marked, and the 5-hour limit with its reset time.
- **Plain-language steps (new):** a shell step shows the description Claude gave the command, such as "Read the arcade app source", instead of the raw command (`Running cd …; cat …`). The raw command only appears when a call has no description.
- **Subagent view (new):** when you open a subagent's transcript, the bar shows that subagent's own milestones, context and current step. Before, the bar disappeared there.
- `/ops setup bar band` switches back to the old one-row band.

### Milestones
- Ops Control offers its own `milestones` tool, unless Control Room is on, in which case Ops Control reads Control Room's.
- **Main session:** the instructions for using the tool are attached once to the session's first prompt, and again after a `/compact`. They are no longer part of the system prompt, which would change on every request.
- **Subagents (new):** the same instructions are added to each subagent's starting prompt, and the milestones a subagent reports are stored on that subagent. Forks (which already carry the session's context), workflow agents and resumed runs are left alone.
- **Subagent context (new):** each request a subagent sends updates its own context percentage, measured against the session's context window.

## Characters

Four new pets come with the name packs: **lelouch**, **shikamaru**, **gojo** and **levi**.
- Each is 24×12 with the full animation set: idle, walk, working, done, sleep, alert, fail, hop, dance, juggle and more.
- **While Claude works** they say their famous lines in the speech bubble (Gojo: "Nah, I'd win.", Shikamaru: "What a drag…", Levi: "Tch.", Lelouch: "Checkmate." and more): at most one every 45 seconds, never in a turn's first 8 seconds, not while Claude waits on you, and only while the pane is open. The quotes are in `WORKING_LINES` in `hooks/lines.ts`; the timing is `quipDue` in `hooks/moments.ts`. `/ops bubbles off` silences them too; Haiku mode never rewrites them.
- For done, fail, hello and the other moments they use the default speech-bubble lines.
- The art lives in `art/<name>/<name>.art`. `python3 art/build.py <name>` turns it into `hooks/sprites/<name>.ts`, a viewer page and sprite-sheet PNGs.
- You can pick them in the `/plugin` menu's `pet` option. `/ops pet <name>` doesn't accept them yet (known gap); use a name pack or the `/plugin` option instead.

---

## Making packs

Ops Control has **two kinds of pack**. They are unrelated and live in different folders:

| | Look pack | Name pack |
|---|---|---|
| Sets | colors, transcript row styles, borders, spinner, motion | the main session's name, subagent names, the pet's character |
| Folder | `~/.claude/ops-control/packs/<name>.json` | `~/.claude/ops-control/namepacks/<id>.json` |
| Picked with | `/ops pack <name>` | Settings tab → Package |
| Keyed by | `name` | `id` |

If `CLAUDE_CONFIG_DIR` is set, both folders are under that directory instead of `~/.claude`.

### Name packs

A name pack names your agents after a cast of characters. The main session gets the lead's name, and the pet becomes that character if the pack has one.

**Built-in packs:**

| Pack | Main session | Character | Cast |
|---|---|---|---|
| Default | Main session | your own pet | none: agents keep their own names |
| Code Geass | Lelouch | lelouch | 37 names (C.C., Suzaku, Rolo…) |
| Naruto | Shikamaru | shikamaru | 39 names (Naruto, Sasuke…) |
| Jujutsu Kaisen | Gojo | gojo | 35 names (Yuji, Megumi…) |
| Attack on Titan | Levi | levi | 37 names (Eren, Armin…) |

**How subagents are named:**
- Each new subagent gets the next unused name in the cast and keeps it for the rest of the session, even if you switch packs.
- When the cast runs out, names come round again with a numeral: "Suzaku II", "Suzaku III", …
- A new session starts from the top of the cast again.

#### The easy way: let Ops Control make it

1. Open the pane, go to **Settings → Package**, press Enter and choose **+ Create pack…**
2. Describe the pack, for example `One Piece, Luffy leads`, and press **create**.
3. Ops Control then:
   - asks **Sonnet** for a label, the lead's name and a cast of 24–40 names
   - asks **Opus** to draw the lead as a 24×12 pixel pet (one retry if the drawing doesn't pass the pet checks)
   - saves the pack to `~/.claude/ops-control/namepacks/<id>.json` and the pet to `~/.claude/ops-control/pets/<id>.json`
   - switches to the new pack
4. If the pet can't be drawn, the pack is still saved and your own pet stays.

These are normal model calls on your account.

#### By hand

Create `~/.claude/ops-control/namepacks/one-piece.json`:

```json
{
  "format": 1,
  "id": "one-piece",
  "label": "One Piece",
  "main": "Luffy",
  "pet": "luffy",
  "description": "The Straw Hat crew",
  "cast": ["Zoro", "Nami", "Usopp", "Sanji", "Chopper", "Robin", "Franky", "Brook"]
}
```

| Field | Required | Rules |
|---|---|---|
| `format` | yes | must be `1` |
| `id` | yes | lowercase letters, digits and dashes, starting with a letter or digit, at most 40 characters; must not be a built-in pack's id. Use the file name as the id (the loader doesn't check this). |
| `label` | yes | the name shown in the Settings list; cut to 40 characters |
| `main` | yes | the main session's name; cut to 30 characters |
| `cast` | yes | the subagent names, in order: **at least 8**, anything past 60 is dropped, each cut to 30 characters; duplicates and the `main` name are removed |
| `pet` | no | the character to show: a built-in pet (`clawd`, `robot`, `ghost`, `lelouch`, `shikamaru`, `gojo`, `levi`) or a pet file in `~/.claude/ops-control/pets/`. Leave it out to keep your own pet. |
| `description` | no | a note for yourself; cut to 400 characters |

Comments (`//`) are allowed. A file that doesn't parse or breaks a rule is skipped without a message, so if your pack doesn't appear in the list, check it against the table above. Reopen the Settings tab (or `/reload-plugins`) to pick it up.

### Look packs

A look pack sets how Claude Code looks: palette, transcript rows, borders, spinner and shimmer. It can `extends` another pack and list only what it changes:

```json
{
  "format": 1,
  "name": "arcade-soft",
  "extends": "arcade",
  "description": "arcade, less pink",
  "colors": { "palette": { "accent": "#d46fb0" } }
}
```

- Save it as `~/.claude/ops-control/packs/arcade-soft.json`. The `name` must match the file name and can't be `classic`, `crt`, `cozy` or `arcade`.
- Apply it with `/ops pack arcade-soft`.
- The easiest way to make one is to ask Claude ("make me a Ops Control pack from this palette", "make arcade less pink"). Ops Control's `ops-control-pack` skill writes the file for you.
- `/ops import <file>` converts a Ghostty or base16 color scheme into a pack.
- All fields are listed in [skills/ops-control-pack/reference.md](skills/ops-control-pack/reference.md) and [docs/pack-reference.md](docs/pack-reference.md).

---

## Known gaps

- `/ops pet lelouch` (and the other three characters) is rejected; use a name pack or the `/plugin` menu's `pet` option instead.
- Machine load (CPU/RAM) doesn't show on native Windows (it does on Linux, WSL and macOS).
- The music test "surfaces without a seek Client redraw on every read" is flaky in the test suite.
