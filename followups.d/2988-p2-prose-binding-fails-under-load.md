---
origin: 2988
priority: P2
recorded: 2026-11-07
area: tests
severity: medium
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: blocked — it did not reproduce: the test passed alone (79 s) and on the next commit attempt, and the hook's log carries only "test failed" with no assertion to start from
---

# `prose-binding.test.js` failed once in the pre-commit hook and passed on the next run

```text
  P2 · [no ticket] find why test/unit/core/prose-binding.test.js failed once in affected-tests
       why now   — On PR 2988 the pre-commit hook's affected-tests step failed on this file alone
                   (95 s, "test failed", no assertion printed) for a commit that touched
                   lib/core/cover-lift.js, base.modifiers.css and the cover-lift test. Run alone it
                   passed in 79 s, and the same commit passed the hook on the next attempt. HARD
                   RULE #32 makes a flaky test the finder's defect; the cause is not yet known.
       where     — test/unit/core/prose-binding.test.js renders every slide of every tracked deck
                   (git ls-files over the component roots, examples/ and the baselines) through
                   the engine in one process. Suspects: memory or a node:test time limit when the
                   hook runs it beside other affected tests; a deck in the corpus whose render
                   depends on state left by an earlier one.
       done when — the failure is reproduced (repeat runs under the hook's concurrency) and fixed
                   at its cause, or the test is shown not to depend on load.
       evidence  — the reproducing run's output with the assertion or the signal that ended it.
       verify    — tier 1 checker.
```
