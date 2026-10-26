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

`prepareFonts(deck, host, onSkip, policy)` collects the faces the text uses and asks your host for them. `policy` says how much of each
class of face to embed, in four words:

- `exact`: only the characters the deck draws in that face (the smallest file; an edit may hit a missing glyph);
- `used`: the whole face as your host ships it, so a reader of an editable file can type new words (the default for text);
- `full`: the whole face with every script your host has;
- `system`: nothing; the reader's office suite draws the text in its own fonts.

`{ text, emoji }` sets the two classes (emoji default `exact`). Your host supplies:

- `load({ family, weight, italic, tier, chars, emoji })` returns a WOFF2/TTF/OTF, or `null` for a system font;
- `pin(bytes, { weight, ligatures, keep })` returns a static sfnt at that weight, with only the characters in `keep`
  (the `exact` tier) or **every** character when `keep` is `null`. A variable font must be pinned: an office suite draws a
  variable file at its default weight. HarfBuzz's subsetter does this (`hb_subset_input_pin_axis_location` plus an
  inverted, empty Unicode set for "all").

A face your host throws on is reported through `onSkip` (`'failed'`) and left out; it never takes the whole export down.

**Emoji.** Give `policy.emojiFamily(sequence)` and Calco splits each text run at its emoji (`splitEmojiRuns`, which marks the run
`style.emoji`), naming the emoji run's family, so the emoji font embeds like any other face. A color emoji font is often sliced by
code point range and one family is one file, so answer with the slice's own family, the one that holds every part of the sequence.
Without `emojiFamily`, or under `system`, the emoji stay in their text runs and the reader's own emoji font draws them.
**Check what your font is before you use this.** A COLR v1 color emoji face (Noto Color Emoji from Google Fonts) embeds fine and draws
blank in LibreOffice 24.2, with or without a system emoji font, because the embedded family wins over the fallback; a face an office
suite can paint (COLR v0, SBIX, CBDT) is the one to embed. Lattice does not embed its emoji font in Office files for this reason.
A host written before this option (it ignores `keep` and `emoji`) still embeds whole faces under `exact`.

## Pictures

`choosePicture(shooter, { tone, opaque }, policy)` is the one rule for a slide picture, so every host chooses alike: a
lossless PNG for a flat slide, a JPEG for a photograph when that is much smaller. `policy.mode` is `optimized` (the default)
or `original` (every picture a lossless PNG, no JPEG tried); `policy.quality` (1 to 100) replaces the default JPEG quality.
`captureOfficeSlides` takes the same policy (`pictures`) for the pictures it crops from a slide.

Both formats embed the faces. The `.odp` carries them as TrueType. The `.pptx` carries them as
Embedded OpenType in `ppt/fonts/` when you pass JSZip as `writePptx`'s fourth argument; a regular or
bold face goes in its slot of the family's own name ("Playfair Display", flagged bold or italic by the run), and any
other weight becomes a family of its own ("Outfit SemiBold"), because PowerPoint's font slots are only
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
- An inline chip (a code span, a mark) is a highlight on its words: its corners, border and padding are not
  carried, and it is opaque (its tint is blended over what is behind it).
- What cannot be a shape (a photo, a chart, an icon, a gradient scrim) is a picture of its own,
  cropped from the slide, placed in order among the shapes and grouped with its card
  (`ReadOptions.sprites`, `Shape.kind === 'picture'`). `captureOfficeSlides` does the whole capture (shared
  backgrounds, foreground, these crops) for any host that can `run` a function in the page and `shoot` a slide:
  the CLI (puppeteer) and the Studio (html-to-image) are two such hosts. A host that does not crop them gets one
  foreground picture instead, and a card that holds picture content stays in it.
- The `.pptx` picture lock is markup only: PowerPoint's Lock honors it; LibreOffice does not.
  Google Slides and Collabora on iOS are not verified.

Design, measurements and the LibreOffice behaviors the writers work around:
[`engineering/decisions/2026-10-06-calco-office-export-library.md`](https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-10-06-calco-office-export-library.md).

## License

AGPL-3.0-only. The full text ships as `LICENSE` in the package.
