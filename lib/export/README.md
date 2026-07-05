# lib/export — the owned PPTX writer

`pptx-export.js` (`writePptx`, `pptxLayout`): builds a 16:9 PPTX with one
full-bleed PNG per slide via `pptxgenjs`. Marp-free.

Consumed by `lattice-emulator.js` (lazily — a PDF-only run never loads
`pptxgenjs`). Its browser sibling is
`docs/src/playground/drawing-board-export.js`, kept byte-comparable.

**Gotcha:** `pptxgenjs` is external to the esbuild bundle and required
lazily; keep it that way or the emulator bundle balloons. An editable
(non-image) PPTX export is deliberately not implemented.
