---
origin: 3313
priority: P11
recorded: 2026-11-19
area: infra
severity: medium
swimlane: engineering/decisions/2026-11-19-bundle-legibility-and-slimming.md §4 D3
deferred: off-path — a card tool feature; it runs as its own PR from main, not in #3313
source: https://github.com/Laticent/lattice/pull/3313
---

# Show a PR's growth on the pre-merge card, from git

why now   — the owner replaced the CI size budget (D3) with growth metrics on the pre-merge card, so every merge ask shows what the PR adds and removes.
where     — tools/agent-card.js and tools/card.js (a growth section), engineering/workflow.md §Pre-merge card.
done when — the card reports lines added and removed against main for docs, code, comments, CSS and tests, computed from git with exact comment counts, in well under a second on a typical PR.
evidence  — the card for its own PR, with the numbers checked by hand against git diff --numstat.
verify    — tier 1 checker, because the card is the owner's one merge gate and wrong numbers would mislead it.
