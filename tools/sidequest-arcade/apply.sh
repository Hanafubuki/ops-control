#!/usr/bin/env bash
# Puts the glowup-arcade sidequest dashboard into every installed sidequest version.
# Sidequest serves dashboard/dist from its plugin cache folder and hands its port to each newer
# install, so an update brings back the stock dashboard; this script (run at SessionStart) puts the
# arcade build back. It copies the prebuilt dashboard when the version's dashboard source is the one
# arcade.patch was made for, and otherwise re-applies arcade.patch to the new source and rebuilds.
#
#   apply.sh            install where missing; rebuilds in the foreground when needed
#   apply.sh --hook     SessionStart mode: silent when nothing to do; a rebuild runs in the background
#   apply.sh --rebuild  rebuild from the newest installed sidequest, then install
#   apply.sh --status   show what each installed version serves
#   apply.sh --restore  put the stock dashboard back in every version
set -uo pipefail

ROOT="${SIDEQUEST_ARCADE_ROOT:-$HOME/.claude/sidequest-arcade}"
# Sidequest from the ops-control marketplace, and from Eigenwise's where it is still installed.
CACHES="${SIDEQUEST_ARCADE_CACHE:-$HOME/.claude/plugins/cache/ops-control/sidequest $HOME/.claude/plugins/cache/eigenwise-toolshed/sidequest}"
CACHE="${CACHES%% *}"
MARKED_VERSION="18.1.0"
MARKER=".sidequest-arcade"
# The Sessions page reads what ~/.claude/sidequest-sessions/build.mjs writes, through this link in each installed dist.
SESSIONS_DATA="${SIDEQUEST_SESSIONS_DATA:-$HOME/.claude/sidequest-sessions/data}"
SESSIONS_LINK="sessions-data"
SOURCE_PARTS=(app test package.json package-lock.json tsconfig.json vite.config.ts)
# server.patch adds comment edit and delete to the board server (lib/), which sidequest has no endpoint for.
SERVER_PATCH="$ROOT/server.patch"
SERVER_MARKER="sidequest-arcade: replace a comment"
SERVER_PORT="${SIDEQUEST_PORT:-41730}"
LOG="$ROOT/apply.log"
ERROR_FILE="$ROOT/last-error"
FAILED_SOURCE_FILE="$ROOT/failed-source"
LOCK="$ROOT/.lock"
mode="${1:---apply}"

say() { printf 'sidequest-arcade: %s\n' "$*"; }
log() { printf '%s %s\n' "$(date -Iseconds)" "$*" >> "$LOG"; }

# Fingerprint of a version's dashboard source, so a rebuild that failed is not retried until it changes.
source_fingerprint() {
	(cd "$1/dashboard" && find "${SOURCE_PARTS[@]}" -type f -print0 2>/dev/null | sort -z | xargs -0 sha256sum) | sha256sum | cut -c1-16
}

fail() {
	printf '%s\n' "$*" > "$ERROR_FILE"
	local newest
	newest="$(versions | tail -n 1)"
	[ -n "$newest" ] && source_fingerprint "$newest" > "$FAILED_SOURCE_FILE"
	log "FAILED: $*"
	say "$*"
	return 1
}

clear_failure() {
	rm -f "$ERROR_FILE" "$FAILED_SOURCE_FILE"
}

# Installed versions with a dashboard, oldest first.
versions() {
	local directory
	for directory in $(for cache in $CACHES; do ls -d "$cache"/*/ 2>/dev/null; done | sort -V); do
		directory="${directory%/}"
		[ -f "$directory/dashboard/dist/index.html" ] && [ -d "$directory/dashboard/app" ] && printf '%s\n' "$directory"
	done
}

build_stamp() {
	cat "$ROOT/work/dist/index.html" "$ROOT/arcade.patch" 2>/dev/null | sha256sum | cut -c1-16
}

installed_stamp() {
	cat "$1/dashboard/dist/$MARKER" 2>/dev/null
}

# True when the version's dashboard source is the stock source arcade.patch was made against.
same_source() {
	local part
	for part in "${SOURCE_PARTS[@]}"; do
		diff -rq "$1/dashboard/$part" "$ROOT/upstream/$part" > /dev/null 2>&1 || return 1
	done
}

install_dist() {
	local dashboard="$1/dashboard" stamp
	stamp="$(build_stamp)"
	# Keep the stock build once, the first time this version is touched.
	if [ ! -d "$dashboard/dist.stock" ] && [ ! -f "$dashboard/dist/$MARKER" ]; then
		cp -a "$dashboard/dist" "$dashboard/dist.stock" || return 1
	fi
	rm -rf "$dashboard/dist.next" "$dashboard/dist.old"
	cp -a "$ROOT/work/dist" "$dashboard/dist.next" || return 1
	printf '%s\n' "$stamp" > "$dashboard/dist.next/$MARKER"
	ln -sfn "$SESSIONS_DATA" "$dashboard/dist.next/$SESSIONS_LINK" || return 1
	mv "$dashboard/dist" "$dashboard/dist.old" && mv "$dashboard/dist.next" "$dashboard/dist" || return 1
	rm -rf "$dashboard/dist.old"
	log "installed $stamp into $(basename "$1")"
}

# The data link in every version that serves the arcade build: an install made before the Sessions page, or a
# dist someone rebuilt by hand, gets it on the next run.
ensure_links() {
	local directory
	mkdir -p "$SESSIONS_DATA"
	while IFS= read -r directory; do
		[ -n "$directory" ] || continue
		[ -f "$directory/dashboard/dist/$MARKER" ] || continue
		[ "$(readlink "$directory/dashboard/dist/$SESSIONS_LINK" 2>/dev/null)" = "$SESSIONS_DATA" ] && continue
		ln -sfn "$SESSIONS_DATA" "$directory/dashboard/dist/$SESSIONS_LINK" && log "linked $SESSIONS_LINK into $(basename "$directory")"
	done < <(versions)
}

load_node() {
	command -v npm > /dev/null 2>&1 && return 0
	# shellcheck disable=SC1091
	[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" > /dev/null 2>&1
	command -v npm > /dev/null 2>&1
}

# Re-applies arcade.patch to the newest installed dashboard source and rebuilds it.
rebuild() {
	local newest stage="$ROOT/stage" pristine="$ROOT/upstream.next" part version
	newest="$(versions | tail -n 1)"
	[ -n "$newest" ] || { fail "no installed sidequest version found in $CACHE"; return 1; }
	version="$(basename "$newest")"
	load_node || { fail "npm not found; cannot rebuild the arcade dashboard for sidequest $version"; return 1; }
	rm -rf "$stage" "$pristine"
	mkdir -p "$stage" "$pristine"
	for part in "${SOURCE_PARTS[@]}"; do
		cp -a "$newest/dashboard/$part" "$pristine/" || { fail "could not copy the sidequest $version dashboard source"; return 1; }
	done
	cp -a "$pristine/." "$stage/"
	if ! (cd "$stage" && patch -p1 --forward --batch -s < "$ROOT/arcade.patch") >> "$LOG" 2>&1; then
		rm -rf "$stage" "$pristine"
		fail "arcade.patch no longer applies to sidequest $version; the stock dashboard stays. Ask Claude to rebase ~/.claude/sidequest-arcade/arcade.patch."
		return 1
	fi
	log "rebuilding for sidequest $version"
	if ! (cd "$stage" \
		&& npm ci --no-audit --no-fund \
		&& npm install --no-save --no-audit --no-fund "marked@$MARKED_VERSION" \
		&& npx vitest run \
		&& npx vite build) >> "$LOG" 2>&1; then
		fail "rebuilding the arcade dashboard for sidequest $version failed (tests or build); see $LOG"
		return 1
	fi
	rm -rf "$ROOT/upstream.prev" "$ROOT/work.prev"
	mv "$ROOT/upstream" "$ROOT/upstream.prev" && mv "$pristine" "$ROOT/upstream"
	mv "$ROOT/work" "$ROOT/work.prev" && mv "$stage" "$ROOT/work"
	log "rebuilt for sidequest $version"
}

# Patches the board server of every version that lacks it. Restarts the running server when its own version changed.
apply_server() {
	local directory version running
	[ -f "$SERVER_PATCH" ] || return 0
	load_node || true
	running="$(curl -s -m 2 "http://127.0.0.1:$SERVER_PORT/api/health" 2>/dev/null | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')"
	while IFS= read -r directory; do
		[ -n "$directory" ] || continue
		version="$(basename "$directory")"
		grep -q "$SERVER_MARKER" "$directory/lib/store/comments.js" 2>/dev/null && continue
		if ! (cd "$directory" && patch -p1 --forward --batch --dry-run -s < "$SERVER_PATCH") > /dev/null 2>&1; then
			say "server.patch no longer applies to sidequest $version; editing and deleting comments is unavailable there. Ask Claude to rebase ~/.claude/sidequest-arcade/server.patch."
			log "server.patch does not apply to $version"
			continue
		fi
		(cd "$directory" && patch -p1 --forward --batch -s < "$SERVER_PATCH") >> "$LOG" 2>&1 || { say "patching the sidequest $version server failed; see $LOG"; continue; }
		log "server.patch applied to $version"
		say "comment edit and delete added to the sidequest $version server"
		if [ "$running" = "$version" ]; then
			node "$directory/bin/sidequest.js" stop >> "$LOG" 2>&1
			sleep 1
			nohup node "$directory/bin/sidequest.js" serve --port "$SERVER_PORT" > /dev/null 2>&1 &
			log "restarted the $version server on port $SERVER_PORT"
		fi
	done < <(versions)
}

# Installs the current build wherever it fits. Prints what it did; returns 2 when a rebuild is needed.
apply_all() {
	local directory stamp needs_rebuild=0 newest
	stamp="$(build_stamp)"
	newest="$(versions | tail -n 1)"
	while IFS= read -r directory; do
		[ -n "$directory" ] || continue
		[ "$(installed_stamp "$directory")" = "$stamp" ] && continue
		if same_source "$directory"; then
			install_dist "$directory" && say "arcade dashboard applied to sidequest $(basename "$directory")"
		elif [ "$directory" = "$newest" ]; then
			needs_rebuild=1
		fi
	done < <(versions)
	return $(( needs_rebuild ? 2 : 0 ))
}

with_lock() {
	mkdir "$LOCK" 2> /dev/null || return 3
	trap 'rmdir "$LOCK" 2>/dev/null' EXIT
	"$@"
}

case "$mode" in
	--hook)
		[ -f "$ERROR_FILE" ] && say "last re-apply failed: $(cat "$ERROR_FILE")"
		[ -d "$LOCK" ] && exit 0
		apply_all
		applied=$?
		ensure_links
		apply_server
		if [ $applied -eq 2 ]; then
			newest="$(versions | tail -n 1)"
			# Retry a failed rebuild only once sidequest's dashboard source has changed again.
			if [ "$(cat "$FAILED_SOURCE_FILE" 2>/dev/null)" != "$(source_fingerprint "$newest")" ]; then
				nohup "$0" --rebuild > /dev/null 2>&1 &
				say "a sidequest update changed the dashboard; rebuilding the arcade version in the background"
			fi
		fi
		exit 0
		;;
	--rebuild)
		with_lock bash -c '"$0" --rebuild-locked' "$0"
		exit $?
		;;
	--rebuild-locked)
		rebuild && clear_failure && apply_all
		exit $?
		;;
	--apply)
		apply_all
		status=$?
		ensure_links
		apply_server
		if [ $status -eq 2 ]; then
			with_lock bash -c '"$0" --rebuild-locked' "$0"
			status=$?
		fi
		[ $status -eq 0 ] && clear_failure
		exit $status
		;;
	--status)
		stamp="$(build_stamp)"
		while IFS= read -r directory; do
			[ -n "$directory" ] || continue
			current="$(installed_stamp "$directory")"
			if [ "$current" = "$stamp" ]; then state="arcade (current build $stamp)"
			elif [ -n "$current" ]; then state="arcade (older build $current)"
			else state="stock"; fi
			same_source "$directory" && source_state="dashboard source matches arcade.patch" || source_state="dashboard source changed"
			grep -q "$SERVER_MARKER" "$directory/lib/store/comments.js" 2>/dev/null && server_state="server patched" || server_state="server stock"
			printf '%-8s %s; %s; %s\n' "$(basename "$directory")" "$state" "$source_state" "$server_state"
		done < <(versions)
		[ -f "$ERROR_FILE" ] && say "last error: $(cat "$ERROR_FILE")"
		exit 0
		;;
	--restore)
		while IFS= read -r directory; do
			[ -n "$directory" ] || continue
			dashboard="$directory/dashboard"
			if [ -d "$dashboard/dist.stock" ]; then
				rm -rf "$dashboard/dist" && mv "$dashboard/dist.stock" "$dashboard/dist" && say "stock dashboard restored in sidequest $(basename "$directory")"
			fi
		done < <(versions)
		say "remove the SessionStart hook from ~/.claude/settings.json too, or the next session re-applies the arcade look"
		exit 0
		;;
	*)
		echo "usage: $0 [--hook|--rebuild|--status|--restore]" >&2
		exit 64
		;;
esac
