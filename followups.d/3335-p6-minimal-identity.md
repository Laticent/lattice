---
origin: 3335
priority: P6
recorded: 2026-11-20
area: theming
severity: low
swimlane: engineering/decisions/2026-11-20-deck-preset-study.md §5
deferred: large — a redesign of a shipped preset, judged against the floor
source: https://github.com/Laticent/lattice/pull/3335
---

# Give the Minimal preset a real identity

why now   — decision D2: both judges found Minimal is Classic with a left headline.
where     — the minimal entry in lib/core/front-matter-key.js.
done when — the round-6 Minimal design ships (no header or footer, page numbers kept, light-weight headings, square corners; deck-preset-study.md §6); existing `preset: minimal` decks are rendered before and after and reviewed. Minimal may score below 8.5 (owner, 2026-11-20).
