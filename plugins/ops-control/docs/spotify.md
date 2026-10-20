---
title: Connect Spotify
description: Connect your own Spotify developer app so the Music tab and player show your queue, likes and phone playback.
---

Without connecting, Ops Control reads the Spotify app on this computer. Connecting your Spotify account through the Web API adds:

- a heart on the Music tab and in the player, to like the track playing (`l`)
- four lists in the player: Up next, Recent, Playlists and Devices
- playback on any device (your phone, a speaker, another computer), with the tab and the controls following it
- shuffle, every repeat mode and volume while the Web API runs the player, including on Linux, where Spotify's app ignores shuffle-on, repeat and (in 1.2.74, while paused) volume writes from Ops Control
- the player on Windows, where Ops Control cannot read the local app

## What you need

- **Spotify Premium.** Spotify lets an app control playback only for Premium accounts, and a developer app in development mode only for a Premium owner.
- **A free Spotify developer app of your own.** Spotify no longer gives one app to many people: an app in development mode serves up to five people its owner adds, so Ops Control cannot ship a shared one. Making your own takes a couple of minutes.

## Connect

1. Run `/ops spotify connect`. The music player opens with the steps in its right column. The Connect button (`k`) in that column opens the same steps.
2. Open https://developer.spotify.com/dashboard, log in, and create an app. Any name and description will do.
3. Tick **Web API**.
4. Add the redirect URI `http://127.0.0.1/callback`, exactly so: `127.0.0.1`, not `localhost`, and no port. Save.
5. Copy the app's **Client ID** into the player's Client ID field and press Enter. It is 32 hexadecimal characters.
6. Your browser opens Spotify's consent page. Agree, and the player shows your lists.

In the steps, `d` copies the dashboard address and `u` the redirect URI. The connect steps need an interactive session; in a `-p` run the command says so.

### Over SSH, or with the browser on another machine

After you agree, the browser goes to `http://127.0.0.1:<port>/callback?…`, which only the machine running Ops Control can open, so it shows an error page. Copy that whole address from the browser's address bar into **Or paste the address the browser ended on** and press Enter. Ops Control checks that it came from this login before using it, and shows the reason in the player if it did not.

While Ops Control waits, `w` copies the consent page's address in case the browser did not open by itself. The login gives up after five minutes.

### Cancelling

`x` cancels the login, and closing the player does the same. Ops Control then stops waiting, but the helper process behind the login cannot be stopped from inside Ops Control and may keep waiting for the browser until its five minutes are up. If you agree on Spotify's page in that time anyway, the login still completes and writes the file, and Ops Control connects at its next start.

## The lists

Once connected, the player's right column has four lists. Press `1` to `4` to switch, Tab to reach the list, the arrows to move, and Enter to act:

| Key | List | Enter |
|---|---|---|
| `1` | Up next: the next 20 tracks in your queue | Skips forward to that track |
| `2` | Recent: the last 20 tracks you played | Plays it again, inside the playlist or album it played from |
| `3` | Playlists: all of yours | Plays the playlist |
| `4` | Devices: every Spotify device you are signed in on, the active one marked | Moves playback there and plays |

Recent plays a track alone when it came from anything but an album or a playlist, such as an artist page or Liked Songs.

When the same track is queued twice, Up next skips to its first copy.

Up next refreshes when the track changes and every 15 seconds while it is on screen, Recent when the track changes, Devices every 15 seconds and each time you open the list, and Playlists once each time the player opens. If a refresh fails, the rows stay and a line under them says why; Ops Control tries again after 15 seconds.

Spotify cannot jump within the queue, so skipping to the fourth track skips four times. If the track has already left the queue, the player says so and reloads the list; a track more than 20 down the queue gets "That track is too far down the queue." Spotify also cannot remove or reorder queued tracks. If a queue read is still out when you press Enter, the player says "Still reading the queue, try again." and skips nothing.

When nothing is playing on any device, the player opens on Devices: pick one to start there.

## Where the login lives

Ops Control keeps the login in `~/.claude/ops-control/spotify.json` (under `$CLAUDE_CONFIG_DIR` if you set it), readable only by you (mode 0600). Only Ops Control's helper program, `glowup-installer`, writes that file, and the login never goes into Ops Control's settings store, the status line or a log. For your account Ops Control talks only to `accounts.spotify.com` and `api.spotify.com`; covers come from Spotify's image server, as they do without connecting.

## Disconnect

`/ops spotify disconnect` deletes the file, and Ops Control goes back to the local app. To revoke Ops Control entirely, delete the app on the developer dashboard too.

`/ops spotify` says which you are on: the app on this computer, or your account (with the start of the Client ID and your name), or that you need to connect again.

## When something is off

- **`Spotify (local)` in the Music tab's header.** The Web API is not answering (offline, or Spotify having trouble), so Ops Control shows the app on this computer until it does. Nothing to do.
- **"Spotify playback control needs Premium, so Ops Control uses the Spotify app on this computer for it."** Spotify answered that the account is not Premium. For the rest of the session transport (play, pause, skip, seek) goes to the local app; the heart and Up next still use the Web API. On Linux, shuffle, repeat and volume are back to what the local app takes.
- **"Nothing is playing. Pick a device."** No device has Spotify active. The player switches to Devices; pick one, or start something in any Spotify app.
- **"Spotify needs you to connect again."** The login expired or you removed Ops Control's access. Run `/ops spotify connect`.
- **"…was saved by a newer Ops Control".** A newer Ops Control wrote the login file. Update Ops Control; this one leaves the file alone and uses the local app.
- **"…is damaged. /ops spotify disconnect removes it; then connect again."** The login file cannot be read as a login. Run `/ops spotify disconnect`, then `/ops spotify connect`.
- **The browser says `INVALID_CLIENT: Invalid redirect URI`.** The app's redirect URI is not exactly `http://127.0.0.1/callback`. Fix it on the dashboard and connect again.
