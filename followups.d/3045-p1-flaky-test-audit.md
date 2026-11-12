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
            webkit-tablet runs on `main` d1a4704 (instrumented with a write log), so nothing was changed there.
            It DOES reproduce on webkit-PHONE, unloaded: the (phone) case failed 5 of 8 (`--repeat-each=8`) against a
            `main` c29f45b build on 2026-11-12, same assertion, `frames.every(f => f.same)` false. Use that project to
            chase the lead above (found by #3128, which fails it at the same rate); the
            regex work (recheck) is waiting on an owner decision, `followups.d/3045-p2-regex-recheck-gate.md`. The
            newest marp-cli in the range runs in the integration nightly (owner D2 on #3092).
            2026-11-08 (zero-flakes part 3): `docs/e2e` from 66 counted hits to 42. The instant-shell specs
            (`studio-instant-shell` 11, `studio-reserved-slots` 1, `studio-shell-parity` 1) held the engine for a
            fixed 2.5 s and measured inside the window; `holdEngine(page)` (docs/e2e/engine-glob.ts) now holds it
            until the test calls `release()`. The 9 unseeded randoms are gone (seeded noise in two photo fixtures,
            a fixed walk for two pointer wiggles, and a document id marked flaky-ok: only its uniqueness is read);
            print-waits-for-measuring's floor is flaky-ok (a lower bound set by the stub's own latency). Left in
            `docs/e2e`: 42, led by read-aloud (5), present-emphasis (3 clock asserts on cue onsets: they want
            Playwright's `page.clock`), status-pill (an upper bound on three clicks, the same), present-delivery,
            present-guide, library-images (2-3 each).
            2026-11-09 (zero-flakes part 4, P4): baseline 476 -> 472. test/unit/authoring/class-comment-strip.test.js's 4
            stopwatches are a work count (`charReads`, one read per character today, with a rescanning stand-in as its
            failing arm) plus a regex trace. Sized next: notes-core.test.js's 5 hang guards trace to three slow
            notes-core patterns (`/[\r\n]+$/` in three places, the heading/rule test with a back-reference at :784, and
            the run-time COMMENT_SOURCE `<!--+([\s\S]*?)--+!?>`, which sits on the notes sanitizer and wants its own
            maker-checker); test/unit/components/lint-core.test.js, chart-row-record and the plugin hang guards run all of
            lint and wait on the lint-core drain (followups.d/3045-p2-regex-recheck-gate.md). Retries stay 1: the
            "3 nightlies no redder" check needs the baseline empty first.
            2026-11-11 (continuation, P2): `docs/src/components` done, 92 hits in 21 files; the baseline is now 377 hits
            in 155 files. Every rewrite was shown failing on a broken product line. Found on the way: a quadratic span
            lookup in `renameAssetRefsOutsideCode` (`asset-refs.ts`, `spans.some` per reference), fixed in the same PR
            with a 4x-input work-growth test. Tools added inside the tests, worth copying: fake timers past the product's
            own timer constants for "nothing happens" checks (DeckPreview, present-pace, NewSlideButton, tap-away), and
            in live-controller a `drain()` that waits until the network queue is empty and no awareness-gate timer is
            held. Two test gaps that were there before and were left as they were: live-controller's
            records test cannot see a non-host `records` post being accepted (the host's later post replaces Amina's
            pending `takeRecords`; needs Amina's post alone plus a signal for when `refuseImportedTheme` finishes), and
            the pointer-throttle `<=3` check cannot tell the sender throttle from the host's 30 ms flood gate. Next by
            weight: `docs/src/lib` (96), then `test/integration/export` (55).
            2026-11-11 (CI + flaky tests, P1): `docs/src/lib` done, 96 hits in 39 files; the baseline is now 281 hits
            in 116 files. Six lines keep a `flaky-ok` (0 ms drain turns, simulated durations on the fake clock) and
            three regex hang guards stay F4 with both measurements (front-matter, cadenza/normalize), because recheck
            calls their patterns polynomial. New helper: `test/helpers/property-reads.js` (visit counts for grammar
            walks). Found and fixed: every docs test that imported one of the 17 `docs/src/lib` packages by
            directory ran its built, gitignored `dist/` (a directory import reads `main`, not `exports`), so a
            stale `dist/` decided the result; `docs/vitest.config.ts` now resolves each to its `@laticent/source`
            file. Next by weight: `test/integration/export` (55).
            2026-11-11 (same PR, P2): `test/integration/export` done, 55 hits in 24 files, no `flaky-ok` needed; the
            baseline is now 226 hits in 92 files. Absence checks in a live browser use an unwalled WITNESS run after
            the walled one: the arm waits until the witness heard every vector, so its zero proves something. Found:
            Chrome for Testing 153's Local Network Access blocked `code-sandbox-network`'s CONTROL arm from loopback,
            so its walled arms had passed on an absence that proved nothing; the no-walls launch now disables that
            check. New helpers: `test/helpers/request-log.js` (listener drain, witness listener) and a real-browser
            settle (`page-settle.js`).
            2026-11-11 (CI + flaky tests, second PR, P1): `test/integration/parity` done, 34 hits in 10 files, no
            `flaky-ok` needed; the baseline is now 192 hits in 82 files. The jsdom boots use `bootRuntime`/
            `virtualClock`, which gained `settle({ onStep })` for invariants that must hold throughout a run; the
            real-Chromium ones use `trackPageWork` (a `setContent` page installs the ledger by hand). Found and fixed:
            QR-card slides with no fields re-ran the runtime forever (the decision note's "The virtual clock found a
            live loop").
            2026-11-11 (same PR, P2): `test/unit/playground` done, 21 hits in 3 files, no `flaky-ok` needed; the
            baseline is now 171 hits in 79 files. The voice tests wait for the request to reach the rung
            (`synthCalls`), read absences after one macrotask turn of all-mock code (`drained`), own `Date` with
            `mock.timers` for the latency reservoir, and cancel the on-device load from inside the adapter probe
            instead of racing a 10 ms timer against a 50 ms one. The abort test's `elapsed < 1000` is now "settled
            within one turn of the abort". Next by weight: `test/unit/components` (19), `test/unit/trama` (17),
            `test/unit/plugins` (15).
            2026-11-12 (CI + flaky tests, third PR, P1): `test/unit/components` done, 19 hits in 6 files; the baseline
            is now 152 hits in 73 files. One `flaky-ok` is left: lint-core's track-directive hang guard (in-regex
            backtracking that no count sees, and the whole lint still runs non-linear patterns until the lint-core
            drain), sized 25x over today and 16x under the old 33 s. The rest count work: `packCollage` and the
            tiered hub-spoke now report their search's work (`opts.work`, `meta.work`), parseAffix and three lint-core
            scans are a regex trace plus `scanWork`/`charReads`, and flowchart's live-layout tests run on
            `virtualClock`, which gained `settle({ done })` and `advance(ms)`. Found and fixed: `readIsland`'s
            `bareOpener` regex was quadratic on a comment of blank lines (lib/core/directive-island.mjs).
            2026-11-12 (same PR, P2): `test/unit/trama` done, 17 hits in 1 file (pipeline-draw), no `flaky-ok`
            needed; the baseline is now 135 hits in 72 files. Every jsdom window runs on `virtualClock`, and the
            Worker stand-ins answer on the window's clock; the 2 s font deadline is now checked at 1 ms either side.
            Nine mutations of the built pipeline (deadline, re-check timer, pause length, the stale-chain and
            collapsed-stage guards) each fail a test. Next by weight: `test/unit/plugins` (15).
            2026-11-12 (flaky tests, unit tier, P1): `test/unit` done outside `components` and `trama` (those two are
            on #3144): 61 hits in 25 files, no `flaky-ok`; the baseline is now 110 hits in 54 files. Every rewrite was
            shown failing on a broken product line. Stopwatches became work counts (`charReads`, `scanWork`, a Set-add
            count, a decoder spy) plus regex traces; sleeps became the virtual clock (`settle`, and `advance` for the
            VS Code saved-deck watcher's interval), the measure-kit registry, or an exit event. Two hang guards that
            could never fire (a synchronous hang blocks every timer, node:test's `timeout` included) now run their call
            in a child with a kill deadline: katex-wall's LIMITS and npm-plugin-loader's FIFO (gotchas/ci.md). Found
            and fixed: notes-core's comment pattern (polynomial to recheck, run once per `<!--`) is a linear reader
            held to it by a 60,000-input seeded fuzz, with two smaller slow patterns; slice-equivalence's tag strip is
            a backward pass. Real-flake sweep (5 clean, 2 loaded, 1 shuffled `npm test`): see the PR body.
            Same PR: test/unit's `env-skip` sites (#3144's census and rule) at zero outside components and
            trama: 33 in 15 files through `skipUnlessCI` / `skipWithoutChrome`, two `ci-skip` notes (oh-my-zsh opt-in;
            flock on macOS, run by `wait-for-macos`).
            2026-11-12 (`docs/e2e` census): every `docs/e2e` hit outside three files other sessions own is done, 39
            hits in 24 files, and `SANCTIONED_E2E_SLEEPS` went from 106 calls in 36 files to the one `restyle-overlap`
            entry; the baseline is now 132 hits in 55 files, no `flaky-ok` added and no test disabled. Each rewrite
            waits on a product signal (five helpers in `docs/e2e`, listed in the decision note's tools), and 24 were
            shown failing on a broken product line. Found and fixed: `workspace-backup-size`'s 67 MiB case and
            `preview-nav`'s remount case were red on `main`; vetrina's scroll-cost test counted style mutations, which
            cannot see a same-value write, so it passed with the compare removed (it now counts re-seats);
            `filo-compose`'s 16 ms undo budget is now a work count (one slide replaced, a sixteenth of the deck read)
            with the time in `npm run bench`. Left in `docs/e2e`: `library-images-render`, `playground-paint` and
            `restyle-overlap`, owned by the "e2e Studio shell" and "e2e touch + WebKit" sessions.
done when — `tools/flaky-test-baseline.json` holds no files; every remaining clock or sleep line carries a `flaky-ok`
            reason; and the F3-F9 sweep's findings are fixed. (The retries half is done: PR #3144 set
            `docs/playwright.config.ts` to `retries: 0` on the owner's 2026-11-12 order, held by `checkPlaywrightRetries`,
            while seven sessions fix every test the nightly reports red; see HARD RULES #33 and #34.)
evidence  — per PR: the baseline's diff, and for each rewritten timing or sleep test, the run that shows it failing on
            the defect it guards.
verify    — self-review with the gates per batch, and the HARD RULE #34 evidence for every rewritten test.
