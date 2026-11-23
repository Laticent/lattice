---
origin: 3304
priority: P2
recorded: 2026-11-23
area: infra
severity: medium
swimlane: docs/scripts/ios-safari/run.mjs
deferred: blocked — the owner's ruling (2026-11-22) puts these on their own branch from main after #3304's card; none is in #3304's code, and HARD RULE #33 still owns them to the session that met them
source: https://github.com/Laticent/lattice/pull/3304
---

# Fix three iOS Simulator flakes met on #3304

why now   — HARD RULE #33: a red test is fixed at its root by the session that meets it. #3304's raise met three,
            none in its own code:
            - `ios-safari-studio-iphone` (run 45033643193 at 29ca71b): the panes probe timed out waiting for the
              Studio's first render ("iframes none"), and the compose probe drew its caret 19 px off its text after
              a 1,197 ms hold. Passed on the next run, on main's nightlies, and on #3304 at 8397e5b3.
            - `ios-safari-present-memory` (run 45091849943 at 4c5f1165): the first arm's first navigation, to the
              home page, timed out in safaridriver (`POST /url 408`) before any Studio code ran. Passed at e8f11357.
            - `ios-safari-present-keepalive` (run 45099445978 at e8f11357): Present never opened. An element click
              opened nothing (the page saw a touchstart), then a touch the page never saw, then a 1,897 ms hold,
              the long-press class `tap-guard.mjs` documents. Passed at c0896c61, 50fbd30a and 4c5f1165.
where     — docs/scripts/ios-safari/run.mjs (session start, navigation, the keepalive and compose tap paths),
            docs/scripts/ios-safari/tap-guard.mjs, docs/scripts/ios-safari/panes-probe.js.
done when — each failure is reproduced or explained from its log and fixed at its cause (no retry, no longer
            timeout), and each suite passes twice in a row on a dispatch.
evidence  — per fix, HARD RULE #34: a failing arm, and the suite green on two dispatches.
