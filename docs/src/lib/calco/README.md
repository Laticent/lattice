# Calco

**Rendered slides to office files you can edit.** Calco reads a laid-out HTML slide, keeps a
picture of it with the text removed, and writes every paragraph back as a real text box in its
own font: an OpenDocument Presentation (`.odp`, for LibreOffice Impress) or a
PowerPoint file (`.pptx`), fonts embedded in both. Speaker notes and alt text come along. Or skip the text and write one
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
deck.fonts = await prepareFonts(deck, { load, pin }); // optional: embed the fonts
const odp = await writeOdp(JSZip, deck);               // Uint8Array
const pptx = await writePptx(PptxGenJS, deck, 'uint8array', JSZip); // fonts embedded
```

## Install

```sh
npm i @laticent/calco
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

## Layouts, shared backgrounds and roles

`readSlide` tags each frame with a `role` it reads off the page: `title` (the first `h1`/`h2`),
`eyebrow` and `subtitle` (a lone inline-code paragraph above or below a heading), `header`,
`footer` and `number`. `splitSlide(section, 'background' | 'foreground')` hides a slide's
content (so a photograph shows only the slide's own paint and its decorative layer) or hides
that paint (so a photograph with a transparent background shows only content);
`splitKey(section)` says when two slides paint the same background, so one photograph serves
both. Put the backgrounds in `deck.backgrounds` (`{ color }` for a flat fill, `{ image }` for a
picture) and point each slide at one with `slide.background`; its `image` is then the
transparent foreground.

With backgrounds or roles, the writers use one master page (`.odp`) or layout (`.pptx`) per
distinct background plus the chrome its slides share: a title is a title placeholder, a page
number a slide-number field (when it equals the slide's position), and a header, footer or page number that two or more slides
share on a background is drawn once on the layout (`planMasters`). A slide with no shared
background keeps its own opaque picture and its own chrome, because a layout paints under the
slide's picture. The slide's foreground picture, when there is one, is locked against moving and
resizing; pictures of single objects are not, so a photo can be replaced or moved.

## Fonts

`prepareFonts(deck, host)` collects the faces the text uses and asks your host for them:

- `load({ family, weight, italic })` returns a WOFF2/TTF/OTF, or `null` for a system font;
- `pin(bytes, { weight, ligatures })` returns a static sfnt at that weight with **every**
  character kept (a reader of an editable file types new words). A variable font must be
  pinned: an office suite draws a variable file at its default weight. HarfBuzz's subsetter
  does this (`hb_subset_input_pin_axis_location` plus an inverted, empty Unicode set).

Both formats embed the faces. The `.odp` carries them as TrueType. The `.pptx` carries them as
Embedded OpenType in `ppt/fonts/` when you pass JSZip as `writePptx`'s fourth argument; each
weight becomes a family of its own ("Outfit SemiBold"), because PowerPoint's font slots are only
regular, bold, italic and bold italic. Only TrueType-outline faces are embedded in a `.pptx`; a
CFF face, or a call without JSZip, is named instead, so a reader without it sees a substitute.

Pass JSZip to `writePptx` even when the deck has no fonts to embed: Calco also uses it to mend
three schema errors PptxGenJS 3.12 writes (a paragraph's properties repeated before every run,
the notes master listed out of order, and a slide master declared per slide). Without JSZip the
file is exactly what PptxGenJS wrote.

A `.pptx` you built with PptxGenJS yourself (pictures only, say) can take the same mending:
`await tidyPptxPackage(JSZip, bytes)` returns the package with those errors fixed and nothing
else changed. Pass its notes, alt text and document properties through `xmlSafe(text)` first:
PptxGenJS escapes markup but writes control characters as they come, and one makes its XML
part unreadable.

## No dependencies

JSZip, PptxGenJS and the font pinner are passed in. `readSlide` and `restoreSlide` close over
nothing, so a headless browser can receive them as source.

## Limits

- Lines do not reflow: typing more text grows the box, not the layout.
- PowerPoint: weight is bold or not (600 and up is bold), and `text-transform` is applied to
  the text itself. Placement is measured in LibreOffice; PowerPoint is not verified.
- No native charts, diagrams or equations.
- What cannot be a shape (a photo, a chart, an icon, a gradient scrim) is a picture of its own,
  cropped from the slide, placed in order among the shapes and grouped with its card
  (`ReadOptions.sprites`, `Shape.kind === 'picture'`). A host that does not crop them (the Studio's
  browser export) gets one foreground picture instead, and a card that holds picture content stays in it.
- The `.pptx` picture lock is markup only: PowerPoint's Lock honors it; LibreOffice does not.
  Google Slides and Collabora on iOS are not verified.

Design, measurements and the LibreOffice behaviors the writers work around:
[`engineering/decisions/2026-10-06-calco-office-export-library.md`](https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-10-06-calco-office-export-library.md).

## License

AGPL-3.0-only. The full text ships as `LICENSE` in the package.
