---
origin: 3367
priority: P1
recorded: 2026-11-21
area: website
severity: medium
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: off-path — #3367 changed docs and comments only; these are jsdom Studio unit tests it does not touch, and the owner's flake desk assigns one owner per flake
source: https://github.com/Laticent/lattice/pull/3367#issuecomment-7057507711
---

# About 27 Studio and Compose unit tests time out when the box is under load

why now   — `npx vitest run src/lib/compose src/components/studio` (docs/) is green alone (374 files, 6591 tests) but
            failed about 27 tests every time it ran beside a 4-worker Playwright run. Nearly all failures hit the 20 s
            `testTimeout` (docs/vitest.config); one is a Testing Library `findBy` wait. Measured 2026-11-21: 27 failed in 7
            files on prosemirror-view 1.42.9, 27 failed in 25 files (242 skipped) on 1.42.8 under the same load, 29 in 3
            files in a first run whose names were lost. So no dependency bump causes it; it is a load sensitivity on `main`
            (HARD RULE #32: a test passes or fails on the code alone, never on the machine's load).
where     — on 1.42.9: `studio.controls.test.tsx` (13), `studio.theme-depth.test.tsx` (6), `StudioShell.test.tsx` (5),
            `WorkspaceSheet.test.tsx`, `studio.coach-profile.test.tsx`, `studio.fuzz.test.tsx`, and
            `src/lib/compose/raw-block.test.ts`. The 1.42.8 run spread wider (`studio.local-components`, `deck-source`,
            `scoped-resync`, `deck-markdown-soft-break` and others). `studio.fuzz`'s timeout may already be owned by the
            flake desk's unit/integration session; check before starting.
done when — the same command passes while a 4-worker Playwright run loads the box, with no test's timeout raised to get
            there (HARD RULE #33), and each fix names what the test was waiting on.
evidence  — the loaded run's counts before and after; for each changed test, a failing arm and `--workers=4` repeats
            (HARD RULE #34).
verify    — tier 1: self-review with the gates, plus the loaded repro.
