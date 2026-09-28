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
            - CLOSED (panes-radar PR): radar lays out for its pane, scored by its rim labels
              (`fitKeyToPane` `labelText` + `ceiling`). examples/panes-radar.md.
            - The HTML-drawn charts reflow in the pane box but were not audited at 25%.
            - CLOSED (panes-radar PR): the chart wrap keeps every lead paragraph (`.chart-lead`),
              on a slide and in a pane. examples/chart-lead-paragraphs.md. Still dropped without
              a word: any OTHER block between the heading and the figure (a code block, a
              blockquote, a table, raw HTML) — the wrap keeps top-level paragraphs only.
            - PART CLOSED (panes-radar PR): `calibrate-capacity --pane` measures SVG charts
              (builders for 12 kernels, and a step fails on TYPE FLOOR or CHART LABELS DROPPED as
              well as OVERFLOW). bar, piechart, scatter, line, heatmap, map and radar turned
              `measured`; scatter's hard fell 12 -> 8 (side) and 10 (stack). Still `editorial`:
              bullet, funnel, waterfall, stacked-bar and slope (no probe signal to 24 elements —
              see 2376-p2-probe-labels-over-marks.md) and every HTML-drawn or grouped chart
              (gantt, journey, kanban, matrix-grid, progress, quadrant, roadmap, state-chart,
              word-cloud), which this pass did not measure.
            MEASURED 2026-09-27 (panes-continuation PR, left for its own PR):
            - Mermaid pane labels ALREADY clear the floor: examples/panes-mermaid.md measures a
              smallest label of 13.0 / 14.2 / 11.6px on its three pane slides against a 7.2px floor
              (label font-size x its real on-page transform, `getBoundingClientRect().height /
              offsetHeight`). The open half is that the probe cannot SAY so.
            - The probe's premise is wrong: `probeFigureLegibility` skips `<foreignObject>` because
              "HTML inside a viewBox is not scaled", but Chromium does scale it, and the ratio above
              measures the full transform. The arm is ~10 lines in the SVG loop.
            - Its blast radius is the reason it did not ship on an agent's call: across the 233
              example and baseline decks, 104 slides carry Mermaid labels and 4 non-pane slides fall
              under the floor once measured (mermaid-sketch-labels #4 6.4px and #5 5.6px,
              diagram-narration #5 7.1px, typed-diagram-narration #4 6.9px). Each would gain the
              export's "Text too small" tag, so the change alters exported PDFs: an owner sign-off
              (QUALITY BAR export rule), and those decks' committed PDFs rebuild with it.
where     — lib/integrations/mermaid/ (the render width, and a way to size foreignObject labels
            for the probe), the radar kernel, the HTML chart kernels, chart-family.js,
            tools/calibrate-capacity.js --pane.
done when — a Mermaid pane's labels read at least the type floor and the probe can say so; and the calibration
            measures the rest of the charts' pane ceilings, so their budgets turn `measured`.
evidence  — decision note §2 ("Charts draw for the pane") and §6 gap 2; the label-height table
            in PR #2420.
verify    — tier 1 checker; render a flowchart in a 35% pane and on a slide and compare a node
            label's px height (19.5 vs 34.8 today).
