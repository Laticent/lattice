# Laticent org mark — the inlaid L

A slate **L** with a brass seam let into it, tracing the load path down the
stem and turning out along the arm — set in a slate tile. Laticent is the
parent of Lattice, Cadenza, Lente, Suono and Vetrina, so the mark answers to
the name first:

| Latin root | How the drawing says it |
| --- | --- |
| *latus* — broad, expansive | the arm runs 76 against an 84 cap height, so the letter's own stance is wide |
| *latere* — the hidden bedrock | the seam is the load path — the structure that carries the letter, made visible as one line |

## Why the parent is a TILE and the children are not

This is the one decision worth reading before changing anything.

Measured, not assumed: **every one of the five product marks places a haloed
hub at exactly (64,64)**, radius 13–16.5. The family is not merely "has a
hub" — it is *organized around* one. Every child is centripetal.

A letterform cannot be centripetal without ceasing to be a letter. Dropping a
hub into the L was tried and it fails on geometry, not taste: the node lands
**38 units off center** and reads as a bolted-on dot.

So the parent does not imitate its children — it differs by **class**. A
contained mark beside five free-standing ones is *intended* to read as the
thing they live inside.

**This argument is not backed by the precedent that was first cited here, and
that citation was wrong.** An earlier draft claimed "Alphabet, Meta and P&G
all do this at the corporate register." None of them does: Alphabet is a bare
wordmark, Meta a free-standing loop, P&G a wordmark with a moon-and-stars
device. Not one differentiates from its children by putting the parent in a
container. The containered-letter precedent that *is* real — Facebook's `f`,
Pinterest's `P` — is for **product** marks, not parent marks.

What survives is weaker and worth stating plainly: containment is *a* way to
make the difference deliberate, and an independent critic reports that
"different class" and "doesn't belong" look identical here, with no shared
construction, stroke weight, geometry or ground to separate them. That
objection is unresolved.

The container earns its place three more times: it converts a *letter* into an
*object*, so the lockup stops reading as "L Laticent"; it is the only form
here whose content clears the Android maskable safe circle (43.7 against
51.2); and a full-bleed tile is exactly what an app icon wants.

## Usage — three forms, and they are not interchangeable

The convention every large brand uses, and the reason it exists: the symbol
alone for small and square surfaces, the wordmark alone where the name must
be read, the lockup only where both are needed at once.

| Surface | Use |
| --- | --- |
| App icon, favicon, avatar, any square | `laticent-tile.svg` (`-min` at ≤24px) |
| Site header, documents, letterhead | the wordmark alone |
| Formal first-impression use | `laticent-lockup.svg` |
| Monochrome, engraving, very small print | `laticent-mark.svg`, the bare letter |

## Files

| File | What | Use |
| --- | --- | --- |
| `laticent-tile.svg` | **Primary symbol.** Fixed colors | App icon, favicon, avatar |
| `laticent-tile-min.svg` | Reduced tile | ≤24px |
| `laticent-mark.svg` | The bare letter, light+dark adaptive | Monochrome, engraving |
| `laticent-mark-min.svg` | Reduced bare letter, adaptive | ≤24px |
| `laticent-lockup.svg` / `-dark.svg` | Tile + wordmark | Formal use |
| `laticent-lockup-bare.svg` / `-dark.svg` | Letter + wordmark | Where a container is wrong |
| `generate.py` | Source of truth — regenerates all eight | `python3 generate.py` |
| `audit.py` | Crop gate, transform-aware | `python3 audit.py .` |

**The tile does not adapt to the color scheme.** An app-icon tile is a brand
constant — Facebook's `f` stays blue. Letting it follow
`prefers-color-scheme` inverted it into a glaring bright block on dark. Only
the ground behind a lockup and the wordmark shift.

## Palette — the achromatic parent

The five products each carry one chromatic hue plus a shared warm gold. The
parent carries **no product hue**: slate and the same gold. That is what makes
it read as the root rather than a sixth sibling.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| Slate | `#2C3A43` | `#9DB2BE` | the letter |
| Gold | `#C67A12` | `#F6B64A` | the seam |
| Ground | `#F6F3EC` | `#101314` | the recess the seam sits in |
| Tile | `#25333C` | `#25333C` | the container — a brand constant, never adapts |
| Wordmark | `#241F1B` | `#E6E2DD` | lockup text |

## What makes it the letter and not two rectangles

An earlier L scored 6.5 in review because it had no typographic craft. Each of
these was chosen against a rendered comparison, not asserted:

- **The arm is lighter than the stem** (`ah = sw * 0.80`). A horizontal of
  equal measure reads heavier than a vertical.
- **The crook is bracketed** — a quadratic transition, not a dead 90° miter.
  This is the single move that makes it read as drawn rather than extruded.
- **The seam bends on a radius** echoing that bracket. A mitered seam inside a
  bracketed letter is two drawing languages in one mark.
- **The seam tapers to 0.72** along the arm: load concentrates in the stem and
  diminishes as it spreads.
- **The stem tapers** 3.5 narrower at the top, the way a cut letter does.

## Two things the generator enforces

Both were caught failing in review. Note the recess IS visible at 128px and
is gone by 48px — an earlier draft of this line claimed the opposite.

- **The recess.** Gold and slate measure **1.23:1 on dark** — the same value,
  separated only by hue. The ground-color channel around the seam is what a
  real inlay has, and it is also what keeps the seam visible in grayscale, in
  mono print, and for a viewer with a color vision deficiency. Without it the
  mark collapses to a plain slate L; verified on a grayscale render.
- **Round-crop safety.** A GitHub org or Slack avatar is a **circle**. Nothing
  in a free-standing mark is painted more than `SAFE_R = 54` units from the
  center. A **tile is judged differently**: it is full-bleed *by design* and
  meant to be cropped by the mask, so `audit.py` measures the content inside
  it against the maskable circle instead. The audit is transform-aware —
  ignoring the tile's `translate`+`scale` reported the letter's pre-scaled
  coordinates, and a wrong number from a gate is worse than no gate.

## Rules

- **Clear space:** one stem-width on all sides.
- **Minimum size:** full mark to ~28px; below that use `laticent-mark-min.svg`.
- **Dark mode:** ship the adaptive SVG. Never hand-recolor — the file carries
  its own `prefers-color-scheme` block, as the rest of the family does.
- **Wordmark:** Fraunces / Cormorant Garamond (Georgia fallback), 600,
  `font-size 70`, letter-spacing −1.
- **The lockup shares one baseline.** The mark IS a letter, so its foot sits on
  the wordmark's baseline — flat foot to flat foot, no overshoot (that is for
  curves). It is drawn at **1.35 cap heights**; the convention is 1.2–1.6.
  The text is set on its ALPHABETIC baseline, not with
  `dominant-baseline="central"`: centering the em box makes the alignment
  font-dependent, and "Laticent" has no descenders, so its mass rides high in
  that box and a symbol centered on it drops visibly low. The first version of
  this file did exactly that — the mark hung **9.2px below the baseline** at
  2.1× cap height.
- **Don't:** put a product hue in it, remove the recess from the bare mark,
  lay the seam directly on the slate, let the tile follow the color scheme,
  lighten the seam inside the tile (it borders the cream letter, so lightening
  only *lowers* contrast — a trial `#E0972A` measured 2.20:1 against the brand
  gold's 3.06:1; that color is not in the shipped files), add
  gradients or shadows, or squash the aspect ratio.

Regenerate after any change: `python3 design/logo/laticent/generate.py`.
