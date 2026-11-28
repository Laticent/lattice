---
origin: 2556
priority: P3
recorded: 2026-10-06
area: engine
severity: low
swimlane: engineering/decisions/2026-10-06-calco-office-export-library.md
source: https://github.com/Laticent/lattice/pull/2556
---

# Decide what "anyone can use Calco" means: types and a reference pinner

why now   — the inversion on #2556: `exports.types` points at TypeScript source, so a consumer
            type-checks Calco under its own settings; and a host must bring its own HarfBuzz
            pinner. The license half is settled: Calco is Apache-2.0 since 2026-11-28 (#3542,
            LICENSING.md), so closed web apps can use it.
where     — docs/src/lib/calco/package.json, README.md; followups 2360 covers npm publishing.
done when — the package ships `.d.ts` types and either a reference pinner or a documented
            recipe.
evidence  — the decision recorded in the Calco decision note.
verify    — an outside project imports @laticent/calco and builds an .odp without Lattice.
