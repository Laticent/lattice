# lib/export — the owned office writers

`pptx-export.js` (`writePptx`): builds a PPTX with one full-bleed picture per slide
(PNG, or JPEG for a photographic slide), its notes and its alt text, through Calco's
PPTX writer. The slide keeps the deck's aspect. Marp-free. This is the plain `.pptx`.

`office-export.js` (`captureSlides`, `writeOffice`): the Lattice host for **Calco**
(`@laticent/calco`, `docs/src/lib/calco/`), which writes every `.odp` and the
`--editable` `.pptx`. It hands Calco JSZip, the deck's fonts (from
`lib/fonts/text-faces.js`) and a pinner built on `lib/core/pdf-compose/font-subset.mjs`.

So every `.pptx` Lattice writes, plain or editable, from the CLI or the Studio, comes
out of one writer: Calco's `writePptx` (`docs/src/lib/calco/pptx.ts`), which builds the
OOXML package itself with JSZip. No third-party PPTX writer is in the path
(`engineering/decisions/2026-11-13-native-pptx-writer.md`).

Both are consumed by `lattice.js`. The browser sibling of the plain PPTX is
`docs/src/components/studio/export/deck-export.js` (and its worker,
`pptx-assemble-worker.js`), which calls the same writer.

**Gotcha:** `@laticent/calco` is a workspace library, so `tools/build-cli.js`
INLINES it (`INLINE_PACKAGES`), or a published install could not resolve it.
