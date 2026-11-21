#!/usr/bin/env bash
# PreToolUse prefilter for Bash: hand a command to owner-merge-gate.mjs only when it
# looks like a merge (a REST merge or auto-merge route, `gh pr merge`, or a GraphQL
# merge mutation). Every other Bash call returns here in a few milliseconds, with no
# Node start. The gate itself decides; this file only routes. engineering/workflow.md §Merging.
set -uo pipefail
payload=$(cat 2>/dev/null || true)
case "$payload" in
  *"/merge"*|*"auto_merge"*|*"pr merge"*|*"mergePullRequest"*|*"enablePullRequestAutoMerge"*) ;;
  *) exit 0 ;;
esac
printf '%s' "$payload" | node "$(dirname "$0")/owner-merge-gate.mjs"
