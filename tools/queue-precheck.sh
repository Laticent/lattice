#!/usr/bin/env bash
# Predict whether the merge queue will take this branch as it is — without a rebase.
#
# HARD RULE #16: rebase an open PR only when it conflicts with main. The merge
# queue re-tests every PR on top of current main, so a branch that is merely
# BEHIND needs nothing. This script is the check that tells the two apart. Run it
# right before the merge ask (`npm run queue:precheck`); the Stop hook runs it with
# --no-fetch at the end of every turn.
#
# It merges HEAD with origin/main IN MEMORY (`git merge-tree --write-tree`: no
# working-tree, index or ref changes) and looks for the two things that eject a
# branch which was green on its own:
#
#   1. A textual conflict — merge-tree exits 1.
#   2. A duplicate row in engineering/decisions/README.md. That file merges with
#      `merge=union`, so when both sides reword the same row git keeps BOTH lines
#      and reports a clean merge, and `build:check` then fails in the queue
#      ("N entries in the index — it must appear exactly once").
#
# Measured by replaying 63 real rebases from 2026-09-20..28 against the main the
# queue later used: this check called every one — 30 conflicts, 3 duplicate rows,
# 30 clean trees that also passed `build:check` — with no false alarm
# (engineering/decisions/2026-09-28-rebase-only-on-conflict.md §3b).
#
# Exit codes: 0 clean (behind is fine, do not rebase) · 1 conflict · 2 duplicate
# index row · 3 could not check (shallow clone without the merge base, git older
# than 2.38, no origin/main). Output is one line per finding, for humans; --json
# prints one {"systemMessage": …} object instead, for the Stop hook.
#
# What it does NOT predict: a break that merges cleanly as text and fails a test
# or a generated-file check other than the decision index. The queue still
# catches those, at the cost of an ejection; see §Merge queue — the facts.
set -euo pipefail

fetch=1
json=0
for arg in "$@"; do
  case "$arg" in
    --no-fetch) fetch=0 ;;
    --json) json=1 ;;
    -h|--help) sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "queue-precheck: unknown argument: $arg" >&2; exit 64 ;;
  esac
done

INDEX=engineering/decisions/README.md

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

set +e
out=$(git merge-tree --write-tree --name-only --no-messages HEAD origin/main 2>/dev/null)
status=$?
set -e

case "$status" in
  0) ;;
  1)
    files=$(printf '%s\n' "$out" | awk 'NR>1' | clean_names)
    say 1 "Branch $branch conflicts with origin/main ($files) — rebase before the next push: git fetch origin main && git rebase origin/main. (Behind-but-clean needs nothing; the merge queue handles it.)" ;;
  *)
    say 3 "Could not test $branch for conflicts with origin/main (shallow clone or old git). Before pushing, check the PR shows no conflict, or run: git fetch --deepen=200 origin main" ;;
esac

# Line 1 of merge-tree's output is the merged tree. Each index row reads
# `- <status glyph> [<note>.md](…) — …`; the glyph is multi-byte, so match it as
# "anything up to the space" rather than as one character.
tree=$(printf '%s\n' "$out" | head -1)
dups=$(git show "$tree:$INDEX" 2>/dev/null \
  | grep -oE '^- [^ ]+ \[[^]]+\]' | sed -E 's/^- [^ ]+ //' | sort | uniq -d | tr -d '[]' | clean_names)
[ -z "$dups" ] || say 2 "Branch $branch merges cleanly with origin/main but leaves a duplicate row in $INDEX ($dups) — the queue will eject it. Rebase, run npm run decisions:index, and commit."

say 0 "queue-precheck: $branch is $behind commit(s) behind origin/main and merges cleanly — no rebase needed."
