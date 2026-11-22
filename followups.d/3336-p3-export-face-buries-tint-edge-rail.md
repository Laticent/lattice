---
origin: 3336
priority: P3
recorded: 2026-11-20
area: engine
severity: low
swimlane: engineering/decisions/2026-11-20-backdrop-gradient-fidelity.md
deferred: off-path — the drawn backdrop no longer hits it; only a finish whose backdrop stays in the photo, and `--chrome-pdf`, still do
source: https://github.com/Laticent/lattice/pull/3336
---

# A finish's export face hides the slide's own `tint-edge` rail

why now   — A finish's export face ends its bottom glow on solid canvas (base.finish.css, THE BOTTOM-LAYER RULE), and the
            `.backdrop` paints over the section's own background, so a `divider tint-edge` rail under a finish vanishes from
            the export. Measured on an owner deck: the rail pixel read rgb(39, 32, 22) in the PDF against rgb(166, 98, 124)
            on screen. A slide with no finish keeps it. The vector backdrop draws the SCREEN face, so the rail is back
            wherever the backdrop is drawn; it is still lost on a slide whose backdrop stays in the photo (a `backdrop-*`
            reason in LATTICE_PDF_REPORT) and in `--chrome-pdf`.
where     — lib/base/base.finish.css (the opaque flip and each preset's `-opaque` wash), lib/finishes/finish-generate.js.
done when — a `divider tint-edge` slide under each built-in finish keeps its rail in `--chrome-pdf` and with the backdrop
            refused (force one with an inset blurred shadow), within 6 levels of the screen.
evidence  — the rail pixels, screen against both exports, dark and light.
verify    — tier 1 checker; it changes exported bytes, so export sign-off.
