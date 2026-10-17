---
origin: 2744
priority: P1
recorded: 2026-10-17
area: website
severity: medium
swimlane: engineering/decisions/2026-10-16-mosaico-layout-library.md
source: https://github.com/Laticent/lattice/pull/2744#issuecomment-6229753016
---

# Make the Mosaico demo page as full as Segno's or Trama's

why now   — the owner judged the page sparse next to its siblings; it is the library's front door
            before the npm release
where     — docs/src/pages/libraries/mosaico/index.astro; models: docs/src/pages/libraries/segno/index.astro
            ("Try to make it slow", "How it compares") and trama/index.astro ("Five things to try")
done when — new sections: five one-click presets; the live toGrid CSS for the current layout; a speed
            test (six boxes, free vs ordered, arrangements and ms); Lattice before/after (collage, logo
            wall 3.6x to 2x); the comparison table against diorama and justified-layout from #2744's body
evidence  — tools/screenshot.js at 1440/820/390, light and dark; no horizontal scroll, no console
            errors; WCAG AA on every new text pair
verify    — tier 0 gates plus one tier-1 checker on the page, because it is a site-only change the
            owner reviews visually
