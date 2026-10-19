---
origin: 2744
priority: P3
recorded: 2026-10-18
reviewed: 2026-10-18
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

status    — reviewed 2026-10-18 and left open on purpose. No pane in `lib/components/layout/columns` or
            `rows` (docs, manifests, galleries) declares a floor, cap or shape range, so a migration moves
            no pixel while touching every pane slide (tier 2 trio). Do it with the first pane that needs
            one, and decide the authoring syntax for that limit then: it is a new author-facing surface.

update    — 2026-10-19: the premise needs one correction. 67 of 79 component manifests already declare a
            minimum pane share (`pane.side` / `pane.stack`) and the engine stacks or splits a slide
            whose pane falls below it (`lib/core/pane-spec.js`). So a floor exists, as a share of the
            slide. What is missing is sizing by a figure's SHAPE: see `2779-p1` and §8.8 of the mosaico
            note. Do that first; `template` is needed only if a share-and-shape rule cannot express a pane.
