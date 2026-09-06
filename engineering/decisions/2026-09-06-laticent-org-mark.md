---
status: proposed
summary: The Laticent mark is an inlaid L — a slate letter with a brass seam let into it, tracing the load path down the stem and out along the arm. It arrived by elimination. Five concepts (a datum, an arch, a lattice substrate, a monogram, a cornerstone) were drawn to shipping quality and independently reviewed; every one landed on an unintended first-second reading — a papal cross, a bank-lobby arch, a chain-link fence, a carpenter's square, a Rubik's cube. Fixing those raised the set to 5.5-7.5 self-scored, and the owner rejected all but the monogram: the target was 10/10, not a clearable 8. The monogram's 6.5 had a nameable cause — it was two rectangles and a square, with no typographic craft — so the rebuild put the craft in: an arm lighter than the stem, a bracketed crook, a seam that bends on a radius echoing that bracket and tapers as load spreads. Two defects proved systemic and are now enforced in the generator rather than eyeballed: gold and slate measure 1.23:1 on dark, so the seam sits in a ground-color recess or it dies in grayscale; and a GitHub or Slack avatar is a circle, so nothing is painted past a 54-unit safe radius.
---

# The Laticent mark is an inlaid L

**Ask (2026-09-06, the owner, verbatim):**

> we have incredible logos for libraries and lattice. we need to create one for
> Laticent. we need to create 5 killer boardroom 10/10 designs iterated 5 times
> with the best iteration selected from each design. don't settle.

## What the parent has to do that a product mark does not

Laticent sits above Lattice, Cadenza, Lente, Suono and Vetrina. The five
products share a form language — circular, radial, one chromatic hue each,
plus a warm gold — so the parent has exactly two ways to differ, and only one
of them is cheap.

**Color is the cheap axis, and it is the right one.** The parent takes no
product hue: slate structure plus the family's shared gold. It reads as the
root rather than a sixth sibling, and it costs nothing structurally.

**Form is the expensive axis.** Every reviewer independently reported that a
parent which also abandons the family's construction idiom stops looking like
the root these five grew from and starts looking like a mark from another
company's system that happened to get the same color file. That is why the
candidates keep the family's *construction* — a haloed focal element, a
128 viewBox, one adaptive file per asset — while varying the silhouette.

## The two roots, as drawing constraints

| Latin root | What it demands |
| --- | --- |
| *latus* — broad, expansive | the surface is the widest thing in the frame |
| *latere* — the hidden bedrock | the load-bearing part recedes; it never shouts |

The second is the one that keeps getting lost, and it fails in a specific way:
**fade alone does not read as "buried."** Without a surface — a grade line, a
cut plane, something that separates above from beneath — a faded element reads
as *de-emphasized*, which is the visual grammar of a dimmed bar chart. Three of
the five candidates needed a datum line added before *latere* was true in the
geometry rather than only in the caption.

## What the review caught that iteration did not

Each concept was iterated against real renders in both schemes at 128/64/32/24
before any reviewer saw it. The iteration fixed craft. It did not find a single
one of the following, because they are all **first-second readings** — and you
cannot see the first second of a drawing you have been staring at for an hour.

| Concept | Unintended reading | Fix |
| --- | --- | --- |
| a-core | **Papal cross** — three widening bars on a centered vertical staff. The two-bar minimal variant was a Cross of Lorraine. | Move the pile off the center axis |
| b-keystone | Bank/insurance arch; and a **suono** collision at 24px (radial half-disc, gold tick at 12 o'clock) | Gold moved from the crown to the footing |
| c-substrate | **Chain-link fence**, and the hero element was the *Lattice child mark desaturated* | The grade line now cuts the cell; only the apex shows |
| d-monogram | **Carpenter's square** — the arm ran 1.44× the riser | Arm cut to ~1.06× the riser |
| e-cornerstone | **Rubik's cube** — an n×n×n grid with one off-color cell is the definition of an unsolved twisty puzzle | 3×3×2 courses, true isometry, filled top |

Two further findings were not per-concept at all.

### Gold and slate are the same value on dark

`#F6B64A` on `#9DB2BE` measures **1.23:1**. Every candidate put gold directly
against slate, so on dark the focal element — the keystone, the bearing pad,
the cornerstone — was carried by hue alone. It vanishes in grayscale, in mono
print, and for a viewer with a color vision deficiency. Light mode is fine at
3.45:1, so the defect is one-sided and invisible unless you look for it.

The fix follows the family's own idiom: the product marks already ring their
gold hub with a ground-color halo. `grect()` now fences every gold element the
same way, or the geometry places gold where it only ever meets the ground —
`a-core` draws its pile *behind* the strata, so the gold shows in the gaps and
never touches slate at all.

### A GitHub or Slack avatar is a circle

Two marks had their foundation amputated by a round crop: the grade line and
raft of `b-keystone` sat 68 units from center against a 64-unit radius. The
existing family marks all clear it (41–61), so this was a regression against a
standard the repo already met, not a new constraint.

`SAFE_R = 54` now clamps every horizontal extent, and `audit.py` measures every
painted point in every asset against both the round-avatar radius (64) and the
Android maskable safe circle (51.2). It is a script, not a judgment: the marks
that matter here are the ones nobody looks at in a circle until it is live.

## The pick, and why the set was rejected

Shown the five repaired candidates, the owner rejected all but the monogram:

> these are awful except for the monogram. we are targeting 10/10 boardroom
> ready killer logo not things they can't clear 8

That was the right call and the numbers agreed with it — self-scored, the set
ran 5.5 to 7.5, and two axes capped every one of them. **Category collision:**
the arch, the cube and the bare L all sit in occupied space, while the datum
and the substrate were uncrowded but unmemorable. **Parent fit:** only the
substrate carried anything structural from the children.

The monogram's 6.5 had a cause that could be named and therefore fixed: it was
two plain rectangles and an orange square — no optical correction, no corner
treatment, no proportional system. Craft, not concept, was the gap.

## What the rebuild added

Each move was chosen against a rendered comparison, not asserted.

| Move | Why |
| --- | --- |
| arm at 0.80 of the stem | a horizontal of equal measure reads heavier than a vertical |
| bracketed crook (a quadratic, not a miter) | the single change that makes it read as drawn rather than extruded |
| seam bends on a radius echoing the bracket | a mitered seam inside a bracketed letter is two drawing languages in one mark |
| seam tapers to 0.72 along the arm | load concentrates in the stem and diminishes as it spreads |
| the seam sits in a ground-color recess | real inlay sits in a cut channel — and see below |

Four executions were tried and dropped on the evidence: a seam that **exits
below the baseline** and one that **runs straight through as a pile** both read
as gold leaking out of the letter; a **chiseled arm terminal** read as a slip
rather than as craft; a seam **tracing the counter's inner edge** made the void
busy.

## The recess is not decoration

Gold and slate measure **1.23:1 on dark** — the same value, separated only by
hue. A grayscale render of the seam-on-slate version showed the mark collapsing
to a plain slate L: the seam was carried entirely by hue, so it died in
grayscale, in mono print, and for a viewer with a color vision deficiency. The
ground-color channel restores it by **shape**, which is also what a real inlay
looks like. Light mode was fine at 3.45:1, so the defect was one-sided and
invisible unless measured.

## What is deliberately not settled

**Downstream adoption.** Nothing outside `design/logo/laticent/` changed. The
mark still needs `docs/public/` copies, PWA icons via
`tools/make-pwa-icons.js`, and the site header.

**Parent fit is resolved, and the premise it rested on was half wrong.** See
below.

## Parent fit: why the parent is a tile

The open weakness was stated as "the mark is a letterform in a family of
abstract marks." Rendering the mark **beside the five children for the first
time** showed the framing was half wrong, and the measurement showed why.

**Every one of the five product marks places its hub at exactly (64,64)**,
radius 13-16.5. The family is not merely "has a hub" — it is *organized
around* one. Every child is centripetal. The Laticent L has zero circles.

So the obvious fix was tried: transplant lattice's own core construction
(ground halo, gold disc, deep-gold inner ring) into the letter, at the crook,
at the arm's terminal, at the stem's head, and with the seam removed. **All
four fail, on geometry rather than taste.** A letterform cannot be centripetal
without ceasing to be a letter; the node lands 38 units off center and reads
as a bolted-on dot.

That leaves the resolution the precedent already points at: the parent does
not imitate its children, it differs by **class**. A contained mark beside five
free-standing ones reads as the thing they live inside, which is the actual
relationship — Alphabet, Meta and P&G all do this at the corporate register.
Rendered back into the family row, the tile reads as the parent where the bare
letter read as a mark from another system.

The container pays for itself three more times:

- it converts a *letter* into an *object*, so the lockup stops reading as
  "L Laticent" — the Facebook / Pinterest device;
- its content is the only form here that clears the **Android maskable safe
  circle** (43.7 against 51.2), which no free-standing mark in this family
  does, the existing five included;
- a full-bleed tile is what an app icon wants.

Two errors were caught while building it, both by measurement rather than eye:

- **The tile must not adapt.** Letting it follow `prefers-color-scheme`
  inverted it into a glaring bright block on dark. An app-icon tile is a brand
  constant; only the ground behind a lockup and the wordmark shift.
- **Lightening the seam for the tile was backwards.** The seam never touches
  the tile — it sits inside the cream letter — so lifting it from `#C67A12` to
  `#E0972A` took contrast from 3.06:1 to **2.20:1**, under the 3:1 graphical
  floor, to solve a problem that did not exist.

`audit.py` grew two capabilities for this and both were load-bearing: it
recognizes a full-bleed tile and judges its *content* against the maskable
circle rather than flagging corners it is designed to lose, and it is now
**transform-aware** — ignoring the tile's `translate`+`scale` reported the
letter's pre-scaled coordinates, and a wrong number from a gate is worse than
no gate.

## Files

- `design/logo/laticent/generate.py` — the tile, the mark, minimal variants and lockups
- `design/logo/laticent/audit.py` — the crop / bounding-box gate
- `design/logo/laticent/laticent-*.svg` — the eight master assets
- `design/logo/laticent/README.md` — palette, rules, regeneration
