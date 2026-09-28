#!/bin/bash
# Stop-hook backstop for HARD RULE #16: rebase only on a REAL conflict with main.
# Warns — never blocks — when merging the locally-known origin/main into this
# branch would conflict. It says nothing when the branch is merely BEHIND main:
# the merge queue re-tests every PR on top of current main before it merges, so
# a behind-but-clean branch is fine as it is. Rebasing it anyway re-runs full CI
# for nothing — 75 such rebases, ~1,005 minutes of CI wall-clock time, in the eight days to
# 2026-09-28 (engineering/decisions/2026-09-28-rebase-only-on-conflict.md).
#
# Local-only by design: it does NOT run `git fetch`, so it adds no latency to
# ending a turn. That makes silence mean "no conflict with the origin/main you
# last fetched", not "no conflict". Merge attributes (the decision index's
# merge=union) are read from the working tree, so a dirty tree can change the
# answer. It is advisory; GitHub's mergeable_state is the authority. `git merge-tree --write-tree` does the merge in memory (no
# working-tree or index changes) and exits 1 when the merge has a conflict.
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || exit 0
[ "$branch" = "main" ] && exit 0
[ "$branch" = "HEAD" ] && exit 0
# Git allows `"` and `\` in ref names; drop them so the JSON below stays valid.
branch=$(printf '%s' "$branch" | tr -d '"\\')

# No known origin/main ref → nothing to compare against.
git rev-parse --verify -q origin/main >/dev/null 2>&1 || exit 0

# Not behind at all → no merge to test.
behind=$(git rev-list --count "HEAD..origin/main" 2>/dev/null || echo 0)
[ "${behind:-0}" -gt 0 ] || exit 0

set +e
conflicts=$(git merge-tree --write-tree --name-only --no-messages HEAD origin/main 2>/dev/null)
status=$?
set -e

case "$status" in
  0) exit 0 ;;  # clean merge: behind is fine, the merge queue handles it
  1) ;;         # conflict: fall through and warn
  *)
    # git could not answer — usually a shallow clone that lacks the merge base
    # (exit 128), or git older than 2.38. Say the check did not run rather than
    # stay silent, but do not ask for a rebase: the branch may well be clean.
    printf '{"systemMessage":"Could not test %s for conflicts with origin/main (shallow clone or old git). Before pushing, check the PR shows no conflict, or run: git fetch --deepen=200 origin main"}\n' "$branch"
    exit 0 ;;
esac

# Line 1 of the output is the merged tree's OID; the conflicted paths follow.
# awk reads the whole stream (no SIGPIPE under pipefail); tr keeps the JSON valid.
files=$(printf '%s\n' "$conflicts" | awk 'NR>1 && NR<=6' | tr -d '"\\' | paste -sd ',' - | sed 's/,/, /g')
printf '{"systemMessage":"Branch %s conflicts with origin/main (%s) — rebase before the next push: git fetch origin main && git rebase origin/main. (Behind-but-clean needs nothing; the merge queue handles it.)"}\n' "$branch" "$files"
exit 0
