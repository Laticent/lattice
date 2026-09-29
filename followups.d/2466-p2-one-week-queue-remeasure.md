---
origin: 2466
priority: P2
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2466
---

# Re-measure the rebase-only-on-conflict rule one week after it landed

```text
  P2 · [no ticket] re-measure the rule one week after merge (on or after 2026-10-06)
       why now   — the #2466 card's raise-path: moves confidence from high to very high,
                   or reopens the rule if queue ejections rose.
       where     — engineering/decisions/2026-09-28-rebase-only-on-conflict.md §3 method
                   (1,000 PR runs, same-message pushes, replay with
                   `git --attr-source=<empty tree> merge-tree`), and the `merge_group`
                   conclusions of `ci.yml` runs for the ejection rate.
       done when — the note gains a dated §6 with the needless-rebase count and the
                   queue ejection rate before vs after 2026-09-29.
       evidence  — the two tables, with the exact API window quoted.
       verify    — tier 0 gates, because it is a measurement and a doc edit.
```

Not started before 2026-10-06 on purpose: a week of data is the floor the #2466 card
set, and the session that recorded this item ran on 2026-09-29, one day in.

Measure the decision index separately in that window. The follow-up PR that recorded
this item changed the index's row order to stop it conflicting across PRs
(`engineering/decisions/2026-09-29-decision-index-rows-scatter.md`), so an index-only
conflict after it lands is a regression of that fix, not of the rebase rule.
