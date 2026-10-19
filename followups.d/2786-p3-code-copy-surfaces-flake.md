---
origin: 2786
priority: P3
recorded: 2026-10-19
area: engine
severity: low
swimlane: engineering/decisions/2026-10-18-platform-suites.md
source: https://github.com/Laticent/lattice/pull/2786
---

# `code-copy-surfaces.test.js` failed once in the merge queue, and the cause is still unknown

why now   — `test/unit/runtime/code-copy-surfaces.test.js` failed in the merge queue run for #2786 (run 39284743444, job 118167431359, `unit (node 22)`,
            1.2 s) with only `'test failed'` against the file. The dot reporter prints that for an uncaught exception or an unhandled
            rejection outside any test; a failed assertion prints its diff instead. So the fixed 50 ms wait in `buttonsOn`, the first
            suspect, did not fail: jsdom fires `DOMContentLoaded` from a promise chain, so the runtime boots before any timer. The helper
            now waits for the boot and the buttons under a 5 s deadline anyway, and the file's last test prints every error that escaped a
            test or that jsdom reported from the window. Not reproduced locally: 40 runs under 3x CPU oversubscription, and a probe with
            process-level handlers closing the window 0 to 50 ms after boot, all clean.
where     — `test/unit/runtime/code-copy-surfaces.test.js`; the runtime's boot and copy buttons are `lib/runtime/index.js` (`drawCopyButtons`)
            and `lib/core/code-copy.mjs`.
done when — the next failure's printed stack names the source, and that source is fixed; or 30 days with no recurrence, then delete this entry.
verify    — read the `no error escaped the runtime` test's message in the failing job's log.
