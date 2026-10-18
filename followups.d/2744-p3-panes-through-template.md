---
origin: 2744
priority: P3
recorded: 2026-10-18
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-mosaico-layout-library.md §8.6
source: https://github.com/Laticent/lattice/pull/2763
---

# Route the columns / rows panes through the template strategy

why now   — slice 2 shipped the kernel (§8.6) but not the migration: `columns` and `rows` are fixed-ratio
            CSS pairs, so a move changes no pixel until a pane needs a floor, cap or shape range. This is
            the first pane that does.
where     — lib/components/layout/columns, lib/components/layout/rows (stamp step), docs/src/lib/mosaico/
            template.ts; the pane component docs for whichever pane gains the limit
done when — a pane declares a minimum width or a shape range and the layout honors it through `template`;
            every committed pane deck renders pixel-identical where no pane declares one
evidence  — before/after renders of every committed pane deck; a demo deck (HARD RULE #9) for the new limit,
            light and dark
verify    — tier 2 adversarial trio, because it changes every pane slide
