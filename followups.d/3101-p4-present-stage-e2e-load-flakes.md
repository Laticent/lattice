---
origin: 3101
priority: P4
recorded: 2026-11-10
area: website
severity: medium
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: off-path — the merge-base fails under the same load in other cells of the same spec files, so the timing fault predates PR #3101, and finding it means profiling the Stage's postMessage sync under CPU contention across all three engines
source: https://github.com/Laticent/lattice/pull/3101
---

# The Present and Stage e2e cells fail under parallel load, on `main` as on the branch

why now   — HARD RULE #32: a flaky test is a defect owned by whoever finds it. PR #3101 found it while driving its own
            cells across four Playwright projects at three workers.
where     — docs/e2e/present-emphasis.spec.ts ("an emphasized passage holds a beat on the real Present overlay"),
            docs/e2e/stage-window.spec.ts ("the Stage does not follow links", and "the Stage control bar answers to the
            keyboard it is reachable by"). The keyboard cell's last frames showed the console at 3/7 while the Stage
            still painted 2/7: the Stage's copy of the console's place lagged a fast key sequence.
evidence  — the same command, `npx playwright test e2e/present*.spec.ts e2e/stage-window*.spec.ts --workers=3` on the
            desktop, mobile, webkit-tablet and gecko projects:
            - merge-base a4514bf: 2 of 3 runs failed (present-emphasis once, "does not follow links" once);
            - the PR's head: 0 of 3 runs failed, and 1 of 2 earlier runs failed in the keyboard cell. Alone, the keyboard
              cell passed 3 of 3.
            Then the three cells alone, five times each (`-g "keyboard|walks a focus|emphasized" --repeat-each=5`, same
            projects and workers): present-emphasis failed 1 of 5 on the merge-base and 2 of 5 on the head (739f91a);
            the keyboard cell passed 5 of 5 on both. So present-emphasis is a load flake on `main`; the keyboard cell
            failed once in 15 branch runs and never in 8 base runs, which does not separate them.
done when — each named cell waits for a signal from the surface it asserts on (the Stage's own painted slide, not the
            console's counter) and passes 10 of 10 runs of the command above; no retry, no longer timeout (F1/F2 in the
            flaky-tests note).

also     — the iOS Simulator Studio probe's stopwatch check, docs/scripts/ios-safari/panes-probe.js:232 ("every move
            painted within 5 s"), failed once on PR #3101's head 99c5f17 with click-to-paint 635, 10742 and 168 ms, then
            passed on a re-run of the same commit with 417, 193 and 87 ms (run 42803846784, attempts 1 and 2). Its deck has
            no code block, so the PR's CSS cannot reach it: a simulator stall, not a regression. A pass or fail on a clock
            is shape F2 of the flaky-tests note; done when it asserts that each move painted (a signal) and leaves the
            duration to a benchmark.
