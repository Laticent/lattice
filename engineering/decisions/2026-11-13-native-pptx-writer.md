---
status: proposed
summary: >
  Calco writes the PowerPoint package itself, with JSZip, as it already writes ODP, and Lattice drops pptxgenjs from
  the CLI and the Studio. The owner chose this on 2026-11-13 over vendoring a pptxgenjs fork or shipping an
  npm-shrinkwrap.json, because pptxgenjs pulls in image-size 1.x (infinite-loop advisories) that npm overrides cannot
  remove for people who install Lattice, has not been published since June 2025, and calco already rewrites most of
  what it writes. The build is followups.d/3190-p1-native-pptx-writer.md; it changes exported PPTX bytes, so it ships
  with the owner's export sign-off.
---

# Calco writes PowerPoint itself; pptxgenjs goes

**Date:** 2026-11-13 · **Decided by:** the owner, during the release security pass ("we are not GA so clean break is
best. long term and sustainable solutions is what i am after"), picking the native writer from three measured options ·
**Build:** `followups.d/3190-p1-native-pptx-writer.md` · **Context:** PR #3190 (puppeteer 25 for the CLI's advisories)

## Why this note exists

`npm audit --omit=dev` flagged `image-size` 1.2.1 (JXL, HEIF and ICNS parsers that loop forever on a crafted file).
It reaches Lattice only through `pptxgenjs`, which declares `image-size ^1.2.1` and never loads it: its built files
require `jszip`, `fs` and `https`, and nothing else. PR #3190 pinned `image-size` to 2.1.0 with an `overrides` entry,
which clears this repository's lockfiles. npm never applies a dependency's `overrides`, though, so every project that
installs `@laticent/lattice` still gets 1.x, and its own `npm audit` still lists a high advisory against us.

## The options the owner weighed

All numbers measured on `main` at `ddc15af12`.

| Option | What it buys | What it costs |
|---|---|---|
| **A. Native writer in calco (chosen)** | No third-party code in the PPTX path; the advisory is gone for every consumer; about 98 KB gzip off the Studio export chunk (`pptxgen.min.js` is 283,930 bytes, 97,728 gzipped); the post-processing workarounds below go away | A PR of its own; exported PPTX bytes change, so it needs the export sign-off and a compatibility pass in PowerPoint, Keynote, Google Slides and LibreOffice |
| B. Vendor a pptxgenjs fork without `image-size` | Quick; today's bytes stay | We maintain about 550 KB of someone else's code (`pptxgen.es.js` is 555,144 bytes) and keep every workaround |
| C. `npm-shrinkwrap.json` | The smallest diff | A publishing change that freezes every transitive version for users, and it keeps pptxgenjs |

`pptxgenjs` 4.0.1 (the latest, published 2025-06-26) still declares `image-size ^1.2.1`, and so does its main branch,
so waiting for upstream is not a plan either.

## What pptxgenjs does for us today

Lattice calls eight of its methods:

- **The CLI** (`lib/export/pptx-export.js`, `lib/export/office-export.js`): `defineLayout`, `addSlide`, `addImage` and
  `addNotes`, then `write`. One picture per slide, plus speaker notes.
- **Calco's editable export** (`docs/src/lib/calco/pptx.ts` `buildPptx`), used by the Studio and by
  `office-export.js --editable`: all of the above, plus `defineSlideMaster`, `addText` and `addShape`. These write text
  boxes run by run in their own fonts, preset and custom-geometry shapes with fills, strokes and shadows, layouts with a
  title placeholder and repeating header, footer and page number, and alt text on every picture.

Calco then opens the package pptxgenjs wrote and rewrites much of it (`docs/src/lib/calco/pptx.ts`):

- `groupShapes` wraps members in `p:grpSp`, keyed off tags smuggled through `objectName`;
- `uniqueShapeIds` renumbers shape ids;
- `giveMastersOwnThemes` gives each master its own theme part;
- `applyRoles` turns tagged boxes into title placeholders and page-number fields;
- `onePPrPerParagraph` repairs paragraph properties;
- `nameMediaByContent` renames media by content hash;
- `addSvgPictures` adds `asvg:svgBlip` pictures;
- `embedPptxFonts` embeds the fonts;
- `tidyPptx` and `tidyPptxPackage` handle the rest.

Small caps ride into `<a:rPr>` through pptxgenjs's unescaped `lang` attribute, a hack the tests pin.

In other words, pptxgenjs writes a first draft, and calco spends roughly half of `pptx.ts` correcting it. A writer that
emits the final XML directly removes both the dependency and the correction pass.

## The design

**One writer, in calco, with the shape of `writeOdp`.** `writePptx(JSZip, deck, outputType)` builds the package
directly. The `Deck` type is the one `writeOdp` takes: page size, slides with a background picture, frames (runs of
text), pictures, shapes, notes and alt text, plus the embedding plan. The `PptxGenJS` parameter goes away.

The parts it writes are the minimal set every reader accepts:

- `[Content_Types].xml` and `_rels/.rels`;
- `docProps/core.xml` and `docProps/app.xml`;
- `ppt/presentation.xml` and its rels, `presProps.xml`, `viewProps.xml` and `tableStyles.xml`;
- `ppt/theme/theme1.xml`, plus one theme per master;
- `ppt/slideMasters/*` and `ppt/slideLayouts/*`, from `masters.ts`;
- `ppt/slides/slideN.xml` and their rels;
- `ppt/notesMasters/*` and `ppt/notesSlides/*`;
- `ppt/media/*`, named by content hash;
- `ppt/fonts/*`, as `embedPptxFonts` writes them today.

The features calco rebuilds today get written right the first time:

- groups as `p:grpSp`;
- unique shape ids;
- the title as a real placeholder;
- the page number as `a:fld type="slidenum"`;
- `cap="small"` as a real attribute;
- one `a:pPr` per paragraph;
- SVG pictures with a PNG fallback.

**The CLI's picture-per-slide path** (`pptx-export.js`) calls the same writer with a deck of background pictures and
notes. That gives one PPTX writer for the CLI, `--editable` and the Studio (HARD RULE #1).

**XML is assembled from escaped values only.** Every text value goes through `xmlSafe` (which already strips the
control characters XML 1.0 forbids). There is no string interpolation of page text into attribute names or tag names,
and the small-caps hack retires with pptxgenjs.

## How it is proven

1. **Structure.** A unit test unzips each fixture deck's output and checks every part against the content types and
   rels: no dangling relationship, no unlisted part, unique ids, and well-formed XML.
2. **Round trip.** LibreOffice headless (`soffice --headless --convert-to pdf`) opens every fixture, and the PDF's page
   count and per-page text match the deck. `test/integration/export/office-conformance.test.js` is the home for it.
3. **Parity with today.** For each fixture deck, the text, fonts, positions, notes and alt text read back from the new
   package match what the pptxgenjs path produced. The bytes differ; the content must not.
4. **Real readers.** PowerPoint (macOS and Windows platform suites), Keynote (macOS), Google Slides (import) and
   LibreOffice open the gallery deck in light and dark. A failed open or a repair prompt is a blocker.
5. **Export sign-off.** The changed PPTX bytes go to the owner with renders from each reader (Quality Bar).

## What this does not change

- The ODP writer, the slide camera, font subsetting, and what the deck looks like.
- `jszip` stays; it is the only package dependency in the path.

## Risks

- **A reader rejects a part we write minimally.** PowerPoint is strict about content types and relationship ids.
  Mitigation: the structure test, plus PowerPoint itself in the platform suites, before the merge ask.
- **A pptxgenjs default we relied on without knowing.** Mitigation: the parity test reads back every property the
  current output carries, so a property we forget to write shows up as a diff.
