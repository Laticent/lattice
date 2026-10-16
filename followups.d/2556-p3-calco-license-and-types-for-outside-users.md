---
origin: 2556
priority: P3
recorded: 2026-10-06
area: engine
severity: low
swimlane: engineering/decisions/2026-10-06-calco-office-export-library.md
source: https://github.com/Laticent/lattice/pull/2556
---

# Decide what "anyone can use Calco" means: license, types, a reference pinner

why now   — the inversion on #2556: Calco is AGPL-3.0 like its siblings, which keeps it out of
            closed web apps (most of "anyone"); `exports.types` points at TypeScript source, so a
            consumer type-checks Calco under its own settings; and a host must bring its own
            HarfBuzz pinner. Owner's call before Calco is published or promoted.
where     — docs/src/lib/calco/package.json, README.md; followups 2360 covers npm publishing.
done when — the owner has chosen the license, and the package ships `.d.ts` types and either a
            reference pinner or a documented recipe.
evidence  — the decision recorded in the Calco decision note.
verify    — an outside project imports @laticent/calco and builds an .odp without Lattice.
