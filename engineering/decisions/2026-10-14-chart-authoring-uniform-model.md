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
| **A list** | a label plus ONE `{…}` record: its data items first (one value, or scatter's x and y), then named parameters bound by the chart's schema | bar (one series), line (one series), piechart, funnel, waterfall (`{+2.1M, total}`), word-cloud, map, scatter (`{$420k, 18%, size=140}`), quadrant (points nested under its four named groups) |
| **A table, series shape** | a label column, then one column per series; the header row is data (series names, axes, points) | grouped bar, multi-series line, stacked-bar, slope, radar |
| **A table, grid shape** | a label column, then one column per category; every crossing is a value | heatmap, matrix-grid |

Open (owner, §7): bullet and progress. Each row is one measure plus named parameters (`{4.2M, target=5.0M}`,
`{68%, at-risk}`), which fits the list form under the rule above; an earlier draft put them in tables.

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

Today `chart-values.js` and Segno's `number` type read `12K`, `12.5M`, `1.2B`, `bn` and `T` correctly, but a deck's
`lang:` is ignored and separators are guessed: a comma followed by exactly three digits groups, anything else is a
decimal, US wins a tie. Measured on 2026-10-14: `12.000` reads as 12, `1.234,5` reads as 1.2345 (a pre-existing
misread, logged in `followups.d/`), and `12 000` is not read at all. Inside a record the comma is Segno's only
separator, so `{12,000}` is two items, `12` and `000`, and `{"12,000"}` is text. 96 list rows on shipped chart slides use a
comma-grouped value (funnel 64, hub-spoke 19, line 12, bar 1; 122 when `.docs.md` and non-chart lists are counted).

- **What an author types, in records and table cells alike:** a decimal point, optional digit grouping by a space (a
  no-break space counts, Segno decision 23; a thin space is new and needs adding to Segno's whitespace set), and the magnitude suffixes `k`/`K`, `M`, `B`/`bn`, `T`, with `%`,
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

- **Bullet and progress:** list records (`{4.2M, target=5.0M}`, `{68%, at-risk}`) or tables. Bullet takes any number of
  `Band` rows (it draws the three nearest the target) and an optional floor, which a record names more easily than a fixed set of columns.
- **Radar's `quadrant` variant** (series, then group, then axis) does not fit a GFM table: it stays a nested list, or
  gets a group spelling.
- **The cross-chart field vocabulary** (`value`, `target`, `status`, `x`, `y`, `size`, `group`) is decided in phase
  2's note, before any manifest gains a schema, so reshaping has shared names to project between.
- **A `|` inside a description.** Segno reserves `|` inside a record (decision 4). The recommendation is that prose is
  exempt, so a table description can hold `\|`.
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
- **The rewrite counts.** 617 chart-class slides across all 24 charts, 338 in the charts in scope (regex count, `.docs.md`
  excluded). Phase 1 counts by chart and by slot, including `.docs.md`, because a codemod keyed on spans alone would
  wrap eyebrows and prose code.

## 10. Phases (one PR each)

1. **Census.** Each chart against §2, the exact disagreements, and the rewrite counts by chart and slot. No behavior change.
2. **Ownership, schema and reader.** The field vocabulary note, each chart's schema in its `segno` block, data-slot
   ownership on every path, the `{> …}` production, ISO number reading, and one reader that takes the old and the new
   forms. The old-form branch is transitional and is deleted in phase 4, so nothing reads the old spellings after it.
   This departs from Segno decision 9 (no dual-syntax period) and decision 24 (the codemod deleted before merge) for
   the span of phases 2 to 4, because those phases are separate PRs to `main`.
3. **Editor.** The Insert menu, the schema-driven grid for lists and tables, the description fields, and reshape.
4. **Normalize.** The codemod, kept runnable as a migrator because it is the last clean break before GA, the old
   branch deleted, locale display on, and a `**Breaking:**` fragment. Gated by §7, and it gets the full adversarial
   trio before merge (HARD RULE #25) because it changes the shared chart kernel.

## 11. Not decided here

- Whether any axis line folds into a table header for a series-shape chart.
- Locked slides keep their descriptions as text until the structural guard agrees to draw them.
