---
origin: 3314
priority: P2
recorded: 2026-11-19
area: infra
severity: low
swimlane: engineering/workflow.md §Iterating on an open PR — park it as a draft, then mark it ready
deferred: blocked — needs two weeks of PR runs after #3314 merges; the owner approved the measure (2026-11-19)
source: https://github.com/Laticent/lattice/pull/3314#issuecomment-7001027506
---

# Measure whether draft parking cut the PR runs a newer push cancels

why now   — #3314's saving depends on agents parking a PR before they iterate. Before it, 179 of
            419 PR runs (43%) were canceled by a newer push, about 9,000 runner-minutes, in the
            window 2026-11-15T22:50Z to 2026-11-19T01:18Z. Nothing yet says whether the habit
            took.
where     — the Actions API: `ci.yml` runs with `event=pull_request`, two weeks after the merge.
done when — a note gives the same table for the two weeks after the merge (canceled share,
            runner-minutes, runs per PR branch, merge-queue job wait) and recommends keeping the
            draft gate, or reverting it if the canceled share fell by less than about 15 points.
evidence  — the "before" table in #3314's PR body.
verify    — the query and its raw counts sit beside the note, so the numbers can be re-run.
