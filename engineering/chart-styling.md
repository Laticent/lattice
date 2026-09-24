# How to style a chart

The contract for anyone — human or agent — changing how a chart *looks*. Creating
a new chart member is a different job: that is `design/skills/chart-component.md`.
This is about paint, weight and spacing on the 21 members that exist.

**One sentence: structure belongs to the family, colour belongs to the palette and
the finish, and neither is allowed to do the other's job.**

---

## 1 · The split, and why it is the whole discipline

| | who owns it | what it means |
|---|---|---|
| **Structure** | the chart family, globally | edge weight, corner radius, the gap between marks, spacing |
| **Colour** | the theme's palette, moved by the finish | which hue, how deep, which channel carries identity |

A chart member **never tunes structure for itself.** If a bar's outline looks too
heavy, the fix is the family token, not that member's stylesheet — because if it
looks wrong there it is wrong everywhere, and a per-member fix guarantees the set
stops reading as one system.

This is not a style preference. It is the lesson of the defect that made this
document necessary: the family's declared marks painted at **21 different
physical weights**, a 6.9× spread from 0.42px to 2.9px, every one of them a local
decision that looked right in isolation. Today it is **8** weights over 2.2× —
21 mark classes at exactly 1px, seven knockouts at their own role-correct widths,
and one sanctioned 2px emphasis.

Re-derive both with `node tools/chart-structure-census.js`, on the branch and on
`main`. Quote a commit when you quote the numbers: an earlier draft of this
paragraph said 16 weights over 13.1×, and a later one said 21 over 5.8× measured
against a stale build. The 13.1× came from a probe that
multiplied by `box.width / viewBox.width` where `xMidYMid meet` gives a UNIFORM
`min(sx, sy)`. Measured against a rendered control — viewBox 100×100 in a 400×100
box, `stroke-width: 2` — the x-ratio predicts 8px and the render paints 2.

## 2 · The coordinate-space trap — read this before touching any `stroke-width`

**An SVG `stroke-width` is in viewBox user units, not pixels.** The family's
viewBoxes range from 24 units (a journey mood face) to 1375 (a world map), and
they render into boxes from 32px to 1152px wide. So the same literal means a
different painted weight on every member, and a number tuned by eye on one chart
is meaningless on the next.

Measure it, never reason about it:

```
node tools/chart-structure-census.js          # every width, radius and gap, in PHYSICAL px
node tools/chart-structure-census.js --check  # is every outline mark actually pinned?
```

The census reports each width twice, `user` as declared and `px` as rendered, and
the physical column is the one to read. Its scale comes from `getScreenCTM()`,
never from the viewBox ratio — see above for what that mistake costs.

**The rule:** a data mark's edge comes from `var(--chart-edge)` and carries
`vector-effect: non-scaling-stroke`. That pairing is load-bearing in both
directions — `non-scaling-stroke` strips the viewBox scaling so the weight is
comparable across members, and `--chart-edge` resolves to the family's
`clamp(1px, 0.078cqi, 2px)` so it still grows with the container above HD (#180).
Use one without the other and you break one of the two properties.

`chart-mark-edge-census.test.js` ties the shared rule's class list to the marks
each manifest declares `paint: "fill"`, so a new member joins by declaring its
marks — not by editing CSS. It also fails on a class a member gives
`--chart-edge` that the shared rule does not pin, which is the leak worth knowing
about: the source text reads identically either way, and two radar marks took the
token, missed the list, and rendered at 1.24px and 1.29px beside a 1.00px
neighbor.

**A KNOCKOUT IS NOT AN OUTLINE, and the family has six.** `funnel-band`,
`line-dot`, `quadrant-dot`, `quadrant-trail-after`, `radar-dot`, `scatter-dot`
and `sbar-seg` stroke in `var(--bg)`. That stroke holds two touching marks apart
— a dot where two lines cross, a segment abutting the next in its stack — so its
correct weight follows what it separates, not the family's outline weight.
Flattening them into `--chart-edge` took quadrant's separator from 2.23px to
1.00px. The test re-derives the exemption from each member's own CSS, and a
`:hover` rule does not qualify.

### The structural tokens

| token | value | use |
|---|---|---|
| `--chart-edge` | `var(--chart-hairline)` → 1px @HD | every data mark's outline |
| `--chart-edge-strong` | `calc(… * 2)` → 2px | hero series and the active mark, nothing else |
| `--chart-hairline` | `clamp(1px, 0.078cqi, 2px)` | DOM borders, rules, separators |
| `--chart-fill-accent` | `clamp(4px, 0.31cqi, 7px)` | a mark's leading-edge accent stripe |
| `--chart-mark-radius` | `0.46875cqi` | a mark's corner |

**A text halo is not a mark edge.** `paint-order: stroke` on a label uses
`stroke-width` to fatten a readability outline around glyphs, in the CANVAS
colour. Those are deliberate and must not be folded into `--chart-edge`. The
census test tells them apart by that canvas colour, not by the presence of
`paint-order` — the pie's `.wedge` is a declared mark that carries `paint-order`
precisely so only the outer half of its edge shows, and a `paint-order` exemption
would have let it take any literal width and ship green.

**And a width can arrive as a presentation attribute**, where no CSS scan will
see it. A transform writing `stroke-width="1.2"` into the markup sets the same
property from a file none of the CSS arms opens; the census has an arm for that
too, with one sanctioned entry (`journey-face`, an icon on an `<svg>` wrapper).

## 3 · The three finishes

A finish moves colour; it never adds or removes it, and it never touches
structure.

| | identity lives in | choose it for | body | edge |
|---|---|---|---|---|
| **`pigment`** | the body's **hue** | you want colour | 82% | ink, 1× |
| **`etching`** | the **line and the letter** | a modern look | 30/40% | ink, 1× |
| **`tone`** | the body's **value**, one hue | a conservative, restrained look | 92…9% of one hue | ink, 1× |

`pigment` is the default. Two things hold in **all three**, and they are floors,
not style:

1. **Every mark carries an ink edge.** Measured: no body clears the 3:1 graphical
   floor against its own canvas at any depth — 82% bottoms out at 2.45:1, and 30%
   clears it in **0 of 224** theme × mode × slot combinations — while the ink
   clears it everywhere (worst 4.65:1). A body never guarantees the mark can be
   seen. Its edge does.
2. **Every element that NAMES a mark wears that mark's ink.** No finish removes
   colour. Under `tone` there is one hue, so a name wears the ink — the same
   channel the edge uses. Sending names to a neutral is a floor violation, and it
   is an easy one to write by accident because it looks like an accommodation.

Full philosophy: `engineering/decisions/2026-09-07-chart-design-language/` —
`tone-is-the-third-finish.md` for the trio, `finish-render-defects.md` for what
goes wrong.

## 4 · Contrast — what to measure, and against what

**Against everything on the slide, not against the canvas.** A mark sits on
whatever is painted behind it, which may be a card, a panel, a tint, another mark,
or several of those composited.

```
node tools/chart-contrast-solve.js <rendered.html> [screen|print]
```

**It samples; it does not model.** The solver shoots the slide twice — once as
rendered, once with only the glyph FILL removed — and the pixels that differ are
the pixels a glyph covers. Shot B at those pixels is the backdrop, with
gradients, stacking order, opacity and the family's canvas-coloured halos all
already resolved by the renderer. The INK still comes from computed style,
because Chromium antialiases a body-size stem across two or three pixels with
subpixel fringing and no pixel on it ever holds the pure colour: a `#111`-on-white
control measured 4.02:1 from its darkest pixel against a true 18.1:1.

Each row carries a **`share`** — the fraction of the glyph's covered pixels at the
reported ratio. `share: 1` is a colour choice. `share: 0.001` is a connector
crossing one corner of the label, and sending a colour change after it fixes
nothing.

Floors: **4.5:1** for text, **3:1** for large (≥24px, or ≥18.66px bold) and for
any graphical object carrying information (WCAG 1.4.11). A mark passes on **either**
channel — body-vs-backdrop or edge-vs-backdrop — because `etching` leans on the
edge by design.

### Six ways a contrast measurement lies

Every one of these produced a wrong number in this repo before it was fixed. If
you write a new instrument, check it against all six.

1. **The presentation attribute is not the paint.** `fill="url(#g)"` still reads
   `url()` after CSS has overridden it. Read computed style, always.
2. **SVG text paints with `fill`, HTML text with `color`.** Reading `color` first
   scores an SVG label with an ink it is not drawn in.
3. **A colour carries its own alpha — the INK's as much as the backdrop's.**
   `color(srgb 0 .4 .6 / 0.1)` is a 10% wash; dropping the fourth channel on a
   backdrop turns it into a saturated fill and invents failures, and dropping it
   on the ink hides them: `color: color(srgb 0 0 0 / 0.18)` on white renders at
   1.53:1 and scored as pure black. Two elements in the shipped chart gallery
   carry a translucent ink.
4. **A gradient resolves through `getComputedStyle(stop).stopColor`** — the
   attribute still carries `var()`, which a canvas cannot resolve.
5. **A bounding box lies.** Use `isPointInFill` for SVG, and a `Range` for text —
   a table cell's *box* reaches the row rule its *glyphs* never touch.
6. **`<text>`, `<tspan>` and `<g>` do not paint.** Counting them as surfaces makes
   every label its own backdrop and scores it at exactly 1:1.
7. **A gradient backdrop has two ends and the glyph sits on ONE of them.** Scoring
   against the flattering end passes white text over a black-to-white ramp;
   scoring against the worse end fails every label in the family. Sample where the
   glyph actually is.
8. **Document order is not paint order.** `z-index` and `position` reorder it, and
   this family has both. SVG has no `z-index` at all — there, later in the document
   IS on top, which is why radar's scale rungs used to be dimmed by the series
   polygons painted after them.

And one that is not about measurement at all: **contrast and distinctness are
different questions.** A chart whose five categories all painted one colour passed
every contrast audit in this repo, because one colour is perfectly legible. If you
change how marks take paint, run the flattening detector too:

```
node tools/chart-mark-separation.js  # is one category still distinguishable from the next?
```

## 5 · The order to verify in

Nothing here is optional, and the order matters — a later step is meaningless if
an earlier one moved.

1. `npm run build` — the CSS you edited is not what renders until you do.
2. **Re-render**, then measure. Measuring a stale render is the single most common
   way to report a fix that did not happen.
3. `node tools/chart-structure-census.js --check` — is every outline still pinned?
   Then without `--check` — did the structural spread move?
4. `node tools/chart-contrast-solve.js … screen` **and** `… print`. `@media print`
   is live in the CLI vector PDF path, so a screen measurement does not prove the
   PDF. Neither does either of them, strictly: both are `emulateMediaType` in
   headless Chromium, not the vector PDF itself (HARD RULE #23).
5. `node tools/chart-mark-separation.js` — did an encoding collapse?
6. `npm run lint`, `npm run build:check`, `npm test`.
7. **Look at it.** Rasterize and open the pages. Every instrument above has a blind
   spot; your eyes are what catch a mark that is legible, distinct, correctly
   weighted and still ugly.

**Themes are part of verification, not a follow-up.** Light and dark for every
theme the change can reach, plus the five `a11y-*` themes and print. An `a11y`
theme replaces the categorical palette with textures and greys, so a change that
assumes hue is available breaks there and nowhere else.

## 6 · Traps this family has already paid for

- **A `:not()` fallback at equal specificity, emitted last, overrides everything
  it was meant to back up.** One line collapsed an entire finish.
- **`:nth-of-type` counts same-tag siblings.** One `<span>` per `<td>` means every
  element is position 1, and per-slot rules silently become one rule.
- **A `var()` fallback chain takes the first DEFINED name.** One early name defined
  globally shadows every per-slot name after it.
- **A CSS rule beats a `fill=` presentation attribute**, so a finish can overwrite
  a correct per-category paint with a constant and the legend beside it will still
  show the truth.
- **`build:galleries --check` compares render inputs against HEAD.** Commit a CSS
  change and it reports "no change" while every PDF is stale. Rebuild on the
  strength of what you changed, not on what it says.
- **A mark that carries no datum is ground, not figure.** Painting it at body depth
  made a choropleth's no-data countries darker than its data.
- **An export loses whatever the flattener does not carry.** `flattenSvgStyles`
  inlines a curated list of computed properties and omits any value equal to the
  CSS initial. `stroke-width: 1px` IS the initial — so a mark pinned with
  `vector-effect: non-scaling-stroke` on the slide arrived in the PDF, PPTX and
  standalone SVG with neither property, and fell back to one viewBox USER unit:
  measured over the same live SVGs, a pinned 1px edge came back at 0.84px on a map
  region and 2.46px on a scatter bubble. A stroked element now never drops either
  property. The cost is bytes: +2.7% to +8.2% per exported SVG, and on the Mermaid
  path — where nothing carries `non-scaling-stroke` — every one of those extra
  declarations is a no-op.
- **An INHERITED custom property loses to the element's own declaration**, and no
  specificity beats that. A palette declares in `:root`; `chart-family.css` declares
  the fill wash on `.chart-frame` itself, so a palette setting `--chart-fill-top-l`
  looks like an override and does nothing. The wash is read through
  `var(--palette-fill-*, <default>)` for that reason. Note what this is NOT: a
  palette scoped to `.chart-frame` would win, because then it is an own declaration
  too. (Zero of the 15 shipped palettes do that for any of the 72 properties this
  file sets there.)
- **The wash's own contract is per-theme, and one theme breaks it.** "The wash
  only tints, so `--text-heading` labels clear it on both canvases" holds on a
  canvas near either end of the range and fails on a mid-toned one. concrete
  (canvas `#B8B8B5`) measured 4.14:1 light and 3.49:1 dark for a label on a mark,
  and no ink fixes it — its `--text-heading` is already 15,15,14 and pure black
  reaches 4.20:1. The wash is what has to move.
