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
            fitKeyToPane). PR #2420 (2026-09-27) closed and measured more:
            - CLOSED: a Mermaid flowchart in a tall pane now turns top-to-bottom, on the CLI
              (`preprocessMermaid` asks `engine.paneOrientations`, keyed on each pane's source
              lines) and in the browser (`fenceJob` reads the fence's `<lat-pane>`). Label height in a 35% pane: 11.5px -> 19.5px
              (34.8px on a full slide). examples/panes-mermaid.md.
            - MEASURED, NOT A GAP: the TYPE FLOOR probe (`probeFigureLegibility`) already reads a
              pane's SVG chart, since it walks every `svg[viewBox]` under the slide: a radar in a
              stacked pane measured 12 labels, min 8px against a 7.2px floor, so it rightly stays
              quiet. Dropped chart labels are reported in a pane as on a slide.
            Still open:
            - Mermaid still SCALES its SVG into the pane, so its labels run smaller than on a
              full slide, and its labels are `<foreignObject>` HTML the type-floor probe counts as
              unmeasured — on a slide as in a pane. The direction follows the box's shape, not the
              diagram's: few panes are tall (a 35% pane under an eyebrow is already square), so a
              long chain in a near-square pane stays small either way.
            - Radar scales into its pane: its axis labels live in the diagram, so the key-fitting
              pie/map/quadrant use would shrink them. It needs its labels counted as text
              before it can lay out for the pane.
            - The HTML-drawn charts reflow in the pane box but were not audited at 25%.
            - A chart's wrap (chart-family.js `transformChartSection`) keeps only the FIRST
              paragraph before the figure, lifted as its subtitle, and silently drops a second
              one, on a chart slide and in a chart pane alike (found by the P9 checker, 368
              renders; the pane-follow-ups PR kept the behavior to stay render-identical).
            - The chart pane budgets stay `basis: editorial`: `tools/calibrate-capacity.js --pane`
              does not measure a chart's pane ceiling yet.
where     — lib/integrations/mermaid/ (the render width, and a way to size foreignObject labels
            for the probe), the radar kernel, the HTML chart kernels, chart-family.js,
            tools/calibrate-capacity.js --pane.
done when — a Mermaid pane's labels read at least the type floor and the probe can say so; radar
            lays out for its pane; the chart wrap keeps every lead paragraph; and the calibration
            measures each chart's pane ceiling, so its budget turns `measured`.
evidence  — decision note §2 ("Charts draw for the pane") and §6 gap 2; the label-height table
            in PR #2420.
verify    — tier 1 checker; render a flowchart in a 35% pane and on a slide and compare a node
            label's px height (19.5 vs 34.8 today).
