---
origin: 3159
priority: P7
recorded: 2026-11-12
area: website
severity: low
swimlane: engineering/decisions/2026-11-12-gecko-srcdoc-rewrite-controller.md §6
deferred: blocked — the gecko failure does not reproduce here, so its cause cannot be named or a fix shown against it
source: https://github.com/Laticent/lattice/pull/3170
---

# On Firefox, a quick Explore-and-back sometimes leaves the Playground preview hidden

why now   — playground-tab-switch.spec.ts "a quick Explore and back, 0 frames apart, … (wide)" failed on gecko under load
            in the #3159 session: the preview wrapper stayed `pg-preview-wrap` without `is-live` past the 4 s timeout
            (main 22c3dc7: 1 of 20 at 4 workers).
            #3170 fixed a real stall on this path: a stale Edit `realign` hold that held Explore's reveal for up to 60
            frames. That stall is shown on desktop and webkit-tablet (the new spec case went red 4 of 17 without the
            fix) and only rarely on gecko: on the pre-fix logic gecko ran 142 + 40 runs green under load, and of 100
            instrumented runs one held on `realign` (1031 ms, well under 4 s) and none failed. So whether the gecko
            failure was this stall or a second cause is unknown, and this item stays open until one is caught.
where     — docs/src/components/playground/PlaygroundApp.tsx (the reveal: `markLiveWhenSlidesVisible`, its holds
            `land` / `open-on` / `realign`, now published as `data-hold` on the wrapper)
done when — a gecko failure of the case is caught with `data-hold` read at the moment it fails, its cause named and
            fixed; or the case runs 100+ times green on gecko at 4 workers under load on main after #3170
evidence  — #3170 body (§Tests, §Caveats); the #3159 session's log `Expected pattern: /is-live/ · Received string:
            "pg-preview-wrap"`
verify    — cd docs && npx playwright test e2e/playground-tab-switch.spec.ts --grep "a quick Explore and back, 0 frames apart.*\(wide\)" --project=gecko --workers=4 --repeat-each=20
            (with a `data-hold` read in the failure path, as #3170's raise round did)
