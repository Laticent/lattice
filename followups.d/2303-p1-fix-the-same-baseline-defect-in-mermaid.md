---
origin: 2303
priority: P1
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2303#issuecomment-5776537591
backfill: true
---

# Fix the same baseline defect in mermaid-rendered diagram labels

Backfilled verbatim from the continuation brief on #2303 (merged 2026-09-22).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P1 · [no ticket] Fix the same baseline defect in mermaid-rendered diagram labels
       why now   — it is the same user-visible defect on the same surface class,
                   already measured, and the instrument is committed. It is the
                   last known instance of this bug in the tree.
       where     — the baseline comes from the <style> mermaid injects into its own
                   SVG, on classes mermaid owns (`actor`, `noteText`,
                   `ishikawa-label`). The only CSS we own that touches them is
                   lib/integrations/mermaid/mermaid.css, which sets no baseline
                   today — so the fix is a companion `… tspan` rule there, mirroring
                   what funnel.styles.css / chart-family.css / word-cloud.styles.css
                   now do. Check first whether mermaid's own rule out-specifies it.
       done when — `node tools/audit-svg-baselines.mjs --deck lib/components/diagram/diagram.gallery.md`
                   reports 0 labels over 3px. Baseline before this work: 17 of 91
                   over 3px (`actor` −5.49, `noteText` −3.54, `ishikawa-label` −2.83).
       evidence  — that audit's before/after table, plus real-WebKit screenshots of
                   two affected diagram slides via SendUserFile.
       verify    — tier 1, an independent checker: it edits a stylesheet that styles
                   THIRD-PARTY markup, so a selector that is right today can be
                   silently wrong after a mermaid upgrade. Not tier 2 — the blast
                   radius stops at diagram labels.
```
