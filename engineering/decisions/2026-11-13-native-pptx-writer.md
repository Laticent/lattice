---
status: shipped
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

## What shipped (2026-11-15)

`docs/src/lib/calco/pptx.ts` `buildPptx(JSZip, deck)` / `writePptx(JSZip, deck, outputType)`. The CLI's picture
`.pptx` (`lib/export/pptx-export.js`), `--editable` (`lib/export/office-export.js`), and the Studio's two lanes
(`deck-export.js`, `pptx-assemble-worker.js`) all call it. What differs from the design above, and why:

- **Media are named by a 64-bit FNV-1a hash of their bytes** and stored once: a logo on every slide is one part.
  PNG and JPEG are stored, not deflated; the XML, SVG and fonts are deflated.
- **Notes pages exist only for slides with notes.** pptxgenjs wrote one per slide.
- **The title placeholder is `type="title"` with no index**, and the page-number placeholder is
  `type="sldNum" idx="12"`, the values PowerPoint itself writes; pptxgenjs used `idx="100"` and `idx="4294967295"`.
- **A notes page splits the note into paragraphs** at its line breaks; pptxgenjs wrote one run with raw newlines.

The proof is `test/unit/calco/pptx-structure.test.js` (§How it is proven 1),
`test/integration/export/office-conformance.test.js` (2, LibreOffice), and `test/unit/calco/pptx-parity.test.js`
(3), whose snapshot was read from the pptxgenjs path at `e5dfcb1d` and is frozen.

**Real decks, before and after (2026-11-15).** The gallery and eight example decks (`accent-finishes`, `card-tags`,
`sample-images`, `marks`, `calco-edge-cases`, `focus`, `focus-highlight-axes`, `inline-icons`) were exported by `main` at
`e5dfcb1d` (pptxgenjs) and by this writer, editable and picture-per-slide, and read back with the parity reader: 18
files, 388 slides (194 in each mode), 4,731 objects. The nine picture-per-slide files and six of the nine editable ones match. Five
values differ: three drawn marks now keep the round corners the page asks for (pptxgenjs only rounded them when the
line ends were round too), and two pill corners read 50000 (a half-round) where pptxgenjs's separate rounding of
radius and size left 49840, under 0.05 px on a 30 px pill.

**What did not happen before merge.** §How it is proven 4 named PowerPoint, Keynote and Google Slides. None of them
can run in this sandbox or in a platform suite, so the bytes ship checked by the ISO 29500 schema, Microsoft's Open
XML SDK, LibreOffice 24.2 (the round trip) and Apple's Office importer (`office-quicklook`), and NOT opened in
PowerPoint, Keynote or Google Slides. The owner's export sign-off asks for that open; until it happens,
`followups.d/3220-p1-native-pptx-real-readers.md` tracks it. The LibreOffice round trip skips in CI, where no job
installs LibreOffice.

**What the parity test compares, and what it does not.** `test/helpers/pptx-readback.js` reads each object's kind,
name, alt text, placeholder type, group path, frame, geometry (preset, adjust, custom path), fill (solid, gradient),
outline (color, alpha, width, dash, cap, join), shadow, picture bytes (hash) and SVG, lock, and its text paragraph by
paragraph and run by run (text, field, size, bold, italic, underline, strike, caps, spacing, font, color, alpha,
highlight, alignment, line spacing, insets, wrap, anchor), the layout behind each slide with its background, the notes,
the title, subject and creator, and the embedded fonts. It does not read autofit, `lang`, the `ea`/`cs` faces, the
master's text styles, the theme, a picture's crop, or the document dates. A property outside that list can drift
without a diff.

## Right, not parity (2026-11-15)

The owner's rule, set while the PR was open: **the writer does what the spec and the browser say, not what pptxgenjs
did.** pptxgenjs is a library with its own defaults, and the first cut copied several of them to keep the parity test
quiet. The parity snapshot stays, frozen, as a guard against ACCIDENTAL change. Every place the writer now says
something different is listed in `intended()` in `test/unit/calco/pptx-parity.test.js` with its reason, so a departure
is always a reviewed decision. The ones the parity reader cannot see are held by `test/unit/calco/pptx-correctness.test.js`,
each with a failing arm.

| What | pptxgenjs (and the first cut) | Now | Why |
|---|---|---|---|
| Kerning | the default styles' `kern="1200"` (none under 12pt); `kern="0"` on letter-spaced runs | `kern="100"` on every run | Chromium kerns at every size and kerns letter-spaced text (measured: 11px "AVAVAVTo" 53.3 vs 58.0 px unkerned; 2px-spaced 132.4 vs 142.5). PowerPoint writes `kern="0"` for "off" |
| Language | `lang="en-US"` on every run | the run's nearest `lang`, else the deck's `lang:`, else `en-US` | spell-check and read-aloud follow it |
| Font class | `pitchFamily="34"` (swiss, variable) for every face, JetBrains Mono included | `panose` and `pitchFamily` read from the face (OS/2, post), else the family from the CSS generic, else nothing | a reader without the face picks its stand-in from these; a monospaced face claimed as swiss falls back to Arial |
| Slide size | 13.333 in (12191695 EMU) for a non-16:9 deck; a near-16:9 deck snapped to the wide slide, its content 2 px past the bottom | exact: 12192000 EMU on the longest edge, the deck's own aspect | PowerPoint's 13⅓ in; one scale on both axes |
| Lengths | line widths, shadows and insets rounded to 0.01 pt first | EMU from px directly | one rounding, not two |
| Opacity | whole percents | 1/1000 of a percent, as the file holds | |
| Notes page | a 16:9 slide image on every deck | the slide's own aspect | a portrait deck's notes page showed a squashed slide |
| Header and footer flags | the master's "no slide number" for every layout | each layout says whether it numbers its slides | PowerPoint's Header & Footer dialog and a new slide read it |
| Properties | title "deck", author "Calco" / "Lattice" / "Lattice Drawing Board", company "Calco", `Words` and `Paragraphs` 0, format "On-screen Show (16:9)" | only what the deck says; no counts; "Widescreen" | the program is `Application`, not the author; a zero is a false count; "On-screen Show (16:9)" is PowerPoint's 10 in slide |

What a reader sees: the 18 real-deck files (above) re-exported with these changes, opened in LibreOffice and compared by
`tools/pixel-check.js` against the same files from `c2845d65`: the nine picture-per-slide files are pixel-identical, and
9 of the 194 editable slides differ by 0.06–0.10% of their pixels, all of it the ring of a drawn check or cross icon,
whose line width is now exact. Read back by the parity reader against pptxgenjs, the new values are the line widths
(at most 63 EMU, 0.007 px), 12 opacities (7000 becomes 7100, the page's 7.1%), and the title and author: the CLI now
names the file by the deck's own title, not its file name, and names no author. LibreOffice ignores `kern` (a 1pt, 12pt and 0 threshold render to the
same widths), so the kerning change is visible only in PowerPoint and Keynote, which have not opened it.

Left as they are, on purpose: line spacing stays proportional (`spcPct`, for Google Slides, §The design); `ea` and `cs`
name the run's family; and the theme is still Office's colors and fonts, a question put to the owner (a theme built
from the deck would give PowerPoint's color picker and new text boxes the deck's palette and faces).

## Risks

- **A reader rejects a part we write minimally.** PowerPoint is strict about content types and relationship ids.
  Mitigation: the structure test, the Open XML SDK, and the open in PowerPoint on the owner's sign-off (above).
- **A pptxgenjs default we relied on without knowing.** Mitigation: the parity test reads back every property the
  current output carries, so a property we forget to write shows up as a diff.
