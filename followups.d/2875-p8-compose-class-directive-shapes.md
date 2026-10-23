---
origin: 2875
priority: P8
recorded: 2026-10-23
area: website
severity: low
swimlane: engineering/decisions/2026-10-21-compose-point-and-click.md §7b
source: https://github.com/Laticent/lattice/pull/2882
---

# Compose reads a slide's class from `_class` directives only, so two shapes lose their chips

why now   — the checker on #2882 found two slide-class shapes the engine reads and Compose does not. (1) Two `_class` directives (`<!-- _class: content -->` then `<!-- _class: checklist -->`): the engine applies the last, `slideClassOf` takes the first, so the slide draws markers and Compose paints no chip. (2) A non-underscore `<!-- class: checklist -->`: the engine inherits it into this slide and every one after, Compose's `DIRECTIVE_LINE_RE` captures only `_` keys, so those slides read as `content`. Both lose chips the slide draws; `isStatefulClass` (table cells) has the same blind spots, so they predate the list-item gate.
where     — docs/src/lib/compose/deck-source.ts (`slideClassOf`, `DIRECTIVE_LINE_RE`), docs/src/components/studio/ComposeView.tsx (`listMarkerDrawn`, `isStatefulClass`).
done when — a slide's class in Compose matches the engine's for both shapes, for list chips and table-cell chips.
evidence  — an e2e with each shape, counting chips.
verify    — tier 1 checker.
