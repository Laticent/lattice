---
origin: 2915
priority: P2
recorded: 2026-10-26
area: website
severity: medium
swimlane: engineering/decisions/2026-10-26-photo-contrast-coach.md
source: https://github.com/Laticent/lattice/pull/2915
---

# The photo-contrast pin is unverified on WebKit and a real iPhone

why now   — The Coach's pin simulation toggles `dark` / `light` on the preview section, reads computed
            colors in the same task with transitions off, and puts the classes back. Only Chromium
            was driven (HARD RULE #23). WebKit may serialize `color-mix` / `oklab` computed values
            differently from what the canvas probe parses, and a canvas read of the photo is the other
            engine-specific step.
where     — `docs/src/components/studio/coach/photo-contrast-read.ts` (`rgba`, `readPinned`),
            `docs/e2e/photo-contrast-coach.spec.ts`.

done when — The spec runs on the `webkit-tablet` and `webkit-phone` projects and on a real iPhone, and the warning and the pin appear and work; the result is recorded here.
