---
origin: 3059
priority: P3
recorded: 2026-11-06
area: infra
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md §How the rule is held
deferred: blocked — two failures left no assertion, signal or heap message, and three clean load runs did not reproduce them, so there is nothing yet to fix at its cause
---

# test/unit/core/prose-binding.test.js exited non-zero twice under heavy load, with no message

why now   — #3059 ran `test/unit/core` under 8 busy loops on 4 cores six times. `prose-binding.test.js` failed at file level
            in two of them, at 261 s and 452 s, with no assertion text, no signal and no heap error in the dot reporter's
            output. Both runs had extra load beside the stress: the maker-checker's mutation arms in one, a pre-commit
            hook in the other. Three later runs (spec reporter, nothing else running) passed it at 240–245 s. The test
            renders every slide of every tracked deck in one `test()`, so it is the folder's longest file by far.
where     — test/unit/core/prose-binding.test.js; the runner's per-file subprocess. The dot reporter prints a bare
            `'test failed'` against the file only for an uncaught exception or unhandled rejection outside any test,
            never for a failed assertion (engineering/gotchas/ci.md, "A jsdom test fails as 'test failed' against the
            file"). The file holds one jsdom window it never closes and imports two ESM modules mid-test, so look for an
            error escaping after the assertion, not inside it.
done when — a run that fails it says why (run it with `--test-reporter=spec` and a `process.on('uncaughtException')` /
            `unhandledRejection` logger under the same load, and keep the log), and
            the cause is fixed: memory, a crash in a dependency, or a corpus walk that should be split per deck.
evidence  — the failing log with its reason, then the same load passing.
verify    — self-review with the gates.
