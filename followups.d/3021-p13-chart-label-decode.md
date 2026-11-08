---
origin: 3021
priority: P13
recorded: 2026-11-08
area: chart
severity: low
swimlane: engineering/decisions/2026-11-03-responsive-tables.md
deferred: off-path — two export defects found while writing the chart readers; fixing either changes exported bytes, so each needs the owner's export sign-off
source: https://github.com/Laticent/lattice/pull/3021
---

# A chart label that looks like markup, or holds `&`, prints wrong in the export

why now   — (1) The shared cartesian code runs an already-decoded label through `plainText` a second time, so a category written as the text `<img …>` comes out EMPTY in the screen-reader table (`buildSrDataTable`) and in the axis label's `data-label` (`buildCategoryLabels`, plugins/chart-family/shared/cartesian.js). Screen readers lose that category's name. (The `--fluid` viewer no longer reads that table: line records its labels as written in `data-raw`, #3088.) (2) The pie key double-escapes: a slice named `R&D` prints the literal text `R&amp;D` in `text.chart-key-label`; the map key does the same for `<` and `>`, and an unmatched map name holding a quote reaches the key and the description as a literal `&quot;` (its new `data-unmatched-names` attribute, #3088, records that already-escaped name, so the fluid redraw reproduces it faithfully rather than fixing it).
where     — lib/plugins/chart-family/shared/cartesian.js (`buildSrDataTable`, `buildCategoryLabels`); lib/plugins/chart-family/kinds/piechart/piechart.transform.js and map.transform.js key labels.
done when — a label `<img src=x>` and a slice `R&D` print as written in the export's key, axis and screen-reader table, as text.
evidence  — an export of a deck holding both, read in the DOM: the text nodes equal the source strings.
verify    — a unit test per kernel drawing both labels; the chart readers' round-trip test still passes.
