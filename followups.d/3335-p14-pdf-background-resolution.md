---
origin: 3335
priority: P14
recorded: 2026-11-20
area: engine
severity: low
swimlane: engineering/decisions/2026-11-20-deck-preset-study.md §7
deferred: large — what remains is a second change to export bytes, with its own dark and light sign-off; #3336 made the first
source: https://github.com/Laticent/lattice/pull/3335
---

# L9: what the PDF writer cannot draw still lands in the 1× page photo

Updated 2026-11-27. #3336 shipped the export change this item waited for: the owner signed it off,
and it merged on 2026-11-21. The PDF writer now draws a finish's glow, textures and fades instead
of photographing them (`engineering/pipeline.md` §4a0, "A finish's backdrop is drawn").

why now   — the first layer `readBackdrop` cannot draw (a ghost numeral, which is text) still stays in the page photo, together with everything painted above it, and that photo is still 1×. A finish under such a layer is soft when zoomed.
where     — `lib/core/pdf-compose/compose.mjs` (the photo) and `read-slide.mjs` `readBackdrop` (what it refuses).
done when — the remaining photo is taken at 2× or more, or the refused layers are drawn; a demo deck rendered in dark and light is signed off by the owner; byte-reproducibility (`engineering/pipeline.md` §4a) still holds.
