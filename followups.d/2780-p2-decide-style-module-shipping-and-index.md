---
origin: 2780
priority: P2
recorded: 2026-10-18
area: infra
severity: low
swimlane: engineering/decisions/2026-10-18-on-demand-styles.md §8
source: https://github.com/Laticent/lattice/pull/2780
---

# Decide how the style modules ship and which index a loader uses

why now   — E3 and the build-time bundles both need the answer; the cost of either choice is measured in the note.
where     — package.json files; note §8 (package size 0.94 MB gzipped for both sets; token-only index 29 KB gzipped vs verified 71 KB).
done when — the owner has chosen: ship dist/styles and dist/styles-min or generate them on install; token-only or verified index for the runtime loader (the verified one is free for build-time bundles).
evidence  — the note's measured table.
verify    — tier 0 gates; it is a decision, not a code change.
