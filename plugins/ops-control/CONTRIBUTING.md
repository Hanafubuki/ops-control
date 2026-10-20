# Contributing to Ops Control

## Setup

Run `just --list` to see the dev commands. Each recipe wraps one of these:

```sh
pnpm install # just setup
pnpm check   # just check: `claude plugin validate` and tsc
pnpm test    # just test: `claude plugin test .`
```

You need Node 24, pnpm, just, Go 1.26 (for the installer in `installer/`), and Claude Code 2.1.289 or later. To run the mod in a live session from your clone:

```sh
claude --plugin-dir .   # just dev
```

The session watches the folder and reloads the mod when you save a file.

## Branches and pull requests

- Branch off `main`. One change per branch.
- Every PR is squash merged. The PR title becomes the commit subject, so write it in the commit grammar below.
- Sign off every commit (`git commit -s`).
- No `Co-Authored-By` or tool-attribution trailers.

## Commit grammar

`type(scope): imperative subject`, under 60 characters.

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`. Scope is the area: `build`, `themes`, `events`, `model`, `changes`, `layout`, `band`, `pane`, `agents`, `wiring`, `statusline`, `restyle`, `commands`, `release`, `docs`, `docket`, `ci`, `installer`.

The body says what changed and why. It does not narrate how the answer was found.

## Mod rules

- A hook imports only its own files and `claude-code`.
- `$` is used only in `hooks/register.tsx`.
- After changing `hooks/packpresets.ts`, run `just packs` and commit `installer/internal/packs/packs.json`. `just ci` fails until you do.

## Themes

A theme is a data-only JSON file. It holds no code and nothing in it is executed. Every color is written as `#rrggbb`.

To submit one, open a theme submission issue with the JSON file and a screenshot, or open a PR that adds the file.

## Gates

CI runs `pnpm check`, `pnpm test`, the installer's Go tests, the pack-colors check, shellcheck, and `install.sh` against a fake release on Linux and macOS, on every PR.

## Testing for runaway processes

Once, Ops Control's status line script called itself and started shells until the machine ran out of memory. A mod that writes shell or settings can do that, so test it for real.

**The two-copies trap.** An installed Ops Control plus `just dev` loads Ops Control twice, and each copy has its own store. Disable one before you test: `claude plugin disable ops-control@ops-control`. Ops Control guards against it: at `session.start` each copy writes `ops-control/instances/<session>.<copy>.json` under the config dir, waits 150 ms, and reads them all. A `--plugin-dir` copy wins, otherwise the earliest registration, then the path. An installed copy is identified without its version folder, so an updated version replaces the old one's entry, and an entry whose folder no longer exists is ignored. The active copy refreshes its file every minute and entries older than 3 minutes are ignored, so a crashed session cannot block a later one; each `turn.start` decides again, and a copy can go off then but never back on. The loser toasts once and every hook passes through (`if (off) return next(e)` opens each one: keep that line in any hook you add). The installer also refuses to run while another `ops-control@*` plugin or a `CLAUDE_CODE_PLUGIN_DIRS` entry named Ops Control is loaded.

**Run a dev session safely.** Use a throwaway config dir and a process cap:

```sh
ulimit -u 500
CLAUDE_CONFIG_DIR=$(mktemp -d) just dev
```

`ulimit -u` counts every process you own, so pick a number above what you already run (`ps -u $USER --no-headers | wc -l`).

**Watch it.** In a second terminal:

```sh
watch -n1 'pgrep -c sh; free -h | head -2'
ps -eo ppid,comm | awk '{n[$1" "$2]++} END {for (k in n) if (n[k] > 20) print n[k], k}'
```

A `sh` count that climbs while you do nothing, or one parent with dozens of children, is a loop. Kill it with `pkill -f ops-control/statusline.sh`.

**What `test/statusline-script.check.ts` covers.** It writes the real generated script to a temp dir and runs it in `sh` with a hard 5 second kill. A fallback that calls the script itself must stop at once and never hold more than a handful of processes. A normal fallback must still print its output. It runs under `pnpm test` after the engine tests, because the engine's runner cannot start processes.

**Checklist for any change that writes shell or settings:**

- Never call yourself: a fallback or backup must not be your own script or command.
- Guard recursion in the generated script itself, not only in the code that writes it.
- Run the generated script in a real shell, with the bad input as well as the good one.
- Remember another copy of the mod may have written the file you are about to read.

## Releasing

Add entries under `## [Unreleased]` in `CHANGELOG.md` as you merge changes. To cut a release:

```sh
just release 0.1.0
git push --follow-tags
```

`just release` bumps `plugin.json` and `package.json`, dates the changelog section, then commits and tags. The pushed tag starts the release workflow, which checks the versions, runs `pnpm check` and `pnpm test`, builds the installer for each platform, and publishes the changelog section with the archives, the installer archives and `checksums.txt`.

## Design changes

A new tab, a change to the theme file format, or anything that reads new data from the user's machine starts as an issue that states the design.

Decisions are recorded with [docket](https://github.com/NovusEdge/docket) in `.docket/`. Commit the ledger with the change it describes.

## Comments

A comment in code carries a fact the reader cannot get from the code. Paraphrase, investigation history, and section banners are deleted in review.

## Reporting a security issue

Open a private security advisory on the GitHub repository. Do not open a public issue for it. See [SECURITY.md](SECURITY.md).
