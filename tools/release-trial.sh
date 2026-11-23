#!/usr/bin/env bash
# The publish step of the trial-publish job (tools/trial-publish.js, TRIAL_PUBLISH_COMMAND), for the
# release path in tools/release.js: the same two commands Release (prepare) and Release (publish) run.
# trial-publish.js runs this from the repository root with NPM_CONFIG_USERCONFIG pointing npm at its
# throwaway registry, so `npm view` and `changeset publish` talk to that registry and nothing else.
#
# It works in a temporary git worktree, so the checkout stays clean and the release commit --prepare
# makes never lands on a branch. --prepare runs only when the engine's version has no CHANGELOG section
# yet (the first release, 1.0.0); a later version already carries its section from its release PR, so
# --publish alone is what a real publish run does. No tag is pushed and no GitHub Release is made.
set -euo pipefail
root=$(pwd)
work=$(mktemp -d)/release
git worktree add -q --detach "$work" HEAD
trap 'cd "$root"; git worktree remove --force "$work"' EXIT
cp -al node_modules "$work/node_modules"
cd "$work"
export GIT_AUTHOR_NAME=trial-publish GIT_AUTHOR_EMAIL=trial-publish@example.invalid
export GIT_COMMITTER_NAME=trial-publish GIT_COMMITTER_EMAIL=trial-publish@example.invalid
v=$(node -p "require('./packages/lattice/package.json').version")
if ! grep -qx "## $v" packages/lattice/CHANGELOG.md; then
  node tools/release.js --prepare --skip-checks
fi
node tools/release.js --publish --skip-checks
