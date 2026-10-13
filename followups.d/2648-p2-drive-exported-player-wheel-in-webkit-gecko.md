---
origin: 2648
priority: P2
recorded: 2026-10-12
area: imagery
severity: low
swimlane: engineering/decisions/2026-10-11-collage-component.md §11
source: https://github.com/Laticent/lattice/pull/2648
---

# Drive the exported player's lightbox wheel and digits in WebKit and Firefox

```text
  P2 · [no ticket] Drive the exported player's lightbox wheel and digits in WebKit and Firefox
       why now   — #2648's Gecko and WebKit evidence covers the Studio (the nightly probe, run 38321782041). The exported player's own wheel listener, which the lightbox must stop from turning the slide behind it, was driven in Chromium only (test/integration/export/collage-player.test.js uses Puppeteer).
       where     — test/integration/export/collage-player.test.js, lib/export/player-core.mjs (the window wheel listener near the PRESENT wheel block), lib/core/collage-lightbox.mjs (wheel handler).
       done when — the new wheel-and-digit test passes against the real exported HTML in WebKit and Firefox, with the deck index unchanged after a flick.
       evidence  — the same assertions run through Playwright's webkit and firefox projects over a built export.
       verify    — tier 0 gates, because it adds coverage and changes no shipped bytes unless an engine disagrees.
```
