---
status: in-progress
summary: Options for making cards, pills, tags and rules native shapes in Calco's editable .odp/.pptx instead of pixels in the slide picture. Measured on three decks; recommends label shapes first (a pill or tag becomes one shape that carries its own text), built so containers and rules can follow. The owner picks before any code.
---

# Calco: cards, pills and rules as native shapes (2026-10-07)

**Status: built, pending the owner's look. The owner picked option B on 2026-10-07** (labels,
then cards and rules, grouped with their text). It was built in three slices: labels (§7),
rules (§8) and cards (§9). §4's recommendation of A alone stands as the
reasoning the owner weighed.

**The question.** The owner asked whether a card's corner tag in the editable export is a
real shape. It is not. In Calco's editable `.odp` and `.pptx`, only the WORDS are editable:
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

## 4. Recommendation

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

## 7. Slice 1 as built: labels (2026-10-07)

The owner picked B. Its first slice is A's labels, built so the later slices reuse every
piece:

- **Reader** (`reader.ts`, `labelShape`). A frame becomes a label when its own block paints
  a solid fill and/or one solid border the same on all four sides, any corner radii, and
  nothing else: no image or gradient, border image, shadow, outline, tilt, blend, opacity
  (its own or an ancestor's), `::before`/`::after` content or list marker, background
  clipped short of the border box, scale apart from the slide, or child that paints a box
  or is a picture. And every word inside it must be its own paragraph's: a card whose body is
  a paragraph of its own, or a box holding text the reader left in the picture (a clipped
  child), stays a picture, or the body would sit outside the group, or the left-behind text
  would be hidden with the fill. (The checker on this slice found all three.) The frame carries the border box,
  fill, stroke and four radii as `shape` (`types.ts`). Radii follow CSS: each corner's two
  radii are scaled down together when adjacent corners would overlap, then the smaller is
  kept (an office corner is circular, so a `50%` corner on a wide box comes out round, not
  elliptical).
- **Hide.** After the text hide succeeds (its paint check must see the boxes as drawn),
  each label's fill and four border colors go transparent with `!important`, widths kept,
  so nothing moves. `restoreSlide` undoes the boxes first, then the text.
- **Writers.** A label is a group of two: the shape, then its existing text box, so the text
  keeps the placement already checked in three readers. A CSS border lies inside the box
  and an office stroke is centered on the outline, so the outline is inset by half the border
  width (`shapeOutline`, `layout.ts`). The `.odp` writes `draw:g` around a
  `draw:custom-shape` whose path uses ODF's elliptical quadrants (`X`/`Y`) per corner. The
  `.pptx` writes `rect`, `roundRect` or custom geometry with `arcTo` corners, and
  `tidyPptx` wraps the shape and its text in a `p:grpSp` (PptxGenJS has no group API), with
  `<a:ln><a:noFill/></a:ln>` stated for a label with no border.

Measured on the CLI's `--editable` export: card-tags carries 8 labels (the flush corner tags,
the two-line bands, before/after), muted-tier-and-syntax 3, the jargon gallery 34 (its 2×2
quadrants hold a title and a body, so they stay pictures), the baseline gallery 52. The numbered tags on card-tags
slide 2 stay pictures, because their number is `::before` content. Both `.pptx` files
validate with 0 errors against `pml.xsd` (`xmllint`) and the Open XML SDK 3.3.0; LibreOffice
24.2 draws every label where the PDF has it, and the slide picture under them no longer
holds the tag boxes.

## 8. Slice 2 as built: rules (2026-10-07)

A rule is one side of a border drawn on its own. Measured first: on the three decks the
one-sided borders are the title underline (`cell-masthead`, bottom, on nearly every slide),
table hairlines (collapsed `td` bottoms, plus left edges on one grid), list separators (`li`
tops) and a few underlines. Accent edges on FILLED boxes (`li.state`, the muted-tier cards)
belong to the cards slice; dashed borders (the journey's mood line) stay pictures.

- **Reader** (`reader.ts`, RULES). Any element with no fill, image or shadow that draws one
  to three solid sides gives each side as a `line` (`types.ts` `Line`): the border strip's
  full length, down its middle, the side's color and width, faded by any ancestor opacity.
  A side with a rounded corner, or an element that is tilted, scaled apart from the slide,
  filtered, masked, clip-pathed, blended or not wholly inside a clipping ancestor, stays a
  picture. Rules are slide-level (`ReadResult.lines`, `Slide.lines`), because the border is
  usually not on the block that holds the text (the masthead's rule is on a wrapper around
  the `h2`); the CLI, the Studio and the /calco page pass them through.
- **What the browser actually paints** (the checker on this slice found each case). A line
  must match the paint or the side stays a picture:
  - a side that something else is painted over (a positioned sibling, found by hit-testing
    along it; a positioned `::before`/`::after` such as a timeline dot) is skipped;
  - a collapsed table cell's border is centered on the grid line, not inside the box; where
    cells and rows share an edge the browser paints one border (the wider, then cell over row,
    then the earlier), so that one is drawn and every member's side hidden; a cluster whose
    lines span different stretches is left to the picture;
  - borders that paint nothing (rows and row groups in the separate-borders model, an empty
    cell under `empty-cells: hide`) and borders cut by `contain: paint` or `clip` give no line;
  - an inline box that wraps (one border per line fragment) and a box scaled on one axis stay
    pictures.
- **Hide.** `hide: true` turns just the ruled sides' colors transparent, after the text, and
  sets `transition: none` on every element it touches, since a running transition outranks an
  inline `!important` (labels had the same exposure).
- **Writers.** The `.odp` draws `draw:line` with `svg:stroke-linecap="butt"`; the `.pptx` a
  `line` shape, and `tidyPptx` gives it `cap="flat"` (PptxGenJS cannot). Both go after the
  picture and before every text box, so text sits on top.

Measured on the CLI's `--editable` export: card-tags 9 rules, muted-tier-and-syntax 20, the
jargon gallery 99; every `.pptx` validates with 0 errors (`xmllint` `pml.xsd` and the Open XML
SDK). LibreOffice draws each where the PDF has it (checked at 150 dpi on the jargon table),
and the picture no longer holds them. The muted-tier table's heavier header line is a
`background-image` gradient on `thead tr`, not a border, so it stays a picture.

## 9. Slice 3 as built: cards (2026-10-08)

A card is a box the slide paints (a fill and/or one border all round, any radii) that holds
text. It becomes one native shape, with its drop shadow, grouped with the text, labels and
rules inside it.

- **Reader** (`reader.ts`, CARDS). The deciding rule is **everything inside must already be
  native**, because the card's shape is drawn over the picture and covers whatever the
  picture still holds there. So a box qualifies only when every word in it was read into a
  frame, every box inside that paints is a label or a ruled element whose painted sides all
  became lines, and nothing inside is a picture (`svg`, `img`, …), pseudo-element content or a
  visible list marker. On top of that, the box itself:
  - paints like a label (solid fill and/or one uniform solid border), with **at most one outer
    shadow and no spread**. A transparent shadow layer counts as none (Chrome reports
    `rgba(0, 0, 0, 0) 0px 0px 0px 0px` on boxes that animate a shadow);
  - is not faded, filtered, masked, clip-pathed, tilted or scaled apart from the slide, and no
    clipping ancestor cuts it or its shadow;
  - has nothing outside it painted on top: every other box that overlaps it is hit-tested at
    the middle of the overlap.
  The outermost qualifying box wins, and frames and lines inside carry its index as `card`.
- **What the checker on this slice found, and the fixes.** Each was reproduced with a fixture
  and is now an integration test (`calco-reader.test.js`, "what covers them, and off screen"):
  - *Off screen, every hit test passed.* `elementFromPoint` returns `null` for a point outside
    the viewport, and the CLI reads each slide before the screenshot scrolls to it, so on every
    slide after the first nothing guarded the card (or, since slice 2, the rule). `readSlide`
    now scrolls the slide into view for the read and restores every scroll position, and a
    point that still lands nowhere fails.
  - *Paint the hit test could not see:* an overlay with `pointer-events: none`, an ancestor's
    positioned `::after`, a column rule, a descendant's `border-image`, a painted
    `::first-letter`, a decoration declared on the card. The overlap test now forces pointer
    events on and walks `elementsFromPoint` down to the card, counting only what paints at
    that point (a transparent full-slide veil does not); ancestors' pseudo-elements are placed
    from their computed insets; the rest reject the card.
  - *PptxGenJS reads a zero as unset* (`blur || 8`, `offset || 4`, `angle || 270`), so a hard
    `0 1px 0` shadow came out blurred and a centered glow shifted up. Zeros go in as a
    thousandth.
  - *A see-through or unfilled card's shadow.* CSS shades only outside the box; an office
    shadow shades the shape, so it darkened the inside of a translucent card and drew only an
    outline's shadow for an unfilled one. Only an opaque card's shadow is native now; any other
    card keeps its shadow in the picture and draws just its box.
  - *A picture under the shadow's reach* (a chart beside the card) would be drawn under the
    native shadow; it now stops the card.
  - *Hit tests round to a whole pixel.* Once slides were really on screen, the rules test
    (slice 2) ran for the first time on most slides, and dropped the jargon phase grid's 9
    column dividers and 20 of the obligation matrix's row hairlines (gallery slide 105). The
    middle of a 1px border at y = 634.95 comes back from `elementsFromPoint` as the next row's
    cell, whose box starts at 635.45. Both tests now walk the stack and count an element only
    where it paints: a box that does not hold the point counts only through a pseudo-element
    placed there, and a transparent wrapper not at all. The end samples also sit a pixel inside
    the strip rather than 0.5% from its end.
  - *Restore animated the box back* when it had a CSS transition. Colors now come back while
    `transition: none` still holds, then the transition.
  Measured cost (the checker, headless Chromium, slides on screen): reading the 120-slide
  gallery went from 670 to 804 ms, the 58-slide jargon gallery from 354 to 430 ms.
  `hide: true` clears its fill, border colors and shadow, after the text, with
  `transition: none`, and restores them first.
- **Writers.** The `.odp` writes a `draw:g` named `Card n.c`: a `draw:custom-shape` whose style
  carries `draw:shadow="visible"` with offset, color, opacity and `loext:shadow-blur`, then the
  card's rules, text boxes and label groups. The `.pptx` writes the card shape (with PptxGenJS's
  outer `shadow`: distance and direction from the CSS offset, the CSS blur radius as the blur)
  followed by its members, and `tidyPptx`'s `groupCards` wraps the run in a `p:grpSp` named
  `Calco Card i.c`, after `groupLabels` has made each label one object. Paint order on a slide
  is: picture, free rules, cards, free text.
- **What stays a picture, by design.** Measured on the decks, the cards that do not qualify are
  mostly: accent-edge cards (a thicker colored side on a rounded box, which curves round the
  corners: card-tags slides 4, 5, 10 and the muted-tier cards); numbered cards whose number is
  a `::before` counter (card-tags 2, 3, 8); the sketch finish's offset shadow with negative
  spread (card-tags 9); and boxes holding an icon or an inline pill. Each would need the
  shape to reproduce something the picture keeps, so each stays whole in the picture.

Measured on the CLI's `--editable` export (2026-10-08, after the fixes):

| Deck | Cards | Labels | Rules |
|---|---:|---:|---:|
| card-tags | 2 | 8 | 9 |
| muted-tier-and-syntax | 0 | 3 | 20 |
| gallery-jargon | 32 | 34 | 99 |
| baseline gallery (120 slides) | 55 | 52 | 187 |

The `.odp` holds the same cards. Every `.pptx` validates with 0 errors (`xmllint` against
`pml.xsd`, and the Open XML SDK for Office 2007 and Microsoft 365), with no card left
ungrouped. LibreOffice draws the cards, their shadows and their text where the PDF has them
(jargon slides 5 and 10 compared at 80 dpi); in the `.pptx` it substitutes the fonts, since
it cannot read embedded EOT, as before this slice.

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
