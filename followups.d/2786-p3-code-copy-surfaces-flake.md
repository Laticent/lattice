---
origin: 2786
priority: P3
recorded: 2026-10-19
area: engine
severity: low
swimlane: engineering/decisions/2026-10-18-platform-suites.md
source: https://github.com/Laticent/lattice/pull/2786
---

# `code-copy-surfaces.test.js` failed once in the merge queue and passes locally

why now   — `test/unit/runtime/code-copy-surfaces.test.js` failed in the merge queue run for #2786 (run 39284743444, job 118167431359, `unit (node 22)`,
            1.2 s) and dequeued it. It passed 6 of 6 afterwards on the same merge tree (main plus the branch) and again with the CPU saturated, and
            the CI log carries no assertion text, so the cause is not known. Its helper `buttonsOn` waits a fixed 50 ms (`setTimeout(r, 50)`) after
            `w.eval(runtime)` before counting the copy buttons, which a loaded runner could miss.
where     — `test/unit/runtime/code-copy-surfaces.test.js` (`buttonsOn`); the runtime draws the buttons in `lib/core/code-copy.mjs`.
done when — the test waits for the buttons (poll the DOM with a deadline) instead of 50 ms, and the failing assertion would print its message;
            20 passes under CPU load.
verify    — `node --test test/unit/runtime/code-copy-surfaces.test.js` in a loop under `stress`-style load.
---
