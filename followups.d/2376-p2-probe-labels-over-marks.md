---
origin: 2376
priority: P2
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2376
---

# a chart that truncates its names trips no probe, so stacked-bar's pane ceiling cannot be measured

why now   — the panes-probe-calibration PR added `⚠ CHART LABELS OVERPRINT` (a label across a
            mark or another label), and with it bullet, funnel, waterfall and slope turned
            `measured`. stacked-bar did not: at 24 bars in a 50% pane it trips nothing, because it
            TRUNCATES each category name to "F…" (and each value to "…") instead of dropping or
            overprinting it — a chart whose every name reads "F…" is as unreadable as one that
            dropped them, and the export says nothing. Its budget stays `basis: editorial`.
            Also not seen by the overprint probe, by construction: marks with no `data-anima-role`
            (slope's dots) or no fill (slope's lines, bullet's target tick). Slope's collisions are
            caught by the label arm; a label over a slope dot is not.
where     — the category-label cull in lib/components/chart/_chart-family (where a name is
            ellipsized), recorded like `data-label-drops` (a `truncate` reason, or its own
            attribute); lattice-emulator.js reports it; tools/lib/calibrate-core.js parseProbeLog
            reads it.
done when — `node tools/calibrate-capacity.js stacked-bar --pane side --max 24` fails a step on
            the truncation, and stacked-bar's budget turns `measured`.
evidence  — the 24-bar render (every name "F…") and the calibration table.
verify    — tier 1 checker: the channel feeds every export's log.
