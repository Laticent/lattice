---
origin: 2933
priority: P3
recorded: 2026-10-27
area: engine
severity: low
swimlane: engineering/decisions/2026-06-16-focus-highlighting.md §6
source: https://github.com/Laticent/lattice/pull/2933
---

# The editable PPTX breaks a focused row's ring at cell boundaries

```text
  P3 · [no ticket] row ring drawn in pieces in the editable PPTX
       why now   — #2933's re-check saw the ring around "Calibration" on examples/focus.md slide 3 (`_focus: row`) broken into pieces at the cell boundaries in an `--editable` export opened in LibreOffice. #2933 does not change that slide (byte-identical slide XML before and after), so it predates it; not yet compared against the PDF or PowerPoint.
       where     — docs/src/lib/calco/reader.ts (how a row's per-cell inset box-shadows become pictures or shapes).
       done when — the focused row's ring reads as one unbroken outline in the editable PPTX, matching the PDF.
       evidence  — an Impress render of examples/focus.md slide 3 from `--editable`, before and after, beside the PDF.
       verify    — tier 1 checker; export sign-off applies.
```
