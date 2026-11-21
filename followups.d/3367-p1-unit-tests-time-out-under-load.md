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
            failed about 27 tests every time it ran beside a 4-worker Playwright run. Measured 2026-11-21 under the same
            load: on prosemirror-view 1.42.9, 27 failed in 7 files (26 test timeouts at the 20 s `testTimeout` in
            docs/vitest.config, 1 hook timeout, 1 Testing Library `findBy` miss); on 1.42.8, 27 failed in 25 files with
            242 skipped (24 test timeouts, 9 hook timeouts at 10 s and 30 s, 3 `findBy` misses). A first loaded run
            reported 29 failed in 3 files; only its summary line was kept, so those names are unrecorded. So no dependency
            bump causes it; it is a load sensitivity on `main`
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
