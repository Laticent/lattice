---
origin: 2388
priority: P2
recorded: 2026-09-26
source: https://github.com/Laticent/lattice/pull/2388
---

# A finish saved before #2388 that bakes a dim AND a mask still draws the poppler wedge

```text
  P2 · [no ticket] Legacy saved finish: baked dim + baked mask → poppler wedge.
       why now   — Fabricate finishes saved BEFORE #2388 with Strength < 100% and "Clear behind
                   content" (or a spotlight) carry no `--fin-backdrop-veil-weight`, so their
                   strength is still group opacity around a hard mask. Evince / Okular /
                   pdftoppm draw a dark wedge or the finish at full strength. Re-saving the
                   finish in Fabricate fixes it: the generator now emits the veil weight.
       where     — the saved finish CSS (Studio library / deck-embedded <style>); the engine
                   cannot tell a baked mask from none in CSS.
       done when — a saved finish is regenerated on load (or migrated once) so its CSS carries
                   the current generator output, and a pdftoppm raster of such a finish is
                   clean.
       evidence  — pdftoppm raster before/after re-save.
       verify    — tier: export sign-off (changes exported bytes of existing saved finishes).
```
