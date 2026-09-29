- **Changed: an open PR is rebased only when it conflicts with `main`, never because
  it is behind.** The merge queue already re-tests every PR on top of current `main`
  before it merges, so HARD RULE #16 no longer asks for a rebase before every push.
  The Stop hook (`.claude/hooks/stop-rebase-check.sh`) now warns only when
  `git merge-tree` finds a real conflict, and `engineering/workflow.md` gains a
  §Merge queue — the facts block with the live ruleset values. In the eight days to
  2026-09-28, 67 rebases of PRs that would have merged cleanly cost ~895
  minutes of CI wall-clock time.
- **Added: `npm run queue:precheck`** (`tools/queue-precheck.sh`) — run it before the
  merge ask. It fetches `main`, merges in memory the way GitHub does (GitHub does
  not apply the decision index's `merge=union`), and exits 1 on a conflict, 0 when
  the branch only needs to wait for the queue. The Stop hook now calls it with
  `--no-fetch`.
