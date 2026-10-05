---
origin: 2519
priority: P2
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2519
---

# On a phone, the Explore walk bar can paint in the wrong place and then move

why now   — PR #2519 re-ran docs/e2e/playground-first-paint.spec.ts many times in CI to count
            its first-paint fix. In run 37298787347 (head d53ca06), `on a phone › the Explore
            walk bar is there from the first paint, not a second in` failed once and passed on
            retry. The bar was measured at y=176, h=63 (t=455 ms) and then at y=737, h=107
            (t=501 ms), so someone holding the phone watches it jump. #2519 changes nothing
            this test or the Playground layout reads (Segno is imported only by /segno). CI's
            single retry hides the failure, and the test is not @smoke, so only the nightly
            runs it.
where     — docs/e2e/playground-first-paint.spec.ts:487 (the test); the walk bar's SSR'd
            reserve and caption box (engineering/gotchas/studio-playground.md, "The walk bar
            used to arrive late"); the 6x CPU throttle the test boots under.
done when — the cause is found from that run's trace (artifact studio-e2e-37298787347). Then
            either the bar holds one geometry from first paint, or the test is shown to measure
            something no person sees. Re-run the spec at least 20 times on the nightly
            workflow_dispatch with spec=e2e/playground-first-paint.spec.ts, with no flaky result.
