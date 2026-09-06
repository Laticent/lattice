# Laticent org mark — five candidates

**Status: awaiting the owner's pick.** Five concepts are drawn to shipping
quality — mark, minimal variant, and both lockups each. One gets adopted; the
other four and this directory's `candidates/` folder go away with the pick.

Laticent is the **parent** of Lattice, Cadenza, Lente, Suono and Vetrina, so
every candidate answers to the name before it answers to taste:

| Latin root | What it demands of the drawing |
| --- | --- |
| *latus* — broad, expansive | the surface is the widest thing in the frame |
| *latere* — the hidden bedrock | the load-bearing part recedes; it never shouts |

## The candidates

| Concept | The idea | Best at |
| --- | --- | --- |
| **a-core** | A broad datum at the surface; beneath it the load concentrates into the ground, and one gold pile is driven through the strata | Quiet, sectional, least like a logo |
| **b-keystone** | An arch on piers, with the gold in the **footing**, not the crown | Gravitas; the strongest silhouette |
| **c-substrate** | The grade line cuts one lattice cell — its apex shows, the rest continues below | The tightest tie to the engine's name |
| **d-monogram** | `L` as structure: a riser landing on a plinth, gold at the load joint | Small sizes; the clearest at 16px |
| **e-cornerstone** | A broad coursed plinth with a finished top and one gold cornerstone | Most substantial; best in a round avatar |

## Palette — the achromatic parent

The five products each carry one chromatic hue plus a shared warm gold. The
parent carries **no product hue**: slate structure and the same gold. That is
what makes it read as the root rather than a sixth sibling.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| Slate | `#2C3A43` | `#9DB2BE` | structure — every load-bearing line |
| Gold | `#C67A12` | `#F6B64A` | the accent, and only ever one per mark |
| Deep gold | `#7A5A10` | `#C67A12` | the shaded face of a gold solid |
| Ground | `#F6F3EC` | `#101314` | halos and mortar joints (family halo) |
| Wordmark | `#241F1B` | `#E6E2DD` | lockup text |

Gold and slate sit at **1.23:1 on dark** — the same value, separated only by
hue. So gold is never laid straight onto slate: `grect()` fences it with a
ground-color hairline, or the geometry places it where it only meets the
ground. Without that the focal element of every mark dies in grayscale, in
mono print, and for a viewer with a color vision deficiency.

## Two things the generator enforces

Both were caught failing in review, and neither is visible at 128px.

- **Round-crop safety.** Nothing is painted more than `SAFE_R = 54` units from
  the center, because a GitHub org or Slack avatar is a **circle**. Before the
  clamp, two marks had their foundation sliced off by it. `audit.py` measures
  every painted point; the existing family marks run 41–61, and no candidate
  exceeds 61.
- **A minimal variant is a reduction, not a redraw.** Each `-min` keeps its
  parent's proportions and drops the finest detail. Re-tuning geometry instead
  changes what the symbol *is* — an early two-course `a-core` minimal was a
  Cross of Lorraine.

## Regenerate

```sh
python3 design/logo/laticent/generate.py     # rewrites candidates/
python3 design/logo/laticent/audit.py candidates
```

## Rules (they apply to whichever candidate wins)

- **Clear space:** one course-height on all sides; never crop into `SAFE_R`.
- **Minimum size:** full mark to ~28px; below that use the `-min` variant.
- **Dark mode:** ship the adaptive SVG. Never hand-recolor — the file carries
  its own `prefers-color-scheme` block, as the rest of the family does.
- **Wordmark:** Fraunces / Cormorant Garamond (Georgia fallback), 600,
  letter-spacing −1, at the family's lockup geometry (mark at `scale 0.9375`,
  text at `x=150`, `font-size 70`).
- **Don't:** put a product hue in it, lay gold directly on slate, add gradients
  or shadows, or squash the aspect ratio.
