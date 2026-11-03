---
origin: 3021
priority: P5
recorded: 2026-11-03
area: math
severity: low
swimlane: engineering/decisions/2026-11-03-responsive-tables.md
deferred: off-path — math owns its derivation table; #3021 does not touch it
source: https://github.com/Laticent/lattice/pull/3021
---

# math's derivation table puts each justification below its step when narrow

why now   — a derivation is step | expression | justification; in a narrow box the justification column squeezes the expressions.
where     — lib/components/math/math/math.styles.css (the .derivation rules).
done when — in a narrow box each justification sits under its expression, and the expressions stay aligned.
evidence  — the Frame Lab math entry.
verify    — npm run lab:build -- --only math.
