---
origin: 2899
priority: P1
recorded: 2026-10-25
area: engine
severity: high
swimlane: engineering/development.md §Integration test cache
source: https://github.com/Laticent/lattice/pull/2899
---

# The full integration tier is red on main: four files, eight tests

why now   — found while gating #2899 with `LATTICE_FULL_PUSH=1 npm run test:integration` (1,921 ok, 12 not ok).
            All of them reproduce with `lib/` swapped back to `main` (919689d), so they are not #2899's.
            The pre-push hook skips this tier (a 0.05 s tick), so a red here reaches `main` unseen.
            - bucket-galleries: `chart: light/dark PDF page count = members + 1` (29 expected, 25 rendered).
            - component-galleries: `dark gallery page count matches light` for ep-curve, histogram, risk-matrix, tower.
            - exemplar-render: `exemplars/corporate/reinsurance-renewal.md renders to 17 pages and its committed PDF is fresh`.
            - finish-canvas-matrix: `every exempted frame reaches its OWN token` fails with a puppeteer
              `Runtime.callFunctionOn timed out`; on `main` a second arm failed too, so this file is also flaky.
where     — test/integration/components/bucket-galleries.test.js, component-galleries.test.js,
            test/integration/exemplars/exemplar-render.test.js, test/integration/invariants/finish-canvas-matrix.test.js
done when — each failing test is either fixed at its root (a page count that moved, a stale committed PDF) or shown
            to have a correct new expectation, and the finish-canvas timeout is made deterministic, so
            `LATTICE_FULL_PUSH=1 npm run test:integration` exits 0 on `main`.
evidence  — the tier's summary on `main` before and after.
verify    — `LATTICE_FULL_PUSH=1 node --test <file>` for each of the four files.
