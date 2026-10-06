---
origin: 2354
priority: P7
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2354
---

# state-chart's backtracking timing test fails under load (a 0.05ms floor on the baseline)

why now   — it blocked a pre-push on #2354: "4x the input cost 53.6x the time (0.0ms -> 2.7ms)".
            The same file passed 5/5 run alone. Pre-existing and off #2354's path.
where     — test/unit/components/state-chart.test.js ~2261-2269: `large / Math.max(small, 0.05)`.
            A sub-0.05ms `small` makes one GC pause in `large` read as super-linear.
done when — the assertion cannot fire on noise: e.g. take the min of N runs per size, and/or
            raise the floor to a value that still separates linear (~4x) from quadratic (~16x)
            at these input sizes, measured, not guessed.
evidence  — the test still fails against a deliberately quadratic regex (keep a negative arm),
            and passes 50/50 inside the full parallel `npm test`.
verify    — self-review with the gates.
