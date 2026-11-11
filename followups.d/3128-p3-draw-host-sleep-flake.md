---
origin: 3128
priority: P3
recorded: 2026-11-11
area: website
severity: medium
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: off-path — PR #3128 does not touch docs/src/lib/code-packages; the file is already in tools/flaky-test-baseline.json
source: https://github.com/Laticent/lattice/pull/3128
---

# draw-host.test.ts loses a fixed-sleep race on a loaded CI runner

why now   — `docs/src/lib/code-packages/draw-host.test.ts` ("closes a frame whose lazy module failed to
            load…") failed docs-build on PR #3128 (run 42943654794): `expect(frames.length).toBe(2)`
            got 1, plus an unhandled "the draw frame was stopped" rejection. The test waits fixed
            10–20 ms `setTimeout`s for the host to open a frame, so a busy runner loses the race (shape
            F1 in the flaky-test note). It passes 3 of 3 locally.
where     — docs/src/lib/code-packages/draw-host.test.ts (its eleven fixed sleeps).
done when — the test waits on a signal (the rig's frame list growing, or a promise the fake frame
            resolves) instead of a duration, and its entry leaves tools/flaky-test-baseline.json.
evidence  — CI log of job 130271394646; local `npx vitest run src/lib/code-packages/draw-host.test.ts` ×3 green.
verify    — `npm run build:check` with the baseline entry removed, and the test under `--repeat-each`-style
            looping on a loaded machine.
