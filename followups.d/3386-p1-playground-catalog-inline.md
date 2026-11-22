---
origin: 3386
priority: P1
recorded: 2026-11-21
area: website
severity: low
swimlane: docs/route-budget.history.md
deferred: large — moving the catalog out of the page changes how the playground island boots, which is a perf change owing bench evidence (HARD RULE #19), not a budget-file PR
---

# The playground page inlines its whole component catalog into its HTML

```text
  P1 · [no ticket] fetch the playground catalog instead of inlining it
       why now   — docs/src/pages/playground.astro passes `catalog`, `components` and
                   `lintVocab` to PlaygroundIsland as props, so Astro escapes about 400 KB of
                   JSON into the HTML (every quote becomes &quot;). playground htmlRaw sits at
                   its ceiling: #3382, #3351 and #3386 each raised a ceiling on 2026-11-21,
                   and #3386 raised this one by 1.5 KB for PR 3362's split variants and claim
                   budgets. Every new variant or manifest field pays for itself again here.
       done when — the catalog loads as a fetched, cacheable JSON file (or a lazy chunk),
                   playground htmlRaw drops well under its soft target, and the newcomer
                   first paint is no slower (npm run bench / Lighthouse, before and after).
```
