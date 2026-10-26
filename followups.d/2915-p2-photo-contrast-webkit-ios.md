---
origin: 2915
priority: P2
recorded: 2026-10-26
area: website
severity: medium
swimlane: engineering/decisions/2026-10-26-photo-contrast-coach.md
source: https://github.com/Laticent/lattice/pull/2915
---

# The photo-contrast pin is unverified on a real iPhone

why now   — The Coach's pin simulation toggles `dark` / `light` on the preview section, reads computed
            colors in the same task with transitions off, and puts the classes back. Only Chromium
            was driven at first (HARD RULE #23); Playwright's WebKit then passed the light-mode case on the `webkit-tablet` (1440) and `webkit-phone` (iPhone 15 Pro profile, 390) projects on 2026-10-26. WebKit may serialize `color-mix` / `oklab` computed values
            differently from what the canvas probe parses, and a canvas read of the photo is the other
            engine-specific step.
where     — `docs/src/components/studio/coach/photo-contrast-read.ts` (`rgba`, `readPinned`),
            `docs/e2e/photo-contrast-coach.spec.ts`.

done when — The warning and the pin are exercised on a real iPhone (an emulated WebKit engine is not the device), and the result is recorded here.
