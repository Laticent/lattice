---
origin: 2344
priority: P2
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2344
---

# Five chart paints are lost in Read · Article, from three causes in the chart CSS

why now   — the extended `check:render` (copy-parity pass, #2344) found them on its first run
            and they are sanctioned in `test/viz-render/black-baseline.json` with a `why`. A
            sanction is a debt, not a fix. They predate #2344 and appear on the CLI player too.
where     — (1) progress + timeline-list status chips: `section.chart-frame .chart-status`
            (chart-family CSS) has no `figure.chart-frame` arm. (2) roadmap header underline:
            the `figure.roadmap thead tr` arm exists, but reads `--spectrum-structure`, a
            token declared only on `section` (base.variants.css). matrix-grid's header
            underline has the same cause. (3) matrix-grid: `figure: none` in the projection
            catalog, so its table reaches the article through the generic walk and the filled
            vs outlined cell marks (meaning, not chrome) are dropped.
done when — each baseline entry above is gone because the paint survives, verified by
            `node tools/check-viz-render.js` failing on the stale entry, then re-blessing.
            (3) may instead be a decision that matrix-grid re-hosts as a figure, which on
            its own would still leave the header underline to (2).
evidence  — CDP `CSS.getMatchedStylesForNode` on the slide element names the winning rule;
            the twin in the article matches none of it (2026-09-24).
verify    — a changed slide surface in Read · Article: before/after screenshots of the chart
            gallery's Read · Article view, light and dark (HARD RULE #9).
