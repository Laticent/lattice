---
origin: 2927
priority: P14
recorded: 2026-10-27
area: website
severity: low
swimlane: engineering/decisions/2026-10-27-slide-structure-strip.md §6
source: https://github.com/Laticent/lattice/pull/2927
---

# Show which slides share a block of text

why now   — Authors cannot see the block structure that today decides what an op touches.
where     — Strip-actions module; units and parts from `docs/src/lib/deck-outline`.
done when — a block with several slides has a bracket labeled with its title and, in thumbnails, a shared tint; it changes no behavior.
evidence  — Design §6.2.
verify    — Screenshot both strips on a deck with a split block.
