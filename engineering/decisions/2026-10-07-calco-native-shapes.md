---
status: in-progress
summary: Cards, pills, tags and rules as native shapes in Calco's editable .odp/.pptx instead of pixels in the slide picture. Measured on three decks; the owner picked option B on 2026-10-07 (labels that carry their text, plus cards with native shadows and rules as lines, each card grouped with its contents), and §7 records how it was built and what it measured.
---

# Calco: cards, pills and rules as native shapes (2026-10-07)

**Status: built, waiting on the owner's device check. The owner picked option B (§3) on
2026-10-07. §7 records the build: what the reader lifts and refuses, how each writer draws
and groups it, and the measurements.**

**The question.** The owner asked whether a card's corner tag in the editable export is a
real shape. Before §7 it was not. In Calco's editable `.odp` and `.pptx`, only the WORDS are editable:
every paragraph is a text box, laid over one picture of the slide with its text removed
(`2026-10-06-calco-office-export-library.md` §2). The tag's colored box, the card behind it
and the rule under the title are pixels in that picture. Drag the tag's text box and the
words move; the colored box stays where Chrome drew it.

This note measures which boxes on a real slide could become shapes, names the two problems
any answer has to solve, and puts four options with a recommendation.

## 1. What boxes a slide actually has

A census script (Appendix; method in §6) walked every element of every slide in
three decks, read its computed paint, and sorted it by what an office shape could carry.
"Plain" means a solid fill and/or a border that is the same on all four sides, one corner
radius, no gradient, no transform or filter.

| Box kind | card-tags (10 slides) | muted-tier (8) | jargon gallery (58) |
|---|---:|---:|---:|
| Holds only text, plain: a pill, chip or step label (and a striped table row) | 1 | 0 | 32 |
| Holds only text, one radius per corner: a flush card tag | 8 | 3 | 9 |
| Holds only text, plain, but its `::before`/`::after` also paints a box | 2 | 1 | 22 |
| Empty and plain: a legend swatch, a dot, a bar | 0 | 0 | 173 |
| A one-sided border and no fill: a rule, an accent bar, a table hairline | 10 | 20 | 87 |
| A fill plus a one-sided border: a card with an accent edge | 9 | 7 | 19 |
| A box with a shadow: most cards, some quotes | 16 | 2 | 92 |
| A plain container with no shadow | 2 | 2 | 7 |
| Stays a picture whatever we choose: gradient or image fill, transform, blend | 4 | 7 | 37 |

Three things this table says:

- **Cards are rarely "plain".** A Lattice card usually has a shadow (16 of card-tags' 27
  card-like boxes: the shadow, accent-edge and plain-container rows) and often an accent
  edge drawn as a one-sided border. So "cards as shapes" means shapes with native shadows,
  plus separate line shapes for accent edges.
  Both formats have outer shadows, but neither draws Chrome's blur exactly.
- **Labels are the clean case.** A pill or tag is one element, holds only its text, and has
  no children that paint. It maps to ONE office shape that carries its own text.
- **Rules are many and simple.** A one-sided border is a straight line, the easiest shape
  there is, and there are 87 on the jargon gallery alone.

## 2. The two problems every option must solve

### 2a. The box must leave the picture, or it leaves a ghost

A shape laid over the picture without removing the box from the picture looks right until
someone moves it: then the picture still shows the old box. So the reader has to hide the
box's paint before the screenshot, as it already hides text (`reader.ts`, "HOW TEXT IS
HIDDEN"), and restore it after.

The way to hide it without moving anything: set the element's own `background-color`,
`border-color` and `box-shadow` to transparent/none with `!important`, inline, and keep
every border WIDTH, so layout does not shift by a pixel. The reader already sets and
restores `!important` inline styles this way in its fallback color freeze (`freezeHide`).

What this cannot reach is a box painted by `::before` or `::after`: an inline style does
not apply to a pseudo-element. Those elements (row 3 of the table: 22 on the jargon
gallery) either stay in the picture, or the reader injects a scoped stylesheet keyed on a
marker attribute. The stylesheet works in both capture paths (puppeteer screenshots the
live page; html-to-image copies each pseudo-element's computed style), but it is a second
hiding mechanism, and the recommendation below leaves it for later.

### 2b. A card and its text have to move together

A card is a shape with text boxes on top. If they are loose, dragging the card leaves its
words behind, which is worse than today's picture, where nothing pretends to be movable.

- **ODP** has groups (`draw:g`). The `.odp` writer builds its XML by hand, so a group is a
  wrapper element.
- **PPTX** has groups (`p:grpSp`), but **PptxGenJS 3.12 has no API for them**: its only
  `p:grpSp` is the slide tree's root. A group would be written by post-processing the slide
  XML, as `tidyPptx` already post-processes it. That is a real piece of code: a group needs
  its own `a:xfrm` with child offsets, and every child's id stays unique.

A **label** needs neither: an office shape can hold text. PptxGenJS writes a text box with a
fill, a border and a preset or custom geometry (`addText` with `shape`, `fill`, `line`,
`rectRadius`, or `custGeom` points). The `.odp` writer can write `draw:custom-shape` with a
`text:p` inside. The pill and its word are one object, so moving or resizing one moves both.

One more limit: PptxGenJS's `rectRadius` sets one radius for all four corners. A flush tag
(rounded on one or two corners only) needs `custGeom` points, which PptxGenJS supports, or a
preset like `round2SameRect` whose second adjustment value PptxGenJS cannot set.

## 3. The options

### A. Labels only: a pill or tag becomes one shape that carries its text  — RECOMMENDED

The reader marks a block it already reads as a label when the block holds only text, no
child paints, and its own paint is plain (any radius per corner). The writers draw that
block as one shape: its fill, its border, its corners, its text inside it at the place the
text is now. The box is hidden from the picture by §2a's inline override.

- **Lifts**: on the measured decks, up to 9 of card-tags' 11 tags, 3 of muted-tier's 4, and
  41 of the jargon gallery's 63 text-only boxes (the rest paint with `::before`/`::after`
  and stay pictures). "Up to", because the census counts a striped table row as text-only,
  and A, which works on the blocks the reader already reads, would leave a row's fill in
  the picture.
- **Costs**: one more classification in the reader, a shape type in `types.ts`, and a
  shape-with-text in each writer (`draw:custom-shape` in `odp.ts`, `addText` with a shape in
  `pptx.ts`). No grouping. No new hiding mechanism.
- **Risks**: the label's text has to sit at the same place inside the shape in three
  readers (LibreOffice, Google Slides, Collabora iOS), now with the shape's insets in play.
  Measured before for plain boxes; untested for shapes.
- **Answers the owner's question directly**: the corner tag becomes a real shape.

### B. A, plus containers and rules, grouped

Everything in A, then: one-sided borders become line shapes; plain containers become
shapes with a native shadow; each card is grouped with its shapes and text boxes (`draw:g`
in the `.odp`; `p:grpSp` written by post-processing in the `.pptx`).

- **Lifts**: on the jargon gallery, A's 41 labels plus up to 87 rules and up to 118 cards
  (plain, accent-edged and shadowed together); muted-tier and card-tags become almost
  entirely native.
- **Costs**: about three times A's code. The reader learns paint order (a card under a
  rule under a pill), the `.pptx` gets a grouping post-processor, and shadows are matched
  by eye in three readers, since none draws Chrome's blur.
- **Risks**: a card that lifts while its icon or chart stays in the picture leaves that
  icon behind when the card moves. B must either refuse to lift a container with any
  picture-only child, which on the census refuses most charts' cards, or accept the ghost.

### C. B without grouping

B's shapes, loose. About a third less code than B, and dragging a card leaves its words
behind. Not recommended: it makes the file look more editable than it behaves.

### D. Keep everything but the text in the picture

Today's behavior. It costs nothing and answers the owner's question with "no".

## 4. Recommendation (as proposed; the owner chose B, see §7)

**A now, built so B can follow.** It answers the question the owner asked (the tag), it is
the case with no grouping and no ghost problem, and its pieces (a shape in the deck model,
the inline paint override, a shape writer in each format) are what B needs first anyway.
After A ships and is checked on the owner's devices, B becomes its own decision with real
numbers behind it: how close each reader draws a shadow, and how many cards hold a
picture-only child.

## 5. What stays a picture under every option

Gradients and image fills, textures (`--cat-N-texture`), sketch strokes, anything
transformed, filtered or blended, SVG and MathML (charts and diagrams), and any box painted
only by `::before`/`::after` (until the scoped-stylesheet hide exists).

## 6. How the census was taken, and how the build would be checked

The census script runs in headless Chromium over each deck's `.html` export
(`node dist/lattice-emulator.js examples/<deck>.md <deck>.html`). For every element of
every `section` outside SVG and MathML that is visible and at least 2px wide, it reads
`getComputedStyle` for the background, the four borders, the four radii, the shadow,
transform, filter and blend, and the paint of its `::before`/`::after`. A box counts once,
under the first row it matches in the table's order of exclusion (gradient, transform,
shadow, dashed border, one-sided border, per-corner radius, plain).

Whichever option is picked, the build is checked as the followup asks: card-tags and
muted-tier exported both ways, opened in LibreOffice, Collabora on iOS and Google Slides,
with a shape resized in each; a tier 1 checker, because the reader and both writers change;
and dark and light renders to the owner before merge, because the export bytes change.

## 7. What was built (option B)

The owner picked B. It shipped as one slice, because A's pieces (a shape in the deck model,
the inline paint hide, a shape writer in each format) carry B with little more code once
the reader knows paint order.

**The reader** (`reader.ts`, `readSlide(section, { hide: true, shapes: true })`, off unless
asked) lifts a box when its paint is plain: a solid fill, solid borders, circular corner
radii (a `%` resolved, scaled down as CSS scales them), at most one outer shadow (and only
under an opaque fill: an office suite draws a shadow through a translucent one), no
`border-image`, and no transform, filter, mask, clip or blend on it or any ancestor. A fill
clipped to the padding or content box (`rule: accent` draws its short rule as a padded
segment) is lifted at the box it paints; with borders as well it stays a picture. Two shadow shapes are read as
borders, not shadows: an inset ring (`inset 0 0 0 1px`, how `tag-plain` outlines a tag
without moving its text) is the outline; any other inset or spread keeps the box a picture.
A border the same on most sides is the box's outline; a side that differs (an accent edge)
is a `line` along the middle of its band, and on a rounded box each end wraps 45° of the
corner arc, where Chrome hands the corner to the next side.

**What keeps a box in the picture: the one rule.** A shape is drawn over the picture, so it
may not cover anything the picture still holds that the slide painted above it. The reader
lists what the picture keeps: text it did not read, SVG and MathML, images, list markers,
every `::before`/`::after` that paints (at its own box when it is absolutely placed), and
every box it refused. A lifted box that overlaps one of them, painted above it (compared by
stacking level below their common ancestor, then tree order; a level counts positioned
boxes, a z-indexed flex or grid item, and anything with opacity, a transform, a filter or
isolation, and an absolutely placed pseudo-element has its own), is refused, becomes picture content itself, and the check
runs again until nothing changes. That one rule covers §2a's ghost and §3B's risk: a card
holding an icon, a chart, a counted `::before` tag or a bulleted list stays a picture whole,
with its tag and rules. A z-index −1 backdrop (the `finish-*` washes) paints below, so the
boxes over it still lift.

**Groups.** A box that covers its area (a fill, an outline or a shadow) is a card;
everything lifted inside it (its rules, its labels, its paragraphs) carries its index as
`group`. Groups are flat: the outermost card wins. A box with no shadow holding exactly one
paragraph of its own and nothing else lifted is a **label**: it carries that text inside
it (`Shape.text`), one object.

**The writers** share `shapes.ts`: the outline as a path (a box inset by half its stroke,
because both formats straddle the path; a uniform radius is a preset so a resized shape
keeps round corners), where a label's text sits inside its shape (insets from the edge its
alignment grows from; when an inset would be negative, the shape and a text box are grouped
instead), and the draw order (each group whole where its card first paints, shapes then
text; text that belongs to no group on top). The `.odp` writes `draw:rect` (with
`draw:corner-radius`), `draw:custom-shape` (per-corner paths), `draw:line`, and `draw:g`.
The `.pptx` writes `roundRect`/`rect`/`line` presets and `custGeom` through PptxGenJS, then
`tidyPptx` wraps each tagged run of `<p:sp>` in a `p:grpSp` whose child frame equals its
frame, so every member keeps the coordinates PptxGenJS gave it (`groupShapes`).

**Measured** (LibreOffice 24.2 render of the `.odp` against the Chrome PDF, mean absolute
gray difference per slide at 1280×720, lower is closer):

| Deck | Mode | Text only | With shapes | Shapes lifted |
|---|---|---:|---:|---:|
| card-tags (10) | light | 2.55 | 2.40 | 41 |
| card-tags (10) | dark | 2.34 | 2.23 | 41 |
| muted-tier (8) | light | 2.62 | 2.47 | 39 |
| muted-tier (8) | dark | 2.43 | 2.31 | 39 |
| jargon gallery (58) | light | 3.22 | 2.99 | 370 |

Every slide is as close or closer, except jargon slide 26 at this scale (3.40 → 3.56):
that deck is 3840px wide, its table hairlines are 1px, and poppler draws a stroked line at
least one device pixel wide where Chrome's PDF fills a quarter-point rectangle. At the
deck's own 3840×2160 the slide measures 1.68 → 1.70, the same ink in one crisp pixel
instead of two faint ones. Each `.pptx` validates against `pml.xsd` (xmllint) and the Open
XML SDK 3.3.0 with zero errors. In LibreOffice, driven through UNO, moving a card's group
moves its tag, its accent rule and its text with it and leaves a clean slide; widening a
label keeps its word at its inset.

**A known limit of the draw order.** A group is drawn whole where its card first paints. If
a static box that comes after a card in the tree overlapped a positioned child of that card,
Chrome would paint the box between the card and the child; the office file draws it above
both. It needs two flow boxes to overlap, and no shipped deck does; the independent check
named it and did not reproduce it.

**What B does not reach yet.** A tag drawn by `::before` (`content: counter(card)`, the
numbered cards; `STEP 01`; `RECOMMENDATION`): the reader cannot read pseudo-element text,
so the tag and its card stay a picture. A list card (its markers are pseudo-elements). The
sketch finish (elliptical radii). These need the scoped-stylesheet hide of §2a and a way to
read a counter's value, a separate decision.

## Appendix: the census script

Run from the repository root: `node box-census.cjs $PWD/card-tags.html …` with
`CHROME_PATH` set (the SessionStart hook exports it).

```js
// Census of painted boxes on every slide of a Lattice HTML export: which could be a native shape.
const puppeteer = require('/home/user/lattice/node_modules/puppeteer');
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
  for (const file of process.argv.slice(2)) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto('file://' + file, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 1500));
    const r = await page.evaluate(() => {
      const tally = {}; const ex = {};
      const add = (k, el) => { tally[k] = (tally[k] || 0) + 1; ex[k] = ex[k] || (el.className && String(el.className).slice(0, 60)) || el.tagName; };
      const visible = (c) => c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c);
      const paintOf = (cs) => {
        const sides = ['Top', 'Right', 'Bottom', 'Left'].map((s) => ({ w: parseFloat(cs['border' + s + 'Width']), c: cs['border' + s + 'Color'], st: cs['border' + s + 'Style'] })).map((b) => (b.w > 0 && b.st !== 'none' && b.st !== 'hidden' && visible(b.c) ? b : null));
        return { bg: visible(cs.backgroundColor), img: cs.backgroundImage !== 'none', sides, shadow: cs.boxShadow !== 'none', radii: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius] };
      };
      for (const section of document.querySelectorAll('section')) {
        for (const el of section.querySelectorAll('*')) {
          if (el.closest('svg, math')) continue;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const rect = el.getBoundingClientRect(); if (rect.width < 2 || rect.height < 1) continue;
          const p = paintOf(cs);
          const n = p.sides.filter(Boolean).length;
          if (!p.bg && !p.img && !n && !p.shadow) continue;
          const pseudo = ['::before', '::after'].some((ps) => { const q = paintOf(getComputedStyle(el, ps)); return getComputedStyle(el, ps).content !== 'none' && (q.bg || q.img || q.sides.some(Boolean)); });
          const uniformBorder = n === 0 || (n === 4 && p.sides.every((b) => b.w === p.sides[0].w && b.c === p.sides[0].c && b.st === p.sides[0].st));
          const uniformRadius = p.radii.every((x) => x === p.radii[0]);
          const solidBorder = p.sides.every((b) => !b || b.st === 'solid');
          const transformed = cs.transform !== 'none' || cs.filter !== 'none' || cs.mixBlendMode !== 'normal';
          let k;
          if (p.img) k = 'stays: gradient or image fill';
          else if (transformed) k = 'stays: transform/filter/blend';
          else if (p.shadow) k = 'stays?: box-shadow';
          else if (!solidBorder) k = 'stays?: dashed/dotted border';
          else if (!uniformBorder && n > 0) k = (p.bg ? 'shape + rule(s): fill with one-sided border' : 'rule(s) only: one-sided border, no fill');
          else if (!uniformRadius) k = 'per-corner radius (flush tag)';
          else k = 'plain box: solid fill and/or uniform border';
          if (pseudo) k += ' [+ pseudo paints]';
          // a pill: no painted element children, holds text
          const kidsPaint = [...el.querySelectorAll('*')].some((c) => { const q = paintOf(getComputedStyle(c)); return q.bg || q.sides.some(Boolean); });
          if (k.startsWith('plain') || k.startsWith('per-corner')) k += kidsPaint ? ' · container' : (el.textContent.trim() ? ' · holds only text (pill/tag)' : ' · empty (swatch/bar)');
          add(k, el);
        }
      }
      return { slides: document.querySelectorAll('section').length, tally, ex };
    });
    console.log(`\n${file.split('/').pop()} — ${r.slides} slides`);
    for (const [k, v] of Object.entries(r.tally).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}   e.g. ${r.ex[k]}`);
    await page.close();
  }
  await browser.close();
})();
```
