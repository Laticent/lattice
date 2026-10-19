---
origin: 2746
priority: P2
recorded: 2026-10-18
area: chart
severity: medium
swimlane: engineering/decisions/2026-10-14-chart-authoring-uniform-model.md §10
source: https://github.com/Laticent/lattice/pull/2746
---

# Lint a series name that differs between the groups of a nested chart list, with a fix

```text
  P2 · [no ticket] Warn (with a machine fix) when a nested chart list spells one series two ways
       why now   — a nested list repeats each series name under every group, so a typo makes a new series silently:
                   `- FY23` / `  - Licenses `{18}`` then `- FY24` / `  - Licences `{19}`` draws two series, and lint says nothing
                   (true on main with the old spans too). The owner asked for a lint warning and a fix to keep names consistent
                   while nested-list records stay (2026-10-18).
       where     — lib/authoring/lint-core.js (one new rule, HARD RULE #7); the series charts that read nested rows (bar, line,
                   stacked-bar, slope, radar).
       done when — lint warns when a series name appears in fewer groups than its near-twin (edit distance or case/space only),
                   names the likely intended spelling, and offers a fix that rewrites it; silent on genuinely different series; a
                   changelog.d fragment and a spec/diagnostics.md row.
       evidence  — `node -e` repro: render the deck above, both `Licenses` and `Licences` appear as series; `lintText` returns [].
       verify    — tier 0 gates; unit tests with a positive and a negative arm per chart.
```
