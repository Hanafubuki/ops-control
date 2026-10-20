---
title: Install
description: Install the Ops Control mod from its marketplace, check that it loads, and remove it.
---

## Install

Ops Control needs Claude Code 2.1.289 or later.

```sh title="shell"
curl -fsSL https://glowup.khimani.dev/install.sh | sh
```

The script downloads the installer for your platform from the latest GitHub release, verifies it against the release's `checksums.txt`, and runs it from a temp folder, so it needs no sudo and leaves nothing on your PATH. Replace `sh` with `less` to read the script first.

The installer previews each pack as you move through them, then asks whether to take the pack as it is or customize it. Customizing lets you swap in any theme for the pack's colors and any spinner for its own. After that come the pet, speech bubbles and reduced motion. On a terminal at least 102 columns wide, Clawd stands next to the form and comments on the current pick.

When you finish, the installer runs `claude plugin marketplace add NovusEdge/glowup` and `claude plugin install ops-control@ops-control` with your choices, and you restart Claude Code if it was already running.

If Ops Control is already installed, the installer only updates settings. Your theme and spinner change only if you set them under Customize or with `--theme` or `--spinner`, and with `--yes` only the options you pass are changed. A later `/ops` command replaces what the installer set.

After `claude plugin update`, sessions that were already open keep running the old copy until you run `/reload-plugins`. Ops Control shows a toast in those sessions when a newer version is installed.

The script supports Linux and macOS on x86-64 and ARM. On Windows, download `glowup-installer_<version>_windows_amd64.zip` from the [latest release](https://github.com/NovusEdge/glowup/releases/latest), or install by hand.

### Installer options

Pass options after `sh -s --`:

```sh title="shell"
curl -fsSL https://glowup.khimani.dev/install.sh | sh -s -- --yes --pack crt
```

| Option | What it does |
| --- | --- |
| `--yes` | Install without the picker, with the defaults or the options below. The script adds it when there is no terminal. |
| `--pack NAME` | `classic`, `crt`, `cozy` or `arcade`. Default `classic`. |
| `--theme NAME` | A theme on top of the pack: `classic`, `ops-control`, `aurora`, `dusk`, `cyberpunk`, `vaporwave` or `high-contrast`. `classic` keeps the pack's own colors. Default: not set. |
| `--spinner NAME` | `stock`, `comet`, `eyes`, `orb-states`, `clawd`, `shimmer`, `scanline`, `ring`, `glitch`, `signal`, or `pack` for the pack's own. Default `pack`. |
| `--pet clawd\|off` | Default `clawd`. |
| `--bubbles on\|off\|haiku` | Speech bubbles. `haiku` lets Claude Haiku write some lines, as small calls on your account. Default `on`. |
| `--reduced-motion` | Turn off Ops Control's animation. |
| `--dry-run` | Print the commands a fresh install runs, and run nothing. |
| `--version` | Print the installer's version. |

Set `OPS_CONTROL_VERSION=v0.3.0` to use that release's installer instead of the latest.

### The config TUI binary

The first time you run `/ops config`, Ops Control downloads the `glowup-installer` that matches the installed Ops Control version to `~/.local/share/ops-control/bin/<version>/` (under `$XDG_DATA_HOME` if you set it; on Windows the file is `glowup-installer.exe` in `%XDG_DATA_HOME%\ops-control\bin\<version>\` or `%USERPROFILE%\.local\share\ops-control\bin\<version>\`) and checks it against the release's `checksums.txt`. Later runs reuse that copy. Set `OPS_CONTROL_BIN` to the path of a `glowup-installer` to use that one instead of downloading. A clone with `installer/glowup-installer` built (`just installer-build`) uses it without the variable.

### Terminals

The installer has been tested in Konsole, kitty, ghostty, alacritty and xterm. It uses 24-bit color when the terminal advertises it, falls back to 256 colors under `TERM=xterm`, and respects `NO_COLOR`.

xterm takes block characters from the font rather than drawing them itself, so Clawd shows gaps unless the font covers the Block Elements range (DejaVu Sans Mono does). kitty, ghostty and alacritty draw them themselves.

### Install by hand

In Claude Code, run:

```text title="claude code"
/plugin marketplace add NovusEdge/glowup
/plugin install ops-control@ops-control
```

The mod usually loads into the current session; restart Claude Code if it does not.

## Check that it works

`/ops` with no arguments should print a short command card. During a turn you should then see either the band above the prompt or, in fullscreen on a wide terminal, the pane beside the transcript. If neither appears, [Layout](layout.md) explains the width thresholds.

### If Ops Control does not load

Ops Control needs Claude Code 2.1.289 or later. The installer checks this, but `/plugin install` does not. On an older Claude Code you see one of these:

- An error at start, such as:

  ```text
  Failed to load hooks from ...\ops-control\0.9.0\hooks\hooks.json:
  ... "path": ["hooks"], "message": "Invalid input: expected record, received undefined"
  ```

  Older builds do not know the `modules` format that Ops Control's `hooks/hooks.json` uses.
- No error, but `/ops` is unknown and no band or pane appears. Some builds just before 2.1.289 skip Ops Control without a message.

Run `claude --version`. If it is older than 2.1.289, run `claude update` (or `npm i -g @anthropic-ai/claude-code@latest` if you installed with npm), then restart Claude Code.

## Settings

The installer sets every setting except `statusline`. To change them afterwards, use `claude plugin configure ops-control@ops-control` or your Claude Code settings.

| Setting | Values | Default | What it does |
| --- | --- | --- | --- |
| `pack` | A pack name | `classic` | The pack at session start. |
| `pet` | `clawd` or `off` | `clawd` | Shows Clawd, or no pet. |
| `bubbles` | `on`, `off` or `haiku` | `on` | Speech bubbles from templates, none, or lines written by Haiku. |
| `theme` | A theme name | `classic` | A theme on top of the pack. `classic` keeps the pack's own colors. |
| `spinner` | A spinner name | `pack` | A spinner on top of the pack: `stock`, `comet`, `eyes`, `orb-states`, `clawd`, `shimmer`, `scanline`, `ring`, `glitch` or `signal`. `pack` keeps the pack's own spinner. |
| `statusline` | Comma-separated field ids | `activity,ctx,effort,5h,week` | The status line fields and their order. Unknown ids are dropped. See [Status line](statusline.md#choosing-the-fields). |
| `reducedMotion` | `true` or `false` | `false` | Turns off Ops Control's animation. |

These settings and the `/ops` commands change the same saved choices, and whichever changed last wins; see [Settings and the store](commands.md#settings-and-the-store).

## Compatibility

> Packs, themes and pet files that load in Ops Control 1.0 load the same way in every 1.x release, and studio links from 1.0 open in every 1.x. A later 1.x may add keys, values, status line fields and commands, but never removes or renames one. An earlier 1.x skips what it does not know and tells you, and it refuses a file whose `format` is newer than it understands. Your settings and XP carry forward to every later 1.x. Going back to an earlier version is not supported, but it does not erase the setup, level or outfit a newer one saved.

In practice, a pack, theme or pet file made for a later 1.x still loads in an earlier one. What the earlier release does not know is skipped, and a notice names each key it skipped. See the [pack](pack-reference.md#keys-and-values-from-a-later-release), [theme](theme-reference.md) and [pet file](pet-sprites.md#files-from-a-later-release) references. After you go back to an earlier release, it leaves a setup, level or outfit saved by the newer one as it was: `/ops setup`, `/ops outfit` and earning XP refuse to rewrite them.

One exception: Ops Control 1.0 does not know the status line's `/` line break and drops it without a notice, so it draws every field on one line. Editing the status line in 1.0's `/ops config` saves the list without the `/`.

## Run from a clone

To work on the mod, run it from a checkout:

```sh title="shell"
git clone https://github.com/NovusEdge/glowup
cd ops-control
claude --plugin-dir .
```

The session reloads the mod whenever you save a file in the folder.

If Ops Control is also installed, both copies load. The clone takes over, and the installed copy turns itself off and shows a toast with the command to disable it permanently (`claude plugin disable ops-control@ops-control`). The installer refuses to run while it detects a second copy, whether from another marketplace or from `CLAUDE_CODE_PLUGIN_DIRS`.

## Remove

If you turned on the status line takeover, run `/ops statusline restore` before uninstalling so your own status line comes back. (If you forget, it comes back on its own within 10 minutes; see [Status line](statusline.md#if-ops-control-is-gone).)

```text title="claude code"
/plugin uninstall ops-control@ops-control
```

Uninstalling leaves your themes and packs in `~/.claude/ops-control`.
