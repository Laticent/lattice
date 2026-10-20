---
origin: 2831
recorded: 2026-10-20
area: engine
swimlane: engineering/decisions/2026-10-20-inline-objects-audit.md
source: https://github.com/Laticent/lattice/pull/2831
priority: P4
severity: low
---

# A trailing pill stretches full width in column-flex items

A trailing pill is a slot in every component by convention, so inline-run leaves it. In components whose items are column flex and that read no such slot (matrix-2x2, list-steps), it renders as a bar across the item.

why now   — seen in the demo deck's first draft; the pill looks like a defect there.
where     — those components' CSS (align-self:flex-start on a trailing pill), or a manifest option to join the run.
done when — a trailing pill in each of those components keeps its natural width, in the audit and in a render.
evidence  — before and after render of a trailing pill in matrix-2x2 and list-steps.
verify    — tier 1: component CSS; visual review.
