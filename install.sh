#!/bin/sh
# Installs Ops Control, Sidequest and prismantis from the ops-control marketplace in one go, and adds
# Ops Control's keyboard shortcuts to keybindings.json when you have none yet.
#
#   curl -fsSL https://raw.githubusercontent.com/Hanafubuki/ops-control/main/install.sh | sh
#   curl -fsSL https://raw.githubusercontent.com/Hanafubuki/ops-control/main/install.sh | sh -s -- --replace
#
# --replace first uninstalls the copies from their old marketplaces (glowup@glowup,
# sidequest@eigenwise-toolshed, prismantis@prismantis), so nothing loads twice.
set -eu

REPO=Hanafubuki/ops-control
MARKETPLACE=ops-control
PLUGINS="ops-control sidequest prismantis"
OLD="glowup@glowup sidequest@eigenwise-toolshed prismantis@prismantis"

replace=0
for arg in "$@"; do
  case "$arg" in
    --replace) replace=1 ;;
    -h|--help) sed -n '2,9p' "$0" 2>/dev/null || true; exit 0 ;;
    *) echo "ops-control install: unknown option $arg (use --replace)" >&2; exit 2 ;;
  esac
done

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

if claude plugin marketplace list --json 2>/dev/null | grep -q "\"name\": *\"$MARKETPLACE\""; then
  echo "Updating the $MARKETPLACE marketplace"
  claude plugin marketplace update "$MARKETPLACE"
else
  echo "Adding the $MARKETPLACE marketplace"
  claude plugin marketplace add "$REPO"
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
