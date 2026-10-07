---
origin: 2415
priority: P2
recorded: 2026-09-27
area: website
severity: medium
swimlane: engineering/decisions/2026-09-25-vetrina-delivery-presets.md
source: https://github.com/Laticent/lattice/pull/2415
---

# The Stage window blinks off on a site palette change (nightly e2e red on main)

why now   — `docs/e2e/stage-window.spec.ts:372` ("a site palette change does not blink the
            presenter view off") fails every time on `main` at 3b5a92a (2 of 2 runs, desktop,
            build:e2e) and on #2415's branch (3 of 3). The presenter view goes away once during the
            rewrite (`__gone` 1, expected 0). It passed on #2415's branch before it was rebased onto
            #2410 / #2418, so one of the commits that landed on main on 2026-09-27 likely broke it.
            The spec runs only in the nightly suite, so no PR gate caught it.
where     — the Stage window's palette rewrite (docs/src/components/studio/ stage window code) and
            whatever #2410 (typography venue) or #2418 (modifier effects) changed in the Stage's
            document; bisect the day's main commits against that one spec.
done when — the spec passes on main, reproduced red first, 3 of 3 runs green after.
evidence  — the bisect result naming the breaking commit, and the passing runs.
verify    — tier 0 gates plus the spec itself.
