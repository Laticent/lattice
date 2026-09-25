---
origin: 2366
priority: P3
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2366
---

# An SVG chart in Read · Article drops its authored caption

why now   — #2366 fixed the FLOW branch (`projectFlow` now captions with the `.chart-caption`
            sibling). The SVG and spatial branches still caption with the slide heading, which
            is already the h2 above, and drop the author's caption line.
where     — `lib/transformers/prose-projection.mjs`, the two other `figcaption` builders
            (the SVG media and spatial-bounded projections, near `projectFlow`).
done when — every figure kind captions with the authored `.chart-caption` when the slide has
            one and falls back to the heading otherwise, pinned in `prose-projection.test.js`.
evidence  — the flow case was found on `examples/read-article-chart-paints.md` (matrix-grid's
            "Illustrative — placements vary by company." vanished); the SVG branches share the
            heading-only code shape (read, not rendered).
verify    — a changed Read · Article surface: before/after screenshots of a captioned bar or
            pie chart in the player, light and dark (HARD RULE #9).
