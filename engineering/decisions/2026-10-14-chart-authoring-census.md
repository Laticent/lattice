---
status: shipped
summary: Phase 1 of the chart authoring model, measured with markdown-it over 425 decks, 298 doc examples and 136 manifest snippets - 879 chart slides, 512 on the 16 charts the model covers; the codemod would wrap 1,351 row values, merge 227 two-span rows, move 143 detail bullets and turn 116 nested-list slides into tables, and a third of the rewrites sit outside the decks; today's number reader reads an ISO space-grouped `1 234` as 1, and every chart reads its rows with a private parser.
---

# Chart authoring census (2026-10-14)

Phase 1 of `2026-10-14-chart-authoring-uniform-model.md` (§10). This note measures every chart
slide against that note's §2 model, lists where each chart disagrees with it, and counts the
rewrites by chart and slot. It changes no behavior. Phase 2's schemas and phase 4's codemod scope
rest on these numbers.

Re-derive everything here with `node tools/chart-authoring-census.mjs` (add `--only deck` or
`--only docs` to split the corpus, `--chart <name>` for one chart's slides with `file:slide`
references, `--json <path>` for the raw counts). It runs in under two seconds. The tables in §6
are its output on the commit that added this note.

## 1. How it counts

- **The corpus**, three kinds of source, each counted separately because a codemod has to reach
  all three:
  - **425 decks**: `examples/`, `test/integration/baseline-decks/`, every
    `lib/components/**/*.gallery.md` and `design/*.gallery.md`, `exemplars/` and `kit/`.
  - **298 doc examples**: each fenced `markdown` block in `lib/components/**/*.docs.md`, read as
    its own deck, because a doc's example is what an author copies.
  - **136 manifest snippets**: every string in a chart manifest that holds a `_class` directive
    (`sample`, `skeleton`, variant samples). This is the text the Insert menu, the catalog and
    agents insert, so a codemod that misses it keeps inserting the old syntax.

  4,775 slides; 879 carry one of the 24 chart classes (656 in decks, 87 in docs, 136 in
  manifests). **Left out, by name:** `.vscode/lattice.code-snippets`, the `.mdx` pages of the docs
  site (`LAB_PROGRESS` in `guides/status/component-pills.mdx` holds progress rows), and test
  fixtures such as `lib/plugins/chart-family/chart-family.fixtures.md`. Phase 4's codemod owes
  those a pass the census does not count.
- **The parser.** Slides are split by `splitSourceToSections` (`lib/core/section-source-split.js`),
  the engine's own boundary source, so a `split: headings` deck divides where the render divides.
  Each slide is parsed with markdown-it's default preset (GFM tables), and the census walks the
  tokens. No line regex decides what is a list row, a nested row, a table cell or a blockquote.
- **A value** is a span `isValuePill` (`lib/core/chart-values.js`) accepts. That is the test
  `parseSeries` uses to call a nested row data rather than detail, so the census's data/detail
  split is the transforms' split.
- **A slot** is where a span sits: the heading; a paragraph above the data (split into `[…]` axis
  brackets and everything else, which is mostly a kicker); a paragraph below; a top-level row's
  own line; a nested row's own line; a blockquote; a table header cell; a table body cell.
- **A rewrite** is one edit the §2 model asks for:
  - wrap a row's one span, a value or a text value (map's categories), in `{…}`;
  - merge a row's two spans into one record;
  - fold one of bullet's named nested rows (`Band`, `Floor`) into the record as a parameter;
  - move a value-less nested row (mark detail) into a `>` blockquote on a list slide, or into a
    `{> …}` cell on a slide that becomes a table;
  - turn a nested-series list into a table;
  - find a home for a span on a series slide's group row, which a series table has no cell for;
  - drop the comma from a number;
  - replace heatmap's `note=` span.

  The `outside` charts (gantt, kanban, journey, flowchart, state-chart, hub-spoke, roadmap,
  timeline-list) adopt only the number and description rules, so only those are counted for them.

**Against the earlier counts.** The model note's §5 counted 96 comma-grouped values on shipped
chart list rows (funnel 64, hub-spoke 19, line 12, bar 1). On `examples/`, the baseline decks, the
component galleries and `exemplars/` this census finds the same 96, chart by chart. §9 counted 617
chart slides with `.docs.md` excluded. Over the same files without `exemplars/` this census finds
616, and so does a plain line grep for `_class:` over those files, so the one-slide gap is not a
parser effect; where the 617 came from is not recorded. §9's "338 in scope" cannot be reproduced
from a stated chart list; the 14 charts §2 places give 331 over those files, and 364 with bullet
and progress.

## 2. Headline numbers

On the 16 charts the model covers (§2's nine list charts, three series charts and two grid charts,
plus bullet and progress), 512 slides:

| rewrite | decks | docs | manifests | total |
|---|--:|--:|--:|--:|
| wrap a row's one span in `{…}` (of which a text value) | 987 (34) | 129 (8) | 235 (8) | 1,351 (50) |
| merge two spans into one record | 177 | 12 | 38 | 227 |
| fold a named nested row into a parameter (bullet) | 3 | 0 | 2 | 5 |
| move a detail bullet into a `>` blockquote | 108 | 0 | 12 | 120 |
| move a detail bullet into a `{> …}` cell (slide becomes a table) | 21 | 0 | 2 | 23 |
| turn a nested-series list into a table (slides) | 80 | 14 | 22 | 116 |
| a group-row span with no cell in a table (all slope's status words) | 17 | 0 | 2 | 19 |
| drop a comma from a number | 77 | 7 | 15 | 99 |
| replace heatmap's `note=` span with `{> …}` | 2 | 0 | 0 | 2 |

**A third of the rewrites are not in decks.** The manifests alone carry 235 wraps and 22
list-to-table slides; the docs another 129 wraps and 14 slides.

Three of radar's slides (its `quadrant` variant: series, then group, then axis) have no GFM table
form at all and are not in the 116 (§5).

**Slots outside the data hold 316 spans on these charts**: 174 above the data that are not axis
brackets (kickers such as `` `Revenue · FY26` ``), 139 axis brackets, 2 below the data and 1 in a
heading. A codemod keyed on spans alone would rewrite every one of them. Row and cell slots hold
3,820 spans (1,972 on top-level rows, 1,846 on nested rows, 2 in table cells).

## 3. Where each chart disagrees with §2

Every chart reads its rows with its own parser, and every narrator in `lib/core/chart-narration.js`
reads the same rows a second time from source with regexes. No chart reads a `>` blockquote; mark
detail always comes from the first nested list (`lib/components/chart/_chart-family/mark-detail.js`).
The reader of each chart today:

| chart | transform reads | narrator reads | where it disagrees with §2 |
|---|---|---|---|
| bar | `parseSeries` (`_chart-family/cartesian.js`), last pill | generic `parseDataRows` | a nested row is a series point when its last pill is a number and detail otherwise; multi-series is a nested list, not a table |
| line | `parseSeries` | generic, then `lineSentences` | as bar; 23 of 34 slides are multi-series |
| stacked-bar | `parseSeries` | generic | nested list is data; a group row's own pill is kept as an authored total, a second value slot, though no slide in the corpus writes one (none of its 69 group rows carries a span); a value-less detail row beside the data rows has no slot in a series table |
| slope | `parseSeries` | generic, then `slopeSentences` | 19 entity rows carry a status word (`fail`, `live`); a series table has no slot for a per-row status |
| piechart | `stripTrailingPills`, **first** pill | generic | takes the first pill where bar, funnel and map take the last; reads with bare `parseValue`, so `PROJ-42` plots as 42 |
| funnel | its own last-`<code>` regex | `parseFunnelStages` | a row with no number is drawn at 0, not refused; 64 comma-grouped values |
| waterfall | `stripTrailingPills`, marker in any order | generic | the marker is a second pill (1 row in the corpus), not a named parameter |
| word-cloud | its own `<li>` regex | `narrateWordCloud`, first pill | no nesting model: one nested bullet under the first word collapses the cloud to one word (§4) |
| map | its own last-`<code>` regex | generic | 50 rows carry a text value (a category), so the schema needs a text field type |
| scatter | `readPoint` (`lib/core/chart-point.js`), last pill | generic, `pointOnly` | closest to §2 already: every row is a record |
| quadrant | `parseItem` and `readPoint` | `parseQuadrantGroups` | already records; a point's `trail` holds two records on one row (the transform reads both, the second as `to`), which one record per row cannot hold |
| radar | its own `parseSeries` and `parseAxisItem` | `parseRadarSeries` | multi-series is a nested list; the `quadrant` variant adds a group level no table holds |
| heatmap | `parseTable`, `readCell` | `parseDataTable` | already a table; a cell description is a `note=` span |
| matrix-grid | markdown-it `parseCell` | `authoredTable` | already a table of state marks; nothing numeric |
| bullet | `stripTrailingPills`, two values, named nested rows | `parseBulletRow` with its own copy of the name regexes | measure and target are two pills; `Band`, `Target`, `Floor` and `Actual` are named nested rows, not record parameters |
| progress | `stripTrailingPills`, `pills[0]` and `pills[1]` | `firstListTree` | percent and status are two pills; nested rows render as a visible note |

**Other private readers**: lint's `unknown-map-region` strips the trailing span with its own regex
(`lib/authoring/lint-core.js`), `trailingRowPill` reads waterfall's marker position, a gantt
copy of `stripTrailingPills` lives there too, and `lib/core/first-list-tree.js` feeds progress's
narrator and hub-spoke's lint. The read-along core and the guide player are bundles of
`chart-narration.js`, not separate readers. Compose has no chart-row reader yet.

**Which pill counts differs**: the first on pie and in the word-cloud narrator, the last in
`readLeadValue`, funnel, map, radar and scatter. **Data versus detail differs**: the transforms
decide per nested row; the narrator decides per slide (`nestedIsData`). Phase 2's one reader
removes both disagreements; §6's `check-ownership` rule keeps them from coming back.

## 4. What phase 2 must know

- **The number reader rejects ISO input today, and one path misreads it.** `isValuePill('1 234')`
  is false, so a nested row written the ISO way becomes mark detail. `parseValue('1 234')` returns
  **1**, so on pie, funnel, map, radar, word-cloud and progress (which call `parseValue` without the
  guard) `1 234` plots as 1, silently. The same holds with a no-break space (U+00A0) or a narrow no-break space (U+202F) as the separator. `{4.2M}` is
  refused by `isValuePill` but read by `parseValue` as 4,200,000. The ISO reader is phase 2's
  first job. The PR that added this note fixes the EU case that shares the reader (`1.234,5`)
  and logs the space misread as `followups.d/2690-p2-iso-space-grouping-reads-first-group.md`.
- **No dot-grouped number (`12.000`) appears in the corpus**, so the pasted-locale lint fixes
  author input, not shipped decks.
- **Descriptions start from zero on the 16 charts**: no `>` blockquote under an item, no
  `{> …}` span. Flowchart and state-chart carry 15 between them, outside the model. **No column-0
  `>` sits between two chart list items anywhere in the corpus**, so the lint that follow-up
  2686-p2 asked for (`chart-list-split-quote`, added by the same PR) catches new mistakes and fixes no
  shipped deck.
- **Progress's visible nested note is used on no slide.** §3 decision 7 turns it into a named
  visible field; no deck in the corpus loses content to that.
- **Heatmap: 134 empty cells and no cell a strict reader would refuse.** The `$1.2M to $1.5M`
  partial read in the model note §5 does not occur in shipped decks. The empty cells are why a
  field needs a stated meaning for "empty".
- **Map needs a text field type** (50 rows), and **slope needs a per-row status** that a series
  table has no column for: a status column, or a `{…}` span on the label cell.
- **Stacked-bar's authored group total is unused**: no group row in the corpus carries a span,
  so phase 2 may drop that exception rather than give it a schema field.
- **Two tables on one slide.** `examples/chart-lead-blocks.md` slide 4 (bar) already puts a lead
  table above its list; converting the list to a table gives the slide two, so a reader that takes
  "the first table" reads the wrong one.
- **A defect found on the way.** Word-cloud has no nesting model: a row `` - Alpha `5` `` with one
  nested bullet under it, then `` - Beta `3` ``, renders a one-word cloud (`data-count="1"`) and leaves Beta
  as stray prose. No shipped deck nests under a word, so it is pre-existing and off this path;
  it is logged as `followups.d/2690-p1-word-cloud-nested-bullet-drops-words.md`.

## 5. Evidence for the owner's open questions (model note §7)

These are measurements, not decisions.

- **Bullet and progress, list records or tables.** Bullet: 20 slides, 86 rows, every one of them
  two value pills (measure, target). 5 nested rows are named: 4 `Band`, 1 `Floor`; no slide uses
  `Target`, `Actual` or `Range` as a nested name. A list record writes the common row as
  `{4.2M, target=5.0M}` and the rare one as `{4.2M, target=5.0M, band=60%, floor=90%}`; a table
  needs a column per name, empty on all but a handful of the 86 rows, and cannot hold "any number of bands" without
  a repeat rule. Progress: 30 slides, 140 rows; 139 are a percent and a status word, 1 is a bare
  percent, and no row has a nested note. Either form holds progress; the record is one span per
  row, the table one column per field.
- **Radar's `quadrant` variant.** 3 slides use it: radar's gallery, its docs and its manifest
  sample; no example deck does. Every other radar slide is plain series and fits a table.
- **A `|` inside a description.** The corpus holds no description in a table yet (§4), and
  neither `note=` span on a heatmap holds a `|`, so there is no shipped text to break either way.
- **The phase 4 gate.** For the first half of its evidence (how many schema exceptions today's
  shapes need), §3's table names the exceptions phase 2 must decide: slope's per-row status (19
  spans), map's text values (50 rows), stacked-bar's authored group total (0 uses), detail beside a
  series' data rows (23), quadrant's two-record `trail`, waterfall's marker, bullet's named rows (5),
  and radar's group level (3 slides).

## 6. The census output

Corpus: 425 decks, 298 fenced `markdown` blocks from .docs.md and 136 manifest snippets (859 sources), 4775 slides, 879 on the 24 charts.

**Slides and containers**

| chart | shape | slides | decks | docs | manifests | list | table | rows | depth 2 | depth 3 | depth 4+ |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| bar | list | 34 | 24 | 4 | 6 | 34 | 1 | 144 | 64 | 0 | 0 |
| line | list | 34 | 24 | 4 | 6 | 34 | 0 | 184 | 371 | 0 | 0 |
| piechart | list | 46 | 40 | 2 | 4 | 46 | 0 | 231 | 27 | 0 | 0 |
| funnel | list | 30 | 26 | 1 | 3 | 30 | 0 | 142 | 24 | 0 | 0 |
| waterfall | list | 16 | 10 | 2 | 4 | 16 | 0 | 106 | 7 | 0 | 0 |
| word-cloud | list | 44 | 32 | 5 | 7 | 44 | 0 | 412 | 0 | 0 | 0 |
| map | list | 44 | 30 | 6 | 8 | 44 | 0 | 276 | 19 | 0 | 0 |
| scatter | list | 22 | 14 | 3 | 5 | 22 | 0 | 148 | 14 | 0 | 0 |
| quadrant | list | 48 | 32 | 7 | 9 | 48 | 0 | 182 | 335 | 19 | 0 |
| stacked-bar | series | 22 | 14 | 3 | 5 | 22 | 0 | 69 | 243 | 0 | 0 |
| slope | series | 20 | 12 | 3 | 5 | 20 | 0 | 95 | 192 | 0 | 0 |
| radar | series | 47 | 31 | 7 | 9 | 47 | 0 | 121 | 622 | 47 | 0 |
| heatmap | grid | 31 | 25 | 2 | 4 | 0 | 31 | 0 | 0 | 0 | 0 |
| matrix-grid | grid | 24 | 20 | 1 | 3 | 0 | 24 | 0 | 0 | 0 | 0 |
| bullet | open | 20 | 12 | 3 | 5 | 20 | 0 | 86 | 5 | 0 | 0 |
| progress | open | 30 | 26 | 1 | 3 | 30 | 0 | 140 | 0 | 0 | 0 |
| gantt | outside | 37 | 33 | 1 | 3 | 37 | 0 | 86 | 215 | 14 | 0 |
| kanban | outside | 27 | 18 | 3 | 6 | 26 | 0 | 97 | 127 | 49 | 0 |
| journey | outside | 42 | 30 | 5 | 7 | 42 | 0 | 130 | 265 | 0 | 0 |
| flowchart | outside | 38 | 26 | 5 | 7 | 38 | 0 | 162 | 103 | 20 | 0 |
| state-chart | outside | 84 | 68 | 7 | 9 | 84 | 0 | 423 | 474 | 5 | 0 |
| hub-spoke | outside | 48 | 34 | 6 | 8 | 48 | 0 | 48 | 292 | 98 | 0 |
| roadmap | outside | 60 | 48 | 5 | 7 | 0 | 60 | 0 | 0 | 0 | 0 |
| timeline-list | outside | 31 | 27 | 1 | 3 | 31 | 0 | 128 | 128 | 0 | 0 |

**What a top-level row carries** (inline-code spans on the row's own line)

| chart | no span | one value | one record | one text | one other | two or more | nested data | nested group | nested other | series slides | `>` under item | column-0 `>` |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| bar | 21 | 123 | 0 | 0 | 0 | 0 | 54 | 0 | 10 | 7 | 0 | 0 |
| line | 122 | 62 | 0 | 0 | 0 | 0 | 370 | 0 | 1 | 23 | 0 | 0 |
| piechart | 0 | 231 | 0 | 0 | 0 | 0 | 0 | 0 | 27 | 0 | 0 | 0 |
| funnel | 0 | 142 | 0 | 0 | 0 | 0 | 0 | 0 | 24 | 0 | 0 | 0 |
| waterfall | 0 | 104 | 0 | 0 | 0 | 2 | 0 | 0 | 7 | 0 | 0 | 0 |
| word-cloud | 0 | 412 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| map | 0 | 226 | 0 | 50 | 0 | 0 | 0 | 0 | 19 | 0 | 0 | 0 |
| scatter | 0 | 0 | 148 | 0 | 0 | 0 | 0 | 0 | 14 | 0 | 0 | 0 |
| quadrant | 182 | 0 | 0 | 0 | 0 | 0 | 335 | 0 | 19 | 0 | 0 | 0 |
| stacked-bar | 69 | 0 | 0 | 0 | 0 | 0 | 240 | 0 | 3 | 22 | 0 | 0 |
| slope | 76 | 0 | 0 | 19 | 0 | 0 | 190 | 0 | 2 | 20 | 0 | 0 |
| radar | 121 | 0 | 0 | 0 | 0 | 0 | 640 | 12 | 17 | 47 | 0 | 0 |
| heatmap | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| matrix-grid | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| bullet | 0 | 0 | 0 | 0 | 0 | 86 | 5 | 0 | 0 | 0 | 0 | 0 |
| progress | 0 | 1 | 0 | 0 | 0 | 139 | 0 | 0 | 0 | 0 | 0 | 0 |
| gantt | 86 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 229 | 0 | 0 | 0 |
| kanban | 97 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 176 | 0 | 0 | 0 |
| journey | 130 | 0 | 0 | 0 | 0 | 0 | 221 | 0 | 44 | 0 | 0 | 0 |
| flowchart | 42 | 0 | 19 | 101 | 0 | 0 | 6 | 0 | 117 | 0 | 8 | 0 |
| state-chart | 104 | 0 | 10 | 299 | 0 | 10 | 0 | 0 | 479 | 0 | 9 | 0 |
| hub-spoke | 22 | 21 | 4 | 0 | 0 | 1 | 139 | 0 | 251 | 0 | 0 | 0 |
| roadmap | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| timeline-list | 4 | 2 | 0 | 56 | 0 | 66 | 0 | 0 | 128 | 0 | 0 | 0 |

"nested other" is a nested row with no value and no data below it: mark detail on the in-scope charts, the chart's own structure (tasks, cards, connections) on the `outside` ones.

**Table cells** (body cells after the label column)

| chart | tables | header cells | body cells | plain number | with a span | state mark | not a number | empty | `note=` span |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| bar | 1 | 3 | 4 | 4 | 0 | 0 | 0 | 0 | 0 |
| heatmap | 31 | 181 | 782 | 648 | 2 | 0 | 0 | 134 | 2 |
| matrix-grid | 24 | 113 | 439 | 0 | 0 | 439 | 0 | 0 | 0 |
| roadmap | 60 | 239 | 563 | 0 | 0 | 476 | 85 | 2 | 0 |

**Spans by slot** (only the row and cell slots are a codemod's to touch)

| chart | heading | above: `[…]` axes | above: other (kicker) | below data | row lead | nested lead | blockquote | header cell | body cell |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| bar | 1 | 0 | 18 | 0 | 123 | 54 | 0 | 0 | 0 |
| line | 0 | 0 | 10 | 0 | 62 | 370 | 0 | 0 | 0 |
| piechart | 0 | 0 | 44 | 0 | 231 | 0 | 0 | 0 | 0 |
| funnel | 0 | 0 | 2 | 0 | 142 | 0 | 0 | 0 | 0 |
| waterfall | 0 | 0 | 12 | 0 | 108 | 0 | 0 | 0 | 0 |
| word-cloud | 0 | 0 | 3 | 0 | 412 | 0 | 0 | 0 | 0 |
| map | 0 | 0 | 6 | 0 | 276 | 0 | 0 | 0 | 0 |
| scatter | 0 | 22 | 1 | 0 | 148 | 0 | 0 | 0 | 0 |
| quadrant | 0 | 47 | 2 | 0 | 0 | 347 | 0 | 0 | 0 |
| stacked-bar | 0 | 0 | 3 | 0 | 0 | 240 | 0 | 0 | 0 |
| slope | 0 | 0 | 2 | 0 | 19 | 190 | 0 | 0 | 0 |
| radar | 0 | 45 | 5 | 0 | 0 | 640 | 0 | 0 | 0 |
| heatmap | 0 | 2 | 29 | 0 | 0 | 0 | 0 | 0 | 2 |
| matrix-grid | 0 | 23 | 0 | 2 | 0 | 0 | 0 | 0 | 0 |
| bullet | 0 | 0 | 10 | 0 | 172 | 5 | 0 | 0 | 0 |
| progress | 0 | 0 | 27 | 0 | 279 | 0 | 0 | 0 | 0 |
| gantt | 0 | 36 | 7 | 0 | 0 | 461 | 0 | 0 | 0 |
| kanban | 2 | 0 | 31 | 0 | 0 | 137 | 0 | 0 | 0 |
| journey | 0 | 3 | 0 | 0 | 0 | 309 | 0 | 0 | 0 |
| flowchart | 0 | 0 | 23 | 14 | 120 | 37 | 0 | 0 | 0 |
| state-chart | 0 | 0 | 51 | 4 | 329 | 8 | 0 | 0 | 0 |
| hub-spoke | 0 | 0 | 48 | 3 | 27 | 248 | 0 | 0 | 0 |
| roadmap | 0 | 3 | 40 | 1 | 0 | 0 | 0 | 143 | 0 |
| timeline-list | 0 | 0 | 30 | 0 | 190 | 0 | 0 | 0 | 0 |

**Rewrites under §2** (charts the model covers; `outside` charts adopt only the number and description rules)

| chart | wrap in `{…}` | of which text | merge spans into one record | named row → parameter | detail → `>` | detail → `{> …}` cell | list → table (slides) | group-row span with no cell | no GFM table (slides) | series points to cells | comma number | dot-grouped number | heatmap `note=` | strict cell refused |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| bar | 123 | 0 | 0 | 0 | 10 | 0 | 7 | 0 | 0 | 54 | 3 | 0 | 0 | 0 |
| line | 62 | 0 | 0 | 0 | 0 | 1 | 23 | 0 | 0 | 370 | 24 | 0 | 0 | 0 |
| piechart | 231 | 0 | 0 | 0 | 27 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| funnel | 142 | 0 | 0 | 0 | 24 | 0 | 0 | 0 | 0 | 0 | 72 | 0 | 0 | 0 |
| waterfall | 104 | 0 | 2 | 0 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| word-cloud | 412 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| map | 276 | 50 | 0 | 0 | 19 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| scatter | 0 | 0 | 0 | 0 | 14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| quadrant | 0 | 0 | 0 | 0 | 19 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| stacked-bar | 0 | 0 | 0 | 0 | 0 | 3 | 22 | 0 | 0 | 240 | 0 | 0 | 0 | 0 |
| slope | 0 | 0 | 0 | 0 | 0 | 2 | 20 | 19 | 0 | 190 | 0 | 0 | 0 | 0 |
| radar | 0 | 0 | 0 | 0 | 0 | 17 | 44 | 0 | 3 | 610 | 0 | 0 | 0 | 0 |
| heatmap | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-grid | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| bullet | 0 | 0 | 86 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| progress | 1 | 0 | 139 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| gantt | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| kanban | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| journey | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| flowchart | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| state-chart | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| hub-spoke | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 43 | 0 | 0 | 0 |
| roadmap | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| timeline-list | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

In-scope totals: 1351 wraps (50 of them text), 227 merges, 5 named rows to parameters, 120 detail bullets to `>`, 23 to `{> …}` cells, 116 list-to-table slides, 19 group-row spans with no cell, 99 comma numbers, 2 `note=` spans, 0 heatmap cells a strict reader refuses.

**Rows with two or more spans, by kind** (what a merge folds into one record)

| chart | spans | rows |
|---|--:|--:|
| waterfall | `value + text` | 2 |
| bullet | `value + value` | 86 |
| progress | `value + text` | 139 |
| state-chart | `text + text` | 10 |
| hub-spoke | `value + record` | 1 |
| timeline-list | `text + text` | 47 |
| timeline-list | `value + text` | 19 |

**Bullet's nested rows by name** (§7 evidence: what a record would have to name)

| name | rows |
|---|--:|
| Band | 4 |
| Floor | 1 |
