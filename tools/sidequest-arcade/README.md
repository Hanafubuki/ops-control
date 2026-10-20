# sidequest-arcade

The sidequest dashboard restyled to match glowup's **arcade** pack, with two fixes to the ticket view:
reminder, links and comments sit in their own column beside the description, and the description is
rendered as GitHub-flavored markdown (headings, lists, tables, task lists, code blocks with a copy button).

It also adds a **Claude sessions** page, linked at the top of the left rail: every Claude Code session with its name and
id; click one for a dialog with every request made in it (status, objective, milestones, what was done, Claude's
answer, questions and action items for you, files and commands) and links that open the markdown files it created. In
that view the page header shows only the title "Claude sessions" and a search box that filters the sessions (name, id,
project, branch, last prompt); it has its own query (`sessionSearch`), so the ticket search is never touched. The
inbox and settings stay mounted there, only hidden, because the inbox sends the desktop notifications. Its
data comes from `~/.claude/sidequest-sessions` (see the README there), served through a `sessions-data` link that
`apply.sh` puts into every installed `dashboard/dist`.

Sidequest serves `dashboard/dist` from its plugin cache folder and hands its port to every newer install,
so an update brings back the stock dashboard. A SessionStart hook in `~/.claude/settings.json` runs
`apply.sh --hook`, which puts the arcade build back.

| Path | What it is |
|---|---|
| `arcade.patch` | All changes, as a diff against the stock dashboard source (`upstream/`) |
| `server.patch` | Adds comment edit (`PATCH`) and delete (`DELETE /api/tickets/:id/comment/:commentId`) to the board server's `lib/server.js`, `lib/store.js`, `lib/store/comments.js`; `server/upstream` and `server/work` are its before/after copies |
| `upstream/` | Stock dashboard source the patch was made against |
| `work/` | Patched source, `node_modules` and the built `dist/` that gets installed |
| `apply.sh` | Installs, rebuilds, reports status, restores stock |
| `apply.log`, `last-error` | What the last runs did; `last-error` exists only after a failure |

## Commands

```bash
~/.claude/sidequest-arcade/apply.sh            # install where missing (rebuilds when needed)
~/.claude/sidequest-arcade/apply.sh --status   # what each installed sidequest version serves
~/.claude/sidequest-arcade/apply.sh --restore  # stock dashboard back everywhere
```

To uninstall: run `--restore`, remove the `apply.sh --hook` entry from `SessionStart` in
`~/.claude/settings.json`, then delete this folder.

## After a sidequest update

- Dashboard source unchanged: the hook copies the prebuilt arcade dashboard in (milliseconds).
- Dashboard source changed: the hook re-applies `arcade.patch` to the new source, runs the dashboard
  tests and rebuilds in the background (about 10 s, needs npm), then installs it. Reload the page.
- Patch no longer applies: the stock dashboard stays and every session start prints the reason until it
  is fixed. Ask Claude to rebase `arcade.patch` on the new `dashboard/` source.

## Changing the look

Edit `work/app/src/...` (colors are tokens in `styles/theme.css`, markdown styles in `styles/markdown.css`),
then:

```bash
cd ~/.claude/sidequest-arcade/work && npx vitest run && npx vite build
cd ~/.claude/sidequest-arcade && diff -ruN -x node_modules -x dist -x package.json -x package-lock.json upstream work > arcade.patch
./apply.sh
```

## Themes and corners

Settings › Appearance has a theme picker (each tile previews its own colors), a dark-mode switch and a
Soft/Hard corner choice.

Clawd, the Claude Code mascot, replaces the Eigenwise "E" and the "S" badge: as the browser tab icon
(`work/app/public/favicon.svg`), the sidebar logo and the desktop notification icon. Its pixels are defined once in
`work/app/src/lib/components/shell/clawd.ts`; `test/clawd.test.ts` fails when `favicon.svg` drifts from it.

| Theme | Modes |
|---|---|
| Arcade (default) | dark = glowup arcade, light = arcade light |
| Clean | sidequest's stock palette and fonts (Karla, Newsreader), light or dark |
| Tokyo Night | dark = Night, light = Day (text colors darkened to pass WCAG AA) |
| Catppuccin Mocha, Latte, Frappé, Macchiato | fixed: Latte is light, the others dark; exact official palette |

Corners: **soft** sets `--radius` to 8px; **hard** (default) sets it to 0 and squares every element, pills and
dots included.

- Tokens live in `work/app/src/styles/theme.css`, keyed on `data-palette`, `data-theme` and `data-corners` on
  `<html>`. Catppuccin flavors set raw `--ctp-*` colors and share one mapping. A new theme is a new
  `[data-palette="…"]` block plus an entry in `PALETTES` (`work/app/src/lib/state/appearance.ts`) and in the
  palette regex of the pre-paint script in `work/app/index.html`; `test/appearance.test.ts` fails when the
  script and the module disagree.
- Stored in the browser: `sq_arcade_palette`, `sq_arcade_theme` (light/dark) and `sq_arcade_corners`.

## Editing and deleting comments

Every comment in the ticket dialog has **✎ Edit** (Save, Cancel, Esc cancels, Ctrl+Enter saves; an edited comment shows
"· edited") and **✕ Delete** (asks first). Stock sidequest has no endpoint for either, so `server.patch` adds them to the
board server, not just the dashboard. `apply.sh` patches every installed version that lacks it (the marker is the
`sidequest-arcade:` comment in `lib/store/comments.js`) and restarts the running server when its own version was
patched. When a sidequest update changes those files and the patch no longer applies, every session start says so: ask
Claude to rebase `server.patch`. To change it: edit `server/work/lib/...`, then
`cd ~/.claude/sidequest-arcade/server && diff -ruN upstream work > ../server.patch`.
