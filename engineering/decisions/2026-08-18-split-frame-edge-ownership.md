---
status: shipped
summary: >
  A sovereign split frame suppresses every chrome Cell it declares, but the deck
  spectrum is a `border-top` on the `section` rather than a Tile, so `suppresses`
  cannot name it — the ribbon painted on top of `split-panel`'s own accent bar,
  giving a 7px two-tone stripe that stepped down to 4px at the panel seam. The
  border is dropped on `split-panel` and `split-compare` and the edge is rebuilt
  as one bar in two segments meeting at the seam. Anchor the segments to the
  PANEL BOXES, never to a width percentage: `.panel-left` is not border-box, so a
  `--panel-w: 38` boundary landed a constant 128 raster px short on every
  variant.
---

# A sovereign frame must own its top edge (the split-panel double border)

**Date:** 2026-08-18 · **Status:** shipped ·
**Touches:** `lib/components/statement/split-panel/split-panel.styles.css`,
`lib/components/comparison/split-compare/split-compare.styles.css`,
`lib/shared/shared.styles.css`

## The defect

`split-panel` painted two horizontal rules across the top of the featured panel.
Measured on a real cuoio export at 2560x1440:

| raster rows | mark | source |
|---|---|---|
| 0-7 (4 CSS px) | `#677EBB`, full width | `section` `border-top` + `border-image: var(--spectrum)`, `base.elements.css` |
| 8-13 (3 CSS px) | `#7A5A10`, left 38% only | `.panel-left::before`, `split-panel.styles.css` |

A 7px two-tone stripe over the panel that stepped down to 4px at the seam. In
`indaco` the two colors sat ~5% apart and read as a banding artifact; in `cuoio`
they are unrelated hues and read as two rules disagreeing about where the slide
starts. On a `cat-N` slide it was three unrelated hues in ten pixels.

Same defect in `split-compare` via `.compare-left::before`. `.metric` and
`.steps` had already dodged it locally with `content: none`, and `.pullquote`
never had it because its `::before` is the quote glyph — three independent local
decisions and no rule, which is the signature of the real problem below.

## Why it happened — the spectrum is not a Form noun

`split-panel` is a **sovereign** frame. Its manifest suppresses seven chrome
Cells (`masthead`, `masthead-lede`, `masthead-bay`, `footer`, `footer-left`,
`progress-centre`, `pagination-right`). It suppresses everything — and still got
the ribbon, because the ribbon is a **border on the section box**, not a Cell or
a Tile, so `suppresses` has no way to name it.

There is a `rule` Tile manifest (`lib/forms/tile/rule/rule.manifest.json`,
`status: "shipped"`, `fits: ["stage"]`, `z: 0`) that claims to be this mark. It
is the only Tile folder with no CSS and no transform, and both placement fields
are wrong — the bar paints outside every Cell, on no plane. The manifest-vs-CSS
plane gate cannot catch it because there is no co-located CSS to check.

Ten frames are sovereign; only three (`title`, `closing`, `divider`) drop the
ribbon, each with its own hand-written `border-top: none`. This change makes the
split family the fourth and fifth, but by *owning* the edge rather than
abandoning it. **Promoting the spectrum bar itself to a real Form noun is not in
this change** and remains open.

## What ships

Both components drop the section border and rebuild the edge as ONE bar of the
ribbon's weight (`calc(var(--_sec-1cqi) * 0.3125)`) in two segments:

- **left** — a pseudo, `.panel-left::after` / `.compare-left::after`, painting
  `var(--panel-mark, var(--accent))`. Those boxes are already `position: relative`
  in the existing CSS, so this adds no containing block.
- **right** — a BACKGROUND on `.panel-right` / `.compare-right`, not a pseudo. See
  "the footer moved" below for why that distinction is load-bearing.

The transition lands on the panel seam, which is already the slide's strongest
vertical line, so it reads as intentional rather than truncated.

### Anchor to the panel boxes, never to a width percentage

The first implementation hung both segments off the `section` and computed the
boundary from a `--panel-w` token (`38`, the declared `width: 38%`). Every
variant landed **128 raster px short of its seam**. `.panel-left` is not
border-box, so its rendered width is `38% + 2 * var(--sp-lg)`. The error being
*constant* across different `--panel-w` values is what identifies it as the
padding rather than the percentage — a percentage error would have scaled.

Putting each segment on its own panel box makes the boundary correct by
construction. Three consequences:

1. `--panel-w` is deleted. No token, no per-variant width table (the widths in
   play are 38 / 44 / 50 / 30 / 31 / 34, plus 30 for `split-compare`).
2. `.mirror` needs no width rule — the panels row-reverse and their segments go
   with them. Only the ribbon's anchor flips (`background-position: left`).
3. The mark uses `::after` so `.pullquote` keeps `::before` for its glyph.

### The right segment is a background, because the footer lives in that box

The right segment was first a `::before` too, which needs `position: relative` on
`.panel-right`. But `<footer>` is a **child of `.panel-right`**
(`lib/core/split-panels.js`), so positioning the panel made it the footer's
containing block: the running footer jumped out of the panel it used to span and
wrapped to two lines. Caught only by pixel-diffing the regenerated PDF against
`HEAD`, which showed differing rows at 709-723 as well as at the top edge.

A background needs no containing block, no z-index and no stacking interaction,
and it is sized to the panel's own box for free — strictly better than the pseudo
even setting the regression aside.

It does have one trap, which bit immediately: `background:` SHORTHAND resets
`background-image`, and both components set `background: var(--bg)` on the right
box *after* the new rule. That silently erased the ribbon on every slide — and the
first verification pass PASSED anyway, because it was locating the boundary by
looking for a color transition at y=3 and finding the two panels' own fills
meeting at exactly the seam. **A check that cannot distinguish "the bar is
correct" from "there is no bar" is not a check.** The three shorthands are now
`background-color` longhands, and the check asserts the top band differs from each
panel's body color and is exactly 8 raster rows before it compares the boundary.

### Keeping the ribbon consistent with neighboring slides

The right segment is `background-size: calc(var(--_sec-1cqi) * 100)` — one slide
width — anchored `right`, so the visible slice is exactly what a full-width bar
would show at those x. Measured `#5CB135` against a full-width `#5DB133` at the
same x: 2/255 apart, invisible. A split slide does not read as recolored beside
its neighbors.

### Registers and modifiers

The ribbon segment **is** this frame's section-edge bar, so it obeys the same
five classes that clear the section border in `base.variants.css`:
`spectrum-off`, `spectrum-edge-{left,right,bottom,off}`. The panel mark is a
STRUCTURAL accent and survives `spectrum: off` — the white-label baseline
(`base.docs.md`).

`accent` recolors the ribbon segment to a solid `--accent` instead of re-adding a
section border; `shared.styles.css` excludes the two split frames from its
`border-top`. **Specificity is why this exclusion is required, not style:**
`section.accent` and `section.split-panel` are both `(0,1,1)`, and
`shared.styles.css` is in `TAIL_SOURCES`, so without the `:not()` the tie is
broken by source order in `accent`'s favor and the double returns.
`section.accent.dark` needs no exclusion — it decorates the section background,
which both panels cover; verified on a real `split-panel accent dark` export
(8 rows `#C8A040`, then the panels, one bar).

`watermark` takes `--on-accent-watermark` for its mark: the panel fill IS
`--accent` there, so a `--panel-mark` bar measured `#7A5A10` on `#7A5A10` —
invisible. The pre-existing 3px rule was already doing this and the first draft
had dropped it.

## Verification

Rendered the committed gallery (`split-panel.gallery.md`, 24 slides) in `cuoio`
and compared the edge-band transition against the panel seam sampled in the slide
body. **Exact on all 15 split slides** — base, metric, pullquote, steps,
watermark, proof, capstone, mirror, qr, cat-1, cat-3, cat-8, dark, compact,
accent. `accent` is uniformly `--accent` across the full width by design (one
solid line, no transition to find). `dark`'s seam is at 1100 at every sampled y.

Both failures found late were found by rendering the **real committed gallery**,
not the two-slide probe deck used while exploring — `mirror` and the `accent`
specificity tie exist only there.

### The 4px shift

Removing a `border-top` gives the box back the 4 CSS px it reserved, so panel
content sits 4px higher and the panels now reach the slide's true top edge —
measured at exactly 4.0 CSS px on the gallery, with no new overflow or legibility
warnings. This is inherent to the fix, not incidental: a full-bleed sovereign
frame should reach the edge. Keeping a transparent border to preserve the old
geometry does not work — the section background would show through as a 4px band
above the segments.

## The achromatic-palette regression (found before merge, fixed in this change)

Dropping the section border meant the panel half's only edge is now the component's
own mark, whose default is `--accent` — and on an ACHROMATIC palette `--accent` IS
`--surface-inverse`. onyx measured **1.00:1**: `#000000` on `#000000`, no edge at all.
Before this change the visible edge over the panel came from the section's spectrum
`border-top`, so nothing had exposed it. ardesia (1.06), concrete (1.10) and atelier
(1.11) were the same defect a hair off. The five `a11y-*` palettes inherit it because
`a11y-base.css` `@import`s onyx.

`--panel-edge-mark` is the fix: declared in `base.tokens.css` as `var(--accent)` — the
intended look, unchanged on 28 palettes — and overridden on the four broken ones to the
curated `--spectrum-end`. `--panel-mark` still outranks it where set (cat-N,
proof/capstone), because that is categorical identity.

**Why per-palette and not a new global default.** Swapping the default to
`--spectrum-end` everywhere fixes all four, but measured across all 32 it makes
**mustard worse** — 3.93:1 down to 1.89:1. The endpoint is not universally the better
color; it is better exactly where `--accent` collapses into the panel.

### Three things the gates caught that the audit alone did not

1. **A `var()` fallback re-creates the bug.** The first shape was
   `var(--panel-edge-mark, var(--accent))`. `checkOwnership` rejected it: a palette that
   never defines the token degrades silently onto `--accent`, which is the defect. The
   token is declared in `base.tokens.css` instead, and the read carries no fallback.
2. **The export path is BASE-WINS, so a plain `:root` override is discarded.**
   `composed-contrast` models palette-wins (the engine/Studio order, and the export order
   after #1527). Today's export concatenates `base.tokens.css` AFTER the palette, so at
   equal specificity the engine default wins on source order: the static audit passed
   while the rendered PDF still showed `#000000` on `#000000`. The overrides are pinned
   `:root:root`. **This is a live discrepancy between the audit's model and the export
   path** — any future per-palette override of a base-declared token has the same trap.
3. **A flat override collapses a `light-dark()` pair.** Only the LIGHT arm is broken; on
   the dark arm `--accent` flips bright and measures 21:1 on onyx. A flat
   `var(--spectrum-end)` would have replaced a correct color with a worse one, which
   `paired-token-parity.test.js` caught. The overrides are
   `light-dark(var(--spectrum-end), var(--accent))`.

### The floor, and why it is not 3:1

The gate is the composed-contrast surface `split-panel/edge-mark`, floor **1.5:1** — a
floor against invisibility, not an accessibility claim. WCAG 1.4.11's 3:1 is calibrated
for identifying a UI component, a stricter task than noticing a colored rule, and holding
a 4px decorative mark to it fails 25 of 32 palettes including cuoio (2.72) and indaco
(2.06) — both rendered and plainly legible. The shipped population is bimodal with an
empty band: thirteen theme·mode pairs at 1.00–1.11, next worst crepuscolo at 1.86. 1.5
sits in that gap, so it is not tuned to any one palette. The categorical marks that DO
carry information (`--cat-N-mark` on `--cat-N-fill`) are gated separately by
`checkCatContrast`.

Verified by rendering, not by the token map: light and dark arms of all four patched
palettes, plus cuoio / indaco / mustard unchanged.

## Rejected alternatives

- **Drop the panel bar, keep the ribbon.** One line, but it deletes the
  categorical marker that ties the panel to the labels and rules in the
  supporting zone on `cat-N` decks.
- **Move the panel bar to the panel's bottom.** Looked good, and fails on
  overflow: `.panel-left` is `justify-content: safe flex-end`, so content sits at
  the bottom and start-aligns downward into the bar when it overflows. The top is
  this component's safe edge by construction, which is very likely why the bar
  was there. Measured: descenders cut by the bar.
- **Sovereign frames simply drop the ribbon** (join `title`/`closing`/`divider`).
  Most principled on paper, worst-looking in practice — the edge stops dead at
  the seam and reads as truncated. This change is that principle implemented
  properly: the frame owns the *whole* edge instead of abandoning most of it.
- **`spectrum-edge: bottom`.** A shipped register and a fine deck aesthetic, but
  it is an author workaround, not an engine fix: deck-wide it moves every slide's
  ribbon, per-slide it makes split slides disagree with the rest of the deck, and
  either way the double still ships for anyone who does not know the trick.

## Still open

The spectrum bar remains a `border-top` on the `section` for every other layout,
suppressed ad hoc in seven places. The `rule` Tile manifest still describes a
Tile that does not exist. Promoting it to a real Form noun — an edge Cell the
root Frame owns, with `suppresses` able to name it — is the follow-up this change
does not attempt.
