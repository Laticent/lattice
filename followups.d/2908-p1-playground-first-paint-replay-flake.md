---
origin: 2908
priority: P1
recorded: 2026-10-28
area: website
severity: medium
swimlane: docs/e2e/playground-first-paint.spec.ts
source: https://github.com/Laticent/lattice/pull/2908
---

# The Playground first-paint replay test flakes on CI: "the pre-paint replay never ran"

```text
  P1 · The @smoke test playground-first-paint.spec.ts:232 fails intermittently on CI
       why now   — it reds studio-smoke on unrelated PRs and in the merge queue (runs 40431166278,
                   40581378725, 40581957657, 40628042251, 40690261298, and #2908's 40727236903),
                   first seen 2026-10-27, right after #2900 (stricter liveness check) and #2905
                   (snapshot roughly doubled, still under half the cap) merged on 2026-10-26.
       where     — docs/src/components/playground/PlaygroundApp.tsx:1164 (captureFirstSlide on
                   pagehide); docs/src/pages/playground.astro (the replay returns when the pane
                   differs from the recorded fit.boxW by more than 1px, or a ResizeObserver fires).
       done when — the cause is named from a failing run's trace (the boot-time snapshot ts/fit),
                   and the test passes 20 throttled CI runs in a row.
       evidence  — #2908's triage: 0 failures in 60 throttled local runs on main and on the PR;
                   the stored snapshot is 117,572 of 245,760 units, so the cap is not the cause.
       verify    — tier 2: the e2e smoke project on CI, repeated.
```
