---
origin: 2669
priority: P3
recorded: 2026-10-13
area: engine
severity: low
swimlane: engineering/decisions/2026-09-28-segno-unified-inline-notation.md
source: https://github.com/Laticent/lattice/pull/2669
---

# Under test, run the fast read and the full bind on every record read, and throw on any difference

why now   — #2669 added `fastRead` in schema.ts: a plain `{…}` span binds from the parser's flat tree,
            and anything else falls back to the full bind. `schema.test.ts` pins the two equal on every
            span of one to three items from one pool, but the other ~300 Segno tests, the unit suite and
            the e2e specs only ever see whichever path `read()` picks. A divergence the pool does not
            reach would ship as a wrong pill with no failing test.
where     — docs/src/lib/segno/schema.ts (`read`, `fastRead`, `bindMode`); a test-only switch that makes
            `read()` run both paths and throw when they differ, turned on by the Segno vitest setup and
            by test/unit when it loads the library.
done when — with the switch on, `npm test` and `cd docs && npx vitest run` pass and every record read in
            them has been checked both ways; a mutant that changes one branch of `fastRead` fails a test
            that did not fail before (`npm run mutate:segno`).
evidence  — the count of reads compared in a full run, and the mutation score before and after.
verify    — tier 1 maker-checker: test infrastructure, no shipped code path changes.
