---
origin: 2388
priority: P3
recorded: 2026-09-26
source: https://github.com/Laticent/lattice/pull/2388
---

# On screen, gallery's inset frame line runs through the deck header

Found while verifying #2388; not caused by it (reproduced with no `backdrop:` key or token).

```text
  P3 · [no ticket] gallery frame keyline collides with the header chrome on screen.
       why now   — a `finish: gallery` deck with a `header:` shows the frame's top keyline
                   striking through the header text in the Studio preview and the HTML
                   export; the PDF (opaque face) does not show it.
       where     — base.finish.css `--fin-frame` (the inset box-shadow keyline) on the section,
                   vs the header placed in the section's top padding at the same inset.
       done when — the gallery keyline and the header no longer overlap on any render path,
                   in light and dark, with and without a header.
       evidence  — a dark `title finish-gallery` slide with a header, rendered with and
                   without backdrop-60 backdrop-clear: the line crosses the header in both
                   screen captures, neither PDF.
       verify    — tier: render + look (screen capture of the HTML, and the PDF).
```
