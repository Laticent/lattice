---
origin: 2376
priority: P2
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2376
---

# finish sizing charts to their pane: Mermaid, the HTML charts, and a measured budget

why now   — PR #2376 made the SVG chart kernels draw for the pane: the engine stamps each
            pane's box as `data-pane-view`, the cartesian kernels lay out on that canvas
            (cartesian.js viewFor) and the keyed ones re-fit their key (svg-legend.js
            fitKeyToPane). Three things still shrink or go unreported:
            - Mermaid lays itself out and its SVG scales into the pane, so a flowchart in a
              60% pane draws its node labels small, with no warning (the owner's review deck).
            - The HTML-drawn charts reflow in the pane box but were not audited at 25%.
            - Radar scales into its pane: its axis labels live in the diagram, so the key-fitting
              pie/map/quadrant use would shrink them. It needs its labels counted as text
              before it can lay out for the pane.
            - Neither the overflow probe nor the TYPE FLOOR probe (probeFigureLegibility)
              flags an unreadable chart pane, so the chart pane budgets stay
              `basis: editorial` — there is no ceiling to measure yet.
where     — lib/integrations/mermaid/ (the render width), lib/engine/index.js paneView, the
            HTML chart kernels, the TYPE FLOOR probe, tools/calibrate-capacity.js --pane.
done when — a Mermaid pane renders at the pane's width so its labels match a Mermaid slide's;
            the TYPE FLOOR probe flags a chart pane below the floor; and the calibration
            measures each chart's pane ceiling, so its budget turns `measured`.
evidence  — decision note §2 ("Charts draw for the pane") and §6 gap 2.
verify    — render a flowchart in a 40% pane and a Mermaid slide; compare a node label's px
            height.
