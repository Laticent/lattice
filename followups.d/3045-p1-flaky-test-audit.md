---
origin: 3045
priority: P1
recorded: 2026-11-06
area: infra
severity: medium
swimlane: engineering/decisions/2026-11-06-flaky-tests.md §How the rule is held
deferred: large — 563 counted hits in 221 test files, plus the shapes no line shows; each rewrite needs its own evidence that the test still fails on the bug it guards
---

# Audit every test against the nine flaky shapes and rewrite the offenders

why now   — HARD RULE #32 landed with a ratchet: `tools/flaky-test-baseline.json` holds 384 fixed sleeps, 164 stopwatch
            assertions and 15 unseeded randoms in 221 files, beside the 105 `docs/e2e` `waitForTimeout` calls that
            `SANCTIONED_E2E_SLEEPS` already holds with a reason each. A flaky test ejects good PRs from the merge queue
            (#3041, twice) and teaches every session to re-run instead of fix.
where     — every file in `tools/flaky-test-baseline.json`; the `SANCTIONED_E2E_SLEEPS` entries, each re-judged against F2;
            then the shapes the gate cannot see (F3 read-once, F4 deadlines, F6 network, F7 shared state, F8 machine,
            F9 retries) across `test/**` and `docs/e2e/**`. One F8 case already seen: `test/unit/trama/radial.test.js`
            compares file timestamps, so a `git checkout` that touches the `.ts` sources fails it while `dist/` is current
            (the builder leaves identical output untouched).
how       — first the rest of `test/unit/core/class-directive-scan.test.js` ("a full-deck scan is well under a frame";
            its ratio test was rewritten to count work in #3045) and `test/benchmark/relationship-scaling.test.js`,
            whose ratio the gate cannot see. Then one PR per folder
            (`test/unit/core`, `test/integration`, `docs/e2e`, `docs/src/components/studio`, …), heaviest first.
            For each hit: classify it (flaky, or right as it is), rewrite a flaky one with the note's fix for its shape,
            mark a right one `// flaky-ok: <why>`, and lower the baseline. A rewritten timing test asserts on work done,
            with a failing arm that shows it still catches the bug it was written for (#3044's quadratic stand-in is
            the pattern).
progress  — 2026-11-06: `test/unit/core` is done (59 hits, 34 files; the baseline now holds 504 hits in 187 files),
            with `test/benchmark/relationship-scaling.test.js` and the class-directive remainder. The tools are
            `test/helpers/runtime-boot.js` (a virtual clock for the runtime-boot sleeps, which recur in 32 test files)
            and `test/helpers/work-count.js` (`scanWork`, `charReads`); the decision note's §How the rule is held lists
            what they cannot see. Next by weight: `docs/e2e` (66 in 34), then `test/integration/export` (57 in 25).
            Seen red in #3059's `studio-smoke` on both CI attempts and green 5 of 5 locally:
            `docs/e2e/collage-lightbox.spec.ts:211` (the zoom cursor still `zoom-in` 5 s after a wheel step).
            2026-11-07: a CI census (30 days of runs) found 22 of 453 merge_group runs red from flakes, 13 of them in
            `studio-smoke`, and 137 nightly e2e retry-passes. This branch fixes three CI-confirmed flakes: `radial`
            (mtimes, F8), `live-controller.test.ts` `until()` (a poll budget racing two real product timers), and segno
            `block.test.ts` "bounds" (a stopwatch ratio). The rest of the census, with each flake's root cause, status
            and next step, is in this branch's PR body. collage-lightbox:211 is a product race in `StudioShell.tsx`
            (the hover hit-test runs before the frame shows the new slide); a fix is in progress, not in this branch.
            2026-11-08: a fourth, found red on that branch's own docs-build: `PlaygroundApp.test.tsx` threw "window is
            not defined" after the run. The reveal's per-frame poll outlived unmount and went live afterwards, arming a
            teardown timer nothing cancelled. The poll now stops once its frame leaves the page; a held-frame test is its arm.
            Two e2e flakes FOUND while exercising that PR (retries 0, 4 busy loops on 4 cores), both pre-existing on `main`
            644f177 and not fixed yet: `playground-tab-switch.spec.ts:211` (wide) on webkit-tablet, `frames.every(f =>
            f.same)` false, i.e. the preview document was replaced during the Explore switch (branch 1 in 41, `main` 1 in
            41). Lead: the spec marks the frame's window right after an edit while a full write from that edit may still be
            in flight; confirm by recording whether the write that replaced it began before the mark. And
            `playground-first-paint.spec.ts:990` on desktop (`main` 1 in 1 full run, branch 0 in 1): the poll at :1002
            reads `.hasAttribute` on a null element.
            2026-11-08 (second session, one PR): collage-lightbox:211 fixed in the product (StudioShell hit-tests only
            once the frame shows the reader's slide; 2 in 40 loaded runs failed before, 0 in 100 after); the Marp suites
            run a pinned, locked marp-cli (no network in a test); library-image-metadata:614 reads `aria-pressed`
            instead of a toPass retry; the slide map's capture rechecks the scroll after its imports; the Windows
            export-confine stopwatches are counts; first-paint:990 polls a frame with no root as "loading" (40 in 100
            loaded runs threw before). NOT done: `playground-tab-switch.spec.ts:211` did not reproduce in 190 loaded
            webkit-tablet runs on `main` d1a4704 (instrumented with a write log), so nothing was changed there; the
            regex work (recheck) is waiting on an owner decision, `followups.d/3045-p2-regex-recheck-gate.md`. The
            newest marp-cli in the range runs in the integration nightly (owner D2 on #3092).
done when — `tools/flaky-test-baseline.json` holds no files; every remaining clock or sleep line carries a `flaky-ok`
            reason; the F3-F9 sweep's findings are fixed or each recorded with its reason; and the last PR sets
            `docs/playwright.config.ts` `retries` to 0 with the Studio e2e nightly no redder than before it.
evidence  — per PR: the baseline's diff, and for each rewritten timing or sleep test, the run that shows it failing on
            the defect it guards; for the retries change, three nightlies' results before and after.
verify    — self-review with the gates per batch; maker-checker on the retries PR, since it changes what CI reports.
