---
origin: 2690
priority: P1
recorded: 2026-10-14
area: chart
severity: medium
swimlane: engineering/decisions/2026-10-14-chart-authoring-uniform-model.md
source: engineering/decisions/2026-10-14-chart-authoring-uniform-model.md §9 and §10; engineering/decisions/2026-10-14-chart-authoring-census.md §3 and §4
---

# Phase 2 of the chart authoring model, what is left: the `{> …}` production and the private readers

why now   — Slice 2 (2026-10-16) drew the record on every path: ownership, the bridge in the chart family,
            the source bridge for the narrators, the grid cells, and lint (model note §10). A record row draws
            what its old spans draw on all 16 charts. What is left is the part that deletes the old branch.
where     — 1. The `{> …}` production and the table description (model note §9): `>` excluded from the first
               character of a record's first bare item, prose to the first unescaped `}`, LL(1) bound, grammar
               fuzz and the scaling ladder. The pipe lint (`chart-table-unescaped-pipe`) is already in place.
            2. Each transform and narrator reads the record through `readRecord` instead of the bridge
               (`bridgeRecordsHtml`, `bridgeRecordsSource`) and its private parser (census note §3):
               `stripTrailingPills`, `parseSeries`/`readLeadValue`, funnel and map's regexes, radar's
               `parseAxisItem`, bullet's named nested rows. Then `tools/chart-authoring-census.mjs` reports no
               private reader.
            3. The fields the bridge cannot spell as spans: bullet's `band=` and `floor=` (named nested rows
               today) and progress's `note=` (a nested row, drawn as a visible note). Until a transform reads
               them, lint `chart-row-record-unread` is what keeps a record that carries one from losing it silently.
            4. A grouped number (`1,200`) is not a record value (Segno reads numbers ISO in, §5), and the corpus
               has 64 grouped funnel values: the codemod writes `1200` and the chart shows it grouped.
            5. A record in a detail bullet under a row that holds a value stays a code span, where it used to
               be a pill. No deck in the tree has one; if a deck needs a pill there, the escape is `\{…}`.
done when — no transform or narrator parses a row's spans itself; the bridge and `legacySpans` are deleted
            with the old spellings (phase 4); the census shows no private reader.
evidence  — corpus parity unchanged (HTML, marks, narration, lint), plus the per-chart matrix
            `test/unit/core/chart-row-record.test.js` rewritten to compare the record against its expected marks
            rather than against the old spans.
verify    — tier 2 adversarial trio, because it changes what the shared kernel reads.
