---
origin: 2763
priority: P2
recorded: 2026-10-18
area: website
severity: low
swimlane: engineering/decisions/2026-10-16-mosaico-layout-library.md §8.5
source: https://github.com/Laticent/lattice/pull/2763
---

# Studio exports draw the logo wall as the unpacked grid, though the live preview packs it

why now   — found while checking the export wait (§8.5). A Studio PDF and webpage of a deck with a
            logo wall carry `data-logo-wall="fallback"`: equal cells, not equal-weight rows. The
            same wall in the live preview packs. The CLI's PDF packs it from the inlined SVG. It
            predates the measuring kit: exports built from main's code read `fallback` too.
where     — docs/src/components/studio/export/deck-export.js createCaptureFrame (the frame's
            runtime); lib/transformers/logo-marks.js measureMark (a same-origin SVG fetch); the
            frame's CSP (docs/src/playground/preview-csp.js closes connect-src)
done when — a Studio export of the logo-wall deck in the evidence of PR 2763 shows packed rows, or
            this note says why the capture frame cannot read the marks and what the export does
            instead
evidence  — Studio PDF page of the wall before and after, light and dark
verify    — tier 1 checker, because it changes what every Studio export captures
