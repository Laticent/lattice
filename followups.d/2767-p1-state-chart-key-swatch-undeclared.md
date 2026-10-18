---
origin: 2767
priority: P1
recorded: 2026-10-17
area: chart
severity: low
swimlane: engineering/decisions/2026-09-07-chart-design-language.md
---

# `chart-language-census --check` names an undeclared `state-chart` mark

```text
  P1 · [no ticket] state-chart paints `fc-key-swatch` but no kernel.marks row declares it.
       why now   — found running the census for the histogram and EP curve in #2767; state-chart
                   is unchanged from main there, so it predates #2767 and is off its path.
       where     — `node tools/chart-language-census.js --check`: "state-chart/fc-key-swatch:
                   painted 2x on the render but declared in no kernel.marks row".
       done when — the census check reports no disagreement: the swatch is declared in
                   state-chart.manifest.json's kernel.marks, or the render stops painting it.
       evidence  — `node tools/chart-language-census.js --check` output before and after.
       verify    — tier 0: rerun the census check; a finish written against the swatch then reaches it.
```
