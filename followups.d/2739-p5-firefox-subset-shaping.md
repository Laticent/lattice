---
origin: 2739
priority: P5
recorded: 2026-10-16
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-player-as-library-audit.md §11.1
source: https://github.com/Laticent/lattice/pull/2739
---

# Find why Firefox draws a glyph-subset Playfair a few pixels narrower than the full face

why now   — measured in #2739: subsetting a player's fonts (which every CLI export does, and now the Studio's) shifts the Playfair headline by a few pixels in Firefox only (4,220–8,149 changed pixels per view); Chromium and WebKit are pixel-identical. The glyph advances at wght 700 are identical in both files (fontTools), so it is not a metric change.
where     — subset-font's HarfBuzz options (layout features, hinting, variation tables) against Firefox's rasterizer.
done when — the cause is named; the subset renders identically in Firefox, or the note says why it cannot.
evidence  — Firefox screenshots, full against subset, before/after.
verify    — tier 0 to investigate; any byte change stops for the owner's export sign-off.
