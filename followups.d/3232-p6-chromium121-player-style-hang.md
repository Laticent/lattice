---
origin: 3232
priority: P6
recorded: 2026-11-19
area: engine
severity: low
swimlane: engineering/decisions/2026-11-16-status-triplets.md §7
deferred: off-path — the player's style computation in a pre-light-dark() Chromium; #3312 does not change it
source: https://github.com/Laticent/lattice/pull/3312
---

# An exported player stalls Chromium 121 on dark and a11y pages

```text
  P6 · [no ticket] the HTML player hangs getComputedStyle in Chromium 121
       why now   — Raising #3312's card, the exported players were probed in Playwright 1.41's
                   Chromium 121.0.6167.57 (no light-dark()). Every page loads in under 300 ms,
                   but a getComputedStyle read of the risk matrix's key numbers never returns on
                   status-triplets (dark) and risk-matrix-a11y-critical (light and dark), on
                   main's export as on #3312's. status-triplets (light) answers at once (critical
                   key number white on indaco's critical band). The player exists to theme old
                   engines, so a renderer stall there is in its contract.
       where     — lib/export/player-core.mjs output in Chromium < 123: likely a relative-color
                   or calc() value in the dark scope that this engine evaluates without end.
       done when — the four player pages answer a getComputedStyle read within a second in
                   Chromium 121, with a bisected cause, and a test that loads a dark player page
                   in that engine.
       verify    — npm i playwright@1.41.2 in a scratch folder, npx playwright install chromium;
                   bound each step (goto commit, domcontentloaded, then evaluate with a timeout).
```
