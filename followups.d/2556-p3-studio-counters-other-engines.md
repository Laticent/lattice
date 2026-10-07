---
origin: 2556
priority: P3
recorded: 2026-10-07
area: website
severity: low
swimlane: engineering/decisions/2026-10-06-calco-office-export-library.md
source: https://github.com/Laticent/lattice/pull/2587
---

# Verify the Studio counter fix in Firefox and WebKit

why now   — #2587 fixed Studio exports drawing every CSS counter as 0 by passing the counter
            properties to html-to-image (`deck-export.js` › `captureStyleProperties`). It was verified
            in Chromium only. WebKit may return a non-empty computed `cssText`, and html-to-image then
            copies that text instead of the property list, so the fix may not reach it.
where     — docs/src/components/studio/export/deck-export.js captureStyleProperties / captureOptions.
done when — a deck with a list-steps timeline and an agenda exports 1 2 3 / 01–04 from the Studio in
            Firefox and WebKit, PDF and .pptx.
evidence  — `node tools/bench-pdf-export.mjs --engine firefox|webkit --deck <counter deck>` after
            `npx playwright install firefox webkit`, the pages rasterized beside Chromium's.
verify    — tier 0 gates plus the rendered pages; a code change there changes export bytes, so the
            owner sees dark and light first.
