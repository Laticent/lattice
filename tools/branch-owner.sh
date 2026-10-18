#!/usr/bin/env bash
# Who has committed to this branch? The check behind HARD RULE #31 (one session, one branch).
#
# Every session's commits carry a `Claude-Session: https://claude.ai/code/session_<id>` trailer.
# This lists the distinct sessions whose commits are on origin/<branch> beyond origin/main, so a
# session can see that another one owns a branch BEFORE it pushes there, instead of finding out
# from a pull request that now holds two sessions' work (PR #2777 did).
#
# Usage:  tools/branch-owner.sh [branch] [--me session_<id>] [--allow session_<id>]... [--no-fetch]
#   branch      defaults to the current branch. `origin/<branch>` and `refs/heads/<branch>` are accepted.
#   --me        your own session id, from the attribution line your instructions give you
#               (`Claude-Session: …/session_<id>`). Without it, every session on the branch counts as
#               someone else.
#   --allow     a session whose commits you may share the branch with: the one a takeover came from
#               (HARD RULE #31 rule 4). Repeatable.
#   --no-fetch  trust the local origin/<branch> ref instead of fetching. If that ref is missing the
#               answer is "cannot tell" (exit 3), never "new branch".
#
# Exit codes (the dangerous direction is a false "safe", so anything unclear is NOT 0):
#   0  the branch does not exist on the remote, has no commits beyond main, or only yours/allowed ones
#   1  another session's commits are on it (or a trailer names no session): do NOT push there
#   3  could not check (the remote is unreachable, the fetch failed, or --no-fetch with no local ref)
#  64  bad argument
#
# What counts: every non-merge commit, plus a merge commit that carries a trailer (a merge that
# resolves conflicts is authorship). A merge without a trailer, such as GitHub's, is ignored. A commit
# with no trailer line at all is `unattributed`: usually a person's, so it does not fail the check, but
# it prints a warning; read what it changed before you push. A line that starts `Claude-Session` but
# names no `session_<id>` is `malformed` and DOES fail the check.
set -u

branch=""
me=""
allow=""
fetch=1
while [ $# -gt 0 ]; do
  case "$1" in
    --me|--allow)
      if [ $# -lt 2 ] || [ -z "$2" ] || [ "${2#-}" != "$2" ]; then
        echo "branch-owner: $1 needs a session id (session_<id>)" >&2; exit 64
      fi
      if [ "$1" = "--me" ]; then me="$2"; else allow="$allow $2"; fi
      shift 2 ;;
    --no-fetch) fetch=0; shift ;;
    -*) echo "branch-owner: unknown option $1" >&2; exit 64 ;;
    *) branch="$1"; shift ;;
  esac
done
[ -n "$branch" ] || branch="$(git branch --show-current)"
[ -n "$branch" ] || { echo "branch-owner: no branch given and HEAD is detached" >&2; exit 64; }
branch="${branch#refs/heads/}"
branch="${branch#origin/}"

# Does the branch exist on the remote? ls-remote is the network truth; its exit code separates
# "not there" (2) from "could not ask" (anything else). A failed lookup must never read as "new".
if [ "$fetch" = 1 ]; then
  git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1
  rc=$?
  if [ "$rc" = 2 ]; then
    echo "origin/$branch does not exist on the remote: a new branch is yours."
    exit 0
  elif [ "$rc" != 0 ]; then
    echo "branch-owner: could not ask the remote about origin/$branch (git ls-remote exit $rc). Not safe to assume." >&2
    exit 3
  fi
  if ! git fetch --quiet origin "$branch" main 2>/dev/null; then
    echo "branch-owner: git fetch origin $branch main failed. Not safe to assume." >&2
    exit 3
  fi
fi
if ! git rev-parse --verify --quiet "origin/$branch" >/dev/null; then
  echo "branch-owner: no local ref origin/$branch and no fetch: cannot tell. Run without --no-fetch." >&2
  exit 3
fi
if ! git rev-parse --verify --quiet "origin/main" >/dev/null; then
  echo "branch-owner: no local ref origin/main: cannot tell. Run without --no-fetch." >&2
  exit 3
fi

# One line per commit: `<n-parents> <author-id>`. Only a `Claude-Session:` TRAILER line names the
# author: a session id quoted in the subject or body (a commit that discusses another session) must
# not count. The last trailer line in a message wins.
rows="$(git log --format='%H %P%x09%B%x1e' "origin/main..origin/$branch" \
  | awk 'BEGIN{RS="\036"; FS="\n"}
         index($0, "\t") > 0 {
           split($1, head, "\t"); np = split(head[1], parts, " ") - 1
           id = "unattributed"
           for (i = 1; i <= NF; i++) {
             if ($i ~ /^[Cc][Ll][Aa][Uu][Dd][Ee]-[Ss][Ee][Ss][Ss][Ii][Oo][Nn]/) {
               if ($i ~ /^Claude-Session:/ && match($i, /session_[A-Za-z0-9]+/)) id = substr($i, RSTART, RLENGTH)
               else id = "malformed"
             }
           }
           if (np > 1 && id == "unattributed") next   # a trailer-less merge (GitHub, or `git merge`)
           print id
         }')"

if [ -z "$rows" ]; then
  echo "origin/$branch has no commits beyond origin/main: nothing to collide with."
  exit 0
fi

ids="$(echo "$rows" | sort | uniq -c | sort -rn | awk '{print $1, $2}')"
echo "Sessions with commits on origin/$branch beyond origin/main:"
echo "$ids" | sed 's/^/  /'

mine_or_allowed="${me:-__none__}$allow"
others="$(echo "$ids" | awk '{print $2}' | grep -v '^unattributed$' | while read -r id; do
  ok=0
  for a in $mine_or_allowed; do [ "$id" = "$a" ] && ok=1; done
  [ "$ok" = 0 ] && echo "$id"
done)"

if echo "$ids" | awk '{print $2}' | grep -q '^unattributed$'; then
  echo "Warning: commits with no Claude-Session trailer (a person's, or a tool's). Read what they changed before you push."
fi
if [ -n "$others" ]; then
  echo "Another session owns commits here. Do not push to origin/$branch (HARD RULE #31)."
  echo "Do not branch from it either unless I said so: its unmerged commits would ride into your PR."
  echo "Cut your branch from main, or ask the owner (workflow.md §Session branch ownership, rules 3 and 4)."
  exit 1
fi
echo "Only your own${allow:+ and allowed} commits: safe to push."
exit 0
