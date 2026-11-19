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
const pptx = await writePptx(JSZip, deck);             // Uint8Array, fonts embedded
```

## Install

```sh
npm i @laticent/calco
```

## What it reads, and what it leaves in the picture

Every visible word in the HTML part of the slide, grouped into paragraphs and broken into
lines where the browser broke them, with the style it was drawn in: the font actually used,
weight, slant, size, color, opacity, letter-spacing, `text-transform`, underline and strike.

Translucent text is written as the solid color it appears as wherever one can be found: over a solid
background exactly (`flatColor`), and in the ODP over a gradient, from the solid color under it
(`nearColor`, an approximation). LibreOffice-based apps draw a translucent run badly: LibreOffice clips
a letter-spaced one, and Collabora Online fills every letter of one as a solid block. The PPTX keeps
the opacity over a gradient, which PowerPoint and Google Slides draw correctly. Over a picture both
formats keep the opacity, since there is no solid color to blend over.

It leaves in the picture what a text box cannot reproduce: SVG and MathML (a chart keeps its
labels), `::before`/`::after` text, rotated or vertical text, gradient text, and any paragraph
cut by a clip (an ellipsized line).

Hiding the text does not touch anything else: colors that come from `currentColor`
(a tinted pill, an SVG icon, a `::after` page number) are frozen first.

## Layouts, shared backgrounds and roles

`readSlide` tags each frame with a `role` it reads off the page: `title` (the first `h1`/`h2`),
`eyebrow` and `subtitle` (a lone inline-code paragraph above or below a heading), `meta` (a lone
inline-code paragraph that is a slide's last paragraph: a source, a basis), `header`, `footer` and
`number`, and the slide's `look` (Lattice's `data-frame`: title, content, divider, topic, closing).
`splitSlide(section, 'background' | 'foreground')` hides a slide's
content (so a photograph shows only the slide's own paint and its decorative layer) or hides
that paint (so a photograph with a transparent background shows only content);
`splitKey(section)` says when two slides paint the same background, so one photograph serves
both. Put the backgrounds in `deck.backgrounds` (`{ color }` for a flat fill, `{ image }` for a
picture) and point each slide at one with `slide.background`; its `image` is then the
transparent foreground.

With backgrounds or roles, every layout (`.pptx`) or master page (`.odp`) carries the WHOLE look of its slides
(`planMasters`). Slides share one when they sit on the same background, are the same look, and draw their running
chrome in the same place and style, whatever its text says:

- chrome whose text is the same on every slide of a layout is drawn once on it, a layout of one slide included (a
  dark divider's light footer); chrome whose text varies (a header naming each section) stays on each slide, and the
  `.pptx` layout offers a placeholder in its look instead of becoming a layout per slide;
- a page number is a slide-number field when it equals the slide's position;
- in the `.pptx`, the chrome most slides show is drawn once on the slide master; a layout whose header and footer are
  the master's shows them, and any other hides them and draws its own;
- each `.pptx` layout has a placeholder, in that layout's own type and ink, for every role its slides show: title, a
  body (or, on a look with a heading and at most one line under it, a subtitle), eyebrow, meta, and a varying header
  or footer. A role with no frame on the layout falls back to its title's ink, never the master's, so a slide added
  on a dark look in a light deck is light on dark;
- layouts are named after the look ("Title", "Content", "Divider", "Topic", "Closing", "Divider 2"); a divider is
  PowerPoint's section header.

Chrome whose ink hardly shows on its layout's flat ground (under 1.5:1) sits on something the slide's own picture
paints, such as a split slide's dark half, so it stays on the slide. A slide with no background in `deck.backgrounds`
keeps its own opaque picture and its own chrome, because a layout paints under the slide's picture.

## Theme

The `.pptx` carries the deck's theme, not Office's (`readTheme`, theme.ts): the theme fonts are the faces the deck's titles and
body are drawn in; the twelve theme colors are the body ink and ground (`dk1`/`lt1`, by role whatever their lightness, as the master's color
map reads them), the heading ink and a second ground (`dk2`/`lt2`), and six accents, the saturated colors the deck paints with most. The master's text styles and each layout's
title and body (or subtitle) placeholders are in the deck's own type, so a slide or text box added in PowerPoint looks like the
deck. Existing text keeps its explicit colors and faces: a theme switch could not recolor the slides' pictures. Every run also
states its weight, slant, caps and letter-spacing when they are off, so it never inherits a bold or all-caps master style.

A host that knows its palette passes it: `captureOfficeSlides(host, n, { palette: { dk1: 'var(--text-body)', accent1:
'var(--accent)', … } })` resolves each CSS color on every slide under its color scheme (`resolvePalette`) and returns the
colors most slides give as `theme`; put it in `deck.theme`, and it wins over what Calco reads, slot by slot. Lattice's palette is
`OFFICE_PALETTE` in `lib/core/office-export-policy.js`. The slide's foreground picture, when there is one, is locked against moving and
resizing; pictures of single objects are not, so a photo can be replaced or moved.

## Fonts

Calco does no font processing and holds no font policy. `prepareFonts(deck, host, onSkip)` lists the faces the deck's text draws with (`facesUsed`:
family, weight, slant, whether ligatures stay on, and `chars`, every character the deck draws in that face, capitals from `text-transform` and small
caps included) and asks your host for each one:

- `host.font(face)` returns the **finished** font: a static sfnt pinned to `face.weight` (a variable font must be pinned: an office suite draws a
  variable file at its default weight; HarfBuzz's `hb_subset_input_pin_axis_location` does it), with ligature features dropped when `face.ligatures` is
  false (`pinFeatures`), and cut to `face.chars` or whole, whichever your policy says;
- return `'system'` to embed nothing on purpose (the reader's office suite draws that text in its own font): Calco leaves the face out without a word;
- return `null` when you have no file for the face (a system font such as Arial): Calco leaves it out and `onSkip` hears `'unavailable'`;
- throw, and `onSkip` hears `'failed'` with the error and the other faces still embed.

A face whose license forbids embedding is left out too (`embeddingAllowed`, `'license'`). Lattice's own host reads its `font-embedding:` tiers through
`lib/core/office-export-policy.js` (`faceCut`); Calco never sees the words.

**Emoji.** `splitEmojiRuns(deck, family)` splits each text run at its emoji, naming the emoji run's family (and marking it `style.emoji`, so a line's
height still comes from its text), so a host can embed an emoji font like any other face. A color emoji font is often sliced by code point range and
one family is one file, so `family(sequence)` answers with the slice that holds every part of the sequence. Without the call the emoji stay in their
text runs and the reader's own emoji font draws them. **Check what your font is before you embed one.** A COLR v1 color emoji face (Noto Color Emoji
from Google Fonts) embeds fine and draws blank in LibreOffice 24.2, with or without a system emoji font, because the embedded family wins over the
fallback; a face an office suite can paint (COLR v0, SBIX, CBDT) is the one to embed. Lattice does not embed its emoji font in Office files for this
reason.

## Pictures

Calco is handed the pictures it writes. A slide is photographed by the host (PNG or JPEG bytes; `imageMime` names the part from the bytes), and which
encoding to take is the host's rule: Lattice's is `choosePicture` in `lib/core/image-policy.js`. `isContinuousTone(section)` is the one helper here, because
only a reader of the page can say whether a slide is photographic (a host asks it before it shoots, to pick the cheap order).

For the pictures Calco crops out of a slide itself (a photo, an icon), pass `captureOfficeSlides` `pictures`: `{ lossless, quality, toneBytes, flatBytes,
share }`, the instructions it encodes by. Leave it out and every crop is a lossless PNG.

Both formats embed the faces. The `.odp` carries them as TrueType. The `.pptx` carries them as
Embedded OpenType in `ppt/fonts/`; a regular or
bold face goes in its slot of the family's own name ("Playfair Display", flagged bold or italic by the run), and any
other weight becomes a family of its own ("Outfit SemiBold"), because PowerPoint's font slots are only
regular, bold, italic and bold italic. Only TrueType-outline faces are embedded in a `.pptx`; a
CFF face is named instead, so a reader without it sees a substitute.

## The PowerPoint package

`writePptx(JSZip, deck, outputType)` builds the whole OOXML package itself, as `writeOdp` builds
the `.odp`: the content types and relationships, the document properties, one slide master with
a layout for each look (`planMasters`), a notes master, the slides and their notes pages, the
fonts, and the media, one part per distinct picture, named by a hash of its bytes. Each master
has its own theme, the parts are in the order the ISO/IEC 29500 schema gives, and every shape id
is unique on its slide. `outputType` is JSZip's (`uint8array`, the default, `nodebuffer`,
`arraybuffer`, `blob`, `base64`); `buildPptx(JSZip, deck)` returns the zip unwritten.

What the browser drew comes out as PowerPoint's own objects: a card is a `p:grpSp` (or, when it
holds custom geometry, its members loose in paint order, because Apple's Office importer drops
custom geometry inside a group), the slide title is the title placeholder, the page number is a
`slidenum` field, small caps are `cap="small"`, and an icon that is an inline `<svg>` is an SVG
picture with its PNG as the fallback.

A picture-only deck is a deck whose slides have an `image` and no `frames`: Lattice's plain
`.pptx` is written that way, by the same function. Every text value goes through `xmlSafe`
(which strips the characters XML 1.0 forbids) and is then escaped.

Before 2026-11-15, Calco's `writePptx` took PptxGenJS as its first argument and JSZip as its fourth,
and Calco exported `tidyPptxPackage`, `embedPptxFonts`, `groupShapes`, `applyRoles` and
`uniqueShapeIds` to mend what PptxGenJS wrote. Those are gone: pass JSZip first. The package
version moves at its first publish.

## No dependencies

JSZip and the font pinner are passed in. `readSlide` and `restoreSlide` close over
nothing, so a headless browser can receive them as source.

## Limits

- Lines do not reflow: typing more text grows the box, not the layout.
- PowerPoint: weight is bold or not (600 and up is bold), and `text-transform` is applied to
  the text itself. Placement is measured in LibreOffice; PowerPoint is not verified.
- A `.pptx` opened in LibreOffice older than 24.8 (24.2.7 measured) ignores the embedded fonts and draws the text in its own substitute. A wider
  substitute (Inter for Outfit) runs a card's body lines past the card edge, because lines are fixed where the browser broke them and the text
  frames do not wrap. With the face installed on the machine the same file stays inside its cards (examples/focus-highlight-axes.md slide 8), and
  the `.odp` embeds fonts that this LibreOffice does use.
- No native charts, diagrams or equations.
- An inline chip (a code span, a mark) is a highlight on its words: its corners, border and padding are not
  carried, and it is opaque (its tint is blended over what is behind it).
- What cannot be a shape (a photo, a chart, an icon, a gradient scrim) is a picture of its own,
  cropped from the slide, placed in order among the shapes and grouped with its card
  (`ReadOptions.sprites`, `Shape.kind === 'picture'`). `captureOfficeSlides` does the whole capture (shared
  backgrounds, foreground, these crops) for any host that can `run` a function in the page and `shoot` a slide:
  the CLI (puppeteer) and the Studio (html-to-image) are two such hosts. A host that does not crop them gets one
  foreground picture instead, and a card that holds picture content stays in it.
  A picture that holds a box's own fill or edge and sits outside that box's text's card (a focused table
  column's tint and ring span every row, so no row holds them) and draws AFTER that card leaves that text
  free, drawn on top: the text paints over its own box, and in its row's group it would come out under the
  picture, right after the picture (`TextFrame.above`), so a shape painted later stays above it. Free text no longer moves with its row when the row is dragged. A picture drawn before the card (a
  gradient panel behind it) changes nothing.
- A focused table row's ring (`box-shadow: inset 0 W 0` and `inset 0 -W 0` on every cell, plus `inset W 0 0` on the first and `inset -W 0 0` on
  the last) is native lines, one band per cell edge, so it reads as one outline. A side band with no top and bottom band beside it (a focused
  column's) stays a picture of the whole column.
- An `outline` pulled in by its own width (`outline-offset: -W`, the focus highlight's card edge) is drawn as
  an inside stroke, replacing a border no wider than that band. Any other outline keeps its box a picture.
- The `.pptx` picture lock is markup only: PowerPoint's Lock honors it; LibreOffice does not.
  Google Slides and Collabora on iOS are not verified.

Design, measurements and the LibreOffice behaviors the writers work around:
[`engineering/decisions/2026-10-06-calco-office-export-library.md`](https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-10-06-calco-office-export-library.md).

## License

AGPL-3.0-only. The full text ships as `LICENSE` in the package.
