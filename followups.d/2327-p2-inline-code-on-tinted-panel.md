---
origin: 2327
priority: P2
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2327
---

# Inline code on a tinted split panel renders as a near-invisible pill

Found while #2327 rebuilt `examples/system-design-foundations.pdf`. On pages 125 and 183 the
inline code `` `1 - 0.99^100` `` and `` `1 - 0.99^30` `` sits in the tinted left panel of a
split slide. The committed PDF drew it as italic body text. A render of `origin/main` at
2026-09-24 draws it as a code pill whose pale ink almost disappears on the pink and peach
panels. The `origin/main` render matches #2327's pixel for pixel on both pages, so #2327
did not cause it. #2327 had to rebuild the PDF for page 199, so the committed PDF now shows
the defect.

```text
  P2 · Inline code is unreadable on a tinted split panel
       why now   — the formula is the point of both slides, and it can barely be read
                   on the shipped PDF.
       where     — examples/system-design-foundations.md slides at pages 125 and 183;
                   the inline-code color on a split slide's tinted panel.
       done when — the code reads at AA contrast on every panel tint, or renders as
                   italic text again if that was the intended treatment.
       evidence  — before/after crops of pages 125 and 183, light and dark.
       verify    — tier 1: render the deck, look at both pages.
```
