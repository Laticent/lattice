---
origin: 2704
priority: P2
recorded: 2026-10-15
area: website
severity: medium
swimlane: engineering/decisions/2026-10-15-fuoco-focus-sync.md §11
source: https://github.com/Laticent/lattice/pull/2704
---

# Present seeds from an authored-slide index and does not follow the focus hub

why now   — Present opens on the wrong rendered slide of a heading-split deck and drifts from the editor while open.
where     — the Present route's seed (a chunk index) and its own navigation.
done when — Present opens on the focused rendered slide and, while open, follows and drives the hub.
evidence  — a real Present session on a heading-split deck, before and after.
verify    — the Present e2e specs plus a real-surface check.
