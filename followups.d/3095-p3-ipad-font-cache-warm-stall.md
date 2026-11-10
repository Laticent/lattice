---
origin: 3095
priority: P3
recorded: 2026-11-10
area: website
severity: low
swimlane: docs/scripts/ios-safari/font-cache-probe.js
deferred: off-path — found while raising PR #3117's evidence; it fails identically on main, and the type-sets change does not touch the warm-up's order or count
---

# iPad Safari: the Studio's font warm-up stalls before all 31 faces arrive

why now   — the `ios-safari-font-cache` platform suite fails on the iPad simulator's warm arm (GitHub Pages' `max-age=600` headers): the server had served 24 of 31 faces after 240 s on main (run 42791914887, e862e58) and 23 of 31 on PR #3117 (run 42781766641). The control arm (`no-store`) fetches all 31 on the same device, the iPhone simulator passes both arms, and Playwright WebKit passes every arm at iPad, iPad-Safari-width and iPhone sizes. The suite is not in the nightly, so nothing has been watching it.
where     — docs/src/components/studio/studio-warm.ts (the low-priority warm queue and its idle gate); docs/scripts/ios-safari/font-cache-probe.js and font-cache-server.mjs.
done when — the iPad warm arm fetches all 31 faces within the probe's budget (or the budget is shown to be wrong for a cold simulator and is raised with the measurement), and the suite runs on a schedule so a regression is seen.
evidence  — the two run logs above; the probe self-test on Playwright WebKit (`PROBE=font-cache node docs/scripts/ios-safari/probe.selftest.mjs`).
verify    — tier 1 checker; the platform suite green on the iPad simulator.
