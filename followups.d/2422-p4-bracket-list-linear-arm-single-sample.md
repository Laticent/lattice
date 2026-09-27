---
origin: 2422
priority: P4
recorded: 2026-09-27
---

# `bracket-list` linear-growth arm compares single mean timings with no noise guard

why now   — `cost stays linear in input length` (test/unit/core/bracket-list.test.js:168) failed
            once in 13 full-suite stress runs on #2422's branch, which touches no bracket-list
            code. It times one 200-iteration batch at 4000 and one at 16000 and asserts growth
            under 8x; a load spike during the large batch decides it. Same shape #2422 fixed in
            lift-bracket-span.test.js.
where     — test/unit/core/bracket-list.test.js:168 (`run`).
done when — the arm takes the fastest of several batches per size, and still fails when the
            linear parse it pins is replaced by a backtracking one.
evidence  — 20 full-suite runs with no failure of this arm, plus the break run failing.
verify    — tier 0: the gates, plus the break arm.
