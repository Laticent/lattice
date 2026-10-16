---
origin: 2376
priority: P2
recorded: 2026-09-25
area: chart
severity: medium
swimlane: engineering/decisions/2026-09-25-panes-two-components-one-slide.md
source: https://github.com/Laticent/lattice/pull/2376
---

# finish sizing charts to their pane: Mermaid, the HTML charts, and a measured budget

why now   — PR #2376 made the SVG chart kernels draw for the pane: the engine stamps each
            pane's box as `data-pane-view`, the cartesian kernels lay out on that canvas
            (cartesian.js viewFor) and the keyed ones re-fit their key (svg-legend.js
            fitKeyToPane). PR #2420 (2026-09-27) closed and measured more:
            - CLOSED: a Mermaid flowchart in a tall pane now turns top-to-bottom, on the CLI
              (the Mermaid bake, `mermaid.bake.js`, asks `engine.paneOrientations`, keyed on each pane's source
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
              on a slide and in a pane. examples/chart-lead-paragraphs.md.
            - CLOSED (panes-probe-calibration PR): every OTHER block between the heading and the
              figure (a code block, a blockquote, a table, raw HTML) renders too, whole, in a
              `div.chart-lead-block`, and the Read · Article view carries it. A census of 309
              decks found none, and all 309 render byte-identical HTML.
              examples/chart-lead-blocks.md. Not closed, and pre-existing: unbalanced raw HTML
              (an unclosed `<div>`, `<script>` holding a `<`) before the figure still swallows
              what follows it, and a table before a table-data chart is read as its data.
            - CLOSED (panes-probe-calibration PR): the calibration measures the HTML-drawn and
              grouped charts too (builders for gantt, journey, matrix-grid, progress, quadrant,
              state-chart, word-cloud; kanban and roadmap had one), and all nine turned
              `measured`. Lowered to the ceiling: matrix-grid side 4 -> 3 and progress side
              6 -> 4 (both CLIP: a three-word row label wraps one word per line in the pane's
              narrow label column — a reflow weakness, logged below), word-cloud side 20 -> 6
              (type floor) and stack 20 -> 8 (the packer drops a word at 9).
              CLOSED (panes-chart-labels PR): progress and matrix-grid gave a pane's row label a
              column so narrow that a three-word label set one word per line. In a pane the column
              takes its slide width, capped by the pane (pane.css); side ceilings 4 -> 9 and
              3 -> 5. examples/panes-row-labels.md.
            - PART CLOSED (panes-radar PR): `calibrate-capacity --pane` measures SVG charts
              (builders for 12 kernels, and a step fails on TYPE FLOOR or CHART LABELS DROPPED as
              well as OVERFLOW). bar, piechart, scatter, line, heatmap, map and radar turned
              `measured`; scatter's hard fell 12 -> 8 (side) and 10 (stack). Still `editorial`:
              bullet, funnel, waterfall, stacked-bar and slope (no probe signal to 24 elements —
              closed since: a truncated name is reported) and every HTML-drawn or grouped chart
              (gantt, journey, kanban, matrix-grid, progress, quadrant, roadmap, state-chart,
              word-cloud), which this pass did not measure.
            - CLOSED (panes-probe-calibration PR): the type-floor probe sizes `<foreignObject>`
              labels (font-size x rect height / offsetHeight, over K). Export TYPE FLOOR lines
              after it: mermaid-sketch-labels pages 4 (6.6px) and 5 (5.5px), diagram-narration
              page 5 (7px), typed-diagram-narration page 4 (6.9px), newly tagged; panes-mermaid
              stays quiet. Default (`reader`) exports are byte-identical, since the tab is
              author-only. The four decks are left as they are for the owner to fix or accept.
              Two PRE-EXISTING holes the checker found, off this PR's path:
              (a) `unmeasured` never reaches the export for a slide that fits: split-verdict.js
                  returns null when a slide is neither over nor illegible, so the `ⓘ TYPE FLOOR
                  NOT MEASURED` line prints only for overflowing slides (no deck printed it at
                  HEAD either). A MathML label in a Mermaid diagram (no offsetHeight) is the
                  live case.
              (b) the scaled-HTML (`data-fit-k`) arm reads childless leaves only, so a label
                  like `A<br>B` is skipped there, as the foreignObject arm's was before its fix.
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
            for the probe), the radar kernel, the HTML chart kernels, chart-family.dispatch.js,
            tools/calibrate-capacity.js --pane.
done when — a Mermaid pane's labels read at least the type floor and the probe can say so; and the calibration
            measures the rest of the charts' pane ceilings, so their budgets turn `measured`.
evidence  — decision note §2 ("Charts draw for the pane") and §6 gap 2; the label-height table
            in PR #2420.
verify    — tier 1 checker; render a flowchart in a 35% pane and on a slide and compare a node
            label's px height (19.5 vs 34.8 today).
