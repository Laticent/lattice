#!/usr/bin/env bash
# Predict whether GitHub will merge this branch as it is — without a rebase.
#
# HARD RULE #16: rebase an open PR only when it conflicts with main. The merge
# queue re-tests every PR on top of current main, so a branch that is merely
# BEHIND needs nothing. This script is the check that tells the two apart. Run it
# right before the merge ask (`npm run queue:precheck`); the Stop hook runs it with
# --no-fetch at the end of every turn.
#
# It merges HEAD with origin/main IN MEMORY (`git merge-tree --write-tree`: no
# working-tree, index or ref changes) THE WAY GITHUB DOES — that is, ignoring the
# merge drivers in .gitattributes. This matters for one file above all:
# engineering/decisions/README.md is marked `merge=union`, so a LOCAL merge or
# rebase of two PRs that each add an index row succeeds silently, but GitHub does
# not apply that driver: it marks the PR `mergeable_state: dirty`, runs no
# pull_request CI on it, and the queue cannot take it. PR #2466 hit exactly this
# (local merge clean, GitHub dirty, CI silent for three pushes). So the check
# reads attributes from an empty tree (`git --attr-source=<empty>`, git 2.42+),
# and an index clash reports as the conflict GitHub will see.
#
# Measured against 63 real rebases from 2026-09-20..28, replayed on the main the
# queue later used (engineering/decisions/2026-09-28-rebase-only-on-conflict.md
# §3b): 39 conflicts on GitHub's terms (9 of them only the decision index) and 24
# clean trees, every one of which also passed `build:check` there.
#
# Exit codes: 0 clean (behind is fine, do not rebase) · 1 conflict — rebase ·
# 3 could not check (the fetch failed, no origin/main ref, a shallow clone without
# the merge base, or git older than 2.42) · 64 unknown argument. Output is one
# line for humans; --json prints one {"systemMessage": …} object instead, for the
# Stop hook, and nothing when the branch is clean.
#
# What it does NOT predict: a break that merges cleanly as text and fails a test
# or a generated-file check. The queue still catches those, at the cost of an
# ejection; see engineering/workflow.md §Merge queue — the facts.
set -euo pipefail

fetch=1
json=0
for arg in "$@"; do
  case "$arg" in
    --no-fetch) fetch=0 ;;
    --json) json=1 ;;
    -h|--help) sed -n '2,33p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "queue-precheck: unknown argument: $arg" >&2; exit 64 ;;
  esac
done

say() {
  # $1 = exit code, $2 = message. Branch and file names can carry `"` or `\`,
  # which would break the JSON; the caller strips them before building $2.
  if [ "$json" -eq 1 ]; then
    [ "$1" -eq 0 ] || printf '{"systemMessage":"%s"}\n' "$2"
  else
    printf '%s\n' "$2"
  fi
  exit "$1"
}

clean_names() { tr -d '"\\' | awk 'NR<=5' | paste -sd ',' - | sed 's/,/, /g'; }

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)
branch=$(printf '%s' "$branch" | tr -d '"\\')

if [ "$fetch" -eq 1 ]; then
  git fetch -q origin main 2>/dev/null || say 3 "queue-precheck: could not fetch origin/main; nothing was checked."
fi
git rev-parse --verify -q origin/main >/dev/null 2>&1 \
  || say 3 "queue-precheck: no origin/main ref; nothing was checked."

behind=$(git rev-list --count "HEAD..origin/main" 2>/dev/null || echo 0)
[ "${behind:-0}" -gt 0 ] || say 0 "queue-precheck: $branch is up to date with origin/main."

# An empty tree as the attribute source = "no .gitattributes merge drivers",
# which is how GitHub merges. `hash-object -w` makes sure the object exists.
empty=$(git hash-object -w -t tree /dev/null 2>/dev/null || true)

set +e
out=$(git --attr-source="$empty" merge-tree --write-tree --name-only --no-messages HEAD origin/main 2>/dev/null)
status=$?
set -e

case "$status" in
  0) say 0 "queue-precheck: $branch is $behind commit(s) behind origin/main and merges cleanly on GitHub's terms — no rebase needed." ;;
  1)
    files=$(printf '%s\n' "$out" | awk 'NR>1' | clean_names)
    say 1 "Branch $branch conflicts with origin/main on GitHub's terms ($files) — rebase before the next push: git fetch origin main && git rebase origin/main. (Behind-but-clean needs nothing; the merge queue handles it.)" ;;
  *)
    say 3 "Could not test $branch for conflicts with origin/main (shallow clone, or git older than 2.42). Before pushing, check the PR shows no conflict, or run: git fetch --deepen=200 origin main" ;;
esac
