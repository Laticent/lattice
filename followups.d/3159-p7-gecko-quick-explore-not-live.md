---
origin: 3159
priority: P7
recorded: 2026-11-12
area: website
severity: low
swimlane: engineering/decisions/2026-11-12-gecko-srcdoc-rewrite-controller.md §6
deferred: off-path — the Playground's Explore/Edit tab switch on Gecko; it fails the same way on main, so #3159 did not cause it
source: https://github.com/Laticent/lattice/pull/3159
---

# On Firefox, a quick Explore-and-back sometimes leaves the Playground preview hidden

why now   — playground-tab-switch.spec.ts "a quick Explore and back, 0 frames apart, … (wide)" fails on gecko under load: the
            preview wrapper stays `pg-preview-wrap` and never gains `is-live`, so the reader sees no preview after the switch.
            Found by #3159's raise loop and classified there: on main (22c3dc7) 1 of 20 at 4 workers; on #3159's branch 0 of
            20 at 4 workers, and 2 of 5 in its heavier mixed runs.
where     — docs/src/components/playground/PlaygroundApp.tsx (the tab switch and the reveal that sets `is-live`)
done when — the case passes 20/20 on gecko at 4 workers on main, with the cause named
evidence  — the #3159 session's logs: main 1/20 with `Expected pattern: /is-live/ · Received string: "pg-preview-wrap"`
verify    — cd docs && npx playwright test e2e/playground-tab-switch.spec.ts --grep "a quick Explore and back, 0 frames apart.*\(wide\)" --project=gecko --workers=4 --repeat-each=20
