---
origin: 2982
priority: P2
recorded: 2026-10-30
area: studio
severity: low
swimlane: engineering/decisions/2026-10-27-slide-structure-strip.md
deferred: off-path — a pill-strip e2e that fails on main too; #2982 changes the map strip, not the pills
source: https://github.com/Laticent/lattice/pull/2982
---

# strip-drag's quick-swipe arm fails on desktop-touch, on main as well

```text
  P2 · [no ticket] strip-drag.spec.ts:139 fails on the desktop-touch project.
       why now   — the @parity touch suite runs nightly, so this test is red there and
                   hides any real regression in the pill strip's swipe-to-scroll.
       where     — docs/e2e/strip-drag.spec.ts:139, "a long press released without moving
                   opens the menu; a quick swipe moves nothing"; the assertion at :158 polls
                   the Slide navigator's scrollLeft and reads 0.
       done when — the test passes on desktop-touch (and still on mobile-touch), with the
                   swipe arm proving a scroll rather than skipping it.
       evidence  — #2982's session ran it with main's MapRail.tsx, StudioMap.tsx and
                   StudioShell.tsx in place: 2 of 2 failed, the same as on the branch. It
                   passes on mobile-touch. Likely cause, not yet checked: at 1440px the five
                   pills fit the strip, so the navigator has no overflow to scroll and
                   scrollLeft cannot leave 0.
       verify    — cd docs && npx playwright test e2e/strip-drag.spec.ts:139
                   --project=desktop-touch --project=mobile-touch --retries=0
```
