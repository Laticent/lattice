---
origin: 3335
priority: P2
recorded: 2026-11-20
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-20-deck-preset-study.md §5
deferred: large — reverses a register contract across the engine table, Studio mirror and docs; PR 3335 is design-only
source: https://github.com/Laticent/lattice/pull/3335
---

# A deck preset can carry theme, mode, marks and backdrop

why now   — decision D1: four of the ten target presets need it.
where     — lib/core/front-matter-key.js (PRESETS, PRESET_KEYS), lib/core/resolve-preset.js, docs/src/components/studio/deck-preset.ts and deck-preset.test.ts.
done when — the four keys resolve from a preset in every render path; a key the deck writes still wins; the Studio change count includes them; resolve-preset.js's "does NOT set" list is updated.
