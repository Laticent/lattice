---
origin: 2466
priority: P3
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2466
---

# Update the strict-flag row once the owner turns "Require branches to be up to date" off

```text
  P3 · [no ticket] once the owner turns off the strict flag, update the
       `strict_required_status_checks_policy` row in workflow.md §Merge queue — the facts
       why now   — the row says `true`; stale facts caused the rediscovery problem this
                   line of work set out to fix.
       where     — engineering/workflow.md §Merge queue — the facts; re-read with the
                   curl command in that section.
       done when — the row matches the live ruleset.
       evidence  — the curl output pasted in the PR body.
       verify    — tier 0 gates, because it is a one-row doc edit.
```

Blocked on the owner, not on code. Read live on 2026-09-29 (ruleset `18317422`,
`updated_at` 2026-06-30): `required_status_checks {'strict_required_status_checks_policy':
True, …}`. The row is correct today, so there is nothing to edit until the owner changes
the setting. Re-read before acting.
