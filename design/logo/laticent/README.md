# Laticent org mark — the incised L

An **L** with the load path cut into it, running down the stem and turning out
along the arm. Laticent is the parent of Lattice, Cadenza, Lente, Suono and
Vetrina, so the mark answers to the name first:

| Latin root | How the drawing says it |
| --- | --- |
| *latus* — broad, expansive | the arm runs 68 against an 84 cap height. A Garamond L is nearer 0.60 of its cap; this is 0.81, so the letter's own stance is broad |
| *latere* — the hidden bedrock | the channel is cut THROUGH the letter to the ground it stands on. What carries the letter is not drawn on it — it is the material showing through from underneath |

## Two forms, two jobs

Neither is "the" primary. They do different work, and the split is measured
rather than hierarchical.

**The bare letter is the identity.** Rendered beside the five product marks,
it belongs: same free-standing class, same visual density, achromatic where
they are chromatic. The tile in that same row is the densest object on the
page by a wide margin.

**The tile is the square-surface form**, and it earns its place on one
measurement: its content is the only form in this family that clears the
Android maskable safe circle (45.3 against 51.2). The five product marks do
not, and neither does the bare letter (56.4 against a 64-unit avatar circle —
safe for a round crop, too wide for a maskable one). An app icon, a favicon
and an org avatar all need a ground; a letter alone in a circle looks
unfinished. That is the whole argument, and it does not depend on any claim
about parents containing children.

**An earlier draft did rest on such a claim, and it was wrong.** It said
"Alphabet, Meta and P&G all do this at the corporate register." None of them
does: Alphabet is a bare wordmark, Meta a free-standing loop, P&G a wordmark
with a moon-and-stars device. The real containered-letter precedent —
Facebook's `f`, Pinterest's `P` — is for **product** marks, not parent marks.
An independent critic also reported that "different class" and "doesn't
belong" look identical here. Framing the tile as a surface requirement rather
than a statement about hierarchy retires that objection instead of arguing
with it.

## Usage

| Surface | Use |
| --- | --- |
| App icon, favicon, avatar, any square or round crop | `laticent-tile.svg` (`-min` at ≤24px) |
| Beside the product marks; monochrome, engraving, small print | `laticent-mark.svg` (`-min` at ≤24px) |
| Site header, documents, letterhead | the wordmark alone |
| Formal first-impression use | `laticent-lockup.svg` |

## Files

| File | What | Use |
| --- | --- | --- |
| `laticent-tile.svg` | Cream letter on a fixed bluestone tile, brass channel | App icon, favicon, avatar |
| `laticent-tile-min.svg` | Reduced tile — solid letter, no channel | ≤24px |
| `laticent-mark.svg` | The bare letter, light+dark adaptive, channel cut as a mask | Family row, monochrome |
| `laticent-mark-min.svg` | Reduced bare letter — solid, adaptive | ≤24px |
| `laticent-lockup.svg` / `-dark.svg` | Tile + wordmark | Formal use |
| `laticent-lockup-bare.svg` / `-dark.svg` | Letter + wordmark | Where a container is wrong |
| `generate.py` | Source of truth — regenerates all eight | `python3 generate.py` |
| `wordmark.py` | **Generated.** The wordmark as a path | — |
| `outline-wordmark.py` | Re-outlines the wordmark from Fraunces | On demand; needs network |
| `audit.py` | Crop gate, transform-aware | `python3 audit.py .` |

## Palette

The five products each carry one chromatic hue plus a shared warm gold. The
parent carries **no product hue**: slate and the same gold. That is what makes
it read as the root rather than a sixth sibling.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| Slate | `#2C3A43` | `#9DB2BE` | the bare letter |
| Gold | `#C67A12` | — | the tile's channel; fixed, the tile does not adapt |
| Tile | `#526D7D` | — | the container; a brand constant |
| Cream | `#F6F3EC` | — | the letter reversed out of the tile |
| Wordmark | `#241F1B` | `#E6E2DD` | lockup text |

**The tile does not adapt to the color scheme.** An app-icon tile is a brand
constant — Facebook's `f` stays blue. Letting it follow
`prefers-color-scheme` inverted it into a glaring bright block on dark. Only
the bare letter and the wordmark shift.

**Why the tile is mid-tone and not near-black.** It was `#25333C`, and that
was a blocking defect: a near-black tile measures 1.28–1.46:1 against the dark
grounds it has to sit on (this repo's dark, GitHub dark, zinc-900, VS Code
dark), so the container was invisible exactly where a container has to hold —
a GitHub org avatar. Nothing dark can clear 3:1 against a dark ground; a
visible container must be mid-tone. `#526D7D` is the deepest slate that clears
3:1 on cream **and** on every one of those grounds:

| Ground | Ratio |
| --- | --- |
| cream `#F6F3EC` | 4.93 |
| GitHub dark `#0d1117` | 3.46 |
| this repo's dark `#101314` | 3.41 |
| zinc-900 `#18181b` | 3.24 |
| VS Code dark `#1f1f1f` | 3.02 |

## What makes it the letter and not two rectangles

Each move was picked against a rendered sweep in both schemes, not asserted.

- **Stem at 20 of an 84 cap** (0.24). At 25 (0.30) it read as machined angle
  iron rather than a letter; at 16 it went wiry by 24px.
- **Arm at 68.** At 76 it read as a bracket or a carpenter's square at *every*
  stem weight. This is the widest thing that is still legibly an L, not the
  widest thing that fits.
- **The arm is lighter than the stem** (`0.80`). A horizontal of equal measure
  reads heavier than a vertical.
- **The crook is bracketed** — a quadratic transition, not a dead 90° miter.
  This is the single move that makes it read as drawn rather than extruded.
- **No stem taper.** The previous drawing narrowed the stem 3.5 over 84, and
  that slope never lands on the pixel grid: the mark's most prominent vertical
  rendered fuzzy at 48px while the right edge stayed razor sharp. Craft that
  costs sharpness is not craft.

## The channel

It is drawn as a **stroked centerline**, never outlined by hand. The previous
seam was a hand-built polygon and three separate defects came out of that one
decision: it bulged to 113% at the crook (a round inner edge against a mitered
outer one), its recess landed asymmetric because a hand-offset outline cannot
be centered, and it needed a taper parameter fitted by eye. A stroked
centerline with a round linejoin holds a constant width around the bend and is
symmetric by construction.

**In the bare mark it is a real hole, cut with a mask.** Painting it in the
ground's color was the obvious approach and it is wrong: an SVG dropped on a
page has no idea what is behind it. A channel stroked in this repo's own
`#101314` is a hair off on GitHub dark, visibly darker than zinc-900, and
lighter than black — correct only on the one ground it was authored against.

**In the tile it is brass**, at 3.06:1 against the cream letter.

**Why not a brass seam in the bare mark too.** That is what shipped before, and
it fails structurally rather than by taste. Gold on slate measures **1.23:1 on
dark** — the same value, separated only by hue — so the letter read as two
disconnected pieces and collapsed to a flat slate L in grayscale. Fencing the
seam with a ground-color recess made it worse: slate / near-black / gold /
near-black / slate is five bands across a 20-unit stem, and on dark the
near-black recess *is* the ground, so it did not frame the seam, it severed the
letter into two floating rails. Cutting to the ground needs no second color to
survive — the channel sits at whatever contrast the letter itself has (10.6:1
on cream, 8.5:1 on dark) in either scheme, in grayscale, in mono print, and
under a color vision deficiency.

**Two widths, and it is an optical correction.** The bare mark's channel is
2.8, the tile's is 3.4. In the bare mark the channel is a **void** — it removes
ink, so the ground floods it and it reads wider than its measure. In the tile
it is a **fill** — brass substitutes for cream and holds its own edge. Swept
side by side at a common width, the void hollowed the letter into two rails at
exactly the measure where the fill still read as an inlay.

## The wordmark is a path, not live text

Measured in real Chromium, "Laticent" at font-size 70 / weight 600 /
letter-spacing −1 spans **219.6 to 315.9 units** across the family's own
fallback chain — Fraunces 248.0, Cormorant 219.6, Liberation (what Linux gives
for Georgia and Times) 240.8, DejaVu (what a bare `serif` gives) 315.9,
FreeSerif 236.4. No fixed allotment is both tight and safe across that spread:
the shipped 300 clipped DejaVu by 15.9, and widening it to 316 would leave 68
units of dead space in the intended face. A path has no spread — it is the same
drawing everywhere, which is what a logo has to be.

Fraunces is SIL OFL 1.1, which permits outlining glyphs into artwork. The
resulting path is artwork, not a font, and carries no license obligation of its
own. Re-outline with `python3 outline-wordmark.py` (needs network).

The five sibling lockups still set live `<text>` and still carry this defect.
Changing them is a shared-asset decision, not one this mark can take alone.

## What the generator enforces

`assert_invariants()` proves both from the numbers at generate time. Both were
carried as prose before and both were wrong.

- **The channel never breaks out of the letter.** Gold measures 1.61:1 against
  the tile — under the 3:1 graphical floor — so the tile's channel reads only
  while cream surrounds it on every side. This was never checked at all.
- **Nothing is painted past `SAFE_R`.** A round avatar crop (GitHub org, Slack)
  is a circle of radius 64; `SAFE_R = 58` is that circle with a ~10% margin.
  The constant said 54 while the letter measured 56.4.

`audit.py` cross-checks the shipped files, and judges a **tile** differently: it
is full-bleed by design and meant to be cropped by the mask, so its *content* is
measured against the maskable circle rather than flagging corners it is designed
to lose. It is transform-aware — ignoring the tile's `translate`+`scale`
reported the letter's pre-scaled coordinates, and a wrong number from a gate is
worse than no gate.

## Rules

- **Clear space:** one stem-width on all sides.
- **Minimum size:** full mark to ~28px; below that use the `-min` variants,
  which drop the channel. Under ~1px it only muddies the stem.
- **Dark mode:** ship the adaptive SVG. Never hand-recolor — the file carries
  its own `prefers-color-scheme` block, as the rest of the family does.
- **The lockup shares one baseline.** In the bare form the mark IS a letter, so
  its foot sits on the wordmark's baseline — flat foot to flat foot, no
  overshoot (that is for curves), at 1.35 cap heights (convention 1.2–1.6). The
  first version of this file hung the mark **9.2px below the baseline** at 2.1×
  cap height, because it centered the em box with
  `dominant-baseline="central"` and "Laticent" has no descenders, so its mass
  rides high in that box.
- **The tile shares no baseline** — it is not a letter. It is centered on the
  wordmark's **cap band**, at 1.65 cap heights. At 1.45 it reads subordinate to
  the word; at 1.90 it swamps it. Dropping it toward the word's center of mass
  (measured at 71.2) looked plausible in isolation and visibly sagged once the
  options were seen side by side.
- **Don't:** put a product hue in it, paint the bare mark's channel instead of
  masking it, put brass on slate, let the tile follow the color scheme, let the
  channel touch the tile (1.61:1), add gradients or shadows, or squash the
  aspect ratio.

Regenerate after any change: `python3 design/logo/laticent/generate.py`.
