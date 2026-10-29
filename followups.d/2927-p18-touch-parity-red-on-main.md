---
origin: 2927
priority: P18
recorded: 2026-10-29
area: website
severity: medium
swimlane: engineering/decisions/2026-10-27-slide-structure-strip.md
deferred: off-path — red on main at cd555a7 too; this PR touches neither path
---

# Two @parity specs fail on the touch projects, on main too

why now   — Found while driving the strip work; both fail identically on a build of `cd555a7` (this PR's base), so the per-PR CI, which runs no touch project, has not caught them.
where     — `docs/e2e/compose-stress.spec.ts:500` ("inserting from the gallery reveals the new slide, taking focus only on a fine pointer": on `tablet-touch` and `mobile-touch` a coarse pointer still lands focus in Compose) and `docs/e2e/preview-nav.spec.ts:268` ("a slide navigator that remounts comes back centered": on `mobile-touch` the landscape rotation leaves the pill navigator mounted, `toHaveCount(0)` gets 1).
done when — both pass on their touch projects three runs in a row, or each names its root cause and is fixed.
evidence  — 2026-10-29, production build of `cd555a7` on port 4399: 3 failed (compose-stress:500 on both touch projects, preview-nav:268 on mobile-touch); the same three fail on this branch.
verify    — `cd docs && npx playwright test e2e/compose-stress.spec.ts:500 e2e/preview-nav.spec.ts:268 --project=mobile-touch --project=tablet-touch`
