---
origin: 2828
priority: P1
recorded: 2026-10-20
area: engine
severity: medium
swimlane: engineering/typography.md
---

# Check the smaller venue chrome in the other 13 themes, the PPTX export and a real projector

#2828 cut the running header, footer and page number at `venue: conference` and `venue: hall`
(`--chrome-fs` times `--venue-chrome-cut` 0.85). It was checked in `indaco` and `indaco-dark`
only, at hall, in the PDF export. The owner has not seen conference, and nobody has seen it on
a projector.

why now   — the cut is shipped on every conference and hall deck. A theme with a lighter muted
            ink than `indaco` could drop its chrome below 4.5:1 contrast at the smaller size.
where     — `--chrome-fs` in `lib/typography/emit.js`; `--venue-chrome-cut` in
            `lib/base/base.modifiers.css`; the chrome contrast per theme in `themes/*/`.
done when — chrome ink measures 4.5:1 or better against the slide ground at conference and
            hall in all 14 palettes, light and dark, and the PPTX chrome matches the PDF.
evidence  — a contrast table per palette from the rendered deck, plus
            `examples/venue-chrome.md` rendered to PDF and PPTX via `SendUserFile`.
verify    — tier 0 gates, because it measures and reports. A palette that fails is an
            EXPORT-BYTES change, so it stops for the owner's sign-off.
