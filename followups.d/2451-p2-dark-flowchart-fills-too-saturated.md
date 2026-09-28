---
origin: 2451
priority: P2
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2451
---

# Eight themes paint dark-mode diagram boxes in raw neon fills

why now   — the defect is visible on every flowchart, pie and pill in eight of fourteen
            base themes' dark faces, and it is the single biggest gap between those themes
            and indaco / cuoio in a boardroom review (found by the 2026-09-28 theme
            evaluation that led to #2451).
where     — `--cat-N-fill`'s DARK arm in themes/{ardesia,atelier,brina,burgundy,crepuscolo,
            laguna,magnolia,mustard}.css. Measured OKLCH chroma over slots 1-6: indaco and
            cuoio cap at 0.150; these eight reach 0.215-0.256 (laguna 0.251, crepuscolo 0.256,
            brina's slot 1 renders as electric indigo, burgundy's as pure blue). The flowchart
            slide of any deck rendered with `<theme>-dark` shows it.
done when — every listed theme's dark `--cat-1..6-fill` chroma is <= 0.16, checkCatContrast
            and cat-adjacency-floor.test.js stay green (the frozen distances may not erode),
            and a flowchart rendered in each `-dark` face reads as jewel tones, not primaries.
evidence  — one contact sheet: the probe flowchart slide rendered in all eight dark faces
            before and after, sent via SendUserFile; `node tools/cvd-audit.js` counts before/after.
verify    — tier 0 gates, because it is token values in eight palette files with an existing
            ratchet (cat-adjacency-floor) guarding the distances; add a tier 1 checker only if
            a fix has to move a mark or reorder a cycle.
