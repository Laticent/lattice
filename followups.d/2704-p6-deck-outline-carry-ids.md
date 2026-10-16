---
origin: 2704
priority: P6
recorded: 2026-10-15
area: website
severity: low
swimlane: engineering/decisions/2026-10-15-fuoco-focus-sync.md §11
source: https://github.com/Laticent/lattice/pull/2704
---

# The deck outliner keeps its own id matching rather than the shared carryIds

why now   — the same id rule is implemented twice; the generic one now handles inserts at a unit start, and the deck one may not.
where     — docs/src/lib/deck-outline/deck-outline.ts updateDeckIndex / buildDeckIndex.
done when — the deck outliner calls carryIds for its re-parsed region, and its fuzz suite still matches full builds.
evidence  — deck-outline.test.ts fuzz runs, plus a new insert-at-slide-start case.
verify    — unit fuzz at FUOCO_RUNS=5000.
