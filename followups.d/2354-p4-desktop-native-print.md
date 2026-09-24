---
origin: 2354
priority: P4
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2354
---

# Desktop: native print (vector PDF) instead of iframe.print()

why now   — the Studio's vector print path is iframe.print() (deck-export.js ~1785), which is
            weak in WebKit; print_to_pdf exists only in WebView2. The raster PDF export
            already works on WebKitGTK (verified in #2354), so this is about VECTOR output.
where     — docs/src/components/studio/export/deck-export.js; PrintOptionsPanel.tsx;
            a print seam in docs/src/lib/platform.js + lib.rs (WebKitGTK print operation).
done when — Print deck on desktop yields a vector PDF with selectable text.
evidence  — the PDF itself (pdffonts shows embedded fonts, text is selectable). This changes
            EXPORT BYTES, so it stops for the owner's sign-off with dark and light decks.
verify    — maker-checker.
