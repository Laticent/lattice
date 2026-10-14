---
status: proposed
summary: One authoring model for chart data - one field is a list row, several fields or a true grid is a table, every record and description is an inline-code `{…}` span (`{> text}`, blockquote form in lists) - so one manifest schema drives the grid editor, autocomplete, lint and reshaping.
---

# Chart authoring, one model (2026-10-14)

Status: proposed. Owner decisions are in §3, taken in conversation on 2026-10-14. No code yet.
Parent notes: `2026-09-28-segno-unified-inline-notation.md` (the inline notation; decisions 3, 6, 7, 10, 11, 17, 25),
`2026-10-13-compose-inline-notation-editors.md` (the editors), `2026-10-14-compose-chart-series-grid.md` (the phase 3 census this replaces as the plan).

## 1. The problem

Segno unified the inline spans. The chart bodies around the spans are not uniform. Each chart's
manifest describes its rows in prose (`"selector": "ul > li"` plus a paragraph), so nothing
machine-readable says what a row holds. An author learns three things per chart:

1. the container (flat list, nested list, a dash-separated number row for radar, a table);
2. the row's cell grammar (one pill, two ordered pills for bullet and progress, a signed value for waterfall, a record for scatter);
3. where extras go (status, size, a hidden description). Nested bullets mean data on one chart and detail on another.

The cost: authors forget the shapes, reshaping a chart (bar to line to pie) has no shared data
model, and every editor, linter and prompt re-learns the shapes by hand.

## 2. The model

Every chart's data is rows of named fields. Each chart's manifest declares the fields it reads (`rows`),
in Segno's types. One reader, one writer, one grid editor, autocomplete and lint all read that schema.

| Row has | Written as | Charts (from the component docs; the census confirms) |
|---|---|---|
| one field | a list row, ``- EMEA `{4.2}` `` | bar, line, piechart, funnel, waterfall, word-cloud |
| several fields | a table: the header names the fields, the first column is the label | grouped and stacked bar, multi-series line, slope, bullet, progress, scatter, quadrant, radar |
| a true 2-D grid | a table, as today | heatmap, matrix-grid |

Not data-shaped, so outside this model: gantt, kanban, map (region names resolve against a basemap),
and the structure charts (flowchart, state-chart, hub-spoke, journey, roadmap, timeline-list).

## 3. Decisions

| | decision |
|---|---|
| 1 | **Data container: list for one field, table for several fields or a grid.** The test an author asks is "one number per row, or several?" |
| 2 | **`{…}` is the container for a record. No bare values in lists:** ``- EMEA `{4.2}` ``. Table cells are plain values (the header names the field). |
| 3 | **`[ ]` wraps a list of records** (an axis line, a label set). A leading `[x]`, `[-]`, `[ ]` marker is a cell state in matrix-grid, verdict-grid, pricing badges and the roadmap, and stays as it is. |
| 4 | **Position decides meaning.** A paragraph above the content describes its axes or kicker; a paragraph below is the key, caption or legend. Unchanged. |
| 5 | **A description is `{> text}`, everywhere a span can sit, and it travels with the data.** In a table cell it describes the cell; in a header cell, the column; a column whose header is `{>}` holds one plain-text description per row. In a list row, the declared block form is a `>` blockquote under the item (what flowchart and state-chart already do). Same meaning, one spelling per document (Segno decisions 6 and 7). Descriptions are hidden detail: hover and tap on screen, the speaker note in print, never on the slide face. |
| 6 | **Inside `{> …}` the text is prose** up to the first unescaped `}`; commas do not split it; `\}` is the escape. |
| 7 | **The retired spellings:** a nested bullet as detail on a list chart, and heatmap's ``note=…`` span, become `>` / `{> …}`. |
| 8 | Reshaping is a projection between field sets: one field to many adds columns in the grid; many to one asks which field to keep; a missing required field (pie to bullet needs a target) is refused with the name. |
| 9 | **The container is `` `{…}` ``: braces inside an inline-code span, everywhere, including table cells and descriptions** (`` 62 `{> Dipped after onboarding}` ``, `` Jan `{> Onboarding changed}` ``, a `` `{>}` `` header for the row-description column). Owner, 2026-10-14, after weighing three options (§3a). The typing cost is carried by Compose's custom editors (as for pills and sparks) and by autocomplete in the editor, not by changing the notation. |


### 3a. Why `` `{…}` `` and not `` `…` `` or bare `{…}` (2026-10-14)

Measured over 392 shipped decks and galleries, fenced code removed: 10,825 inline-code spans, 630 start with `{`, 236 are tagged records, 2,355 are bare numbers. Outside code, 79 lines hold a brace, in 13 files: 52 are LaTeX math and the rest are CSS in `<style>` blocks and JSON fixtures; none is ordinary prose. The docs site has 32 `.mdx` pages, where a bare `{…}` is a JavaScript expression.

- **`` `{…}` `` (chosen).** Markdown does not parse inside a code span, so `_`, `*`, `[`, `<`, `\` and quotes reach Segno byte for byte, on every render path and in every other Markdown tool (GitHub, MDX, export-to-Marp). Plain code stays literal unless it starts with a marker (decision 6 of `2026-05-11-inline-code-directives.md`). It degrades to a visible monospace chip. Costs: four wrapping characters per value, a backtick that is a dead key on many European layouts, prose inside a code chip in a plain preview, and a `|` that still splits a GFM table cell.
- **`` `…` `` (rejected).** Works only where position fixes the meaning; in free prose `` `SHIPPED, c2` `` is a pill or code by guess, autocomplete has no trigger, and the kinds still need a marker, which is a brace under another name.
- **Bare `{…}` (rejected).** Shortest, but Markdown processes the inside first (`\}` is consumed as an escape, `_` and `*` start emphasis, `[x]` is a link candidate, `<` opens HTML), so Segno would have to run ahead of the inline parser on every path; math regions would need carving out; MDX pages fail to compile; Pandoc and markdown-it-attrs read `{.class}` as attributes; and a deck shared as a `.md` file shows raw braces everywhere else.
- **Rejected middle ground:** bare braces only in table cells and chart row slots. It saves the most characters where data is dense, at the price of two rules instead of one.

## 4. What must be proved before a chart depends on it

- **`{> …}` is a new Segno production** (a `>` after `{` makes the rest prose to the closing `}`). It must keep the LL(1) linear bound, pass the grammar fuzz and the scaling ladder, and not collide with the reserved `|` (decision 4 of the Segno note). Phase 2 proves this first.
- **Does the existing corpus use a `{>`, a `>` cell, or a blockquote in a chart list that this would read differently?** The census counts them.
- **Detail on multi-field charts.** The census counts shipped slides that carry detail under scatter, quadrant and radar, which become tables.
- **The slide counts a rewrite would touch.** About 500 chart slides exist in `examples/`, the baseline decks and `lib/components`; the census gives the per-chart rewrite count.

## 5. Phases (one PR each; none changes what an author types until phase 4)

1. **Census.** Each chart against §2: the exact disagreements, detail usage, and the rewrite counts. No behavior change.
2. **Schemas and reader.** `rows` in the manifests, one reader that takes the old and the new forms, and the `{> …}` production, proven first.
3. **Editor.** The Insert menu (decided 2026-10-14), the schema-driven grid for lists and tables, the description fields, and reshape.
4. **Normalize.** A codemod moves the charts that change to the new forms and deletes the old readers, with no dual-syntax period (Segno decision 9). The owner signs off after seeing the census list.

Phase 4 changes what authors type, so it needs the owner's sign-off, and it gets the full adversarial trio before merge (HARD RULE #25) because it touches the shared chart kernel.

## 6. What this note does not decide

- The exact field names per chart (the census proposes them).
- Whether an axis line stays a bracket list of records or folds into the table header for any chart.
- Locked slides keep their descriptions as text until the structural guard agrees to draw them.
