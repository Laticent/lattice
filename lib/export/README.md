# lib/export — the owned office writers

`pptx-export.js` (`writePptx`, `pptxLayout`): builds a 16:9 PPTX with one
full-bleed PNG per slide via `pptxgenjs`. Marp-free. This is the plain `.pptx`.

`office-export.js` (`captureSlides`, `writeOffice`): the Lattice host for **Calco**
(`@laticent/calco`, `docs/src/lib/calco/`), which writes every `.odp` and the
`--editable` `.pptx`. It hands Calco JSZip, PptxGenJS, the deck's fonts (from
`lib/fonts/text-faces.js`) and a pinner built on `lib/core/pdf-compose/font-subset.mjs`.

Both are consumed by `lattice.js` (lazily — a PDF-only run never loads
`pptxgenjs`). The browser sibling of the plain PPTX is
`docs/src/components/studio/export/deck-export.js`, kept byte-comparable.

**Gotcha:** `pptxgenjs` is external to the esbuild bundle and required
lazily; keep it that way or the emulator bundle balloons. `@laticent/calco` is the
opposite: a workspace library, so `tools/build-cli.js` INLINES it
(`INLINE_PACKAGES`), or a published install could not resolve it.
