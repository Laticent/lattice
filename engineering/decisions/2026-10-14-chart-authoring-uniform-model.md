---
status: proposed
summary: One authoring model for chart data - a list row is a label plus one `{…}` record, a table holds series columns or a grid, descriptions are a `>` blockquote in lists and `{> text}` in tables, numbers are ISO in and locale out, and one manifest schema drives the reader, editor, lint and reshaping.
---

# Chart authoring, one model (2026-10-14)

Status: proposed, revised the same day after the adversarial trio (§8), then checked again by an independent checker. Owner decisions are in §3. No code yet.

Parent notes: `2026-09-28-segno-unified-inline-notation.md` (the inline notation), `2026-10-13-compose-inline-notation-editors.md`
(the editors), `2026-10-14-compose-chart-series-grid.md` (the earlier phase 3 note, which this replaces as the plan),
`2026-06-13-lfm-standard.md` (LFM, which this must join).

## 1. The problem

Segno unified the inline spans. The chart bodies around them are not uniform. Four chart manifests (flowchart,
hub-spoke, journey, state-chart) declare a row schema in their `segno` block; every other chart describes its rows
only in prose (`"selector": "ul > li"` plus a paragraph). An author learns three things per chart:

1. **The container.** A flat list, a nested list (radar is series, then axis; slope is entity, then two points), or a table.
2. **The row's grammar.** One pill; a value plus a marker (waterfall's `total` / `step`); two value pills, any word pills
   (folded into the label) and a keyword sublist (bullet); a percent plus a status word (progress); a record (scatter, quadrant).
3. **Where extras go.** A nested bullet is data on one chart (a series in grouped bar) and hidden detail on another
   (pie, funnel). In bar, line and stacked-bar, `parseSeries` decides by whether the trailing pill parses as a
   number; pie and funnel take the whole sublist as detail. On progress it is a visible note.

The cost: authors forget the shapes, reshaping a chart has no shared data model, and every editor, linter, narrator
and prompt re-learns the shapes by hand.

## 2. The model

**A chart's data is a table. A list is the same table with one data column.** The reader normalizes a list to that
table before binding, so the reader, reshape and conformance tests all target one structure.

| Written as | One row is | Charts |
|---|---|---|
| **A list** | a label plus ONE `{…}` record: its data items first (one value, or scatter's x and y), then named parameters bound by the chart's schema | bar (one series), line (one series), piechart, funnel, bullet, progress, waterfall (`{+2.1M, total}`), word-cloud, map, scatter (`{$420k, 18%, size=140}`), quadrant (points nested under its four named groups) |
| **A table, series shape** | a label column, then one column per series; the header row is data (series names, axes, points) | grouped bar, multi-series line, stacked-bar, slope, radar (its `quadrant` variant stays a nested list) |
| **A table, grid shape** | a label column, then one column per category; every crossing is a value | heatmap, matrix-grid |

Decided (owner, 2026-10-16, after a measured bake-off): bullet and progress are lists, and radar is a table. Each bullet or
progress row is one measure plus named parameters (`{4.2M, target=5.0M}`, `{68%, at-risk}`), which fits the list form under
the rule above. Radar's rows share the same named columns across several series, which is the table-shaped case. Radar's
`quadrant` variant (3 slides) adds a group level no table holds, so it stays a nested list. The bake-off is in §7.

Outside this model, by choice: gantt (spans and `after=` dependencies), kanban (cards in columns), journey (its own
record, Segno decision 11), and the structure charts (flowchart, state-chart, hub-spoke, roadmap, timeline-list). They
still adopt §3's description and number rules.

**The schema has three shapes**, so no chart needs a private flag: `fields` (a fixed set of named parameters),
`series` (open columns whose header is data, with reserved names that cannot be series), and `grid`. A field has a
type (number, signed number, percent, status, text), a nullability and a meaning for an empty cell, because an empty
cell means "not measured" in heatmap and nothing yet in grouped bar. The schema owns what one row holds; the chart's
transform owns what rows mean together (waterfall's running total, radar's shared scale, stacked sums).

**A nested list is a group, never data and never detail.** Quadrant's four named groups are the case.

## 3. Decisions (owner, 2026-10-14)

| | decision |
|---|---|
| 1 | **List or table.** A list row is a label plus one record of data and parameters; a table holds series columns or a grid. |
| 2 | **`` `{…}` `` is the container for a record, and lists have no bare values:** ``- EMEA `{4.2}` ``. A table cell's value is plain, or a leading state marker plus a label (decision 3); anything else in a cell is a `` `{…}` `` span. |
| 3 | **`[ ]` wraps a list of records** (an axis line, a label set). A leading state marker (`[x]`, `[-]`, `[ ]`, and the six-state set's `[!]`, `[?]`, `[/]`; matrix-grid reads only the first three) is a cell state in matrix-grid, obligation-matrix, verdict-grid, checklist, pricing badges and the roadmap, and stays as it is. |
| 4 | **Position decides meaning.** A paragraph above the content holds the axes or kicker; a paragraph below holds the key, caption or legend. Unchanged. |
| 5 | **Descriptions: one form per container.** In a list, a `>` blockquote indented under the item, which is meant to keep rich Markdown (bold, links, several paragraphs). Flowchart and state-chart already use this form, but today they flatten it to escaped plain text on one line (`lib/core/flowchart-grammar.js` reads the quote from source and the transforms escape it), so keeping Markdown is new work. In a table, `` `{> text}` ``: after a cell's value it describes the cell, in a header cell the column, and a column whose header is `` `{>}` `` holds one plain-text description per row. There is one form per position; a lint refuses `{> …}` in a list row and a blockquote that is not indented under its item. Descriptions are hidden detail: hover and tap on screen, the speaker note in print, never the slide face. A list-to-table reshape that would flatten a rich description warns first. |
| 6 | **Inside `{> …}` the text is prose** to the first unescaped `}`; commas do not split it; `\}` and `\\` are the escapes. |
| 7 | **Retired:** a nested bullet as detail on every chart that uses the shared detail substrate (`lib/components/chart/_chart-family/mark-detail.js`), and heatmap's ``note=…`` span (Segno migration row 20). Progress's visible nested note is not detail: it becomes a named visible field, so no slide loses content it shows today. |
| 8 | **Reshaping is a projection between schemas.** One data column to many adds columns in the grid; many to one asks which to keep; a required field that is missing (pie to bullet needs a target) or a type that would change meaning (an unsigned bar value is a level in waterfall) is refused by name, never guessed. |
| 9 | **The container is `` `{…}` `` inside inline code**, not plain backticks and not bare braces (§4). Compose's custom editors and the editor's autocomplete carry the typing cost. |
| 10 | **Numbers are ISO in, locale out.** See §5. |
| 11 | **Scatter and quadrant stay list records** (Segno decision 10 stands), after the owner compared both forms written out. |
| 12 | **LFM 1.1 §3.6 is amended before it is ratified**, in its own spec PR straight after this note, **and phase 4 is gated** (§6, §7). |

## 4. Why `` `{…}` `` and not `` `…` `` or bare `{…}`

Measured over 392 shipped decks and galleries, fenced code removed: 10,825 inline-code spans, 630 start with `{`, 236
are tagged records, 2,355 are bare numbers (markdown-it's own tokenizer gives 10,847 spans and 2,387 bare numbers; the
conclusions do not change). Outside code, 79 lines hold a brace, in 13 files: about 75 are LaTeX math (52 inline or
single-line, 23 continuation lines of display math), 3 are JSON fixtures and 1 is a MathML annotation; `<style>`
blocks were removed before counting. None is ordinary prose. The docs site has 32 `.mdx` pages, where a bare `{…}` in
prose is a JavaScript expression.

- **`` `{…}` `` (chosen).** Markdown does not parse inside a code span, so `_`, `*`, `[`, `<`, `\` and quotes reach
  Segno unchanged, on every render path and in every other Markdown tool. Plain code stays literal unless it starts
  with a marker (decision 6 of `2026-05-11-inline-code-directives.md`). It degrades to a visible monospace chip.
  Costs: four wrapping characters per value, a backtick that is a dead key on many European layouts, and a `|` that
  still splits a GFM table cell (a `\|` there reaches Segno as `|`).
- **`` `…` `` (rejected).** Works only where position fixes the meaning; in free prose `` `SHIPPED, c2` `` is a pill
  or code by guess, autocomplete has no trigger, and the kinds still need a marker.
- **Bare `{…}` (rejected).** Shortest, but Markdown processes the inside first (`\}` is consumed as an escape, `_` and
  `*` start emphasis, `[x]` is a link candidate, `<` opens HTML), so Segno would have to run ahead of the inline
  parser on every path; math needs carving out; MDX pages fail to compile; Pandoc and markdown-it-attrs read
  `{.class}` as attributes; and a deck shared as a `.md` file shows raw braces everywhere else.
- **Rejected middle ground:** bare braces only in table cells and chart row slots. It saves the most characters where
  data is dense, at the price of two rules instead of one.

## 5. Numbers: ISO in, locale out

Today `chart-values.js` and Segno's `number` type read `12K`, `12.5M`, `1.2B`, `bn` (and its finance spellings `Bn` and `BN`, since followups.d/2699-p3) and `T` correctly, but a deck's
`lang:` is ignored and separators are guessed: a comma followed by exactly three digits groups, anything else is a
decimal, US wins a tie. Measured on 2026-10-14: `12.000` reads as 12, `1.234,5` read as 1.2345 (a pre-existing
misread, fixed since: a whole European number, dot-grouped thousands then one decimal comma, reads its comma as the decimal), and `12 000` was not a value though `parseValue`, which six charts call without that test, read it as 12 (fixed since: exact three-digit space groups collapse before either reader runs; `2026-10-14-chart-authoring-census.md` §4). A malformed spelling read as a different number: `--5` as -5, `(5` as 5, `1,2,3` as 1.2 and `1.2.3.4x` as 1234 (fixed since: both readers refuse a second sign, an unpaired parenthesis and a digit run that is not one number, every chart reads it as no value, and lint's `chart-value-malformed` names it). Inside a record the comma is Segno's only
separator, so `{12,000}` is two items, `12` and `000`, and `{"12,000"}` is text. 96 list rows on shipped chart slides use a
comma-grouped value (funnel 64, hub-spoke 19, line 12, bar 1; 122 when `.docs.md` and non-chart lists are counted).

- **What an author types, in records and table cells alike:** a decimal point, optional digit grouping by a space (a
  no-break space counts, Segno decision 23; a thin space is new and needs adding to Segno's whitespace set), and the magnitude suffixes `k`/`K`, `M`, `B`/`bn`/`Bn`/`BN`, `T`, with `%`,
  a currency sign and a trailing unit as today. A comma is never part of a number. This reverses Segno migration rows 13 and 14 (`1,25M` means 1.25M on every chart). This is ISO 80000-1's rule: digit
  groups are separated by a space, never by a dot or a comma, because those two mean opposite things in different
  countries.
- **What the slide shows:** the number formatted for the deck's `lang:`. A French deck shows `12 000` and `1,25 M`; a
  US deck shows `12,000` and `1.25M`. This changes what some slides display, so it goes through the visual review
  path with screenshots.
- **Pasted locale numbers** (`1 234,5`, `12,000`): the linter and Compose's grid recognize them and offer the fix to
  the standard form. A conversion is never silent.
- **A typed table cell is read strictly** with Segno's whole-value reader. A cell that is not wholly a number is an
  error, never a partial read (today a heatmap cell `$1.2M to $1.5M` is painted as 12,000,000).

## 6. Where each piece belongs, and how it joins LFM

- **Segno** owns a general production: `>` after `{` makes the rest of the record prose (§9). Nothing in Segno names
  hover, speaker notes or charts (Segno decision 13).
- **Lattice manifests** own each chart's schema, in the existing `segno` block, not a new `rows` key (`venueCapacity.rows` already
  means line geometry for capacity lint in 5 manifests, and `rows` is a slot name in 8, including bullet, heatmap,
  progress and roadmap). They also own what a description means.
- **LFM** owns the shapes and how they degrade, and references the Segno notation; it never names a chart's fields
  normatively.
  - **Amend LFM 1.1 §3.6 before it is ratified:** a span in a declared data slot is read by that slot's schema, not
    as a pill. As drafted, §3.6 makes `{4.2}` a pill wherever it sits.
  - **An LFM 1.2 section** for the list-as-one-column-table rule, header binding, the grid shape, where descriptions
    go and how they degrade, and a normative number grammar (§5), with conformance cases in the existing JSON shape
    (`spec/conformance/lfm/`): L0 for `{4.2}`, `{> …}` and a `{>}` column; L1 for bound rows; L2 for a refused reshape.
  - **Per-chart fields** stay generated in `grammar.json`, stamped with the LFM version; renaming a field is
    `**Breaking:**`.
- **One reader.** A `check-ownership` rule that chart transforms and narrators read rows only through the shared
  reader, as `checkSegnoBoundary` does for Segno, keeps private readers from coming back. It is a `build:check` rule,
  not a new CI step.

## 7. Open, for the owner

- **Decided 2026-10-16: radar is a table; bullet and progress are list records.** Measured over the corpus (every deck,
  gallery, docs example and manifest sample; counts match the census: 44 plain radar slides plus 3 quadrant, 20 bullet slides
  with 86 rows, 30 progress slides with 140 rows), each slide converted to both forms. Re-derive with
  `node tools/chart-list-vs-table-bakeoff.mjs --sensitivity` (a corpus edit moves every number, so quote the commit):

  | | radar list → table | bullet list → table | progress list → table |
  |---|---|---|---|
  | characters, table unpadded | 13,740 → 7,908 (−42%) | 3,498 → 3,837 (+10%) | 5,012 → 6,334 (+26%) |
  | characters, table padded to align pipes | 13,740 → 14,304 (+4%) | 3,498 → 5,822 (+66%) | 5,012 → 9,341 (+86%) |
  | axis or label names written | 610 → 225 | same | same |
  | places touched to add or rename an axis | 2.7 → 1 | n/a | n/a |
  | places touched to add a series or band | 1 → 6.1 | 1 → 4.3 | n/a |
  | optional cells left empty in a table | n/a | 84% (26 of 31) | n/a |

  A table is a clear win for radar under every weighting tried (raw-markdown, Compose-first, agent author), including a
  worst case that scores the list's Compose support and error hazard generously. Bullet's table would be 84% empty cells.
  Progress is the closest call: the list wins unless Compose carries about a fifth of the weight. A table edits in Compose
  today (an editable grid with Tab to add a row); a `{…}` list row has no row editor yet (the chart-series grid was never
  built), so that editor is the one thing that would move progress. Not measured: authoring error rates for people and for
  models. Radar's size saving holds only when pipes are left unaligned.
- **Decided 2026-10-16: the cross-chart field vocabulary.** Shared core: `value`, `target`, `status`, `x`, `y`, `size`, `group`,
  plus `band`, `floor`, `kind` (waterfall's bar kind), `when` (a date or span), `after` (a dependency) and `to`
  (quadrant's trail end). Two renames remove the collisions the survey found: kanban's S/M/L/XL badge is `effort`, so
  `size` means bubble size only; map's bloc of regions is `bloc`, so `group` means a category only. A chart's old word
  (`measure`, `pct`, `weight`, `volume`) stays an alias for `value` or `size`. Journey's `who` and `mood`, hub-spoke's
  `flow` and state-chart's styling keys stay chart-specific. `total` (waterfall's anchor versus stacked-bar's printed sum)
  and `note` (heatmap's hidden detail versus progress's visible one) collide too and are not decided here: phase 2's schema
  names them. Named (phase 2, 2026-10-16): waterfall's `total` is a value of `kind`, stacked-bar's authored total is
  dropped (unused), and `note` is progress's visible field; heatmap's `note=` is retired by decision 7 anyway. Evidence: a read-only survey of all 23 charts' parsers and docs.
- **Decided 2026-10-16: `|` in a description is allowed, and the author escapes it as `\|`.** Segno still reserves `|` inside
  a record (decision 4); prose is exempt. A table cell is split on an unescaped `|` by GFM before Segno reads it, so a
  bare `|` in a table description silently adds a cell. A lint rule in `lib/authoring/lint-core.js` must warn on it and
  carry the fix (`\|`); it ships with the first `{> …}` table description (phase 3), and
  `followups.d/2723-p2-lint-unescaped-pipe-in-description.md` holds it until then.
- **Phase 4 goes ahead only on evidence from phases 2 and 3** (how many schema exceptions today's shapes need, what
  authors mis-type in the new editor), the bar Segno decision 17 sets, and with the owner's sign-off.

## 8. What the trio found, and what changed

The adversarial trio (red team, inversion, checker) reviewed the first draft. What it changed:

- **`{4.2}` is a pill today**, and the chart did not render (verified by two lenses through `lib/engine`). Fixed by
  §9's ownership step and the LFM amendment.
- **`{> …}` already parses**, as a record whose scalar starts with `>`, and on a bar slide it paints into the label.
  Fixed by §9's production.
- **Comma numbers cannot be written in a record.** Fixed by §5.
- **The census was wrong in places** (radar's shape, bullet's bands, waterfall's marker, map being data-shaped, the
  chart count is 24). Fixed in §1 and §2; `2026-10-14-compose-chart-series-grid.md` carries the same corrections in its banner.
- **"A header names the fields" was false** for 7 of the 9 multi-field charts. Fixed by the three schema shapes.
- **Moving scatter and quadrant to tables reversed Segno decision 10.** The owner kept them as lists.
- **The description had four forms of different power.** Now one per container.
- **A column-0 `>` under a list item ends the list** in markdown-it, and flowchart already loses a node to it with no
  warning (pre-existing, logged in `followups.d/`). Fixed by a lint that flags a blockquote between chart list items
  that is not indented under one.

## 9. What must be proved before a chart depends on it

- **Ownership on every path.** Chart rows and table cells claim their spans before the pill pass, in the engine's
  markdown-it plugin (`lib/integrations/markdown-it/plugins.js`, which today owns only list rows, and only for
  flowchart, hub-spoke and state-chart), the runtime mirror (`lib/core/resolve-inline-code.js`, `isOwnedElement`),
  Compose's `normalizeObjects`, the narrators (`lib/core/chart-narration.js`), lint, the read-along core and
  export-to-Marp, pinned by the engine-vs-runtime fidelity probe. Nothing shipped puts a pill in a chart row today.
- **The `{> …}` production.** `>` is excluded from the first character of a record's first bare item, so `{>5}` and
  `{>a}` stop being values (the corpus has no `` `{>`` span). The prose runs to the first unescaped `}`, linear and
  unbounded like a quoted string; decision 21's `until()` is not used because it cannot see an escape. It must keep
  Segno's LL(1) bound and pass the grammar fuzz and the scaling ladder.
- **Readers scope to direct children**, so a code span inside a blockquote description never becomes a row's value.
- **A `{>}` column is removed before a chart's column caps** (heatmap's `MAX_COLS`), and a description on an empty
  heatmap cell is kept, not dropped as it is today.
- **The rewrite counts** (superseded by the census note, `2026-10-14-chart-authoring-census.md`). 617 chart-class slides across all 24 charts, 338 in the charts in scope (regex count, `.docs.md`
  excluded). Phase 1 counts by chart and by slot, including `.docs.md`, because a codemod keyed on spans alone would
  wrap eyebrows and prose code.

## 10. Phases (one PR each)

1. **Census.** Each chart against §2, the exact disagreements, and the rewrite counts by chart and slot. No behavior change. Done: `2026-10-14-chart-authoring-census.md`, from `tools/chart-authoring-census.mjs`. It corrects §9's counts (879 chart slides, 512 on the 16 charts in scope, once `.docs.md` and manifest snippets are counted).
2. **Ownership, schema and reader.** The field vocabulary note, each chart's schema in its `segno` block, data-slot
   ownership on every path, the `{> …}` production, ISO number reading, and one reader that takes the old and the new
   forms. The old-form branch is transitional and is deleted in phase 4, so nothing reads the old spellings after it.
   This departs from Segno decision 9 (no dual-syntax period) and decision 24 (the codemod deleted before merge) for
   the span of phases 2 to 4, because those phases are separate PRs to `main`.

   **Phase 2, slice 1 (2026-10-16): the schemas and the reader's seam.** Each of the 16 charts declares its row in
   its manifest's `segno` block (a `row` slot, `cell` on the two grid charts), with a `rows` block for shape, detail,
   markless depths (`markless`), whether a `>` under a list row is its description (`quotes`) and `legacy`, the spans the chart
   reads today. `lib/core/chart-rows.js` is the one reader: the narrator and lint take the detail charts, the
   markless rows and a row's `>` description from it (Compose reads the same `quotes` flag from the generated
   catalog, pinned to the reader by a test), and `rowQuotesAsBullets` is deleted (the narrator reads descriptions as
   structure, not as rewritten source). The record form is linted, not drawn: `chart-row-record-unread` warns on a
   data row written as one record and names the old spans, because today that row loses its value; it has no
   machine fix, so a bulk fix never pushes decks away from the form phase 4 writes. A schema the chart does not draw
   yet does not count as the component reading a span (`componentReads`), so the pill lint still judges it. Names
   decided by the schema: waterfall's marker is `kind` (`total` / `step`), progress's `status` is the shared status
   vocabulary (`lib/core/chart-status.js`) and its visible note is `note`, and stacked-bar's authored group total is
   dropped (no group row in the corpus carries a span, census note §4). Left out until a reader reads it: quadrant's
   trail end `to`. One exception the format does not express yet, for the phase 4 count: map's `value` is `text`
   because it is a number in a choropleth and a category word under `highlight`. Corpus evidence: all 895 chart
   slides render, narrate and lint identically (895 by the engine's own section split).

   **Phase 2, slice 2 (2026-10-16): the record is drawn.** A data row written as one `{…}` record draws what its
   old spans draw, on all 16 charts, on the engine and on the runtime. Three pieces, mostly in `lib/core/chart-rows.js`.

   (1) **Ownership**, `ownsRecordSpan`. A span is the row's record when all of these hold: the chart that DRAWS the slide
   (the dispatcher's pick, `recordChart`, from a literal order a test pins to the registry) has a row schema; the span reads
   as that chart's record; it is the SOLE value in its row's LEAD (the item's first paragraph or heading: last in it, no other
   code span there holds a value, no code span right before it; a later paragraph is not the row's value); it is outside a `>`
   quote; it is in the slide's first list or first table, the only ones a kernel reads (a raw `<ul>` or `<table>` ahead of it
   makes it the second); and its row is data. Whether a nested row is data comes from the chart's own schema, `rows.nested`
   (`isDetailRow`), because the kernels differ: `point-unless-valued` (bar, line, slope, stacked-bar: a series point under a
   parent with no value of its own, and detail under one that has a value, where a pill is a pill as it is on main), or
   `detail` (pie, funnel, map, waterfall, word-cloud, progress, quadrant, scatter, radar, bullet: every row below the first
   data depth). Two documented shapes put a plain value under a valued parent: stacked-bar's authored category total over its
   segments, and bullet's keyword rows (`Target`, `Floor`, `Band`) under a measure. A delta note in the same place is a pill on
   main and cannot be told from a segment by position, so a record there stays a pill, and lint `chart-row-record-unread`
   says so; those two shapes read from the old spans until phase 4. A detail row keeps its pill. Every path asks
   this one question and measures the place its own way: the engine's `inlinePills` from tokens, the runtime's
   `isOwnedRecordElement` from the DOM, Compose's `ownsRecord` from the ProseMirror doc, lint's `recordPlace` from the source
   line. This is narrower than `sits: "list-rows"`, as §9 required: a pill in a label or in a description still renders.
   "After another code span" is a fact about the source, so the engine snapshots it before its own pass turns an earlier span
   into a pill (otherwise the answer would depend on visit order).

   (2) **The bridge.** The chart family calls `bridgeRecordsHtml` once before it dispatches (`chart-family.dispatch.js`), so
   the engine and the runtime share it, and rewrites a data row's record to the spans each transform reads (`legacySpans`);
   a slide the chart declines shows that rewritten list, as the old form would, not the braces. `bridgeRecordsSource` does the
   same to a slide's Markdown for the narrators, inside a line, so the line count the description reader keys on holds. The
   bridge decides nothing: whoever CLAIMS a span (the markdown-it pill pass on the engine path, the DOM mirror in the browser, each
   asking `ownsRecordSpan` from its own surface, tokens or DOM) stamps it with `data-lat-record`, and `bridgeRecordsHtml`
   rewrites exactly the stamped spans and strips the stamp. A claimed span is therefore always rewritten or shown as it was, and
   a second, different reading of the HTML (a raw `<blockquote>`, a stray `</ul>`, a no-break space, a comment) cannot leave it
   as raw braces, which is what four independent review rounds kept finding when the bridge re-decided. Grid charts convert
   through `gridCellText` (heatmap `{4.2}` is `4.2`, matrix-grid `{done}` is `[x]` from its shortcut table), and matrix-grid's
   cell decoder, which runs before any bridge, reads the same text. The transforms themselves are untouched, which is why
   parity is exact; phase 4 deletes the bridge with the old spellings.

   (3) **Lint.** `chart-row-record-unread` is no longer a stopgap for the spans; it reports only what the chart still cannot
   draw: a field with no span form (bullet's `band=` and `floor=`, progress's `note=`), a record that follows another code span,
   and a record Segno refuses that is not a pill either (`{3, targt=5}`, which used to vanish from the chart without a word).
   `chart-table-unescaped-pipe` (followups 2723) warns on a bare `|` inside a table cell's `{> …}` description.

   **Evidence.** (a) The same rows written both ways render identical HTML on the engine and the runtime bundle and narrate
   identically, for all 16 charts (`test/unit/core/chart-row-record.test.js`), and the runtime bundle does the same in
   headless Chromium on Marp-shaped markup. (b) A generated differential (`chart-row-record-differential.test.js`: seeded
   random slides on 10 charts, tight and loose, ordered, nested, with totals and descriptions, declined shapes included) holds
   the record form equal to the old form, and a second arm injects `{±N}` pills into detail bullets and compares against what
   main drew. (c) A fidelity probe pins engine against runtime, and a Playwright spec drives Compose in Chromium. (d) About 800
   chart-class slides in tracked Markdown (786 by the harness used here, 796 to 819 by three other splits) render, narrate and
   lint byte-identically to `main`. (e) The adversarial trio (red team, inversion, independent checker) ran three times; each
   round found decks that change, and every finding has a case in the test file. The third round's lesson is the one worth
   keeping: a test that compares the record form with the OLD form cannot see a deck that writes no record and changed against
   `main`, so the tests now also assert what main did.

   **What changes for authors who never write a record.** Nothing was the target, and the measurement is the evidence: 1,585 generated decks
   with no record (values as plain spans, delta pills, label pills, keyword rows, signed notes, CRLF, loose items) render the same HTML,
   pills and narration on this branch as on `main`, and the 786 chart-class slides of the repo's own corpus are unchanged. The rule that
   keeps it so: a `{N}` (or `{word}` on map) is a row's record only when it is the sole value in the row's LEAD paragraph (its first
   block, last in it, after no other code span), the row is DATA (not detail, per the chart's `rows.nested`), and the chart is the slide's
   first list or table. A second paragraph, a description, a row that already has a value, a signed delta under a valued row and a
   `{N}` beside a pill all stay pills. On a matrix-grid slide a sole-cell `{done}`, `{partial}` or `{todo}` (any case) is a state,
   because Segno reads it as `state=…`.

   **Known residual, no visible effect found.** Lint and the narrators' source bridge measure a row's lead per line, so a record
   on a continuation line, or after a margin comment, can differ from the engine (a bullet-character or ordered-delimiter switch
   is counted as a new list on every path since the seventh review round); the narrator picks its chart by the first class token, not in dispatch order. Two things the format does not express
   yet: a grouped number (`1,200`) is not a record value, because Segno reads numbers ISO in (§5) and splits `{1,200}` into
   two items, so phase 4's codemod must write `1200` and show it grouped (the census counts 78 grouped funnel values); and a
   record under a valued row on bar or line stays a pill, so a series point written that way needs its parent without a value. Bullet's keyword rows (`Target`, `Floor`, `Band`) and stacked-bar's authored total read from the old spans until phase 4; lint says so.

   **Phase 2, still to do.** The `{> …}` production (§9) and the table description it needs; each transform and
   narrator reading the record through `readRecord` instead of the bridge and its private parser (the census note §3
   table), so `tools/chart-authoring-census.mjs` can report no private reader; the field set the bridge cannot yet
   spell as spans. Held in `followups.d/2690-p1-chart-model-phase-2-reader.md`.
3. **Editor.** The Insert menu, the schema-driven grid for lists and tables, the description fields, and reshape.
4. **Normalize.** The codemod, kept runnable as a migrator because it is the last clean break before GA, the old
   branch deleted, locale display on, and a `**Breaking:**` fragment. Gated by §7, and it gets the full adversarial
   trio before merge (HARD RULE #25) because it changes the shared chart kernel.

## 11. Not decided here

- Whether any axis line folds into a table header for a series-shape chart.
- Locked slides keep their descriptions as text until the structural guard agrees to draw them.
