#!/usr/bin/env bash
# Cuts a release after a push to main. Claude Code only reinstalls a plugin when its version changes, so every
# change under plugins/ or .claude-plugin/ needs a new Ops Control version to reach people.
#
# - The Ops Control version has no tag yet (someone bumped it by hand, e.g. to a minor or major): tag that version.
# - Otherwise, when plugins/ or .claude-plugin/ changed since the last tag: bump the patch number, commit and tag it.
#
# Either way a missing CHANGELOG entry is written from the commit subjects, and a GitHub release is created from it.
# Sidequest and prismantis keep their upstream version numbers: a change to them without a new version gets a warning.
set -euo pipefail

PLUGIN_JSON=plugins/ops-control/.claude-plugin/plugin.json
MARKETPLACE_JSON=.claude-plugin/marketplace.json

current_version=$(node -p "require('./$PLUGIN_JSON').version")
last_tag=$(git describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null || true)

if [ -n "$last_tag" ] && [ "v$current_version" = "$last_tag" ]; then
  if git diff --quiet "$last_tag" HEAD -- plugins .claude-plugin; then
    echo "Nothing under plugins/ or .claude-plugin/ changed since $last_tag: no release."
    exit 0
  fi
  release_version=$(node -p "const [major, minor, patch] = '$current_version'.split('.').map(Number); [major, minor, patch + 1].join('.')")
else
  release_version=$current_version
fi
echo "Releasing $release_version (last tag: ${last_tag:-none})"

# Upstream plugins changed without a new version: Claude Code will not deliver that change.
for upstream_plugin in sidequest prismantis; do
  upstream_json=plugins/$upstream_plugin/.claude-plugin/plugin.json
  [ -n "$last_tag" ] || break
  if ! git diff --quiet "$last_tag" HEAD -- "plugins/$upstream_plugin" \
     && [ "$(git show "$last_tag:$upstream_json" | node -p "JSON.parse(require('fs').readFileSync(0)).version")" = "$(node -p "require('./$upstream_json').version")" ]; then
    echo "::warning::plugins/$upstream_plugin changed since $last_tag but its version did not: people who installed it will not get the change until its version in $upstream_json and $MARKETPLACE_JSON is raised."
  fi
done

# Sets the version in plugin.json, the marketplace's own version and the marketplace's Ops Control entry, keeping
# the files' formatting.
node - "$release_version" "$PLUGIN_JSON" "$MARKETPLACE_JSON" <<'NODE'
const fs = require('fs')
const [version, pluginPath, marketplacePath] = process.argv.slice(2)
const setFirstVersion = text => text.replace(/("version":\s*")[^"]+/, `$1${version}`)

fs.writeFileSync(pluginPath, setFirstVersion(fs.readFileSync(pluginPath, 'utf8')))

const marketplaceText = fs.readFileSync(marketplacePath, 'utf8')
const pluginsStart = marketplaceText.indexOf('"plugins"')
const opsControlEntryStart = marketplaceText.indexOf('"source": "./plugins/ops-control"', pluginsStart)
if (pluginsStart < 0 || opsControlEntryStart < 0) throw new Error('marketplace.json: plugins list or Ops Control entry not found')
const updatedMarketplaceText = setFirstVersion(marketplaceText.slice(0, pluginsStart))
  + marketplaceText.slice(pluginsStart, opsControlEntryStart)
  + setFirstVersion(marketplaceText.slice(opsControlEntryStart))
fs.writeFileSync(marketplacePath, updatedMarketplaceText)

const marketplace = JSON.parse(updatedMarketplaceText)
const opsControlEntry = marketplace.plugins.find(plugin => plugin.name === 'ops-control')
if (marketplace.version !== version || opsControlEntry.version !== version || JSON.parse(fs.readFileSync(pluginPath, 'utf8')).version !== version) {
  throw new Error('version not set everywhere')
}
NODE

# A CHANGELOG entry from the commit subjects, unless one for this version was written by hand.
if ! grep -q "^## \[$release_version\]" CHANGELOG.md; then
  commit_subjects=$(git log ${last_tag:+"$last_tag"..HEAD} --no-merges --format='- %s' -- plugins .claude-plugin)
  changelog_entry=$(printf '## [%s] - %s\n\n%s\n' "$release_version" "$(TZ=Europe/Zurich date +%F)" "$commit_subjects")
  node - "$changelog_entry" <<'NODE'
const fs = require('fs')
const changelog = fs.readFileSync('CHANGELOG.md', 'utf8')
const firstRelease = changelog.indexOf('\n## [')
const entry = `${process.argv[2]}\n\n`
fs.writeFileSync('CHANGELOG.md', firstRelease < 0 ? `${changelog.trimEnd()}\n\n${entry}` : changelog.slice(0, firstRelease + 1) + entry + changelog.slice(firstRelease + 1))
NODE
fi

if ! git diff --quiet; then
  git add "$PLUGIN_JSON" "$MARKETPLACE_JSON" CHANGELOG.md
  git commit -m "Release $release_version"
fi
git tag -a "v$release_version" -m "Release $release_version"
git push origin HEAD:main "v$release_version"

# The release notes are this version's CHANGELOG section.
release_notes=$(awk -v heading="## [$release_version]" 'index($0, heading) == 1 { found = 1; next } found && /^## \[/ { exit } found' CHANGELOG.md)
gh release create "v$release_version" --title "ops-control $release_version" --notes "$release_notes"
