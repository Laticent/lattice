---
origin: 2710
priority: P2
recorded: 2026-10-15
area: code
severity: low
swimlane: engineering/decisions/2026-10-15-code-plugin.md §9
source: https://github.com/Laticent/lattice/pull/2710
---

# Copy buttons are drawn in Studio thumbnails and the slide overview

why now   — the runtime draws them on any document stamped `data-lattice-live-media`, and the thumbnail and overview frames carry that stamp too (single-slide-render.ts callers), so a copy-enabled block shows two tiny buttons in a filmstrip. Not verified on screen.
where     — lib/runtime/index.js drawCopyButtons; docs/src/lib/single-slide-render.ts callers (SlideOverview.tsx, preview-pool.tsx).
done when — the buttons appear only in the full-size reading frames, by a builder-side signal rather than a size guess.
evidence  — a screenshot of the filmstrip with a `@code{copy}` deck, before and after.
verify    — docs/e2e/code-copy.spec.ts plus a thumbnail assertion.
