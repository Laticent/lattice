---
origin: 2400
priority: P3
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2400
---

# The gallery finish's frame keyline is missing from a Studio-style capture

Found while testing every backdrop mask through html-to-image for #2400; not caused by it (the
same capture before and after the change has no frame).

```text
  P3 · [no ticket] gallery's inset frame keyline absent from an html-to-image capture.
       why now   — `finish: gallery` shows its keyline in the live Studio; a capture of the
                   section with `.lattice-exporting` on, through html-to-image, shows none.
       where     — `--fin-frame`, an inset box-shadow on the SECTION; the capture clones the
                   section. The harness skips deck-export.js's pre-capture fixups, so first
                   confirm on a real Studio download.
       done when — a real Studio PDF download of a gallery slide shows the keyline as the Studio
                   does (or the absence is confirmed intended), light and dark.
       verify    — tier: real Studio download + look.
```
