# Calco

**Rendered slides to office files you can edit.** Calco reads a laid-out HTML slide, keeps a
picture of it with the text removed, and writes every paragraph back as a real text box in its
own font: an OpenDocument Presentation (`.odp`, for LibreOffice Impress, fonts embedded) or a
PowerPoint file (`.pptx`). Speaker notes and alt text come along. Or skip the text and write one
picture per slide.

*Calco* is Italian for a cast or a tracing: a faithful copy you can rework.

```ts
import { readSlide, restoreSlide, prepareFonts, writeOdp, writePptx } from '@laticent/calco';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';

// 1. In the page (a browser, or puppeteer's elementHandle.evaluate):
const read = readSlide(slideElement, { hide: true }); // text → frames; text now hidden
const background = await screenshot(slideElement);    // your capture: puppeteer, html-to-image, …
restoreSlide(slideElement);

// 2. Anywhere (Node or the browser):
const deck = {
  width: read.width, height: read.height,
  slides: [{ image: background, frames: read.frames, notes: 'Say this', description: 'Title slide' }],
};
deck.fonts = await prepareFonts(deck, { load, pin }); // optional: embed the fonts (.odp)
const odp = await writeOdp(JSZip, deck);               // Uint8Array
const pptx = await writePptx(PptxGenJS, deck);         // Uint8Array
```

## What it reads, and what it leaves in the picture

Every visible word in the HTML part of the slide, grouped into paragraphs and broken into
lines where the browser broke them, with the style it was drawn in: the font actually used,
weight, slant, size, color, opacity, letter-spacing, `text-transform`, underline and strike.

It leaves in the picture what a text box cannot reproduce: SVG and MathML (a chart keeps its
labels), `::before`/`::after` text, rotated or vertical text, gradient text, and any paragraph
cut by a clip (an ellipsized line).

Hiding the text does not touch anything else: colors that come from `currentColor`
(a tinted pill, an SVG icon, a `::after` page number) are frozen first.

## Fonts

`prepareFonts(deck, host)` collects the faces the text uses and asks your host for them:

- `load({ family, weight, italic })` returns a WOFF2/TTF/OTF, or `null` for a system font;
- `pin(bytes, { weight, ligatures })` returns a static sfnt at that weight with **every**
  character kept (a reader of an editable file types new words). A variable font must be
  pinned: an office suite draws a variable file at its default weight. HarfBuzz's subsetter
  does this (`hb_subset_input_pin_axis_location` plus an inverted, empty Unicode set).

The `.odp` embeds the faces. The `.pptx` only names them (PowerPoint's own embedded-font format
is not written), so a reader without them sees a substitute; Calco still uses their metrics to
place the boxes.

## No dependencies

JSZip, PptxGenJS and the font pinner are passed in. `readSlide` and `restoreSlide` close over
nothing, so a headless browser can receive them as source.

## Limits

- Lines do not reflow: typing more text grows the box, not the layout.
- PowerPoint: weight is bold or not (600 and up is bold), and `text-transform` is applied to
  the text itself. Placement is measured in LibreOffice; PowerPoint is not verified.
- No native charts, diagrams or equations.

Design, measurements and the LibreOffice behaviors the writers work around:
[`engineering/decisions/2026-10-06-calco-office-export-library.md`](../../../../engineering/decisions/2026-10-06-calco-office-export-library.md).
