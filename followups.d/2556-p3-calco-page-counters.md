---
origin: 2556
priority: P3
recorded: 2026-10-07
source: https://github.com/Laticent/lattice/pull/2556
---

# The /calco demo page still draws CSS counters as 0

why now   — the Studio's captures now pass the counter properties to html-to-image
            (`deck-export.js` › `captureStyleProperties`, `engineering/gotchas/export.md`); the
            /calco page's own capture does not. Pre-existing and off-path (HARD RULE #18).
            `lib/core/pdf-compose/compose.mjs` `makeHtmlToImageCamera` has the same gap but no
            caller today.
where     — docs/src/pages/calco.astro (the `toBlob` call), compose.mjs makeHtmlToImageCamera.
done when — both pass the same property list as `captureOptions` (one shared helper, #15).
evidence  — a counter slide exported from /calco, before and after.
verify    — export-bytes change on /calco: owner sign-off on dark + light.
