---
origin: 2422
priority: P3
recorded: 2026-09-27
area: infra
severity: medium
swimlane: engineering/development.md
---

# flowchart worker "burst" arm waits a fixed 60 ms for two layouts

why now   — `a burst paints only the newest edit, with at most one layout queued behind the
            one in flight` (test/unit/components/flowchart.test.js:218) failed 2 times in the
            full-suite stress loop on #2422's branch (`'FlowchartAlphaBetaGamma'` did not match
            /Delta/), and passes alone. `settle()` is a fixed `setTimeout(60)`, and this arm
            needs TWO worker layouts in sequence inside it; under suite load the second has not
            answered yet. #2422 touches no flowchart or worker code.
where     — test/unit/components/flowchart.test.js `settle` (and the arms that use it).
done when — the arm waits on the event it asserts (the worker's second answer, or
            `data-fc-pending` clearing, with a generous deadline), not a fixed sleep, and still
            fails when the burst coalescing it pins is broken.
evidence  — 20 full-suite runs with no failure of this arm, plus a run with coalescing
            disabled failing.
verify    — tier 0: the gates, plus the break arm.
