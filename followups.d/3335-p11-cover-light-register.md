---
origin: 3335
priority: P11
recorded: 2026-11-20
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-20-deck-preset-study.md §8
deferred: large — a new register plus a fix to the title component in both modes
source: https://github.com/Laticent/lattice/pull/3335
---

# WP-cover: a cover register with its own cover-light token

why now   — seven of the eight presets that clear 8.5 use a light cover; the engine's `light` token is a silent no-op on `title` while `divider light` works (D6).
where     — title and closing CSS, base.modifiers.css:1259-1320, base.finish.css:520-700, lib/export/player-core.mjs, the shared register plumbing (§8 Phase 1).
done when — `cover: light` stamps `cover-light` on title and closing in light and dark with scheme-aware inks; today's `light`, `title light` and `BOOKEND_FORCES_DARK` keep their tested meaning; the owner signs off the HTML player renders; golden-diff shows existing decks unchanged.
