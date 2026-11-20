---
origin: 3335
priority: P3
recorded: 2026-11-20
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-20-deck-preset-study.md §8
deferred: large — a new composition axis for title and section slides
source: https://github.com/Laticent/lattice/pull/3335
---

# N1: bookend compositions (masthead, ledger, column, label, stage, frame, poster)

why now   — the cover identity of all eight presets that clear 8.5, currently deck CSS in the prototypes (D6).
where     — the bookends register (p11), the anchor bucket (title, closing, divider) and the --fs-* roles.
done when — `bookends: <surface> <composition>` styles title, closing and divider alike from tokens only; each composition renders in light and dark; the presets that use them are rescored at 8.5 or higher by both judges.
