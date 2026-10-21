---
status: in-progress
summary: Calco now lifts pseudo-elements (dots, rings, accent bars, mask icons, counter text), linear gradients, sized one-color layers and stacked shadows into native shapes, nests a pill's shapes inside its card's group, reports what it approximated, and holds a refusal-count ratchet. Measured on the 120-slide gallery in LibreOffice; PowerPoint, Google Slides and Collabora were not reachable.
---

# Calco: lift what can be lifted, say what was approximated (2026-10-21)

**Status: built and measured in LibreOffice (§4, §6). The Studio runs the same capture as the CLI (§9).
PowerPoint, Google Slides and Collabora on iOS are UNVERIFIED.**

**The question.** The owner's rule: if a slide's background is an image it bakes the finish, the
background and the decorative layer, and everything else is a real shape. A pill is a real pill
with the same properties and editable text. This note records how far the reader goes toward
that rule, and where it stops.

## 1. The model

Calco reads the page Chrome laid out (`readSlide`) and rebuilds it as native objects:

1. **Background layer.** The slide's own paint goes on a shared master page (`.odp`) or layout
   (`.pptx`) (`2026-10-17-calco-shared-backgrounds.md`).
2. **Shapes.** Each painted box becomes a shape: rectangle, rounded rectangle, ellipse, line or
   path. Text rides inside its box as a label.
3. **Groups.** A card and what it holds is one group. A pill inside a card, with its dot, ring and
   mark, is a group inside the card's group (`Shape.sub`; nested `p:grpSp` / `draw:g`).
4. **Pictures.** What cannot be a shape (a photo, a chart, an icon, a box with a paint Calco cannot
   draw) is cropped from the slide as pictures of its own (§6), one per cluster, in paint order
   among the shapes. The CLI export makes them; a slide whose ink they do not cover, or that reads
   its backdrop, keeps one transparent foreground picture instead.

**The one rule** (from `2026-10-07-calco-native-shapes.md` §7): a shape drawn over the picture
may not cover picture content painted above it. When a box would, the fix is to lift more of what
covers it, never to loosen the rule.

## 2. What the reader lifts now

| CSS | Becomes |
|---|---|
| `::before` / `::after` with a flat paint (dot, accent bar, ring) | a shape, probed because a pseudo has no DOM rectangle |
| `mask` with a curated inline SVG token (`--mark-*`, `--shape-*`) | a stroked or filled path with round caps |
| `box-shadow: 0 0 0 Wpx` | a stroke-only box one ring wider |
| `content` text, with `counter()` / `counters()` worked out | real text, as if the element were there |
| `linear-gradient(...)` with 2+ stops, angle or `to side` | `a:gradFill` (`.pptx`), `draw:gradient` plus an opacity gradient (`.odp`) |
| `linear-gradient(C, C)` sized and placed (an accent rule) | a flat fill of its tile, or a second shape above a colored box |
| a gradient under an opaque or clear border | a gradient over the border box (stops move at most the border's width) |
| an inline chip (a code span, a mark) | a highlight on its words (`TextStyle.highlight`; **approximated**, §3) |
| two outer shadows | the widest one (**approximated**) |
| `backdrop-filter` on a translucent fill | the translucent fill (**approximated**) |

A fully transparent gradient stop takes its neighbor's color, so an office suite that blends
channels separately does not fade through black.

## 3. What was approximated, and how the user is told

`ReadResult.approximated` lists one entry per lifted shape and kind (`stacked-shadow`,
`backdrop-blur`, `chip-highlight`). `captureSlides` passes it on, `writeOffice` tallies it, and `lattice` prints
`; approximated: 2 stacked shadows, 1 frosted fill` in the export line. The choice was the owner's:
approximate and say so, rather than leave the box a picture.

**Inline chips.** The first version lifted a chip as a rounded rectangle behind its paragraph. The owner
found that bad: the shape does not move or wrap with the words, and a chip that wraps is two boxes. A chip is
now a text highlight on its runs (`a:highlight` in `.pptx`, `fo:background-color` in `.odp`), so it moves,
edits and wraps with the text. The tint is blended over what is behind it (a highlight is opaque), and text
with its own transparency is blended over the highlight, because LibreOffice drops a run's background when
the run also has a text opacity. The chip's corners, border and padding are lost. A chip whose words stay in
the picture (a paragraph the reader cannot place, such as a token wider than its line) stays in the picture
too. Measured in LibreOffice: the highlight pixel matches Chrome's chip within one level on a light and a dark
slide.

**Decorative text is not read.** A finish's monogram or numeral is generated text on the slide's decorative
layer, which the background capture already draws; the reader skips it, so it no longer appears twice.

## 4. Measured (gallery, 120 slides, LibreOffice 24.2)

| Step | Refusals | Shapes | `.odp` vs Chrome (mean abs diff) |
|---|---:|---:|---:|
| Before pseudo lifting | 447 | | 2.61 |
| After pseudo lifting + counters | 112 | 1,723 | 2.54 |
| After gradients and sized layers | 68 | 1,778 | 2.53 |
| After the review fixes (§6) | | 1,717 | 2.53 |

A 5-shape gradient test (two stops, three stops, a 135° fade, a tall box and a 6 px bar) went from
5.40 to 2.48 in the `.odp` once multi-stop gradients drew, and matches Chrome in the `.pptx`. The
`.pptx` validates against the PowerPoint rules (`validate.py`).

## 5. The refusal ratchet

`test/integration/export/calco-refusals.test.js` renders five demo decks with the real CLI, reads
every slide in Chromium with `diagnose`, and fails if a deck's refusals exceed
`calco-refusals.budget.json` or its lifted shapes fall below it. It runs in the integration tier
(19 s for five decks), not as a new CI job or hook. Re-measure with `CALCO_REFUSALS_BLESS=1` in a PR
that justifies the numbers.

## 6. Pictures of what cannot be a shape

The reader keeps a list of picture content: drawn elements (`img`, `svg`, `canvas`, `math`), boxes it
refused, list markers, pseudo-elements it could not lift, text it did not read. With `sprites` it:

1. **Clusters** the items: each item's box, grown by its shadow or blur reach and 8 px, and every
   pair of boxes that overlap merged until none do. Each pixel of the foreground belongs to one cluster.
2. **Orders** each cluster among the shapes by the same paint-order test the reader already used for
   "is this item above that box" (`above`, which knows when the box is a pseudo-element: a `::after`
   scrim is above its element's picture, a `z-index: -1` glow is below its element). A box the cluster is
   partly above and partly below cannot be drawn in either order, so it joins the picture. This replaces the old rule that any lifted box under picture
   content stays a picture: a card holding an icon is now a shape with the icon drawn above it.
3. **Groups** a picture with the card it sits in (`Shape.group`), as for any shape.

The host (`captureSlides`) takes the transparent foreground capture it already took and crops the
pictures from it in the page (`cropPictures`): no second render per picture. Each crop shrinks to its
ink. A fully opaque crop is a JPEG when that is much smaller (same rule as the slide picture, §
`2026-10-21-slide-pictures-png-or-jpeg.md`); a crop with a few clear pixels (a photo next to a thin
rule) is a JPEG of the largest opaque rectangle plus a PNG of each strip around it, because a JPEG
would paint the clear pixels black. If the capture has ink outside every crop (more than 0.02% of the
slide) it is one more picture, placed first, with the other pictures' boxes cleared out of it: nothing the
foreground holds is dropped. Only a slide whose crop throws, or that reads its backdrop, keeps one
whole-slide picture, and the export line counts those. A writer draws a card's members together where the
first one paints; a member that another shape paints over is drawn in its own place instead
(`drawOrder`), so a group never puts a picture under a shape that is above it.

Measured:

| | Before | After |
|---|---:|---:|
| Gallery `.odp` size | 10.8 MB | 8.3 MB (an independent run in another sandbox measured 10.2 MB; the cause is not found) |
| Gallery pictures / slides on a whole-slide picture | 120 / 120 | 121 / 0 |
| Gallery `.odp` vs Chrome | 2.53 | 2.54 |
| 35-slide photo deck `.pptx` (owner's) | 15.0 MB, 35 slides on a whole-slide picture | 13.5 MB, 44 pictures, 0 whole |
| Export time, editable (independent runs) | `accent-finishes` 5.2 s; gallery 127 s | 11 to 15 s; 321 s (2 to 2.5 times; +0.5 to +1.6 s a slide) |
| A deck of small photos (`sample-images`, `.pptx`) | 877 KB | 1.38 MB: a crop is an RGBA PNG at 2x and stays PNG under 600 KB |

The size win holds for large photos; a small photo crop is a lossless PNG and can be larger than the one slide picture it replaced. The photo deck's media is mostly its 21 layout backgrounds (a photo per slide, shared where equal);
its pictures are two photos at 330 KB each as JPEG (they were 2.4 MB PNGs while a thin rule beside
each made the crop non-opaque).

An independent check of the first version found six defects, each now a fixture in
`test/integration/export/calco-sprites-order.test.js` (and one in `shapes.test.js`): the order test
ignored pseudo-elements (a scrim under its photo, an accent bar under its card's picture, a glow over
its card); `opaqueCore` looked only at a crop's edges, so a frame with a clear middle became a JPEG with
a black middle; ink outside every cluster (a column rule) was dropped; a second read after a fallback
exported a "Content clipped" pill; a group drew its picture under a shape above it; and splitting or
dropping a picture left stale `group` indexes that merged unrelated shapes. Correct ordering costs
lifted shapes: `backdrop-register` now refuses 47 boxes (was 41) and lifts 12 (was 18), because boxes
the old order wrongly kept as shapes are now left in the picture.

## 7. Still refused, and why

- **Stacked-edge shadows** (negative spread, `kanban-card`): dropping them loses the look; an
  office shadow cannot draw them.
- **Radial gradients, gradient scrims over photos, inner glows, dashed borders, elliptical radii on
  tilted cards, masks that are not a plain path.** With pictures these are a picture of their own,
  not a hole in a card.
- **A rule that follows a rounded corner** (`lat-code`'s bottom line).
- Charts, diagrams, equations and photos are pictures by design.

## 8. Found, not fixed here

The `.pptx` writes a heavy face as the family "Playfair Display Bold". LibreOffice ignores the
`.pptx`'s embedded fonts, so a title falls back to a sans face there; the `.odp` is unaffected.
That is why the gallery `.pptx` scores about 7.4 against 2.5 for the `.odp`. It predates this
work and is a decision about how weight is named per target app.

## 9. Not verified

PowerPoint, Google Slides and Collabora Office on iOS. They run different engines than the one
measured here.

The Studio (`docs/src/components/studio/export/deck-export.js`) and the CLI run one capture:
`captureOfficeSlides` (`docs/src/lib/calco/capture.ts`) decides what each photograph is (the shared
background, the foreground, the cropped pictures) and a host gives it two verbs, `run` and `shoot`.
The CLI's host is puppeteer; the Studio's is html-to-image in the page. Measured on the real Studio
(Playwright, Chromium), against the CLI on the same decks, mean abs diff to Chrome in LibreOffice:

| Deck | Studio `.pptx` | CLI `.pptx` | Studio `.odp` |
|---|---:|---:|---:|
| `accent-finishes` | 5.1 | 5.7 | 2.0 |
| `card-tags` | 4.8 | 5.4 | 2.4 |
| `sample-images` | 3.6 | 4.3 | 1.3 |
| a 35-slide photo deck | 12.4 | 13.3 | 6.4 |

Every Studio `.pptx` passes the full ISO schema check and `validate.py` with no duplicate shape ids.

Two costs. Time: `accent-finishes` takes 9.7 s in the Studio (7 s before this capture, 7.5 s in the CLI);
the 35-slide deck takes 50 s (about 45 s before). Size: 13.9 MB against 12.7 MB for the CLI. The Studio's
html-to-image cannot composite a slide that reads the paint behind it (a blend, a backdrop blur) the way
Chrome does, so its three photographs never add back up; the Studio passes `backdrop: 'whole'` and keeps one
picture for such a slide without shooting its layers. Without that the 35-slide deck took 90 s and 42 MB.

## 10. What the validators prove, and what they do not

`validate.py` (the PowerPoint-rules check used for this branch) validates, by an independent reading of its source, against the XSD only the parts
whose folder it maps (`ppt/`), and checks slides, layouts and masters with a short denylist; it passed a file
whose `a:rPr` children were out of order, which the full ISO 29500 transitional XSD rejects. The branch's output
passes the FULL XSD on every slide, layout and master part of 24 decks (an independent run), so the schema claim
holds, but not because of `validate.py`. Neither check opens PowerPoint.

Both are now a harness in the repo, not a scratch script: `test/conformance/office/office-conformance.js` (run it on any file with
`npm run conformance:office -- deck.pptx deck.odp`) holds the full-schema check over the vendored XSDs
(`test/conformance/office/schemas`), the unique-shape-id rule, Microsoft's Open XML SDK validator
(`tools/office-conformance/openxml-check`, .NET; the schema plus Office's semantic rules) and the `.odp` structure checks. It runs
on five exported decks in `test/integration/export/office-conformance.test.js`, each check with an arm that must fail (a misordered
child, a repeated id, an undeclared attribute, a missing master page, a compressed mimetype), and on the Studio's real download in
`docs/e2e/studio-office-export.spec.ts`. The SDK validator passes every deck and flags the file `validate.py` passed. Two things are only inferred: that
PowerPoint tolerates the constructs LibreOffice reads (gradient angle on non-square boxes, `a:highlight`, a
`p:pic` inside a nested `p:grpSp`, a layout image background, slide-number fields), and that Collabora's newer
engine reads the `loext:` gradient and opacity stops. The shape ids on a slide are now unique (PptxGenJS wrote
id 25 on every slide-number placeholder).

## 11. Gaps found in review, and how each closed

Each of these was found in review and fixed in the same PR, with a fixture in
`test/integration/export/calco-redteam.test.js`.

- **Hidden text under an opaque box or picture** is no longer read as live text, and no longer left as picture ink:
  `hiddenUnderOpaque` hit-tests three points, and the dropped text is hidden from the capture like read text.
  Checked on `card-tags` slide 7, where a panel covers the page number: `main` exported a phantom "7" on top of the panel.
- **An opaque highlight over a backdrop layer's grid or glow** is not drawn: a chip that overlaps the decorative layer
  stays in the picture (`backdrop-register` refusals 40 → 47, all `covered` / `wrapped-inline`; the ratchet is re-blessed for it).
- **A shape reaching into a thick rounded border** is clipped against the padding box and its inner radii.
- **A `::before` with a z-index and a static `::after`** of one element are ordered by level, not by side.
- **Two backgrounds that differ only by a very faint watermark** may still share one master page. This is not a
  defect: the backgrounds are JPEG-quantized, so a mark that faint is absent from the export either way. Tried at full
  resolution and reverted.

Cost, measured on this machine: `accent-finishes` exports in 7.5 s (`main`: about 5.2 s); the foreground capture uses
`optimizeForSpeed` because each picture is re-encoded from it. A photograph under the flat-size threshold is a JPEG
(`photo`), so `sample-images` is 839 KB (`main`: 877 KB).
