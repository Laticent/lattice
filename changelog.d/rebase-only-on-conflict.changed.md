- **Changed: an open PR is rebased only when it conflicts with `main`, never because
  it is behind.** The merge queue already re-tests every PR on top of current `main`
  before it merges, so HARD RULE #16 no longer asks for a rebase before every push.
  The Stop hook (`.claude/hooks/stop-rebase-check.sh`) now warns only when
  `git merge-tree` finds a real conflict, and `engineering/workflow.md` gains a
  §Merge queue — the facts block with the live ruleset values. Rebase-only re-runs
  of already-green PRs cost 67 full CI runs in the eight days to 2026-09-28.
