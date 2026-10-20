---
title: Status line
description: The status entry Ops Control shows while Claude works, the opt-in takeover, what it writes to disk, and how to undo it.
---

Ops Control can show status in two ways. By default it adds a single entry under the prompt while Claude is working and leaves your own status line alone. If you opt in, it takes over the whole status line instead, which means replacing your `statusLine` setting (Ops Control keeps a copy) and writing a small script and a status file per session. `/ops statusline restore` undoes the takeover.

## The first-run question

The first time you start an interactive session after installing Ops Control, it asks once whether it should draw your status line. This is the same question `/ops statusline on` asks: it names the settings file it would change and warns you if a project sets its own status line. Yes runs the takeover described below. No changes nothing, and Ops Control does not ask again.

If you close the question without answering, Ops Control asks again on the next start, up to three times in all. It never asks in `-p` or SDK runs, or when it cannot read `settings.json`.

## The default entry

While Claude or a subagent is working, the entry under the prompt looks like this:

```text title="status entry"
◆ editing · ctx 48% · 5h 23% ↻2h10m · wk 61% ↻Thu
```

It shows what Claude is doing, how much of the context window is used, and your 5-hour and weekly usage with their reset times, and you can [choose different fields](#choosing-the-fields). It stays up while background subagents run after the turn ends, and disappears when everything is idle. With the takeover on, the entry is not shown.

Claude Code puts a `⚠ ops-control:` prefix in front of every mod's status entry. It does not mean anything is wrong.

## Choosing the fields

The entry and the takeover line both show the same list of fields, in the order you pick. The default is `activity ctx effort 5h week`; `music` is off until you list it. Claude Code re-runs the status script about every 30 seconds, so the track can trail a change by that long.

| Id | Shows |
| --- | --- |
| `activity` | what Claude is doing: `◆ editing` |
| `ctx` | context used: `ctx 48%` |
| `5h` | 5-hour usage and reset: `5h 23% ↻2h10m` |
| `week` | weekly usage and reset: `wk 61% ↻Thu` |
| `cost` | session cost: `$1.24` |
| `model` | the model, as `/model` names it |
| `effort` | the effort level of Claude's last request: `◐ high` |
| `agents` | running subagents: `2 agents` |
| `plan` | plan progress: `plan 3/7` |
| `branch` | git branch |
| `changes` | lines added and removed: `+42 −7` |
| `cwd` | the project folder name |
| `level` | your [pet level](pets.md#levels) and progress to the next: `Lv 7 ▰▰▰▱▱` |
| `music` | the Spotify track playing: `♪ Title — Artist`. Left out unless a track is playing: paused and ads are left out too. |

List the fields you want in order, or go back to the default:

```text title="claude code"
/ops statusline fields activity 5h week branch
/ops statusline fields default
```

An unknown id rejects the whole command and lists the valid ones. The Status row in `/ops config` takes the same list, and the `statusline` setting in the `/plugin` menu accepts them comma-separated. The `/plugin` setting is more lenient: it drops an unknown id without a message and keeps the rest, and a list with no known id gives the default fields. That is how an id added in a later 1.x passes through an earlier one without breaking the setting.

A field with nothing to show is left out; `5h` and `week` only appear on a subscription that reports those limits. The usage numbers are the latest Claude Code gave this session, so usage from another session on the same account shows up here after your next response.

In the takeover line, percentages are drawn in your theme's pass color, switching to its edit color from `meter.warn` and its fail color from `meter.danger` (50 and 80 unless you change them with [`/ops setup`](commands.md#setup)). It uses 24-bit color when `COLORTERM` is `truecolor` or `24bit` and 256 colors otherwise. The entry under the prompt is plain text.

### Two lines

Put a `/` in the list where the second line should start:

```text title="claude code"
/ops statusline fields activity ctx effort / 5h week music
```

The takeover line then draws two lines. The entry under the prompt is always one line, so it shows both halves joined with ` · `. Only one `/` is allowed, and the command refuses a second. A `/` at the start or end, or a half whose fields have nothing to show, leaves a single line. In the `/plugin` setting, write it as its own item: `activity,ctx,effort,/,5h,week`. In `/ops config`, tick **── line 2 ──** in the Status list and move it to where the break should fall.

## The takeover

`/ops statusline on` asks for confirmation first. If you say Yes, Ops Control:

1. Saves your current `statusLine` value (or the fact that you had none).
2. Writes a small shell script to `~/.claude/ops-control/statusline.sh`.
3. Points `statusLine` in `~/.claude/settings.json` at that script. It re-reads the file just before writing and changes only that key.
4. From then on, writes the line to show to `~/.claude/ops-control/status/<session id>` whenever it changes, and at least once a minute.

The script reads the session id from the JSON Claude Code passes it and prints that session's file. With `CLAUDE_CONFIG_DIR` set, all of these paths are under that folder instead of `~/.claude`. If `settings.json` exists but is not valid JSON, Ops Control says so and changes nothing.

### If Ops Control is gone

The script only uses a status file that is less than 10 minutes old; otherwise it runs your original status line command. So if you uninstall or disable Ops Control without restoring, your own status line returns within 10 minutes (or the line stays blank if you had none).

## Restore

`/ops statusline restore` puts your saved `statusLine` back, or removes the key if you had none, and deletes Ops Control's script and status files. If you changed `statusLine` yourself after the takeover, restore leaves your value alone and just discards the backup.

## Project settings

A `statusLine` in a project's `.claude/settings.json` or `.claude/settings.local.json` overrides your user settings, so Ops Control's line will not show in that project. The confirmation question warns you when it finds one; remove the project's `statusLine` to see Ops Control's line there.
