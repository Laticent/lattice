---
origin: 3336
priority: P1
recorded: 2026-11-21
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-20-backdrop-gradient-fidelity.md §3
deferred: large — a second export path, and its bytes need the owner's sign-off
source: https://github.com/Laticent/lattice/pull/3336
---

# Draw a finish's backdrop in the .pptx and .odp exports

```text
  P1 · Bring the drawn backdrop to .pptx and .odp
       why now   — #3336 draws a finish's backdrop in the PDF instead of photographing it.
                   The office exports still carry a 2560×1440 picture per backdrop: the
                   decision note's test deck is 3.1 MB in picture mode (15 pictures of
                   108–423 KB) and 2.2 MB with --editable (12 backgrounds of 19–487 KB).
       where     — lib/export (the .pptx and .odp writers), reusing the backdrop model in
                   lib/core/pdf-compose/backdrop.mjs; draw it as a layout background with
                   <a:gradFill> (and the ODF equivalent).
       done when — a PR draws the backdrop natively, the owner signs off on dark and light
                   renders, and PowerPoint, Keynote and LibreOffice open it.
       evidence  — file sizes and renders, before and after.
       verify    — tier 2 trio: export bytes change.
```
