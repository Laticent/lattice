#!/usr/bin/env bash
# PreToolUse(Bash) nudge: about to rebase onto, merge, or pull main when this
# branch merges cleanly with it? Say so before the command runs. WARNS, ALWAYS.
# It can never block a tool call.
#
# HARD RULE #16: rebase only on a real conflict. The merge queue re-tests every PR
# on top of current main, so a behind-but-clean branch needs nothing, and a needless
# catch-up re-runs the PR's CI (and its queue run, if queued). From 2026-09-30 to
# 10-06, 7 of 26 agent catch-ups were clean; 1 pulled in a named fix, the other 5
# gave no reason (engineering/decisions/2026-10-06-conflict-reduction.md).
#
# Why warn and not block. Two blocking designs were built and both were refuted by
# the adversarial trio on PR #2561. A pre-push check guessed the pre-catch-up head
# wrongly and its undo advice could delete unpushed work. Git's pre-rebase and
# pre-merge-commit hooks fire mid-operation, so a refusal stranded autostashed edits
# and half-done merges, and lefthook's `{0}` passed ref names to a shell. This hook
# runs BEFORE git starts, so there is no git state to strand. It is the same call the
# repo made for warn-unbounded-wait.sh and check-commit-msg.sh: coach, don't block,
# because HARD RULE #14 bars `--no-verify` as the escape.
#
# Detection is deliberately coarse: a `git` invocation of rebase, merge or pull
# that names main, and not `git merge-base` (history cleanup on the branch's own
# base). Only on a match does it run tools/queue-precheck.sh --no-fetch, the same
# check the Stop hook runs, so the two cannot disagree. It compares with the LOCAL
# origin/main; a command that fetches first is judged on the last fetch.
#
# It cannot see GitHub's "Update branch" button or `gh pr update-branch`, which
# re-run CI the same way. The message names them.

# Deliberately no `-e`: a fault in this hook must never fail the user's command.
set -uo pipefail

payload=$(cat 2>/dev/null || true)

# Fast path: nearly every command mentions none of these.
case "$payload" in
  *rebase*|*merge*|*pull*) ;;
  *) exit 0 ;;
esac
case "$payload" in
  *main*) ;;
  *) exit 0 ;;
esac
# History cleanup on the branch's own base, or plain merge-base queries.
case "$payload" in
  *merge-base*) exit 0 ;;
esac
# A real catch-up: `git ... rebase|merge|pull ... main` inside one command. The
# match is on the raw JSON payload; `[^;&|]*` keeps it to one pipeline segment.
printf '%s' "$payload" | grep -Eq 'git[^;&|]*[[:space:]](rebase|merge|pull)[[:space:]][^;&|]*main' || exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || exit 0
[ "$branch" = "main" ] && exit 0
[ "$branch" = "HEAD" ] && exit 0
[ -f tools/queue-precheck.sh ] || exit 0
git rev-parse --verify -q origin/main >/dev/null 2>&1 || exit 0

# 0 = behind (or level) and clean on GitHub's terms → the catch-up is not needed.
# 1 = real conflict → needed, stay quiet. 3 = could not decide → stay quiet.
verdict=$(bash tools/queue-precheck.sh --no-fetch 2>/dev/null)
[ $? -eq 0 ] || exit 0
case "$verdict" in
  *"up to date"*) exit 0 ;;   # nothing to catch up on; the command is harmless
esac

msg="Heads up (HARD RULE #16): $branch merges cleanly with origin/main on GitHub's terms, so this catch-up is not needed. The merge queue tests every PR on top of current main, and a rebase or merge re-runs the PR's CI for nothing. Rebase only on a real conflict, when you need a specific commit from main (name it in the commit message), or after a queue ejection. GitHub's 'Update branch' and \`gh pr update-branch\` cost the same CI run. To clean up history without moving the base: git rebase -i \"\$(git merge-base HEAD origin/main)\"."
node -e 'process.stdout.write(JSON.stringify({systemMessage: process.argv[1], hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext: process.argv[1]}}))' "$msg" 2>/dev/null \
  || printf '{"systemMessage":"Heads up (HARD RULE #16): this branch merges cleanly with origin/main, so this catch-up is not needed."}'
exit 0
