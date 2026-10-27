---
origin: 2935
priority: P1
recorded: 2026-10-27
area: export
severity: low
swimlane: engineering/decisions/2026-10-26-spectrum-edge-shift.md
source: https://github.com/Laticent/lattice/pull/2935
---

# The editable PPTX and ODP cut off a `collage bleed` eyebrow in dark mode.

why now   — found by the third checker on #2935; it is in that PR's own demo decks (`examples/spectrum-edge-cases.md` slide 11, `examples/spectrum-bar-full-bleed.md` slide 4) but predates it: an identical render from `main` 992664b truncates the same way.
where     — the editable export (`lib/export/office-export.js`, calco): "THE ATELIER" renders as "THE ATELI]" in the dark PPTX and ODP only; light is fine.
done when — the dark editable export of a `collage bleed` slide shows the whole eyebrow, in PPTX and ODP, and a render check pins it.
evidence  — rasters in the checker's report on #2935 (PPTX and ODP through LibreOffice).
verify    — `node lattice.js examples/spectrum-bar-full-bleed.md out.pptx --editable` with `dark` on slide 4, rasterize, compare the eyebrow.
