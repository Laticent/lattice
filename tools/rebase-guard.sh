#!/usr/bin/env bash
# Refuse a rebase or merge of main that the branch does not need — BEFORE it happens.
#
# HARD RULE #16: rebase an open PR only when it CONFLICTS with main. The merge
# queue re-tests every PR on top of current main, so a branch that is merely
# behind needs nothing, and every needless catch-up re-runs the PR's CI (and its
# queue run, if it was queued). From 2026-09-30 to 10-06, 7 of 26 agent catch-ups
# were clean on GitHub's terms; 1 of them pulled in a needed fix, the rest gave no
# reason (engineering/decisions/2026-10-06-conflict-reduction.md).
#
# It runs as two git hooks (lefthook):
#   pre-rebase <upstream> [<branch>]   before `git rebase` (and `git pull --rebase`)
#   pre-merge-commit                   before a merge commit (MERGE_HEAD is set)
# Both see the real local head — unpushed commits included — before anything has
# changed, so a refusal costs nothing and loses nothing. (It ran at pre-push first;
# the adversarial trio on PR #2561 showed a push-time check must reconstruct the
# pre-catch-up head, gets it wrong when an unpushed commit is what conflicts, and
# its undo advice could delete that commit.)
#
# It refuses only when BOTH hold:
#   1. the target brings in main commits the branch lacks (rebasing onto your own
#      remote branch, a stacked parent that is not ahead of main, or the branch's
#      own merge base is never checked), and
#   2. queue-precheck says the branch merges cleanly with the target on GitHub's
#      terms (merge drivers off). A real conflict is allowed.
# A merge that conflicts never reaches pre-merge-commit (git stops first), so it is
# allowed by construction. Anything the check cannot decide is allowed.
#
# History cleanup without moving the base:
#   git rebase -i "$(git merge-base HEAD origin/main)"
#
# HARD RULE #16's own exceptions are the escape. Only two forms are accepted:
#   LATTICE_REBASE_REASON="needs <sha>"          the commit must be in the target
#                                                and not yet in the branch
#   LATTICE_REBASE_REASON="queue ejected: <why>" after the merge queue ejected the PR
# The reason is printed on every use. Say it in the commit message too.
set -uo pipefail

here=$(cd "$(dirname "$0")" && pwd)
mode=${1:-}

say() { printf '%s\n' "$*" >&2; }

# check <head> <target> <what>  — exit 1 to refuse, 0 to allow.
check() {
  local head=$1 target=$2 what=$3
  git rev-parse --verify -q "$head^{commit}" >/dev/null 2>&1 || return 0
  git rev-parse --verify -q "$target^{commit}" >/dev/null 2>&1 || return 0
  git rev-parse --verify -q "origin/main^{commit}" >/dev/null 2>&1 || return 0

  # 1. Does the target bring in main commits the branch lacks?
  local target_main
  target_main=$(git merge-base "$target" origin/main 2>/dev/null) || return 0
  [ "$(git rev-list --count "$head..$target_main" 2>/dev/null || echo 0)" -gt 0 ] || return 0

  # 2. Would the branch have merged cleanly with it? (0 clean, 1 conflict, 3 undecided)
  bash "$here/queue-precheck.sh" --no-fetch --head="$head" --onto="$target" >/dev/null 2>&1
  [ $? -eq 0 ] || return 0

  local reason=${LATTICE_REBASE_REASON:-}
  if [ -n "$reason" ]; then
    case "$reason" in
      "needs "*)
        local sha=${reason#needs }; sha=${sha%%[ :]*}
        if git rev-parse --verify -q "$sha^{commit}" >/dev/null 2>&1 \
          && git merge-base --is-ancestor "$sha" "$target" 2>/dev/null \
          && ! git merge-base --is-ancestor "$sha" "$head" 2>/dev/null; then
          say "rebase-guard: $what allowed — $reason"
          return 0
        fi
        say "rebase-guard: LATTICE_REBASE_REASON names $sha, which is not a commit in the target that the branch lacks."
        ;;
      "queue ejected:"*)
        say "rebase-guard: $what allowed — $reason"
        return 0
        ;;
      *)
        say "rebase-guard: LATTICE_REBASE_REASON must be \"needs <sha>\" or \"queue ejected: <why>\"."
        ;;
    esac
  fi

  local behind
  behind=$(git rev-list --count "$head..$target" 2>/dev/null || echo '?')
  say "rebase-guard: refusing the $what. The branch is $behind commit(s) behind and merges"
  say "cleanly with it on GitHub's terms, so the catch-up is not needed (HARD RULE #16): the"
  say "merge queue tests every PR on top of current main. Nothing has changed yet."
  say ""
  say "  Cleaning up history?  git rebase -i \"\$(git merge-base HEAD origin/main)\""
  say "  Need a commit from main, or the queue ejected the PR?"
  say "    LATTICE_REBASE_REASON=\"needs <sha>\" git ..."
  say "    LATTICE_REBASE_REASON=\"queue ejected: <why>\" git ..."
  return 1
}

case "$mode" in
  pre-rebase)
    upstream=${2:-}
    branch=${3:-}
    if [ -z "$upstream" ]; then
      upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null) || exit 0
    fi
    head=${branch:-HEAD}
    check "$head" "$upstream" "rebase onto $upstream"
    ;;
  pre-merge-commit)
    # git does not write MERGE_HEAD before an automatic merge commit (checked on
    # 2.43), so the commits being merged are read from the `git merge` command line
    # of an ancestor process. That needs /proc (Linux, including the cloud
    # sessions); elsewhere the merge is allowed rather than guessed at.
    targets=()
    gitdir=$(git rev-parse --git-dir 2>/dev/null) || exit 0
    if [ -f "$gitdir/MERGE_HEAD" ]; then
      while read -r t; do [ -n "$t" ] && targets+=("$t"); done < "$gitdir/MERGE_HEAD"
    else
      pid=$PPID
      for _ in 1 2 3 4 5 6 7 8; do
        [ -r "/proc/$pid/cmdline" ] || break
        mapfile -d '' argv < "/proc/$pid/cmdline" 2>/dev/null || break
        if [ "${#argv[@]}" -ge 2 ] && [ "$(basename "${argv[0]}")" = git ] && [ "${argv[1]}" = merge ]; then
          for a in "${argv[@]:2}"; do
            case "$a" in -*) continue ;; esac
            sha=$(git rev-parse --verify -q "$a^{commit}" 2>/dev/null) && targets+=("$sha")
          done
          break
        fi
        pid=$(awk '{print $4}' "/proc/$pid/stat" 2>/dev/null) || break
        [ -n "$pid" ] && [ "$pid" -gt 1 ] || break
      done
    fi
    status=0
    for target in "${targets[@]}"; do
      check HEAD "$target" "merge of ${target:0:12}" || status=1
    done
    exit "$status"
    ;;
  *)
    say "rebase-guard: usage: rebase-guard.sh pre-rebase <upstream> [<branch>] | pre-merge-commit"
    exit 0
    ;;
esac
