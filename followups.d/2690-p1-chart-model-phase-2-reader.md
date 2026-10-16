---
origin: 2690
priority: P1
recorded: 2026-10-14
area: chart
severity: medium
swimlane: engineering/decisions/2026-10-14-chart-authoring-uniform-model.md
source: engineering/decisions/2026-10-14-chart-authoring-uniform-model.md §7 and §9; engineering/decisions/2026-10-14-chart-authoring-census.md §4
---

# Phase 2 of the chart authoring model: one schema-driven reader

why now   — #2690 landed phase 1 (the census) and the pieces phase 2 stands on: LFM §3.6 data
            slots, the `>` row description on all 13 detail charts, and the EU and ISO number
            readers. A row's `>` now has three readers: the engine's HTML lift
            (`takeRowDescription`), the narrator's source scanner (`rowQuotesAsBullets`) and the
            flowchart/state-chart grammar. Phase 2's one reader is what retires the scanner and
            every chart's private row parser. It is blocked on the owner's answers to the model
            note's §7 questions: whether bullet and progress are lists or tables, radar's
            `quadrant` variant, the cross-chart field vocabulary, and whether a description may
            hold a `|`. The census note §5 has the evidence for each.
where     — the model note §5 and §9 (the plan); `lib/core/chart-row-detail.js` (the transitional
            scanner); `lib/components/chart/_chart-family/mark-detail.js` and `cartesian.js` (the
            HTML-level semantics phase 2 must keep); the census note §2 (each chart's private
            readers).
done when — one manifest schema drives the reader, the narration and lint for the in-scope
            charts; `rowQuotesAsBullets` is deleted; and the census tool shows no chart reading
            its rows through a private parser.
evidence  — the census rerun before and after, with mark counts identical across the corpus.
            The demo deck renders unchanged, and narration parity tests pass.
verify    — tier 2 adversarial trio, because it replaces the row reader of every chart.
