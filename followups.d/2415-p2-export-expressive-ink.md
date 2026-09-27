---
origin: 2415
priority: P2
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2415
---

# Ship Vetrina's ink and cursor in an exported expressive deck

why now   — The owner deferred it on 2026-09-27 ("not yet"). Until it lands, a sent `expressive`
            deck plays the focus and none of the ink or the cursor, so it looks close to
            `restrained`. Measured: `createStage` bundles to 35,350 bytes minified (11,347 gzipped),
            and it would ship only in an expressive export.
where     — lib/export/player-core.mjs (inline the stage for expressive only), guide-player.ts (run
            the scene step's ink the way PresentOverlay.tsx does), tools/build-guide-player.js.
done when — an exported expressive deck draws the same ink as the Studio, restrained and somber
            exports are byte-identical to before, and verify-guide-player.mjs checks the ink.
evidence  — the export played in Chromium and in WebKit at iPhone size, with the ink captured.
verify    — tier 0 gates plus tools/verify-guide-player.mjs (both engines).
