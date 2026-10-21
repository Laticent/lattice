---
origin: 2774
priority: P3
recorded: 2026-10-18
area: chart
severity: low
swimlane: engineering/decisions/2026-06-19-chart-adaptive-sizing.md
---

# roadmap.styles.css says `check:chart-fit` is wired to no CI job

```text
  P3 · [no ticket] The comment at lib/components/chart/roadmap/roadmap.styles.css:760-763 says
       `check:chart-fit` "is wired to NO CI job (`grep -rn chart-fit .github/` is empty)". False since #2045:
       integration-nightly.yml runs it in its `chartfit` step.
       why now   — a reader trusts it and skips running the gate.
       where     — the comment above; reword to "runs only in integration-nightly.yml".
       done when — the comment is corrected AND the PR declares the bytes: the comment ships in the eager
                   studio/playground bundle, and rewording it moved eagerJsGz by +4 bytes (docs-build
                   fails until `docs/route-budget.d/<slug>.md` declares them; see engineering/gotchas/ci.md).
       evidence  — docs-build green with the declaration.
       verify    — self-review.
```
