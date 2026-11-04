---
origin: 2992
priority: P3
recorded: 2026-11-02
area: engine
severity: low
swimlane: engineering/decisions/2026-11-01-icon-font.md
deferred: blocked — needs a Google Slides surface to measure where it puts the first baseline under a spacing multiple; nothing here can open Google Slides, and the cause is inferred from one owner screenshot
source: https://github.com/Laticent/lattice/pull/2992
---

# A multi-line text box may sit high in Google Slides

```text
  P3 · [no ticket] measure and correct where Google Slides puts a multi-line box's first line
       why now   — the owner opened an editable PPTX in Google Slides (PR 2992): one-line sentence pieces
                   with a 1.3x spacing multiple sat about 0.3 em higher than PowerPoint and LibreOffice put
                   them, beside icons placed exactly. 010f7b9 made every ONE-line box state 100%, which
                   removes the disagreement there. A box of two or more lines still states its multiple,
                   and if Google Slides reads it the same way its text sits high too (no icon beside it, so
                   less visible; on a card it would sit off-center).
       where     — docs/src/lib/calco/layout.ts spacingMultiple / placeFrame ('proportional')
       done when — a Google Slides render of a multi-line box in a card is measured against PowerPoint's,
                   and either they agree or the placement is changed so both put the first baseline in one place.
       evidence  — screenshots from Google Slides and PowerPoint of the same slide.
       verify    — tier 1 checker.
```
