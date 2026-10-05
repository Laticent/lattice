---
origin: 2520
priority: P3
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2520
---

# Load the pane-needs map on demand instead of inlining it in the Studio page

why now   — PR 2520 inlines the per-component pane needs (~4 KB raw) into the Studio page as an
            island prop; the page's htmlRaw went 202.3 → 210.6 KB (soft 202.0, ceiling 222.2).
            Only Compose's pane gallery reads it.
where     — docs/src/pages/studio.astro (`paneNeeds`), docs/src/components/studio/StudioShell.tsx →
            ComposeView `paneNeeds` prop; the static `studio/component-catalog.json` endpoint is
            the existing on-demand route.
done when — the map arrives with the component catalog (or its own endpoint) and the Studio page's
            htmlRaw drops by the map's size, with the gallery's badges unchanged.
evidence  — `node scripts/check-route-budget.mjs` before/after; compose-panes.spec.ts green.
verify    — tier 0 gates, because the badges are pinned by pane-gallery.test.ts and the e2e spec.
