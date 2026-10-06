- **Added: the pre-push hook refuses a rebase the PR did not need.** A new
  `rebase-guard` job runs first in pre-push. When a push moves a branch onto a
  newer `main` (a rebase, or a merge from `main`), it checks whether the head it
  replaces would have merged cleanly on GitHub's terms. If so, it refuses the
  push and prints how to undo the catch-up (HARD RULE #16). In the week to
  2026-10-06, 7 of 26 agent catch-ups were needless, and each one re-ran the PR's
  CI and its queue run. A rebase that also rewrote the PR's own commits (a squash,
  a reword) goes through. When you need a specific commit from `main`, or the
  queue ejected the PR, push with `LATTICE_REBASE_REASON="<why>"`. `npm run queue:precheck` also
  accepts `--head=<rev>` and `--onto=<rev>`.
