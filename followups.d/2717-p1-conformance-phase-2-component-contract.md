---
origin: 2717
priority: P1
recorded: 2026-10-16
area: engine
severity: high
swimlane: engineering/decisions/2026-10-15-conformance-harness.md §9
---

# Phase 2: the component contract on component-invariants, with the render budget measured

why now   — phase 1 shipped the contract core (lib/conformance) with one static contract; phase 2 is the first render-tier user and the first to catch defects the history says recur (contrast in dark mode, the card-row trigger, the 18 unchecked components)
where     — test/integration/invariants/component-invariants.test.js; lib/conformance/kinds/ (new component.contract.js); tools/manifest-schemas.js; note §6.2 Family A, §6.4, §9 row 2
done when — every variant × theme × scheme runs batched, nightly and report-only; the per-PR render budget is measured and brought to the owner (§12.4) before it blocks; static component clauses run in npm test; stats/actors/kpi each adopt `cards` or carry ledger debt with a reason (§12.2)
evidence  — dist/engineering/conformance.md with the component section; the measured render minutes; the day-one catches listed in the PR body
verify    — tier 2 (adversarial trio): it changes a shared integration gate and sets a CI cost the owner rules on
