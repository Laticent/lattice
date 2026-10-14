---
status: in-progress
summary: Phase 3 of the Compose inline editors. Of the 25 chart components, label-plus-number lists (bar, line, pie, funnel, waterfall, word-cloud) and nested-series lists (grouped and stacked bar, slope) get one shared number grid; gantt, kanban and map do not; bullet, progress, radar, scatter and heatmap wait. Door decided - one Insert menu.
---

# Compose chart series grid — which charts are list-shaped (phase 3 note)

Status: note, written before any code. Source of every claim below: the `Slots` table of each
`lib/components/chart/<name>/<name>.docs.md`. Nothing here was checked against the kernels yet;
the writer's tests will do that (see §4).

Parent: `2026-10-13-compose-inline-notation-editors.md` §9 (phasing) and §12b (phase 2 as built).
Spec: `followups.d/2649-p1-compose-inline-notation-editors.md`.

## 1. The question

Phase 3 puts a number grid in front of chart data, so an author stops typing `- Q1 \`4.2\`` by
hand. A grid fits a chart only if its data is a list of rows, each row a label plus numbers.
Which of the 25 chart-bucket components are that shape?

## 2. The census

Four shapes, by what one row of source looks like.

| Shape | One row is… | Components |
|---|---|---|
| **A. Label + one value** | `- Label \`value\`` | `bar` (default, `row`), `line` (one series), `piechart`, `funnel`, `waterfall`, `word-cloud` |
| **A′. Label + two pills** | `- Label \`a\` \`b\`` where order matters | `bullet` (measure, target), `progress` (percent, status word) |
| **B. Label + nested series** | `- Category` then `  - Series \`value\`` | `bar grouped`, `stacked-bar`, `line` (several series), `slope` (two named points per entity) |
| **C. Label + row of numbers** | `- Series — v1, v2, v3` | `radar` |
| **D. Label + point record** | `- Name \`{x, y}\`` | `scatter`, `quadrant` |
| **E. Table** | a markdown table | `heatmap`, `matrix-grid` |

Not list-shaped, so no grid: `gantt` (spans and `after=` dependencies), `kanban` (columns of cards
with lane labels and size badges), `map` (rows are region names the basemap resolves, so a
grid cannot validate the first column). The structure charts (`flowchart`, `state-chart`,
`hub-spoke`, `journey`, `roadmap`, `timeline-list`, `quadrant`'s axes line) are phase 5's
territory or out of scope.

## 3. Recommendation

Ship shapes A and B in phase 3. Defer A′, C, D and E.

- **A and B are the same grid.** Rows are categories, columns are series, a cell is one number. A is
  the one-column case; B adds columns. That is `SparkPanel`'s number grid with a label column and
  a row add/remove control, which is why the spec says to reuse it.
- **A′ needs typed columns.** `bullet`'s two pills are order-sensitive and a swap "renders a miss as
  a beat" (its docs); `progress` mixes a percent and a status word. A grid there needs a column
  schema, not a number grid. Phase 3b, if wanted.
- **C, D and E are different editors.** A radar row is a comma list under a dash; scatter needs a
  two-axis record with optional `size=`; a table is a different block. Each is its own small panel.
- **Per-component rules the grid must carry**, because the writer must refuse rather than draw a
  chart the engine will refuse:
  - `funnel`: stage values must not increase down the list.
  - `waterfall`: the sign is syntax (`+1.4M` floats, bare `1.4M` anchors), so cells keep their
    sign text and the first and last rows are levels.
  - `piechart`: every slice shares one unit or format.
  - `bar grouped`: two to four series. `stacked-bar`: series order comes from the first category
    that names each part.
  - `slope`: both point names must repeat identically under every entity.
  - `line`: the authored order is the axis order and is never sorted.

## 4. What the writer owes (carried from phase 2)

It is a block-level writer, so it edits a list in the slide body rather than a code span:

1. Parse the list with the chart's own reader, write back only the cells that changed, and keep
   every other byte (the phase-2 gap with `72.50` rewriting to `72.5` must not repeat: the
   panel sends the author's own tokens with one cell changed).
2. Accept the result only if the chart's kernel still reads it as the same chart. Return null
   rather than guess.
3. Open only for the components in §2 shapes A and B, and only when the list parses cleanly
   (no stray text a rewrite would lose).
4. Property test: for each shipped chart slide in `examples/` and the gallery, open, write
   nothing, and compare bytes; then change one cell and compare against a hand-written diff.
5. Tier 1 checker, because it rewrites deck source.

## 5. Open before code

Decided (owner, 2026-10-14): one "Insert" menu in the slide bar holds pills, sparks, avatars,
charts and diagrams, because row one is full at 390px (parent note §12b). Phase 3 builds the menu
and moves the pill and spark doors into it.
