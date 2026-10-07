---
origin: 2556
priority: P3
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2556
---

# A control character in speaker notes corrupts the plain .pptx

why now   — the red team on #2556 found PptxGenJS writes notes unescaped; Calco strips XML-forbidden
            characters, but the plain picture .pptx (lib/export/pptx-export.js and the Studio's
            exportPptx) does not, so a U+0001 in a note yields an unreadable notes part. Off-path.
where     — lib/export/pptx-export.js writePptx (addNotes, altText); deck-export.js exportPptx.
done when — a deck whose note holds U+0001 exports a .pptx whose every XML part parses.
evidence  — xmllint on the notes part before and after.
verify    — unit test beside test/unit/export/pptx-export.test.js.
