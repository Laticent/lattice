---
origin: 2778
priority: P1
recorded: 2026-10-19
area: docs
severity: low
swimlane: engineering/workflow.md §One layout for all four cards
source: https://github.com/Laticent/lattice/pull/2778
---

# Review the first three live ❓ decision cards for misreads

Written by the session that built the ❓ card and `npm run card`. The cards were
scored by blind readers on example content only, never on live ones.

why now   — decides whether the posting hook (the other item from #2778) is worth its cost.
where     — PR comments headed "❓ Decisions", built with `npm run card`.
done when — a list of every line the owner or a reader misread or had to ask about is written in the PR body, with a fix for each.
evidence  — the three comments, quoted.
verify    — tier 0 gates, because it is docs only.
