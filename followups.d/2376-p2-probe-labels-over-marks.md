---
origin: 2376
priority: P2
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2376
---

# a chart whose labels overprint its marks trips no probe, so its pane ceiling cannot be measured

why now   — `tools/calibrate-capacity.js --pane` now measures an SVG chart's ceiling from the
            export's legibility lines (TYPE FLOOR, CHART LABELS DROPPED) as well as OVERFLOW.
            Five charts tripped none of them up to 24 elements in a 50% pane: bullet, funnel,
            waterfall, stacked-bar and slope. At least one is a real miss, not a real fit: a
            bullet pane of 20 rows (measured 2026-09-28) squeezes each row until its label
            prints across the neighboring bar, and nothing in the export says so. Their pane
            budgets stay `basis: editorial` until a signal sees it.
where     — lib/core/overflow-probe.js (a pass over a figure's `<text>` boxes against each other
            and against the marks of OTHER rows, the way tools/measure-pane-fit.js `paneJank`
            does for HTML text); tools/lib/calibrate-core.js `parseProbeLog` reads its line.
done when — a bullet pane that overprints is reported by the export, and the five charts'
            budgets are measured with it.
evidence  — render `node -e` a 20-row bullet pane from calibrate-core `BUILDERS.bullet` and look:
            the labels cross the bars; the export log is clean.
verify    — tier 1 checker, because the probe feeds every export's tag (it is the same class of
            change as the Mermaid foreignObject arm, and needs the owner's export sign-off).
