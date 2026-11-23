---
origin: 3407
priority: P1
recorded: 2026-11-23
area: infra
severity: low
swimlane: engineering/decisions/2026-11-21-ci-load-plan.md §3
deferred: blocked — owner decision: changing a CI job or step is the owner's call (CLAUDE.md second filter, row 2); ❓ card D1 posted in session_01DPMMjE3qPpLbpy7tad263a, unanswered
source: https://claude.ai/code/session_01DPMMjE3qPpLbpy7tad263a
---

# The merge queue runs the render and docs-site tiers on PRs that change only prose

why now   — A prose-only queue run (no file in the `changes` job's `code` or `docs` lists) takes 17.6 min on its
            critical path and 101 job-minutes, and 71 of those run `integration` (4 shards), `docs-test` and
            `docs-build`, which read none of its files. Measured over 59 green queue runs (2026-11-21 16:05Z to
            2026-11-22 21:54Z, every group one PR): without those tiers a prose run's critical path is 9.9 min
            (unit shard 1 becomes the longest job) and it costs 30 job-minutes. In the week to 2026-11-22 22:00Z, 30 of 230 green
            queue runs (26 of 182 PRs) were prose-only, so about 2,130 job-minutes a week, about 9% of queue load.
            Site-only runs were 80 of 230; skipping `integration` on them too would save about 4,800 more.
where     — `.github/workflows/ci.yml`: the `changes` job (its `mq` step already diffs `merge_group.base_sha..head_sha`
            for `player-webkit`), the `ci` gate's "integration skipped in the merge queue" check.
done when — The owner has answered D1. Under A (keep): delete this file and file the W1 holes below as one item.
            Under B: the queue skips `integration`, `docs-test` and `docs-build` when the group diff matches
            neither list, the `ci` gate accepts a skipped `integration` only on that verdict, and any error in
            the `mq` step runs everything. Before the skip, `design/**` joins both filters: the Studio imports
            `design/skills/*.md`, `design/skills/index.json`, `design/editorial.md` and
            `design/design-principles.md`, and `test/integration/invariants/mark-agreement.test.js` globs
            `design/*.gallery.md`. Under C: B, plus the 8 engine-required workspaces under `docs/src/lib`
            (markup, segno, cadenza, trama, squadra, lastra, ltt, calco) join `code` before site-only groups
            skip `integration`.
evidence  — Actions API per-job timings (p50 min): integration shards 12.2 / 14.5 / 11.7 / 15.9, docs-test 8.7,
            docs-build 3.1, unit 9.1 / 8.1 / node 24 7.8, lint 2.2. No integration or docs test reads
            `followups.d/`, `changelog.d/`, `CLAUDE.md`, `.claude/` or `engineering/` (grep, 2026-11-22); the gates
            that do run in `lint` and `unit`, which stay on.
verify    — The first prose-only queue run after the change lists `integration`, `docs-test` and `docs-build` as
            skipped with the `mq` verdict in its log; a group that touches `design/` runs all three; a forced `mq`
            failure runs all three.
