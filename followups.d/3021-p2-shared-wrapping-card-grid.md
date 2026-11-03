---
origin: 3021
priority: P2
recorded: 2026-11-03
area: inventory
severity: medium
swimlane: engineering/decisions/2026-11-03-responsive-tables.md
deferred: large — about 20 components (cards-grid, cards-stack, verdict-grid, pricing, stats, kpi, logo-wall, actors, team-profile, q-and-a, inventory, glossary list form, list, list-steps, checklist, agenda, decision, compare-prose, split-compare)
source: https://github.com/Laticent/lattice/pull/3021
---

# One shared wrapping grid for card and list components, replacing per-shape column rules

why now   — with type held at slide size these components keep their columns side by side and squeeze: verdict-grid at 360px is two cards with one word per line. Several also duplicate their reflow in both a data-orientation and a data-family rule (17 components).
where     — each component's styles.css; the shared rule belongs beside base.table-reflow.css. Reuse the paged/continuous split and the fit check (lib/core/table-reflow-fit.js) from #3021.
done when — each listed component drops to fewer columns as its box narrows, a slide never clips where it fit before (fit check), and the duplicated data-orientation rules are gone.
evidence  — the Frame Lab Compare view at 1280, 640 and 360px, per component.
verify    — npm run lab:build; npm run check:family-conformance; a render sweep against main.
