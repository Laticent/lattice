---
origin: 2746
priority: P1
recorded: 2026-10-18
area: chart
severity: low
swimlane: engineering/decisions/2026-10-14-chart-authoring-uniform-model.md §10
source: https://github.com/Laticent/lattice/pull/2746
---

# Revisit: nested-list records on the series charts (owner call: keep for now)

```text
  P1 · [no ticket] Decide whether series charts keep reading `{…}` records in nested list rows
       why now   — #2746 draws a record in a nested row on bar, line, stacked-bar, slope and radar (`- FY23` / `  - Licenses `{18}``),
                   while §2 of the model note moves series data to tables. The Munger inversion on #2746 flagged it as a third source
                   form for phase 4's codemod. Owner, 2026-10-18: keep it for now, with an explicit call to revisit.
       where     — lib/core/chart-rows.js `isDetailRow` / `rows.nested: point-unless-valued`; the `ancestors` plumbing in the five readers
                   (plugins.js pill pass via chart-places.js, resolve-inline-code.js, docs/src/lib/compose/inline-objects.ts, lint-core.js,
                   chart-source-bridge.js).
       done when — before phase 4's codemod is designed, the owner decides: keep nested-list records as a long-term form (the codemod
                   migrates them), or narrow claims to a chart's first data depth (nested series rows stay pills, lint points to the
                   table), and the model note §2/§10 says which.
       evidence  — the inversion's report on #2746 (story 1); the generated differential's nested cases in
                   test/unit/core/chart-row-record-differential.test.js.
       verify    — tier 0 gates; the differential test.
```
