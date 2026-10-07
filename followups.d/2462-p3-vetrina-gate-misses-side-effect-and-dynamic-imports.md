---
origin: 2462
priority: P3
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/tree/claude/segno-continuation-gy68xe
---

# The Vetrina boundary gate never sees a side-effect or dynamic import

why now   — found by the checker on the `./../` fix. `VETRINA_IMPORT` matches only
            `… from '…'`, so `import './../x'` and `import('./../x')` in
            docs/src/lib/vetrina/ never reach `staysInFolder`. The Suono, Lente and Segno
            gates read `SUONO_SPEC_PATTERNS`, which catches all three shapes. The gap
            predates the `./../` fix and is off its path.
where     — tools/check-ownership.js, `checkVetrinaBoundary` and `VETRINA_IMPORT`; the
            Vetrina tests in test/unit/cli/check-ownership.test.js `scan` with the same
            pattern.
done when — a planted `import './../x'` and `import('./../x')` in a scratch folder are
            reported by `checkVetrinaBoundary(errors, dir)`, and the clean tree still passes.
evidence  — the planted-import probe before and after.
verify    — tier 1; it changes what a gate finds, not the CI contract.
