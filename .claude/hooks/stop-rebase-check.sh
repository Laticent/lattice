#!/bin/bash
# Stop-hook backstop for HARD RULE #16: rebase only on a REAL conflict with main.
# Warns — never blocks — when this branch would not merge cleanly with the
# locally-known origin/main. It says nothing when the branch is merely BEHIND:
# the merge queue re-tests every PR on top of current main before it merges, so
# a behind-but-clean branch is fine as it is. Rebasing it anyway re-runs full CI
# for nothing — 75 such rebases, ~1,005 minutes of CI wall-clock time, in the
# eight days to 2026-09-28 (engineering/decisions/2026-09-28-rebase-only-on-conflict.md).
#
# The check itself lives in tools/queue-precheck.sh, which sessions also run by
# hand before the merge ask, so the two cannot disagree. Here it runs with
# --no-fetch to add no latency to ending a turn. That makes silence mean "no
# conflict with the origin/main you last fetched", not "no conflict". Merge
# attributes (the decision index's merge=union) are read from the working tree,
# so a dirty tree can change the answer. It is advisory; GitHub's
# mergeable_state is the authority.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || exit 0
[ "$branch" = "main" ] && exit 0
[ "$branch" = "HEAD" ] && exit 0
[ -x tools/queue-precheck.sh ] || exit 0
# No known origin/main (a fresh clone that never fetched it) → nothing to compare
# against, and nothing worth a warning on every turn.
git rev-parse --verify -q origin/main >/dev/null 2>&1 || exit 0

tools/queue-precheck.sh --no-fetch --json 2>/dev/null
exit 0
