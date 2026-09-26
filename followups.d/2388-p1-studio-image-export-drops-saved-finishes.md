---
origin: 2388
priority: P1
recorded: 2026-09-26
source: https://github.com/Laticent/lattice/pull/2388
---

# The Studio's Images export drops every saved (Fabricate) finish

Found while verifying #2388 through the Studio's raster export; not caused by it. P1 because a
Studio user who designs a finish in Fabricate and exports images gets slides with no finish.

```text
  P1 · [no ticket] Saved finishes vanish from Share → Images (.zip).
       why now   — the live preview paints a saved finish; the image export of the SAME slide
                   paints none of it (no wash, texture, mark or edge). Built-in finishes export
                   fine, so authors see the loss only after downloading.
       where     — the Studio raster export (studio/export/deck-export.js, html-to-image): the
                   saved finishes' generated CSS that StudioShell injects into the live preview
                   (the usedSavedFinishes memo) evidently does not reach the capture document.
                   Related but separate: followups.d/2388-p2-studio-drops-deck-embedded-finish-css.md
                   (a deck's OWN <style> finish is missing from the preview too).
       done when — a slide wearing a saved finish exports with the finish painted, in light and
                   dark, matching the live preview's export face.
       evidence  — control on #2388's branch with NO backdrop key or token: a Fabricate finish
                   "Plain Grid" (texture 18%) saved through the real UI, chosen in Deck settings;
                   preview shows the grid, the exported PNG is blank apart from the spectrum bar.
       verify    — tier: Studio e2e — Fabricate save → Deck settings pick → Share → Images, and
                   compare the exported PNG against the preview screenshot.
```
