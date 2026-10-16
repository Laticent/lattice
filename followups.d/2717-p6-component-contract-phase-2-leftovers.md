---
origin: 2717
priority: P6
recorded: 2026-10-16
area: infra
severity: low
swimlane: engineering/decisions/2026-10-15-conformance-harness.md §9
---

# Phase 2 items that did not land: anatomy-matches-render, `isEnriched`, manifest autocomplete

why now   — §9 row 2 lists them for phase 2; the PR shipped the static contract, the render tier and the ledger check, and the three below are still owed
where     — lib/conformance/kinds/component.contract.js; tools/build-component-docs.js (`isEnriched`); the Studio manifest editor and tools/manifest-schemas.js
done when — a clause checks that each manifest's anatomy block matches what renders; a clause fails a component that `isEnriched` skips without a reason; manifest autocomplete is derived from the JSON Schema
evidence  — each clause's fixture pair and the day-one catches in the PR body
verify    — tier 0 per clause
