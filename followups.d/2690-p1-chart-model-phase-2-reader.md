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
            5. Lint's `recordPlace` reads a row's lead per line, so a record on a continuation line, or after a bullet-character switch,
               can differ from the engine (no visible effect found; the place oracle counts 163 slides, to be taken to 0 by moving
               lint's line walker onto the shared tracker); the narrator picks its chart by the first class token
               (`pictureDataClass`), not in dispatch order. `bridgeRecordsSource` no longer reads lines (round 16).
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
               mirror ends a lead at a comment or a raw `<div>`/`<hr>`. (Both of the narration-only residuals this item listed, a record in a double-backtick span and the quoted grid table, are
               fixed in round 16: the narrator reads the engine's tokens.)
           13. Ninth round (2026-10-17, fourth independent checker on 2b98e9b): fixed here with a test each: the runtime reads a code span
               inside an inline wrapper (`**`40`**`) as part of the row's lead, as the engine and Compose do (a delta beside it stayed
               a pill on `main` and lost its text in the runtime); the HTML bridge reads a pill an earlier pass drew in the row as code
               right before and as a lead span, as the pill pass does (it rewrote a record the pill pass declined, and lint's message
               about that shape was false). Left, lint-only and no visible effect found: lint's `recordPlace` treats a trailing `&nbsp;`
               as content, does not count a bullet-to-ordered delimiter switch, a quoted list ahead, or an inline raw `<ul>` as lists
               ahead; Compose's `ownsRecord` does not count an inline raw `<ul>` ahead; the narrator reads CRLF text as LF once it rewrites.
           14. Tenth round (2026-10-18, fifth independent checker on 1a5aa32): its six confirmed defects shared one root, a second decision:
               the HTML bridge re-decided ownership from the HTML and drifted from the pill pass (raw `<blockquote>`, a stray `</ul>`,
               a no-break space after a grid cell, a comment, an escaped span). Fixed structurally: the claimer stamps
               (`data-lat-record`), the bridge only follows the stamp, so a claimed span cannot be left as raw braces. The DOM mirror
               and the pill pass still decide independently per path, so a rare shape can draw on one path and stay a pill on the
               other (a pill is what `main` drew); lint and Compose are separate readers. Also fixed: an escaped span earlier in the
               row is no value to the mirror; a comment after the record is content to the mirror, as to the pill pass; the
               matrix-grid cell decoder counts a cell's sole record as the pill pass does. Left, low: the runtime's descendant query
               for wrapped lead spans is slow on thousands of wrappers in a parent with thousands of children; jsdom (not Chromium)
               runs the ownership check slowly on 8,000 old-form rows (a `querySelector` per code element).
           15. Eleventh round (2026-10-18, sixth independent checker on c89f073, the first review of the stamp design): fixed here with a
               test each: a stamp can no longer leak (an author-written `chart-frame` class bridges before its guard; the dispatch strips a
               stamp from a section the chart family never reached; the runtime settles every stamp left after its chart pass: it strips one
               on a built chart and rewrites an unbuilt one, such as an export with the chart family off, to the old-form spans);
               raw-block counting has a per-slide budget (the cost of many large hostile blocks was bounded per block, not per slide);
               a matrix-grid behind an inline raw table, a source bridge behind an inline raw list, a literal-mode slide's narration, and
               the CRLF narration now follow the render; the runtime reads a flowchart-owned row span before a record, as the engine does.
               Left: the browser cannot tell a raw `<code>{1}</code>` from a backticked span in the Marp path, so it claims it where the
               engine does not (HTML, not a deck an author writes in Markdown); a deck-wide `inline-code: literal` register is front matter
               the narrator is not handed; Compose ignores a raw list ahead (editor display only; a slide with raw HTML is locked there).
           16. Twelfth round (2026-10-18, seventh independent checker on c11c86f): fixed here with a test each: the matrix-grid pass scanned raw
               HTML on every slide of every deck, with no budget (now only on a matrix-grid slide, within the per-slide budget); a hand-written
               `chart-frame` class in the browser showed raw braces (a built chart is now told by its `.chart-body`, so the old-form list shows);
               narration and lint read inline code that mentions `<ul>` as a list ahead (code spans are text); a deck-wide `inline-code:
               literal` register is now honored by the narrator, which is handed the deck; a raw list ahead no longer counts as a list to a
               row owner (hub-spoke), only to a record, so the engine's HTML for that slide is as on main. Left, rare: jsdom (not Chromium) runs
               the ownership check slowly on thousands of rows (a `querySelector('ul, ol')` per row-ending span); on the docs site's
               on-demand kernel path a declined slide before its kernel loads keeps its claimed `{…}` as code until the host reloads and
               renders again. (The dispatch's whole-page strip of ` data-lat-record=""` is fixed in round 13.)
           17. Thirteenth round (2026-10-18, the adversarial trio on caf836b): fixed here with a test each that fails on the earlier code:
               the ownership check re-read every ancestor span for each child row (8.6 s of lint for a hostile 14 KB deck with no record,
               43 ms on main; now memoized and span-first: 73 ms); the pipe lint rescanned table bodies; a badge record before the label
               (`{1}` North `{40}`) and a record in a quoted chart list were silent value losses (lint now warns); the browser claimed a
               record inside a raw `<ol>` wrapper and read a commented matrix-grid cell as a state (both now as the engine); the final
               strip touched an author's attribute text (now only the exact stamped `<code>`); a lint fix text named the record itself;
               Compose read a trailing comment as content. The generated differential gained lint and browser arms. Left, low: a record
               cannot write digit grouping (`{1,200}`), stated in the changelog; scope of nested-list records is the owner's revisit
               (followups.d/2746-p1-revisit-nested-list-records.md).
           18. Fourteenth round (2026-10-18, independent checker on the round-13 fixes): fixed here with a test each: round 13's Compose
               change wrongly read a trailing comment as no content (the engine keeps it as an html_inline child, so the record is not
               the row's last span; Compose now agrees again); the runtime's raw-wrapper rule also declined a raw list inside a row,
               which the engine claims (now only a wrapper at the slide's top level); lint was silent on a plain-number badge before a
               record value (`1` North `{40}`, the row is lost; now warns); the quoted-list warning fired on a row's quoted description,
               where neither form draws (now only a quote that holds the chart list). Left, pre-existing (identical at caf836b): a raw
               `<ul><li>` wrapped around the chart's Markdown list makes the engine decline the records (it counts the raw list ahead)
               while the browser claims them, so the engine path shows pills where the old form draws; raw HTML around a chart list,
               rare.
           19. Fifteenth round (2026-10-18, independent checker on 66556b7): the runtime's raw-wrapper rule cannot tell a hand-written
               top-level `<ul><li><ul>` from a Markdown row's `li` in the DOM, so it claims records there while the engine declines
               (a pill in the engine, `<code>` in the browser; neither draws a chart; the shape it fixes, `<ol class="steps">` around
               the list, is the plausible one). Lint's badge warning misses a badge inside emphasis (`**`1`** North `{40}``), a badge on a
               continuation line, and a value after the label (`North `1` grew `{40}``), and names the badge as the cause when the real
               one is a trailing comment. The narrator reads a badge row as drawn where the engine draws no bar for it. A test comment
               said `North `40` grew `{+4}`` draws something; it draws no North bar. All low and rare. The structural fix is one shared
               place-measurer for the five readers (the inversion's "medium change"), not another patch per reader.
           20. Sixteenth round (2026-10-18, the owner's call to build the shared place-measurer): `place-oracle.test.js` runs a seeded
               corpus of 390 hostile slides through each reader and holds it to the engine's answer; it found the browser and Compose in
               agreement and lint's line walker disagreeing on 163 slides and the narrator's on 49. `chart-places.js` counts a span's
               place once from tokens (the engine's pill pass now asks it, byte-identical on 806 repo slides and 1,585 generated decks),
               and the narrator's bridge moved to `chart-source-bridge.js`, which asks it over the engine-configured parser (49 to 0;
               the unpadded double-backtick and the quoted-table narration residuals close with it (a PADDED ``` `` {1.5} `` ``` record is still missed by the narrator and lint: round 18); markdown-it is external in the read-along
               bundle, as in the authoring bundle). Lint's `renderedInlineSpans` (163 to 0) and the engine's `matrixGridCells` and the browser's `applyToDom`
               (which decided a sole `{done}` cell without the shared decision: a seventh and eighth measurer) now ask the shared
               decision with the shared counting; a matrix-grid arm of the oracle compares which cells become state cells, engine
               against browser. Still to do: lint's `findChartRowRecords` (the unread-record warnings) still counts depth, quote and
               lists in a token loop of its own.
           21. Seventeenth round (2026-10-18, the Munger inversion on the shared place tracker, 8e7bb90): fixed here: the tracker's header now says
               `inline()` must be called on EVERY inline token (it marks a list item's lead as seen; a caller that skips a code-less first
               paragraph makes the second paragraph the lead), with a corpus shape that pins it; the oracle's comment no longer says the
               narrator and lint agree "by construction" (they agree where the engine's tokens are the parser's); lint's token parse is
               memoized per slide text (invalidated on `setBoundaryPluginsOff`), so a per-keystroke lint re-parses only the slide that changed.
               Left, each low and logged: (a) the narrators' copy of the boundary parser (inlined into the read-along core) is not switched by
               `plugin-admission.ts` under a host that narrows plugins, so with math off a chart row inside a `$$` block is read on the
               default grammar; the fix is a setter registry like `lint-boundary-state.js`, adopted when the read-along core loads;
               (b) about twenty engine core rules rewrite tokens before the pill pass, and `strip_heading_periods` (`no-period`) empties a trailing
               `.` after a record, so on `bullet no-period` with `### EMEA \`{1.5, target=3}\`.` the engine claims a record the narrator and
               lint do not (identical at 0bcab12): the corpus has no class modifiers; (c) heatmap cells written ``` ``{1.5}`` ``` or with padding
               inside the backticks are claimed by the engine and the browser and missed by the narrator's `RECORD_CELL` and lint's pipe-column
               match (identical at 0bcab12); (d) the oracle's matrix-grid arm compares the ordered list of cell classes, not which cell, and
               its narrator arm calls the bridge directly, not through `readChartRows`; (e) when phase 4 deletes the bridge, the narration
               bundle's `external: ['markdown-it']` and its third boundary-parser copy go with it, and nothing will flag them.
           22. Eighteenth round (2026-10-18, red team and independent checker on 8e7bb90): fixed here with a test or a corpus shape each: lint's
               token parse ran once per lint RULE per chart slide (nine rules call `renderedInlineSpans`), which pushed a timing test to its
               budget; it is memoized per slide text now (the 4,000-row pipe-lint fixture: 1,600 to 2,400 ms down to 210 to 610 ms); lint's table
               column check was cubic in the cells of a row (a 3,000-cell row took 183 s, now 0.2 s) and skipped pipes inside code spans, while
               markdown-it splits on every unescaped pipe: one pass now counts them as the parser does; a raw `<table>` inside a cell of the
               chart's own table was counted as a table "ahead" of it, so the engine drew a pill where the browser drew a state cell (it
               is nested in the table, not ahead of it: the old matrix-grid pass was right, and the pill pass, which had the same count for
               heatmap, now agrees); the browser's matrix-grid check took the nearest section element, so a raw section element the author wrote inside the slide hid the
               chart class (`applyToDom` now passes the section it is iterating); the narrator bridge no longer folds a lone-CR source to LF
               (that added lines it read as rows) or drops a BOM. Two intended behavior changes, both for exotic input: a matrix-grid record cell
               on a slide with TWO chart classes (`matrix-grid bar`) follows the chart the dispatcher draws, as the pill pass always did; and
               a raw table inside a cell no longer demotes the records after it.
               Left, each low and identical at 0bcab12 unless noted: the narrator's parser is the block parser only, so engine-only inline
               syntax around a record (a row with inline math that contains a backtick, then a record) can split the two; a padded
               double-backtick record, and a record followed by `&nbsp;` on a continuation line, or by `&ensp;`/`&#32;`, are claimed by the
               engine and missed by the narrator and lint; a comment on a continuation line differs for the DOM; the narration bundle's
               `markdown-it` resolves to the docs package's copy (14.3.0) and the engine's is the root's (14.1.1), the same split the authoring
               bundle has.
