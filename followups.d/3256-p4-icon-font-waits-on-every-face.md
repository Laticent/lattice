---
origin: 3256
priority: P4
recorded: 2026-11-23
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: blocked — the owner ruled on #3256 to take its merge ask first and fix this right after; claimed by session_01DPMMjFQcat1AAf5y6KDELj
source: https://github.com/Laticent/lattice/pull/3256
---

# icon-font-studio waits on every font face of the exported page, not the icon face

why now   — docs/e2e/icon-font-studio.spec.ts:104 (gecko) times out its 15 s poll under load.
where     — `drawnInOurFace` (same file, line 21) awaits `document.fonts.ready`, which waits for every face on the
            1 MB exported webpage. A probe of a failing run found the export embeds `Lattice Icons` and the face
            `loaded`, so the product is right; the likely cause is the wait's scope (not proven: no face showed
            `loading` in the snapshot).
done when — the predicate awaits `document.fonts.load('1em "Lattice Icons"')` and checks that face alone.
evidence  — base 84bb0806e: 1 in 100 at --workers=4 (#3256: 5 in 100, within noise). After: failing arm, 10/10
            alone, ≥100 at 4 workers on gecko with 0 failures.
verify    — tier 0 gates, because it is test-only.
