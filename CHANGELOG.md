# Changelog

Releases of the ops-control marketplace. Version numbers follow [semantic versioning](https://semver.org); each release is a git tag.

## [1.0.6] - 2026-10-22

- Ops Control: /subtask questions and answers are kept as subplans, listed in a SUBPLANS box under the Plan tab's requests and saved with the session for Sidequest's Claude sessions page

## [1.0.5] - 2026-10-22

- Ops Control: each request keeps its ETA (first work-bar guess) to set against how long it took, shown in the Plan tab; a new session draws nothing of its own until the saved look and pack are loaded, and the Sidequest board icon is the pack's character from the first write

## [1.0.4] - 2026-10-21

- Ops Control: /rename sends the new name to Sidequest at once (rebuilds the Claude sessions page, retags the session's /stask tickets)

## [1.0.3] - 2026-10-21

- Ops Control: character quotes up to 80 characters over a three-row bubble, new Gojo quotes, and the suite green again (status-entry tests match this copy's hidden entry, music redraw fixture, pack skill name, status line script folder)
- Ops Control: a time-left guess on the work bar (milestone pace, task list, past requests), /subtask fork rows with their runs in the Agents tab, no work-bar headline without milestones, and the status line taken over only on /ops statusline on

## [1.0.2] - 2026-10-20

- Ops Control: a box around each reply in every look, plain tool rows, file diffs folded behind a changes toggle, and the life bar in every look

## [1.0.1] - 2026-10-20

### Ops Control 1.0.1
- A grey rule between Claude's messages, and a double accent rule with a "Conclusion" title over the final answer.
- A tool row that opens without a blank line keeps its title: the card frame is drawn under the row.
- The selected pack's character is the Sidequest board's logo, tab icon and notification icon (Clawd while none is set).

### Releases
- Every push to `main` that changes a plugin is now released automatically: the Ops Control version gets a new patch number and a tag, with notes from this file. A version raised by hand (a minor or major release) is tagged as is.

## [1.0.0] - 2026-10-20

The first release.

### Ops Control 1.0.0
Based on [glowup](https://github.com/NovusEdge/glowup) v1.2.0, renamed and extended:
- A pane with seven tabs: Plan, Context (with CPU, RAM and plan usage), Guardrails, Agents (with a detail view per agent), Diff, Music and Settings.
- Interactive guardrails: an on/off switch per rule, kept per project. Ops Control's own guardrails are enforced when switched on (asks you first, or refuses); project rules switched off are ones Claude is told to disregard.
- A work bar over the prompt with the current task's milestones, context and the 5-hour limit; subagents get their own context, milestones and bar.
- Keyboard: Alt+1–7 switch tabs from anywhere, ←/→ step through tabs, ↑/↓ move inside a tab, Enter presses; the tab strip wraps on narrow panes.
- Settings tab: open the Sidequest board, pick the theme, pick or create a name pack, show or hide the pet.
- Name packs (Code Geass, Naruto, Jujutsu Kaisen, Attack on Titan, or your own) with four new pets.
- `/opstask` has Claude do the request, then file the result as a Sidequest ticket.
- On first start, your packs, themes, pets and name packs come over from `~/.claude/glowup`.

### Sidequest 6.0.2
Eigenwise's work board, with the arcade dashboard restyle, a Claude sessions page and comment edit/delete.

### prismantis 0.31.1
Nahum Litvin's rendering of Claude's replies, as released.

### Installing
- `install.sh` installs all three in one command; `--replace` removes old copies, `--version <tag>` installs a given release.
