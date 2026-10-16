---
kind: library
name: Calco
order: 7
promise: Turn any web slide into a PowerPoint you can edit.
intro: Calco reads a slide laid out in a browser and writes it as a PowerPoint or LibreOffice file where every paragraph is a real, editable text box in the slide's own font. The design stays faithful, because everything a text box can't reproduce stays in a picture underneath.
group: Sharing and exporting
inLattice: Writes the editable PowerPoint and LibreOffice exports.
useWhen: You build slides, reports or dashboards in HTML, and someone needs the PowerPoint so they can fix one number the night before.
mark: /calco-mark.svg
facts:
  - { k: Package, v: '@laticent/calco' }
  - { k: Status, v: Coming to npm with Lattice 1.0 }
  - { k: Runs in, v: The browser to read; anywhere to write }
  - { k: Dependencies, v: None (you pass in JSZip and PptxGenJS) }
  - { k: License, v: AGPL-3.0 }
reference:
  - label: The README
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/calco/README.md
    note: What it reads, fonts and pinning, and its limits.
  - label: The deck types
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/calco/types.ts
    note: The plain data the writers take.
  - label: Lattice's host
    href: https://github.com/Laticent/lattice/blob/main/lib/export/office-export.js
    note: A complete, real integration — fonts, pinning and both writers.
  - label: Why we built it
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-10-06-calco-office-export-library.md
    note: The design note, with the measurements against the alternatives.
---

## The problem

Teams build slides, reports and dashboards in HTML, because that's where their tools live. Then someone asks: *"Can you send me the PowerPoint? I need to fix one number."* Take a board deck made in a web tool, and a CFO who wants to change "Revenue held" to "Revenue grew" the night before the meeting.

The usual ways to make that file each fail differently:

- **One screenshot per slide** looks right, and nothing can be edited.
- **Converting through PDF** needs an office suite installed on the exporting machine, can't run in a browser, and swaps the fonts. On a four-slide test deck, it turned the serif headings sans-serif.
- **Rebuilding the slide from its source**, element by element, means re-implementing a browser's layout engine — line breaks, font fallback, letter-spacing, every CSS effect. Lines break in different places, and boxes drift.
- **Variable web fonts break in office apps.** An office app draws a variable font at its default weight, so a semibold heading turns regular.

## The idea

Don't rebuild the slide. **Read what the browser already drew.**

- **Read the words where they landed.** Calco collects every visible word, groups them into paragraphs, and keeps each line break exactly where the browser put it — with the real font, weight, size, color, letter-spacing and decoration.
- **Lift the text, keep a picture of the rest.** Calco can hide exactly that text and nothing else, so your screenshot tool captures a clean background. Charts, rotated text and gradients stay in the picture on purpose.
- **Write real office files.** Each slide becomes the picture, with a text box over it for every paragraph — plus speaker notes and alt text. Plain boxes and rules can come out as native shapes too.
- **Bring the fonts along.** Calco embeds every font face the text uses, so the file looks right on a machine that doesn't have them. A variable font is first pinned to one fixed weight, with every character kept, so the reader can type new words in it.
- **Your libraries, your versions.** Calco has no dependencies of its own. You pass in JSZip and PptxGenJS, so it uses the versions your app already has.

## How to use it

Install it beside the two libraries it writes with:

```sh
npm install @laticent/calco jszip pptxgenjs
```

> Calco publishes to npm with Lattice 1.0. Until then it lives in the Lattice repository at `docs/src/lib/calco`.

In the browser, read a laid-out slide, capture its background, and write the file:

```ts
import { readSlide, restoreSlide, writePptx } from '@laticent/calco';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';

const read = readSlide(slideElement, { hide: true }); // text → frames; the text is now hidden
const image = await screenshot(slideElement);         // your capture: html-to-image, Puppeteer, …
restoreSlide(slideElement);                           // put the text back

const deck = { width: read.width, height: read.height, slides: [{ image, frames: read.frames }] };
const pptx = await writePptx(PptxGenJS, deck, 'uint8array', JSZip); // pass JSZip so fonts embed
```

The writers also work on their own, in Node, from slide images you already have:

```ts
import { writeOdp } from '@laticent/calco';
import JSZip from 'jszip';

const odp = await writeOdp(JSZip, {
  width: 1280, height: 720, title: 'Q3 review',
  slides: [{ image: pngBytes, frames: [], notes: 'Say this', description: 'Title slide' }],
});
```

| Call | What it gives you |
| --- | --- |
| `readSlide(element, { hide })` | The text of a laid-out slide, as frames; optionally hides it |
| `restoreSlide(element)` | Puts back what `readSlide` hid |
| `prepareFonts(deck, { load, pin })` | The font faces to embed, pinned to fixed weights |
| `writePptx(PptxGenJS, deck, 'uint8array', JSZip)` | A PowerPoint file |
| `writeOdp(JSZip, deck)` | A LibreOffice / OpenDocument file, fonts embedded |
| `tidyPptxPackage(JSZip, bytes)` | Repairs a `.pptx` you built with PptxGenJS yourself |

## Where else it fits

- **Any HTML slide or presentation tool** that wants an "Export to PowerPoint (editable)" button — in the browser, or in a headless browser on a server.
- **Report and dashboard exports**: a web report rendered at slide size becomes an editable file for people who live in an office suite.
- **Clean picture decks** from slide images you already render, with notes and alt text.
- **Fixing PptxGenJS output**: `tidyPptxPackage` repairs three schema errors that PptxGenJS writes, and changes nothing else.
- **Open-format archives**: `.odp` files with embedded fonts, for organizations that require OpenDocument.

## How Lattice uses it

Lattice's editable office export runs on Calco in two places. The **command-line tool** writes every `.odp`, and with `--editable` it writes PowerPoint and LibreOffice files with real text boxes, handing Calco the deck's fonts and a font pinner. The **Studio**, Lattice's editor in the browser, does the same, reading and hiding each slide's text during capture. Lattice's picture-only PowerPoint export also runs its output through Calco's repair step.

## What it doesn't do

- **Text doesn't reflow.** Type more words and the box grows; the layout around it stays put.
- **Charts, diagrams and equations stay pictures.** Their text isn't lifted.
- **PowerPoint is less tested than LibreOffice.** Placement is measured in LibreOffice. In PowerPoint, a weight is bold or not, and only TrueType fonts embed.
- **It doesn't render HTML.** It reads a page a browser already laid out, and the screenshot is yours to take.
