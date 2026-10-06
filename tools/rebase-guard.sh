#!/usr/bin/env bash
# Pre-push guard: refuse a rebase (or a merge from main) that the PR did not need.
#
# HARD RULE #16: rebase an open PR only when it CONFLICTS with main. The merge
# queue re-tests every PR on top of current main, so a branch that is merely
# behind needs nothing, and every needless catch-up re-runs the PR's whole CI and
# then its queue run. The rule alone did not stop it: from 2026-09-30 to 10-06,
# 9 of 28 catch-ups (rebases or merges from main) on 21 merged PRs were clean on
# GitHub's terms, i.e. unneeded. That is the replay in
# engineering/decisions/2026-10-06-conflict-reduction.md.
#
# lefthook passes git's pre-push lines on stdin (`use_stdin: true`):
#   <local ref> <local sha> <remote ref> <remote sha>
# For each branch update that moves the branch onto a NEWER main — a rebase, or a
# fast-forward that merged main in — this asks queue-precheck whether the head
# being REPLACED would have merged cleanly with that newer main, on GitHub's terms.
# Clean means the catch-up was unneeded, and the push is refused.
#
# Not checked (exit 0): a new branch, a deletion, a push to main, an amend or an
# ordinary push on the same main, an old head this clone does not have, and
# anything queue-precheck cannot decide (its exit 3). The guard only ever refuses
# when it has proved the catch-up was clean.
#
# The rule's own exception — you need a specific commit from main — is the escape:
#   LATTICE_REBASE_REASON="needs <sha>: <why>" git push --force-with-lease
# It prints the reason and allows the push. Name the commit in the commit message
# too (HARD RULE #16).
set -uo pipefail

zero=0000000000000000000000000000000000000000
here=$(cd "$(dirname "$0")" && pwd)
refused=0

while read -r local_ref local_sha remote_ref remote_sha; do
  [ -n "${local_ref:-}" ] || continue
  case "$local_sha" in "$zero") continue ;; esac   # deletion
  case "$remote_sha" in "$zero") continue ;; esac  # new branch
  case "$remote_ref" in refs/heads/main) continue ;; esac
  git cat-file -e "$remote_sha^{commit}" 2>/dev/null || continue
  git rev-parse --verify -q origin/main >/dev/null 2>&1 || continue

  old_base=$(git merge-base "$remote_sha" origin/main 2>/dev/null) || continue
  new_base=$(git merge-base "$local_sha" origin/main 2>/dev/null) || continue
  [ "$old_base" != "$new_base" ] || continue                       # same main: amend or new work
  git merge-base --is-ancestor "$old_base" "$new_base" 2>/dev/null || continue  # not onto a newer main

  bash "$here/queue-precheck.sh" --no-fetch --head="$remote_sha" --onto="$new_base" >/dev/null 2>&1
  verdict=$?
  [ "$verdict" -eq 0 ] || continue                                 # 1 = real conflict (needed), 3 = undecided

  branch=${remote_ref#refs/heads/}
  if [ -n "${LATTICE_REBASE_REASON:-}" ]; then
    echo "rebase-guard: $branch caught up with main although it merged cleanly — allowed: $LATTICE_REBASE_REASON"
    continue
  fi
  behind=$(git rev-list --count "$remote_sha..$new_base" 2>/dev/null || echo '?')
  cat >&2 <<EOF
rebase-guard: refusing to push $branch. This push moves it onto a newer main, but the
head on the remote (${remote_sha:0:8}) was only behind main by $behind commit(s) and
merged cleanly on GitHub's terms. The catch-up was not needed (HARD RULE #16): the merge
queue tests every PR on top of current main, and the catch-up re-runs CI for nothing.

  Undo it:  git reset --hard ${remote_sha:0:12}
            then cherry-pick any commits you made after the catch-up, and push again.
  Needed a specific commit from main?  LATTICE_REBASE_REASON="needs <sha>: <why>" git push ...
EOF
  refused=1
done

exit "$refused"
