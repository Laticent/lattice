---
origin: 2376
priority: P3
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2376
---

# the fluid viewer hides an overflowing panes slide's panes and tags the wrong pane

why now   — found verifying the pane-follow-ups PR: a 16:9 panes slide whose table pane overflows
            (24 rows beside a one-item list pane), exported `--fluid --overflow-marker=author`,
            shows only the masthead — both panes are off the slide — and its "Fix Me" tag lands
            on the LIST pane's stage, not the table's. Reproduced identically on main, so it is
            not that PR's; the PDF of the same deck is a separate surface and was not checked.
where     — lib/runtime/index.js (the overflow watcher's `overCells` → `cells[oc.index]`
            resolution against CLIP_CELL_SELECTOR, lib/core/overflow-probe.js), and the fluid
            viewer's fit of a panes host.
done when — the fluid viewer shows an overflowing panes slide's panes, and the tag lands on the
            pane that overflows (on its item, where the drill-down can pick one).
evidence  — the deck above; `.fit-culprit` resolves to the list pane's `.cell-stage`.
verify    — the same export at main and at the fix; read `.fit-culprit` and screenshot.
