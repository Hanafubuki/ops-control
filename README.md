# ops-control

A Claude Code plugin marketplace with three plugins that work together:

| Plugin | What it is | Based on |
|---|---|---|
| [**Ops Control**](plugins/ops-control) | A cockpit pane beside the transcript (Plan, Context, Guardrails, Agents, Diff, Music, Settings), a work bar over the prompt with milestones and context, name packs and pets, `/opstask` and `/opspin`, and keyboard navigation | [glowup](https://github.com/NovusEdge/glowup) v1.2.0 by Aliasgar Khimani |
| [**Sidequest**](plugins/sidequest) | A local work board and orchestration loop for Claude Code, here with the arcade dashboard restyle, a Claude sessions page and comment edit/delete | [Sidequest](https://github.com/Eigenwise/eigenwise-toolshed/tree/main/plugins/sidequest) v6.0.2 by Eigenwise |
| [**prismantis**](plugins/prismantis) | Colorful, themeable rendering of Claude's replies: tables, headings, code, diagrams | [prismantis](https://github.com/NahumLitvin/prismantis) v0.31.1 by Nahum Litvin |

## Install

From inside Claude Code (2.1.289 or later):

```text
/plugin marketplace add Hanafubuki/ops-control
/plugin install ops-control@ops-control
/plugin install sidequest@ops-control
/plugin install prismantis@ops-control
```

If you used glowup, Sidequest or prismantis from their own marketplaces before, uninstall those copies first so nothing loads twice:

```text
/plugin uninstall glowup@glowup
/plugin uninstall sidequest@eigenwise-toolshed
/plugin uninstall prismantis@prismantis
```

On its first start Ops Control copies your packs, themes, pets and name packs from `~/.claude/glowup` to `~/.claude/ops-control`. Settings kept in Claude Code's plugin storage (the current look, level and XP, the chosen name pack) start fresh.

## Keyboard (Ops Control)

| Key | Where | What it does |
|---|---|---|
| **Alt+1 … Alt+7** | anywhere, the prompt included | switch to the 1st–7th tab and give the pane the keyboard |
| **← / →** | in the pane | previous / next tab |
| **↑ / ↓** | in the pane | previous / next control inside the tab |
| **Enter** | on a control | press it; on a dropdown, open or close it |
| **Esc** | in the pane | back to the prompt |

These need a few lines in `~/.claude/keybindings.json`; see [Ops Control's README](plugins/ops-control/README.md#keyboard).

## What else is here

| Path | What it is |
|---|---|
| [`tools/sidequest-arcade`](tools/sidequest-arcade) | The patch kit behind Sidequest's arcade dashboard: `arcade.patch` and `server.patch` against the stock sources, the patched source in `work/`, and `apply.sh`, which re-applies the restyle after a Sidequest update. The plugin in `plugins/sidequest` already ships the built dashboard. |
| [`tools/sidequest-sessions`](tools/sidequest-sessions) | The builder for the dashboard's **Claude sessions** page: it reads your Claude Code transcripts and Ops Control's request lists and writes the page's data under `~/.claude/sidequest-sessions/data`. Run from session hooks; see its README. |

## Licences

Everything here is MIT. Each plugin keeps its own `LICENSE` and copyright notice; [LICENSE](LICENSE) covers the rest of the repository.
