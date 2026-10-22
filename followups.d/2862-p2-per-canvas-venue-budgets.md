---
origin: 2862
priority: P2
recorded: 2026-10-22
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-22-venue-conformance.md §6
source: https://github.com/Laticent/lattice/pull/2862
---

# Count and prose budgets are measured at the wide canvas only, so lint is silent for a portrait deck at a venue

why now   — progress, journey, matrix-grid, math, redline, image and others clip at hall on tall/strip/square, and lint:deck cannot say so. Found by check:venue-conformance --all-families.
where     — lib/components/manifest.schema.json (venueCapacity), tools/build-stage-catalog.js, lib/authoring/lint-core.js (capacity-scale and venue-prose are gated on family === 'wide').
done when — a row per canvas family for each budget, lint reads it, and the harness drops its wide-only rule for budgeted components.
evidence  — the harness run with --all-families before and after.
verify    — tier 2 maker-checker; schema and generator change.
