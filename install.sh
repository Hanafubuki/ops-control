#!/bin/sh
# Installs Ops Control, Sidequest and prismantis from the ops-control marketplace in one go, and adds
# Ops Control's keyboard shortcuts to keybindings.json when you have none yet.
#
#   curl -fsSL https://raw.githubusercontent.com/Hanafubuki/ops-control/main/install.sh | sh
#   curl -fsSL https://raw.githubusercontent.com/Hanafubuki/ops-control/main/install.sh | sh -s -- --replace
#   curl -fsSL https://raw.githubusercontent.com/Hanafubuki/ops-control/main/install.sh | sh -s -- --version v1.0.0
#
# --replace first uninstalls the copies from their old marketplaces (glowup@glowup,
# sidequest@eigenwise-toolshed, prismantis@prismantis), so nothing loads twice.
# --version <tag> installs that release (a tag such as v1.0.0) instead of the latest.
set -eu

REPO=Hanafubuki/ops-control
MARKETPLACE=ops-control
PLUGINS="ops-control sidequest prismantis"
OLD="glowup@glowup sidequest@eigenwise-toolshed prismantis@prismantis"

replace=0
version=""
while [ $# -gt 0 ]; do
  case "$1" in
    --replace) replace=1 ;;
    --version) [ $# -ge 2 ] || { echo "ops-control install: --version needs a tag, e.g. v1.0.0" >&2; exit 2; }; version=$2; shift ;;
    --version=*) version=${1#--version=} ;;
    -h|--help) sed -n '2,11p' "$0" 2>/dev/null || true; exit 0 ;;
    *) echo "ops-control install: unknown option $1 (use --replace or --version <tag>)" >&2; exit 2 ;;
  esac
  shift
done
source=$REPO${version:+#$version}

command -v claude >/dev/null 2>&1 || { echo "ops-control install: Claude Code (claude) is not on your PATH." >&2; exit 1; }

installed=$(claude plugin list --json 2>/dev/null || echo '[]')
has_plugin() { printf '%s' "$installed" | grep -q "\"id\": *\"$1\""; }

old_left=""
for id in $OLD; do
  if has_plugin "$id"; then
    if [ "$replace" = 1 ]; then
      echo "Uninstalling $id"
      claude plugin uninstall "$id"
    else
      old_left="$old_left $id"
    fi
  fi
done

known=$(claude plugin marketplace list --json 2>/dev/null || echo '[]')
if printf '%s' "$known" | grep -q "\"name\": *\"$MARKETPLACE\""; then
  if [ -n "$version" ]; then
    # the marketplace was added at another version: add it again pinned to this one
    echo "Switching the $MARKETPLACE marketplace to $version"
    claude plugin marketplace rm "$MARKETPLACE"
    claude plugin marketplace add "$source"
  else
    echo "Updating the $MARKETPLACE marketplace"
    claude plugin marketplace update "$MARKETPLACE"
  fi
else
  echo "Adding the $MARKETPLACE marketplace${version:+ at $version}"
  claude plugin marketplace add "$source"
fi

for plugin in $PLUGINS; do
  echo "Installing $plugin@$MARKETPLACE"
  claude plugin install "$plugin@$MARKETPLACE"
done

# Alt+1-7 switch Ops Control's tabs and the arrows move inside the pane; a keybindings.json you already have is left alone.
config=${CLAUDE_CONFIG_DIR:-$HOME/.claude}
keys="$config/keybindings.json"
if [ -e "$keys" ]; then
  echo "Kept your $keys; to get Alt+1-7 and the arrows in the pane, add the bindings shown in the README."
else
  mkdir -p "$config"
  cat > "$keys" <<'JSON'
{
  "$schema": "https://www.schemastore.org/claude-code-keybindings.json",
  "$docs": "https://code.claude.com/docs/en/keybindings",
  "bindings": [
    {
      "context": "Global",
      "bindings": {
        "alt+1": "diff:back",
        "alt+2": "diff:previousSource",
        "alt+3": "diff:nextSource",
        "alt+4": "diff:previousFile",
        "alt+5": "diff:nextFile",
        "alt+6": "modelPicker:thisSessionOnly",
        "alt+7": "effortSlider:thisSessionOnly"
      }
    },
    {
      "context": "Pane",
      "bindings": {
        "left": "pane:pageUp",
        "right": "pane:pageDown"
      }
    }
  ]
}
JSON
  echo "Wrote $keys (Alt+1-7 switch tabs, the arrows move in the pane)."
fi

if [ -n "$old_left" ]; then
  echo "Still installed from the old marketplaces:$old_left"
  echo "Uninstall them so nothing loads twice, or run this again with --replace."
fi
echo "Done. Restart Claude Code to load Ops Control, Sidequest and prismantis."
