- **A session's work now lands as one PR with a commit per item, and several green PRs are
  authorized in one round.** Measured over the fortnight to 2026-08-23: 50 merges, 48 of
  them on two days — 25 on the 17th, 23 on the 18th. Each cost a human authorization, and
  each was a drift event for every other open PR, which is the same argument §Merging
  already makes for landing a migration as one squash. The default is now one PR per line of
  work; urgent, risky, different-swimlane, and gallery-graduation work still get their own.
  HARD RULE #17's independence test is clarified as *permission* to split, not an obligation
  to — taking it every time is what turned one night into 25 approvals. A batched PR is the
  sanctioned `rebase-and-merge` case, since one curated commit per item keeps per-item revert
  granularity on `main` at the cost of a single merge event. The merge gate itself is
  unchanged: a human still authorizes every merge, now in one round rather than N pings.
  (`engineering/workflow.md`)
