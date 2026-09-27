---
origin: 2376
priority: P3
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2376
---

# a sketch list-tabular ledger draws a frame far taller than its rows, with doubled row rules

why now   — found while inking panes (the pane-follow-ups PR): under `mode: sketch` a three-row
            `list-tabular` slide draws its ink frame around the whole stretched `ol` (rows sit
            mid-frame with empty bands above and below), and each row shows two rules — the
            ink and the component's own. A pane of it looks the same, because it is the same
            structure: this is the slide's look, not a pane defect.
where     — lib/core/rough-ink.js (`tabular`, kind `ledger`), lib/base/base.sketch.css (the
            list-tabular handover), lib/components/inventory/list-tabular/list-tabular.styles.css.
done when — the ledger frame hugs the rows, and each row carries one rule.
evidence  — examples/panes-sketch.pdf slide 4; a bare `list-tabular` slide with three rows
            under `mode: sketch`.
verify    — render both at 16:9; the frame's top and bottom edges meet the first and last rows.
