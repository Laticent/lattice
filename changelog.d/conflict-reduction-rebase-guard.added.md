- **Added: git refuses a rebase or merge of `main` that the branch does not need.**
  New `pre-rebase` and `pre-merge-commit` hooks (`rebase-guard`) refuse a catch-up
  with a newer `main` when the branch merges cleanly with it on GitHub's terms
  (HARD RULE #16). The check runs before anything changes and judges the real local
  head, so a refusal costs nothing and a real conflict is always allowed. In the
  week to 2026-10-06, 7 of 26 agent catch-ups were clean, and 6 of them gave no
  reason. To clean up history without moving the base, rebase onto
  `git merge-base HEAD origin/main`. When you need a specific commit from `main`, or
  the queue ejected the PR, set `LATTICE_REBASE_REASON="needs <sha>"` or
  `="queue ejected: <why>"`.
- **Changed: the pre-push hook stops at its first failing job** (`piped: true`), so
  a failing push no longer pays for every later job.
- `npm run queue:precheck` accepts `--head=<rev>` and `--onto=<rev>`.
