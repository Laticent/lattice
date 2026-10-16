---
origin: 2690
priority: P1
recorded: 2026-10-14
area: chart
severity: medium
swimlane: engineering/decisions/2026-10-14-chart-authoring-uniform-model.md
source: engineering/decisions/2026-10-14-chart-authoring-uniform-model.md §9 and §10; engineering/decisions/2026-10-14-chart-authoring-census.md §3 and §4
---

# Phase 2 of the chart authoring model: the record drawn on every path

why now   — Slice 1 (2026-10-16) landed the half that needed no rendering change. Each of the 16 charts
            declares its row schema in its manifest's `segno` block, and `lib/core/chart-rows.js` is the one
            reader. The narrator, lint and Compose take detail, markless rows and descriptions from it, and
            `rowQuotesAsBullets` is gone. The record form is still not drawn. Lint
            `chart-row-record-unread` warns about it and offers the old spans, because a row written
            `{4.2}` loses its value today. Phases 3 (editor) and 4 (codemod) need the record drawn first.
where     — 1. Ownership (model note §9). Claim a row's DATA record before the pill pass, on every path:
               the engine plugin (`lib/integrations/markdown-it/plugins.js` `inlinePills`), the runtime
               mirror (`lib/core/resolve-inline-code.js` `isOwnedElement`), Compose's `normalizeObjects`,
               lint's `renderedInlineSpans`, plus an arm in the fidelity probe
               (`test/unit/core/marp-fidelity-render.test.js`). It must be narrower than `sits: list-rows`:
               that owns every span on the row, so a pill in a label or in a `>` description would stop
               rendering. A candidate test: the row's last span, outside any quote, that `readRecord` reads.
            2. Each transform reads the record through `readRecord` instead of its private parser. Census
               note §3 lists the parsers: `stripTrailingPills`, `parseSeries`/`readLeadValue`, funnel and
               map's regexes, radar's `parseAxisItem`, bullet's named nested rows. Each narrator does the
               same. `legacySpans` is the bridge.
            3. The `{> …}` production and the table description (model note §9), which is where P2 of
               the 2723 follow-up lands.
            4. `tools/chart-authoring-census.mjs` reports no chart reading its rows through a private
               parser.
done when — a row written `{…}` draws the same marks as its old spans on every in-scope chart, on the
            engine and the runtime; `chart-row-record-unread` is retired; the census shows no private reader.
evidence  — the corpus parity run (every chart slide's HTML, mark count and narration) unchanged, plus a
            matrix of each chart's record and old forms rendering identically.
verify    — tier 2 adversarial trio, because it changes what the shared kernel and the pill pass read.
