- **Added: agent sessions get a warning before a catch-up with `main` they do not
  need.** A new Claude Code PreToolUse hook (`warn-needless-catchup.sh`) fires before
  a `git rebase`, `merge` or `pull` of `main`. When the branch merges cleanly with
  `main` on GitHub's terms, it says the catch-up is not needed (HARD RULE #16) and
  re-runs CI for nothing. It never blocks. In the week to 2026-10-06, 7 of 26 agent
  catch-ups were clean, and 5 of them gave no reason.
- **Changed: the pre-push hook stops at its first failing job** (`piped: true`), so a
  failing push no longer pays for every later job.
