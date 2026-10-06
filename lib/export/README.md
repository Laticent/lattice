# lib/export — the owned PPTX and ODP writers

`pptx-export.js` (`writePptx`, `pptxLayout`): builds a 16:9 PPTX with one
full-bleed PNG per slide via `pptxgenjs`. Marp-free.

`odp-export.js` (`writeOdp`, `buildOdp`, `odpPageSize`): the LibreOffice Impress
sibling — the same image-per-slide model, notes and alt text, packaged as an
OpenDocument Presentation with jszip (no `soffice`). `buildOdp` is pure and takes
the JSZip class, so a browser caller can pass its own copy.

Both are consumed by `lattice-emulator.js` (lazily — a PDF-only run never loads
`pptxgenjs`). Its browser sibling is
`docs/src/components/studio/export/deck-export.js`, kept byte-comparable.

**Gotcha:** `pptxgenjs` is external to the esbuild bundle and required
lazily; keep it that way or the emulator bundle balloons. An editable
(non-image) PPTX export is deliberately not implemented.
