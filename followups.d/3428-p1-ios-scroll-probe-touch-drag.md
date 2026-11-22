---
origin: 3428
priority: P1
recorded: 2026-11-22
area: website
severity: medium
swimlane: engineering/decisions/2026-09-28-playground-virtual-filmstrip.md §1
deferred: blocked — on the hosted iOS Simulator, safaridriver stops answering after one WebDriver touch drag over the Playground's preview frame, so no on-device run can finish
source: https://github.com/Laticent/lattice/pull/3428
---

# Run the Playground scroll probe on a real iPhone and iPad

```text
  P1 · [no ticket] get PROBE=playground-scroll to finish on the iOS Simulator
       why now   — PR 3428 put a scroll guard in applyWindow (deck-render.js) for a wheel scroll
                   that Chromium dropped under load. It is proven on Chromium and on Playwright
                   WebKit, not on a device. The probe exists (playground-scroll-probe.js,
                   run.mjs runPlaygroundScrollProbe), but three warm-harness runs on PR 3428
                   failed for the same reason. After one touch drag over the preview frame,
                   safaridriver answered nothing more, not the next drag (run 45073632825) and not
                   a plain execute-script either (round 3, same run). That held with the burner off,
                   so load is not the cause. The first run (45065714489) hung for 16 minutes per
                   device with no deadline.
       where     — docs/scripts/ios-safari/run.mjs (runPlaygroundScrollProbe, the drag);
                   playground-scroll-probe.js. Compare player-charts.mjs's swipe, which works
                   but is not over an iframe.
       done when — the probe finishes on both simulators with 6 trials each, and its drops field
                   says whether WebKit drops a scroll inside a swap. Whether to register it in
                   .github/platform-suites.json as a nightly suite is the owner's call.
       evidence  — the harness reply comments on PR 3428 and the run logs above.
       verify    — try a touch drag that starts outside the frame, a scroll gesture from
                   XCUITest or simctl in place of WebDriver touch, or the Mac's own Safari
                   (SIM_UDID=mac) for the WebKit half.
```
