---
title: Commands
description: Every /ops subcommand, what it prints, and when it fails.
---

## The /ops command

`/ops` with no arguments, or with `help`, prints a card with the five commands most people need:

```text title="claude code"
ops-control

  /ops config                       open the config TUI in a new terminal window
  /ops pack <name>                  switch look: arcade classic cozy crt
  /ops pet clawd|robot|ghost|off    pick a pet, or none
  /ops pane                         open or close the side pane
  /ops motion reduced               calm everything down

more: /ops help all   docs: https://glowup.khimani.dev/
```

`/ops help all` lists every command in groups: Start here, Look, Pet, Comfort, Make your own and Status line. The Look group includes the `color` commands.

In the terminal and the desktop app, the card is drawn in your pack's colors with a header box, color swatches and the spinner word; the model, and any other client, sees the plain text above. An unknown subcommand prints `Unknown: <what you typed>` above the card.

Look, pet, motion and status line choices are saved and carry over to later sessions.

## theme

| Command | What it does |
| --- | --- |
| `/ops theme <name>` | Switch to a theme. Prints `Theme: <name>`. |
| `/ops theme default` | Drop the theme and go back to the current pack's own colors. Prints `Theme: pack default`. |
| `/ops theme list` | List the built-in themes and your own. The active theme has a filled dot, including one chosen in the settings menu. |
| `/ops theme add <url>` | Download a theme file, check it, and install it. |

A theme replaces the current [pack](packs.md)'s palette and keeps its row style, border and extras. If the theme fails to load, Ops Control prints why and stays on the current one. The built-in themes are `classic` (the default), `ops-control`, `aurora`, `dusk`, `cyberpunk`, `vaporwave` and `high-contrast`; your own are read from `~/.claude/ops-control/themes`. See [Making a theme](themes.md).

### theme add

`theme add` takes an `https://` URL to a single JSON file. It then:

1. Refuses anything that is not `https://`.
2. Downloads the file. A download over 64 KB is refused.
3. Reads the `name` field. The name must be lowercase letters, digits and dashes, start with a letter or digit, and be at most 40 characters.
4. Refuses a name that is one of the built-in themes.
5. Checks the whole file, including the `extends` chain, against the [theme reference](theme-reference.md).
6. Saves it as `<name>.json` in `~/.claude/ops-control/themes`.

Each refusal prints a message naming the failed check. Adding a theme whose name you already have silently replaces your file. `theme add` installs without switching, so follow it with `/ops theme <name>`.

## pack

| Command | What it does |
| --- | --- |
| `/ops pack <name>` | Apply a pack to both layers. Prints `Pack: <name>`. |
| `/ops pack list` | List built-in and installed packs. A filled dot marks the active one. If the look is a mix of packs or has a theme or spinner on top, a last line starts `custom mix:` and names each layer. |
| `/ops pack save <name>` | Save the current look as a self-contained pack file in `~/.claude/ops-control/packs`. Prints `Saved pack "<name>" to <path>.` |
| `/ops pack <url>` | Download, check and install a pack from an `https://` URL, then apply it. |
| `/ops pack <url> --force` | The same, replacing an installed pack of that name. |
| `/ops pack <studio link>` | Install the look in a link from the [studio](https://glowup.khimani.dev/studio). Nothing is downloaded: the pack is inside the link. If the link also carries a setup, Ops Control asks before applying it. Add `--force` to replace an installed pack of the same name. If the link carries a pet, Ops Control installs it and switches to it, unlike `/ops pet add`, which only installs. A pet you already have needs `--force` too. |

## spinner

| Command | What it does |
| --- | --- |
| `/ops spinner <name>` | Use one spinner (`stock`, `comet`, `eyes`, `orb-states`, `clawd`, `shimmer`, `scanline`, `ring`, `glitch` or `signal`) on top of the current pack. Prints `Spinner: <name>`. An unknown name lists the valid ones. |
| `/ops spinner list` | List the spinners. A filled dot marks the one showing now, whether it is your override or the pack's own. |
| `/ops spinner default` | Drop the override and go back to the pack's spinner. Prints `Spinner: pack default`. |

`/ops pack <name>` clears a spinner override, so choose the pack first and the spinner after.

The built-in packs are `classic` (the default), `crt`, `cozy` and `arcade`. If a pack fails to load, Ops Control prints why and keeps the current look. The file format and limits are in [Packs](packs.md).

## color

| Command | What it does |
| --- | --- |
| `/ops color` or `/ops color list` | List the 14 color roles with a swatch, their current hex and what each one paints. A filled dot and `(override)` mark the ones you changed. |
| `/ops color <role> <#hex>` | Override one role. The hex is `#rgb` or `#rrggbb`. Prints `Color <role>: #rrggbb`. |
| `/ops color reset <role>` | Clear one override. |
| `/ops color reset` | Clear all overrides. |

The roles are the ones in the [theme reference](theme-reference.md): `accent`, `text`, `dim`, `faint`, `read`, `edit`, `shell`, `agent`, `pass`, `fail`, `panel`, `addBg`, `delBg` and `sel`. An unknown role or a bad hex prints the reason and changes nothing.

An override sits on top of whatever pack and theme are active and survives switching either. `/ops export konsole` and `/ops pack save <name>` include it. It does not touch a pack's gradient, border color or spinner color.

## import

`/ops import <file>` turns a Ghostty or base16 color scheme into a pack with a colors layer, saves it in `~/.claude/ops-control/packs` and applies it. The file can be at most 64 KB. Add `--force` to replace an installed pack of the same name. See [Packs](packs.md#making-your-own).

## export

`/ops export konsole` writes your current colors as a Konsole color scheme to `$XDG_DATA_HOME/konsole/ops-control-<pack>.colorscheme` (`~/.local/share/konsole/` when `XDG_DATA_HOME` is not set), replacing an earlier export of the same name. In Konsole it appears under Settings → Edit Current Profile → Appearance.

## pet and bubbles

| Command | What it does |
| --- | --- |
| `/ops pet clawd` | Show Clawd. Prints `Pet: clawd`. |
| `/ops pet robot` | Show the CRT robot. Prints `Pet: robot`. |
| `/ops pet ghost` | Show the ghost. Prints `Pet: ghost`. |
| `/ops pet <name>` | Show a pet you installed. Prints `Pet: <name>`. An unknown name prints `No pet named "<name>". /ops pet list shows the pets you have.` and changes nothing. |
| `/ops pet add <file\|https url> [--force]` | Install a pet file from the [studio](https://glowup.khimani.dev/studio) or your disk, without switching to it. Prints `Installed pet "<name>". Switch to it with /ops pet <name>`. `--force` replaces an installed pet of the same name. |
| `/ops pet off` | Hide the pet. Prints `Pet: off`. |
| `/ops pet list` | List the built-in pets, then the ones you installed, then `off`. A filled dot marks the current one. |
| `/ops pet clawd-shiny` | The shiny Clawd. Prints `The shiny pet is not unlocked yet.` until you earn him. |
| `/ops pet egg` | The secret egg. Prints `The egg is not unlocked yet.` until you find the code. |
| `/ops bubbles on` | Turn speech bubbles on. Prints `Bubbles: on`. |
| `/ops bubbles off` | Turn them off. |
| `/ops bubbles haiku` | Let Claude Haiku write some lines. Each one is a small call on your account. Prints `Bubbles: haiku`. |
| `/ops level` | Print your level, your XP total, the XP to the next level, the unlocks you have earned and the next one. Outfit and move unlocks are marked coming soon until they ship. Once you have every unlock it prints `All unlocks earned.` in place of the next one. |
| `/ops outfit` | List your pet's [level outfits](pets.md#level-outfits). A filled dot marks the one worn, an empty dot the others you have unlocked, and a locked one shows the level it comes at. The custom pets have none. |
| `/ops outfit <name>` | Wear an unlocked level outfit. Prints `Outfit: <name>`. A locked outfit prints the level it unlocks at, and an unknown name prints the choices. |
| `/ops outfit off` | Take the level outfit off. It stays off until a level-up unlocks the next one or you wear one again. Prints `Outfit: off`. |

See [Pets](pets.md), and [Pet sprites](pet-sprites.md) for drawing your own.

## setup

Your layout and behavior settings. They are yours alone: installing someone's pack never changes them.

| Command | What it does |
| --- | --- |
| `/ops setup` | Print every setting with its value. |
| `/ops setup <key> <value>` | Change one setting and print them all. |
| `/ops setup reset` | Go back to the defaults. |

| Key | Value | Default |
| --- | --- | --- |
| `band` | Comma list of `combo`, `agents`, `meter`, `plan`, or `none`. The order is the order in the band. | `combo,agents,meter,plan` |
| `tabs` | Comma list of `plan`, `context`, `agents`, `diff`, `music`; at least one. The first one is the tab the pane opens on. A stored `changes` (a tab Ops Control no longer has) is dropped. | `plan,context,agents,diff,music` |
| `meter.warn` | Percent at which the status line's percentages turn the `edit` color. | `50` |
| `meter.danger` | Percent at which the status line's percentages turn `fail`, the pane warns about context and the pet pants. | `80` |
| `bubbles.moods` | Comma list of `needs-you`, `fail`, `done`, `green`, `hello`, `long-done`, `compact`, `level-up`, or `none`. | all eight |
| `bubbles.ms` | How long a bubble stays, 1500 to 10000. | `3000` |
| `pet.sleepMs` | Idle time before the pet sleeps, 15000 to 600000. | `60000` |
| `pet.dance` | `on` or `off`. Off keeps the pet from dancing, and from wearing headphones to dance while Claude works, when Spotify plays. | `on` |

## config

`/ops config` opens Ops Control's settings screen in a new terminal window. On Windows that is a new window in your default terminal app; WSL behaves as Linux. Changes apply to the session you ran it in as you make them. `q` keeps them, and Esc puts back what you had when the screen opened. In the desktop Code tab, where there is no terminal to open, `/ops config` opens the pane described below instead, and `/ops config pane` opens that pane anywhere.

The window opens in the first of these that applies:

1. Inside tmux, a new tmux window.
2. The terminal named by `$TERMINAL`, if you set it. Setting `$TERMINAL` is how you pick the terminal. Ops Control knows the argument conventions of konsole, kitty, ghostty, wezterm, gnome-terminal, foot, alacritty, xfce4-terminal, mate-terminal and terminator, and runs any other terminal as `<terminal> -e <command>`.
3. The terminal you are in, when Ops Control recognizes it: Konsole, kitty, Ghostty, WezTerm or GNOME Terminal.
4. Your system's default terminal: `xdg-terminal-exec`, then `x-terminal-emulator`.

On macOS the first rule applies too, tmux first. Otherwise it is Ghostty, iTerm, kitty or WezTerm, matching the terminal you are in, and Terminal.app for anything else. Without a display, as over SSH, nothing can open; Ops Control prints the command to run in a terminal instead, and it prints the same command if the window fails to start.

Ops Control runs the `glowup-installer` for the installed version. It looks first at the path in `OPS_CONTROL_BIN`, then at `installer/glowup-installer` in a clone, and otherwise downloads the release's copy; see [Install](install.md#the-config-tui-binary). While the screen is open, `/ops config` in that session says so instead of opening a second one.

### The config pane

The pane has a row for each choice, a preview of the look under them, and Done, Copy studio link and Reset at the bottom. Up and down move between rows.

The rows are Pack, Spinner, one for each color role, Band, Tabs, Meter, Pet, Sleeps, Bubbles, Bubble, Moods, Motion and Status. A row shown as ‹ value › cycles to its next value when you press Enter and applies it at once. The other rows are fields you type into and submit with Enter. A field you have not edited does nothing on Enter.

A color field takes a hex such as `#8ecbff` or `8ecbff`, and an empty one clears that role's override. Band, Tabs, Moods and Status take a list separated by commas or spaces, and the order you type is the order Ops Control draws them. An empty Band or Moods field means none, an empty Status field means the default fields, and Tabs needs at least one. The pane says what it did, or why it refused, on the line under the buttons.

Done, or Esc, closes the pane. Copy studio link puts a link to the studio on the clipboard, and the pane says so when the copy fails, as on a surface with no clipboard. Reset asks first, then clears your color overrides and your setup.

Each row has the same effect as the matching command (`pack`, `spinner`, `color`, `setup`, `pet`, `bubbles`, `motion`, `statusline fields`). Mixing layers from different packs and saving a pack are only available as commands. In a `-p` run, `/ops config` prints the command list instead of opening the screen or the pane.

## Settings and the store

The mod's settings in Claude Code's `/plugin` menu (`pack`, `theme`, `spinner`, `pet`, `bubbles`, `statusline` and `reducedMotion`) and the `/ops` commands change the same saved choices, and the most recent change is the one in effect.

Ops Control remembers the `/plugin` values it last saw. If one differs at the next session start or after `/reload-plugins`, Ops Control runs the matching command (`/ops pack crt` for a new `pack`, and so on) and shows a toast saying what it applied. A value it cannot apply, such as an unknown pack name, gets a toast and is not retried. A setting that a later release adds is recorded the first time, with nothing applied, so your `/ops` choice stands. When `pack` changes, Ops Control puts the `/plugin` theme and spinner back on top of the new pack.

Setting `theme` back to `classic`, `spinner` to `pack` or `statusline` to its default list clears the saved choice, as `/ops theme default`, `/ops spinner default` and `/ops statusline fields default` do, rather than saving the default value.

## pane

`/ops pane` toggles the pane, or prints why it cannot open when there is no room. Esc also closes a pane opened this way. Where it opens depends on terminal width; see [Layout](layout.md).

## music

`/ops music` opens the music player, a pane that takes the keyboard; Esc closes it, and running the command again while the player is open closes it too, as `/ops pane` does. When there is no room for the player, the command prints `Music player waits: <reason>`. See [Layout](layout.md#music-player). Opening it from the Music tab's `o: Player` closes the Ops Control pane while the player is up and brings it back when the player closes. In a `-p` run it prints the help.

## spotify

`/ops spotify` says whether Ops Control reads the Spotify app on this computer or your account through the Web API. `/ops spotify connect` opens the music player at the connect steps (in a `-p` run it says it needs an interactive session); `/ops spotify disconnect` deletes the saved login. See [Connect Spotify](spotify.md).

## motion

| Command | What it does |
| --- | --- |
| `/ops motion reduced` | Turn Ops Control's animation off. |
| `/ops motion full` | Turn it back on. |

See [Accessibility](accessibility.md) for what reduced motion changes.

## statusline

| Command | What it does |
| --- | --- |
| `/ops statusline on` | Ask for confirmation, then let Ops Control draw your status line. |
| `/ops statusline restore` | Put your own status line back. |
| `/ops statusline fields` | Show the status line fields. |
| `/ops statusline fields <id> <id> …` | Set the fields in the order typed. An unknown id refuses the whole command and lists the valid ids. A `/` between fields starts a second line (one at most). |
| `/ops statusline fields default` | Go back to the `statusline` setting's value, `activity ctx effort 5h week` unless you changed it. |

The fields are `activity`, `ctx`, `5h`, `week`, `cost`, `model`, `effort`, `agents`, `plan`, `branch`, `changes`, `cwd` and `level`. See [Choosing the fields](statusline.md#choosing-the-fields).

Without `statusline on`, Ops Control only adds its own entry under the prompt while Claude works. `restore` puts your line back only if the current one is still Ops Control's. See [Status line](statusline.md).
