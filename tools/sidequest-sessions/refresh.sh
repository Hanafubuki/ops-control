#!/usr/bin/env bash
# Rebuilds the Sessions page's data in the background, so the hook that runs it returns at once. Runs from
# SessionStart and Stop hooks in ~/.claude/settings.json. Runs queue behind each other (flock), so the last turn of
# every session is always read.
set -u
ROOT="${SIDEQUEST_SESSIONS_ROOT:-$HOME/.claude/sidequest-sessions}"
LOG="$ROOT/build.log"

NODE="$(command -v node 2>/dev/null)"
if [ -z "$NODE" ]; then
	NODE="$(command ls -1d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -n 1)"
fi
[ -n "$NODE" ] && [ -x "$NODE" ] || exit 0

# Keep the log short: the last 200 lines.
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 400 ]; then
	tail -n 200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

nohup bash -c '
	exec 9>"$1/.lock"
	flock -w 60 9 || exit 0
	"$2" "$1/build.mjs" --quiet >> "$3" 2>&1
' _ "$ROOT" "$NODE" "$LOG" > /dev/null 2>&1 &
exit 0
