---
origin: 3413
priority: P1
recorded: 2026-11-22
area: infra
severity: medium
swimlane: engineering/decisions/2026-11-06-flaky-tests.md §HARD RULES #33 and #34
deferred: blocked — the owner ran out of credits mid-session and handed the work to a colleague; finish it in #3413 before that PR leaves draft
source: https://github.com/Laticent/lattice/pull/3413
---

# The export check's witness gives up under load, on every engine

why now   — HARD RULE #34 asks for green under load before #3413 lands. On a 4-CPU cloud sandbox, 4 concurrent
            runs of `test/integration/export-nightly/npm-plugin-export-check.test.js --test-name-pattern=webkit`
            failed in 8 of 8 runs (1 to 3 cells each), and Firefox failed 1 of 20. Each failure says "the witness
            never heard <many vectors>", not only webrtc. WebKit is untouched by #3413, so this predates it. At 6
            concurrent the sandbox ran out of memory. The nightly runs the file alone and stays green.
where     — `reached()` in that test file: the walled run opens about 20 pages, then the witness opens 20 more in
            the same browser and waits on `log.until(...)`, whose default deadline is 60 s
            (`test/helpers/request-log.js` `until`). Under load, pages load slower than that.
done when — 4 concurrent runs × 5 rounds green on every engine, with the cause fixed (what the witness waits on, or
            how many pages run at once), not a longer deadline or a retry (HARD RULE #33's table).
evidence  — the failing-under-load logs before, the same load green after, and a failing arm.
verify    — tier 1: a checker grades #3413's card.
