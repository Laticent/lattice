---
origin: 2978
priority: P1
recorded: 2026-10-29
area: engine
severity: medium
swimlane: engineering/pipeline.md §4a0
deferred: large — new reader and writer code in the PDF export pipeline, and the owner signs off on export bytes; its own PR after #2978
---

# Draw checks as vectors in the PDF, not in the slide's photo

why now   — The owner saw rough check marks in an exported PDF. The CLI's PDF writer (`lib/core/pdf-compose`)
            draws text, images and chart SVG as vectors and photographs everything else; a check is a masked
            box, so it lands in that photo at 1x (96 ppi): a 13-pixel picture, soft at any zoom or in print.
            On screen the same mark is drawn at full device resolution and looks smooth. The owner picked
            vector checks over a 2x photo (which doubles the file, 123 KB to 247 KB on examples/checks.md,
            and is still soft at deep zoom).
where     — `lib/core/pdf-compose/read-slide.mjs` (it already lifts chips as vector boxes, `chipOf`) and
            `write-pdf.mjs`. Each `.lat-state` becomes a filled circle, its rings (the style's outer rim, the
            signal ring, the hollow answers' inset ring) as stroked circles, and the mark as the path in its
            `--mark-*` mask: since #2978 every mask is a bare `<svg><path/></svg>` with the fit baked in, so
            the path parses directly. The disc is hidden from the photo like any drawn shape. The PPTX
            exporter already lifts the same marks (docs/src/lib/calco/reader.ts `markOf`); share that
            reading rather than write a second one (HARD RULE #1). The checklist's `li::before` discs and
            matrix cells (`td > .state`) are the same recipe and belong in scope.
done when — Every check in a CLI PDF is vector: zooming to 800% shows clean edges, `pdfimages -list` shows no
            check inside the photo, and LATTICE_PDF_REPORT names no check as left in the photo.
evidence  — Before/after crops at 800% of examples/checks.md light and dark; the PDF size before and after;
            a test that renders a deck of every answer and style and asserts each check is drawn as vector
            paths in the PDF.
verify    — tier 1 checker, because it changes export bytes and the shared PDF reader; owner sign-off on the
            light and dark PDFs (Quality Bar).
