---
origin: 2780
priority: P8
recorded: 2026-10-18
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-18-on-demand-styles.md §9
source: https://github.com/Laticent/lattice/pull/2780
---

# E3 and E5: hand a style subset to the engine through the default render path, never through `-c <file>`

why now   — the audit found that `lattice deck.md -c <file>` is a different pipeline from the default render. The default masks a slide's own `::after { content }` (packTheme / maskNonPaginationContent) and minifies; `-c <file>` does neither unless the file is dist/lattice.css. Feeding a subset through `-c` made claim, adaptive-image and chart-hue-collapse differ from the full render, with no module missing.
where     — tools/style-needs-audit.mjs (the baseline is rendered through a `-c` copy of dist/lattice.css so both sides match); the loader and export work in E3 and E5.
done when — the loader or export path that applies a subset goes through the same mask and minify steps as the default render, and a test shows claim.md renders identically full vs subset on that path.
evidence  — the claim.md / adaptive-image.md / chart-hue-collapse.md renders, full vs subset, on the real path.
verify    — tier 0 gates, plus the audit run on those three decks.
