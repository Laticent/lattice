# Laticent org mark — the inlaid L

A slate **L** with a brass seam let into it, tracing the load path down the
stem and turning out along the arm. Laticent is the parent of Lattice,
Cadenza, Lente, Suono and Vetrina, so the mark answers to the name first:

| Latin root | How the drawing says it |
| --- | --- |
| *latus* — broad, expansive | the arm runs 76 against an 84 cap height, so the letter's own stance is wide |
| *latere* — the hidden bedrock | the seam is the load path — the structure that carries the letter, made visible as one line |

## Files

| File | What | Use |
| --- | --- | --- |
| `laticent-mark.svg` | Full mark, light+dark adaptive | Anywhere ≥28px |
| `laticent-mark-min.svg` | Reduced mark, adaptive | Favicon / app icon, ≤24px |
| `laticent-lockup.svg` | Mark + wordmark, dark text | On light surfaces |
| `laticent-lockup-dark.svg` | Mark + wordmark, light text | On dark surfaces |
| `generate.py` | Source of truth — regenerates all four | `python3 generate.py` |
| `audit.py` | Crop / bounding-box gate | `python3 audit.py .` |

## Palette — the achromatic parent

The five products each carry one chromatic hue plus a shared warm gold. The
parent carries **no product hue**: slate and the same gold. That is what makes
it read as the root rather than a sixth sibling.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| Slate | `#2C3A43` | `#9DB2BE` | the letter |
| Gold | `#C67A12` | `#F6B64A` | the seam |
| Ground | `#F6F3EC` | `#101314` | the recess the seam sits in |
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

Both were caught failing in review, and neither is visible at 128px.

- **The recess.** Gold and slate measure **1.23:1 on dark** — the same value,
  separated only by hue. The ground-color channel around the seam is what a
  real inlay has, and it is also what keeps the seam visible in grayscale, in
  mono print, and for a viewer with a color vision deficiency. Without it the
  mark collapses to a plain slate L; verified on a grayscale render.
- **Round-crop safety.** A GitHub org or Slack avatar is a **circle**. Nothing
  is painted more than `SAFE_R = 54` units from the center. `audit.py` measures
  every painted point; the family marks run 41–61 and both assets here clear it.

## Rules

- **Clear space:** one stem-width on all sides.
- **Minimum size:** full mark to ~28px; below that use `laticent-mark-min.svg`.
- **Dark mode:** ship the adaptive SVG. Never hand-recolor — the file carries
  its own `prefers-color-scheme` block, as the rest of the family does.
- **Wordmark:** Fraunces / Cormorant Garamond (Georgia fallback), 600,
  letter-spacing −1, on the family's lockup geometry (mark at `scale 0.9375`,
  text at `x=150`, `font-size 70`).
- **Don't:** put a product hue in it, remove the recess, lay the seam directly
  on the slate, add gradients or shadows, or squash the aspect ratio.

Regenerate after any change: `python3 design/logo/laticent/generate.py`.
