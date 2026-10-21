---
origin: 2794
priority: P2
recorded: 2026-10-19
area: website
severity: low
swimlane: engineering/decisions/2026-10-18-on-demand-styles.md §11
source: https://github.com/Laticent/lattice/pull/2794
---

# Offer the style loader to the Studio and the landing page, once the Playground's default is settled

why now   — the loader is built for the Playground only. The Studio, the landing page and the specimens still register the whole sheet, and they share the engine's one `lattice` slot with nothing else, so adopting it there is a per-page decision, not a shared one.
where     — docs/src/lib/theme-fetch.ts (`createThemeFetcher(themeBase, { styles })`), docs/src/lib/single-slide-render.ts, the Studio's engine bridge.
done when — each surface that adopts it has the live-frame gate (`tools/style-loader-gate.mjs`) run on its own frame and a measured bytes and time table; a surface that renders several documents on one page (the pooled thumbnails) keeps the whole sheet unless the scan covers them all.
evidence  — gate output per surface, throttled timings.
verify    — adversarial trio (shared preview path).
