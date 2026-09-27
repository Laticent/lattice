---
origin: 2420
priority: P3
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2420
---

# an overflowing table pane clips at both ends, hiding its header row

why now   — found fixing the fluid viewer's panes (PR #2420): a 24-row table in a 65% pane
            beside a one-item list is centered in its pane and clipped top AND bottom, so the
            header row and the first rows are cut off. The same table on its own slide clips at
            the bottom only and keeps its header. Measured identical in the CLI PDF on main and on
            the branch, and in the fluid viewer once its panes have height, so it is the pane's
            layout, not a viewer's.
where     — lib/forms/cell/pane/pane.css (`lat-pane > .cell-stage`), the table component's stage
            alignment inside a pane (lib/components/*/table), and what `data-cards="center"` asks
            of an overflowing pane.
done when — an overflowing pane keeps its top (a table's header, a list's first item) and clips
            at the bottom, as a slide does; a pane that fits stays centered.
evidence  — CLI PDF of the 24-row deck before and after, and `--fluid --overflow-marker=author`.
verify    — tier 0 gates plus pixel-check on examples/panes.md, because pane CSS reaches every
            panes slide.
