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
done when — Minimal is distinct from Classic at thumbnail size and scores at 8.5 or higher (D5); existing `preset: minimal` decks are rendered before and after, and the change is reviewed.
