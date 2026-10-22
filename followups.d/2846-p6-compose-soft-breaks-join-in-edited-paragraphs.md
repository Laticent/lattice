---
origin: 2846
priority: P6
recorded: 2026-10-22
area: website
severity: medium
swimlane: engineering/decisions/2026-10-21-compose-point-and-click.md §7b
source: https://github.com/Laticent/lattice/pull/2846
---

# Compose: editing a paragraph joins its soft line breaks, and the engine draws each as a break

why now   — the engine runs with `breaks: true`, so `a\nb` is two lines; Compose writes `a b`. Measured on four shipped slides that unlocked with the math atoms (math.gallery.md, math-form-frame.md, math-split-structure.md, finish-backdrops.md).
where     — docs/src/lib/compose/deck-markdown.ts (the `softbreak` token and the serializer's `hard_break`).
done when — a paragraph with soft breaks round-trips its line breaks.
evidence  — corpus test over the shipped decks comparing rendered `<br>` counts.
verify    — tier 1 checker.
