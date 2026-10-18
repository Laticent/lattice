---
origin: 2770
priority: P3
recorded: 2026-10-18
area: chart
severity: low
swimlane: engineering/decisions/2026-06-19-chart-adaptive-sizing.md
---

# `timeline-list` in the strip family with a long title was never rendered after the pill/title share-a-row change

```text
  P3 · [no ticket] #2770 moved the date pill and title onto one row for tall and strip; only tall (portrait)
       was rendered and gated.
       why now   — in strip the nowrap pill and the column gap come out of an already narrow title column, so a
                   long title may wrap to a word or two per line. No fixture exercises strip with a long title.
       where     — lib/components/chart/timeline-list/timeline-list.styles.css (tall/strip block);
                   test/fixtures/chart-fit.md (add a strip case).
       done when — a strip timeline-list with a 12-word title renders without a clip or a one-word-per-line wrap,
                   or the title/pill split is limited to tall.
       evidence  — the strip slide rendered and sent; npm run check:chart-fit output.
       verify    — tier 0: check:chart-fit plus a look; the change is local to one component's strip arm.
```
