---
origin: 3232
priority: P6
recorded: 2026-11-19
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-16-status-triplets.md §7
deferred: large — main hangs identically, so #3312 did not cause it, but the cause is unknown and needs a bisect of the player's a11y output in Chromium 121
source: https://github.com/Laticent/lattice/pull/3312
---

# An a11y palette's exported player hangs Chromium 121

```text
  P6 · [no ticket] the HTML player hangs getComputedStyle in Chromium 121
       why now   — Raising #3312's card, exported players were opened in Playwright 1.41's
                   Chromium 121.0.6167.57 (no light-dark(): the engine the player exists to
                   theme), with a bounded page.screenshot per page, each in its own launch.
                   status-triplets (indaco) paints in light and dark, main and #3312 alike, and
                   main's and #3312's dark slide 2 match pixel for pixel. risk-matrix-a11y-critical
                   (a11y-achromatopsia) never finishes a screenshot in light or dark mode, on
                   main's export as on #3312's. One run took the whole browser down. A reader of
                   an a11y deck in an old Chromium gets a hung tab.
       where     — lib/export/player-core.mjs output for an a11y palette (it extends onyx through
                   a11y-base), in Chromium < 123. Not narrowed yet: bisect by removing the dual-mode
                   style block, then token groups, until the page paints.
       done when — an a11y player paints within a second in Chromium 121 in both modes, with the
                   bisected cause fixed, and a test that loads one in that engine.
       verify    — npm i playwright@1.41.2 in a scratch folder, npx playwright install chromium;
                   one launch per page, then a bounded page.screenshot (a style read stalls in this engine).
```
