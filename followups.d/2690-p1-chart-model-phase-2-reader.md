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
            4. A grouped number (`1,200`) is not a record value (Segno reads numbers ISO in, §5), and the census
               counts 78 grouped funnel values: the codemod writes `1200` and the chart shows it grouped.
            5. Lint's `recordPlace` and `bridgeRecordsSource` read a row's lead per line, so a record on a continuation line, or after a
               bullet-character switch, can differ from the engine (no visible effect found); the narrator picks its chart by the first
               class token (`pictureDataClass`), not in dispatch order. Both go away when the kernels read `readRecord`.
            6. Residuals found by the third review round (2026-10-17), no visible effect: lint's `recordPlace` differs from the engine after an
               ordered-to-bullet list switch and after a margin comment; a record on `map` takes any `{word}`; a bullet keyword row (`Target`, `Floor`, `Band`)
               written as a record under a measure that has a value is read as that measure's note (lint warns); the narrator picks its
               chart by the first class token, not in dispatch order; a record in a map row can take any `{word}`.
            7. Stacked-bar's authored category total over records (`- FY23 `24`` over `{18}` `{6}`) is read as a note and lint warns; the
               chart-row reader in phase 2 step 2 should read the segments, and the delta-note ambiguity needs the reader, not a position rule.
            8. A chart list inside a top-level `>` quote draws from old spans but not from records (red team
               finding 7, 2026-10-16); and `chart-table-unescaped-pipe` misses a row that does not grow
               (`| AM | 3 `{> a | b}` |` under a three-column header), and its `\|` fix still meets `pill-literal`.
done when — no transform or narrator parses a row's spans itself; the bridge and `legacySpans` are deleted
            with the old spellings (phase 4); the census shows no private reader.
evidence  — corpus parity unchanged (HTML, marks, narration, lint), plus the per-chart matrix
            `test/unit/core/chart-row-record.test.js` rewritten to compare the record against its expected marks
            rather than against the old spans.
verify    — tier 2 adversarial trio, because it changes what the shared kernel reads.
            9. Fifth round (2026-10-17): a record is drawn only as the sole value of its row's lead paragraph, so a record in a later
               paragraph, beside another value, or a plain-number record under a valued parent on bar, line, slope or stacked-bar
               stays a pill (as on main); bullet and radar read every nested row as detail, so bullet's keyword rows and radar's
               nested rows written as records keep their pills and lint warns. The reader in step 2 lifts these.
           10. Sixth round (2026-10-17, independent checker on 55073a6): the runtime now remembers the source of a pill it draws, so a
               badge (`{1, circle, c5}`) earlier in a row no longer makes a later record a pill there only; a raw `<ul>`/`<table>`
               ahead of the chart's counts as the first list on every path; the source bridge ends a heading item's lead. Left: a
               pill the ENGINE drew is read back from its shape and label (a bare label pill is a value, anything else is not), which
               matches the engine except for a pill whose label alone reads as a value by another rule; the narrator reads LF-normalized
               text when it rewrites a CRLF slide, which narrates where main returned null (an improvement, off the path).
           11. Seventh round (2026-10-17, second independent checker on 2745994): fixed here with a test each: a bullet-character or
               ordered-delimiter switch starts a new list in the source bridge; the bridge sees a lead end behind `&nbsp;`; a `<ul>` in a
               comment or an attribute is not a raw list; a heatmap `{value=3}` is no claim (the bridge cannot spell it); lint and the
               pill pass are linear on a row of many spans. Left: lint's `chart-row-record-unread` is silent on a heatmap `{value=3}`
               and on a `<code>{9}</code>` written in raw HTML after the chart's list (a pill in the runtime only, on `main` too);
               the narrator narrates a CRLF record row that the old form leaves null (an improvement, off the path).
           12. Eighth round (2026-10-17, third independent checker on 584b63c): fixed here with a test each: the runtime ownership check
               is linear in the spans of one row (it answered after reading the whole row's lead for every span); `rawBlockCounts`
               is bounded on a huge raw block (the `ANY_TAG` comment claimed more than the 4000-piece bound gives); an inline raw
               `<ul>`/`<table>` in a paragraph and a raw `<table>` ahead of a matrix-grid count as ahead in the pill pass and the
               cell decoder; the source bridge reads a record before `&nbsp;` and leaves a record behind a raw list alone; the DOM
               mirror ends a lead at a comment or a raw `<div>`/`<hr>`. Left, narration only and rare: a record in a double-backtick
               span is drawn but not narrated; the narrator still rewrites a record after a quoted grid table or a `|` continuation line.
