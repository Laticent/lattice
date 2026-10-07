---
origin: 2556
priority: P3
recorded: 2026-10-07
source: https://github.com/Laticent/lattice/pull/2556
---

# The picture-only .pptx keeps two PptxGenJS schema errors

why now   — Calco's `tidyPptx` mends PptxGenJS 3.12's schema errors in the editable `.pptx`;
            the picture-only export (`lib/export/pptx-export.js`) writes through PptxGenJS
            directly and keeps two of them: `p:notesMasterIdLst` after `p:sldIdLst`, and a
            `[Content_Types].xml` override for a slide master per slide where one exists. Its
            slides carry no text paragraphs, so the repeated `<a:pPr>` does not arise.
where     — lib/export/pptx-export.js writePptx; reuse the tidy in docs/src/lib/calco/pptx.ts
            rather than a second copy (#15).
done when — `xmllint --schema pml.xsd` reports no error on any part of a picture `.pptx`.
evidence  — the xmllint run before and after, and a byte-identical LibreOffice render.
verify    — gates only; it changes export bytes, so dark and light go to the owner first.
