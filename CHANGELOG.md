# Changelog

Releases of the ops-control marketplace. Version numbers follow [semantic versioning](https://semver.org); each release is a git tag.

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
