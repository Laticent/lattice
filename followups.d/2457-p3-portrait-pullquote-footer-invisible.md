---
origin: 2457
priority: P3
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2457
---

# Portrait `split-panel pullquote`: the running footer is white on white

Found by #2457's red team, pixel-identical on `main`, so pre-existing. In portrait the panels
stack, the footer sits over the white supporting field, and it keeps the panel's
`--on-dark-secondary` ink: measured 1.00:1.

```text
  P3 · Portrait pullquote footer renders white on the white field
       why now   — a confidentiality line that is present in the PDF and invisible.
       where     — split-panel.styles.css chrome-ink block: the portrait arm needs
                   the canvas ink wherever the stacked layout puts the chrome on
                   the supporting field.
       done when — the footer reads >= 4.5:1 on every portrait split-panel variant.
       evidence  — tools/check-slide-contrast.js on a portrait split-panel deck,
                   before and after.
       verify    — tier 1: render, run the contrast tool, look.
```
