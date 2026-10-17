---
origin: 2714
priority: P1
recorded: 2026-10-17
area: chart
severity: medium
swimlane: engineering/decisions/2026-10-15-business-deck-gaps.md
source: https://github.com/Laticent/lattice/pull/2714#issuecomment-6234364708
---

# `histogram` and `ep-curve` charts, the reinsurance beta's last item

```text
  P1 · [no ticket] Two new chart components: a histogram for loss distributions, and an
       exceedance-probability (EP) curve whose return-period axis is a log scale.
       why now   — §7.4 of the business-deck gaps note; loss distributions and return periods
                   (1-in-10 to 1-in-250) are what a reinsurance deck prices from, and no chart
                   draws them. `line.docs.md` documents no log axis.
       where     — lib/components/chart/<name>/, the chart-family kernel, and every roster in
                   design/skills/chart-component.md.
       done when — both render from plain Markdown in light, dark and print; the EP curve reads
                   its return periods on a log axis; narration says each in words; hover cards
                   and the Guide work on the live surfaces.
       evidence  — demo decks rendered to PDF and sent to the owner; a live e2e spec per chart,
                   like docs/e2e/risk-matrix-live.spec.ts; the route budget measured.
       verify    — tier 1 checker: each chart touches the shared chart kernel and the narrator,
                   and a log axis is new to the chart family.
```
