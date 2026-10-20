# sidequest-sessions

The data behind the **Claude sessions** page of the Sidequest dashboard: every Claude Code session (its name, id and
project) and, for each one, every request you made in it with what glowup shows for it — status, objective, the
milestone it is at, every milestone, what was done (files, commands, tests, agents, Claude's answer), the questions and
action items left for you — plus links to the markdown files the session created.

The page is part of the arcade dashboard (`~/.claude/sidequest-arcade`, in `arcade.patch`), so it survives Sidequest
updates the same way the rest of that dashboard does. Open the dashboard and click **Claude sessions** at the top of
the left rail; click a session to open it, a request to see it in full, a markdown file to read it.

| Path | What it is |
|---|---|
| `build.mjs` | Reads the transcripts in `~/.claude/projects/*/*.jsonl` (and glowup's own lists in `~/.claude/glowup/requests/`, which win where they exist) and writes `data/` |
| `data/index.json` | Every session, newest first |
| `data/sessions/<id>.json` | One session's requests in full |
| `data/files/<hash>.md` | Links to the markdown files sessions created (only those still on disk) |
| `refresh.sh` | Runs `build.mjs` in the background, one run at a time |
| `build.test.mjs` | Tests: `node --test ~/.claude/sidequest-sessions/build.test.mjs` |
| `build.log` | Errors from background runs, if any |

## How it stays current

`refresh.sh` runs from three hooks in `~/.claude/settings.json`: `SessionStart` (startup, resume, clear), `Stop`
(after every turn) and `SessionEnd`. It returns at once and rebuilds in the background; only sessions whose transcript
changed are read again. The page reloads its list every 20 seconds while it is open.

Sidequest serves the data through a `sessions-data` link inside its `dashboard/dist`, which `apply.sh` in
`~/.claude/sidequest-arcade` creates on every install and checks at every session start.

## How a transcript reads as requests

- A prompt you typed is a request; so is a skill you ran as a slash command (`/code-review high`). A local command
  (`/config`) and its output are not.
- A message you sent while Claude was working, and that the running turn took in, is its own request, answered by
  that turn ("Sent while #2 ran").
- A turn a background task's notification started is more work for your latest request.
- `[Request interrupted by user]` ends the request as interrupted; a transcript whose last turn is still open is "at
  work now" for three minutes after its last line, and interrupted after that.
- Milestones come from Control Room's milestones tool, else from a plan-progress bar, else from the task list.

## Commands

```bash
node ~/.claude/sidequest-sessions/build.mjs          # build what changed
node ~/.claude/sidequest-sessions/build.mjs --full   # rebuild every session
node --test ~/.claude/sidequest-sessions/build.test.mjs
```

## Removing it

Remove the three `refresh.sh` hook entries from `~/.claude/settings.json`, then delete this folder. The page then says
there is no session data; to remove the page too, take the Sessions files out of `~/.claude/sidequest-arcade/work`,
regenerate `arcade.patch` and run `apply.sh` (see that folder's README).
