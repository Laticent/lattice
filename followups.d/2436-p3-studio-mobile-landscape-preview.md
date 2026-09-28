---
origin: 2436
priority: P3
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2436
---

# Check the Studio's live preview of a `size: mobile-landscape` deck against its export

why now   — #2436 added the `mobile-landscape` canvas (1560×720). The export, the PDF and the video were
            verified: type and the content box stay at their 16:9 sizes and the extra width becomes an
            even side gutter. The live preview reaches the same numbers through a different path, the
            runtime's `patchSectionGeometry` reading the section's laid-out box (`canvasWideFactor`), and
            it was never looked at in the running Studio, only unit-tested and checked in the exported
            player (12.8 px unit, 140 px gutter).
where     — lib/runtime/index.js `patchSectionGeometry`; lib/engine/sizes.js `canvasWideFactor`;
            examples/mobile-landscape.md is the deck to load.
done when — the Studio preview and Present show examples/mobile-landscape.md with the same gutter and
            type as its PDF, at desktop and phone widths, including after a window resize.
evidence  — tools/screenshot.js at 1440/820/390 of the Studio preview beside the PDF's page renders.
verify    — tier 0 if it matches; a runtime fix is tier 1 (a checker), because the runtime runs on
            every live preview.
