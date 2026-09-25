---
origin: 2361
priority: P3
recorded: 2026-09-25
---

# Stacked-bar clips wrapped category labels and drops cents on money values

why now   — found while building the model-choice slide of the agentic-practices deck.
            (1) In the default (column) stacked-bar, a category label that wraps to two lines
            ("Simple · stronger") loses the bottom of its second line: the descender of "g"
            is cut off. (2) Money values lose their trailing zero: computed bar totals print
            "$0.4" and "$1.2" and the axis prints "$0.5", while the key prints "$0.20" and
            "$1.00", so one chart shows two money formats. The deck works around both
            (authored totals, the `row` variant).
where     — lib/components/chart/stacked-bar/ (label box height) and the shared Cartesian
            number formatter in lib/components/chart/_chart-family/.
done when — a two-line category label renders whole, and every money value on one chart
            (axis, totals, key) uses the same decimal places.
evidence  — the stacked-bar gallery with a wrapping label and `$0.20`-style values,
            rendered light and dark.
verify    — render lib/components/chart/stacked-bar/ gallery and look at the page.
