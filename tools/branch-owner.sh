#!/usr/bin/env bash
# Who has committed to this branch? The check behind HARD RULE #31 (one session, one branch).
#
# Every session's commits carry a `Claude-Session: https://claude.ai/code/session_<id>` trailer.
# This lists the distinct sessions that have commits on origin/<branch> beyond origin/main, so a
# session can see that another one owns a branch BEFORE it pushes there, instead of finding out
# from a pull request that now holds two sessions' work (PR #2777 did).
#
# Usage:  tools/branch-owner.sh [branch] [--me session_<id>] [--no-fetch]
#   branch      defaults to the current branch
#   --me        your own session id, from the attribution line your instructions give you
#               (`Claude-Session: …/session_<id>`). Without it, any session on the branch counts
#               as "someone else" unless the branch is new.
#   --no-fetch  skip `git fetch origin <branch>`
#
# Exit codes: 0 the branch is new, empty, or only yours · 1 another session has commits on it:
# do NOT push there, branch from it instead · 64 bad argument.
# A commit with no session trailer (a person's commit) is reported as `unattributed` and does not
# fail the check by itself: a person is not a session, but read what they changed before you push.
set -u

branch=""
me=""
fetch=1
while [ $# -gt 0 ]; do
  case "$1" in
    --me) me="${2:-}"; shift 2 ;;
    --no-fetch) fetch=0; shift ;;
    -*) echo "branch-owner: unknown option $1" >&2; exit 64 ;;
    *) branch="$1"; shift ;;
  esac
done
[ -n "$branch" ] || branch="$(git branch --show-current)"
[ -n "$branch" ] || { echo "branch-owner: no branch given and HEAD is detached" >&2; exit 64; }

[ "$fetch" = 1 ] && git fetch --quiet origin "$branch" main 2>/dev/null
if ! git rev-parse --verify --quiet "origin/$branch" >/dev/null; then
  echo "origin/$branch does not exist yet: a new branch is yours."
  exit 0
fi

# Per-commit session ids on the branch beyond main (merge commits carry no work of their own).
ids="$(git log --no-merges --format='%H%x09%B%x1e' "origin/main..origin/$branch" \
  | awk 'BEGIN{RS="\036"; FS="\t"} NF > 1 { id="unattributed"; if (match($0, /session_[A-Za-z0-9]+/)) id=substr($0, RSTART, RLENGTH); n[id]++ } END { for (k in n) print n[k], k }' \
  | sort -rn)"

if [ -z "$ids" ]; then
  echo "origin/$branch has no commits beyond origin/main: nothing to collide with."
  exit 0
fi

echo "Sessions with commits on origin/$branch beyond origin/main:"
echo "$ids" | sed 's/^/  /'

others="$(echo "$ids" | awk '{print $2}' | grep -v '^unattributed$' | grep -v -x -F "${me:-__none__}" || true)"
if [ -n "$others" ]; then
  echo "Another session owns commits here. Do not push to origin/$branch (HARD RULE #31)."
  echo "Cut your own branch from it instead: git switch -c <your-branch> origin/$branch"
  exit 1
fi
echo "Only your own commits (and any unattributed ones): safe to push."
exit 0
