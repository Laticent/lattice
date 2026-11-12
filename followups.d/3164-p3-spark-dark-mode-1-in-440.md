---
origin: 3164
priority: P3
recorded: 2026-11-12
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: blocked — owner decision D2 on PR #3164's decision card: keep the test running as a HARD RULE #33 exception, or switch it off with test.fixme
source: https://github.com/Laticent/lattice/pull/3164
---

# `compose-spark-editor.spec.ts:108` (the drawn spark follows the site into dark mode) failed once in about 440 runs

why now   — met during PR #3150's load runs: one failure in about 250 runs, then 190 of 190 green, alone and at 4 workers.
            The one failure was in the wait BEFORE the switch to dark mode: Compose's slide-1 spark fill never matched the
            preview's within the poll. No trace was kept. One cause was tested and did not reproduce: ProseMirror's 20 ms
            focus timer undoing a slow first click (mouse held 0 or 60 ms, with and without the editor focused first; 16 of
            16 put the caret on slide 1). HARD RULE #33's no-cause path is `test.fixme` with the three-part reason; the card
            recommends keeping it running so CI's failure trace names the cause next time.
where     — docs/e2e/compose-spark-editor.spec.ts:108 (main's text, from #3128).
done when — the owner answers D2; on a recurrence, the CI trace is read and the race it shows is fixed at its cause.
evidence  — the CI trace of the next failure, or the owner's answer.
verify    — tier 1 checker.
