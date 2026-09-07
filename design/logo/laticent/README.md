# Laticent org mark — the incised L

An **L** with the load path cut into it, running down the stem and turning out
along the arm. Laticent is the parent of Lattice, Cadenza, Lente, Suono and
Vetrina.

The name's two roots are *latus* (broad, expansive) and *latere* (the hidden
bedrock). **Only the second is expressed in the drawing**, and saying so is a
correction: earlier drafts of this file claimed the arm's proportion carried
*latus*, on the grounds that "a Garamond L is nearer 0.60 of its cap; this is
0.81, so the letter's own stance is broad." That is backwards. Measured by
pixel scan at weight 600:

| Face | L ink width / cap height |
| --- | --- |
| Liberation Serif | 0.927 |
| FreeSerif | 0.911 |
| DejaVu Serif | 0.870 |
| **EB Garamond** | **0.847** |
| Cormorant Garamond | 0.788 |
| Fraunces (the wordmark's own face) | 0.739 |
| **the mark** | **0.810** |

A real Garamond L is *wider* than this mark, and 0.810 sits mid-range among
every serif measured. The proportion is unremarkable and claims nothing.

What the drawing does say is *latere*: the load path is incised rather than
drawn on, present but recessive — the structure that carries the letter,
never shouting.

## Two forms, two jobs

**The bare letter is the identity.** It shares the children's free-standing
class and is achromatic where they are chromatic.

**It does not share their visual density, and an earlier version of this line
said it did.** Measured at 256px against the five product marks:

| | ink coverage | contour density |
| --- | --- | --- |
| **laticent-mark** | **15.1%** | **0.90** |
| lattice | 19.9% | 1.54 |
| cadenza | 9.7% | 1.62 |
| lente | 11.8% | 1.73 |
| suono | 19.6% | 3.74 |
| vetrina | 14.7% | 2.17 |

On ink coverage the parent is mid-range. On **contour density** — edge pixels,
which is what the eye reads as busy-ness — it is 1.7x to 4.2x sparser than
every child: five open radial constructions beside one solid slab. Look at a
family row and you see it immediately. "Same visual density" was the fourth
claim in these documents composed rather than measured (see below).

**The tile is the square-surface form.** App icons, favicons and org avatars
need a ground — a letter alone in a round crop looks unfinished — and the bare
letter does not clear the Android maskable safe circle (56.4 against 51.2)
while the tile's content does (45.3). That is a design judgment plus one
supporting measurement, and it is deliberately stated as such.

**It is not "the only form in the family that clears the maskable circle."**
This file said that, and it is false: `lattice-mark.svg` measures 46.1 and
`lente-mark.svg` 41.0, both inside 51.2. Run `python3 audit.py ../../../docs/public`
and it prints them.

That was the **second** false justification written for this tile. The first
claimed "Alphabet, Meta and P&G all do this at the corporate register" — none
of them does; Alphabet is a bare wordmark, Meta a free-standing loop, P&G a
wordmark with a moon-and-stars device. Both claims were composed rather than
checked, and the tool that disproves the second sits in this directory and
takes four seconds to run. Treat any load-bearing claim here as unverified
until you have re-run it.

## Usage

| Surface | Use |
| --- | --- |
| App icon, favicon, avatar, any square or round crop | `laticent-tile.svg` (`-min` below 48px) |
| Beside the product marks; monochrome, engraving, small print | `laticent-mark.svg` (`-min` below 40px) |
| Site header, documents, letterhead | the wordmark alone |
| Formal first-impression use | `laticent-lockup-on-light.svg` / `-on-dark.svg` |

## Files

| File | What | Use |
| --- | --- | --- |
| `laticent-tile.svg` | Cream letter on a fixed bluestone tile, brass groove | App icon, favicon, avatar |
| `laticent-tile-min.svg` | Reduced tile — solid letter, no groove | below 48px, down to 16 |
| `laticent-mark.svg` | The bare letter, light+dark adaptive, groove cut in | Family row, monochrome |
| `laticent-mark-min.svg` | Reduced bare letter — solid, adaptive | below 40px, down to 32 |
| `laticent-lockup-on-light.svg` / `-on-dark.svg` | Tile + wordmark | Formal use, at 260px wide or more |
| `laticent-lockup-bare-on-light.svg` / `-on-dark.svg` | Letter + wordmark | Where a container is wrong, at 240px wide or more |
| `generate.py` | Source of truth — regenerates all eight, asserts four invariants | `python3 generate.py` |
| `wordmark.py` | **Generated.** The wordmark as a path | — |
| `outline-wordmark.py` | Re-outlines the wordmark from Fraunces | On demand; needs network |
| `audit.py` | Crop gate, transform-aware | `python3 audit.py .` |

## Palette

The five products each carry one chromatic hue plus a shared warm gold. The
parent carries **no product hue**: slate and the same gold.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| Slate | `#2C3A43` | `#9DB2BE` | the bare letter |
| Groove | `#16202A` | `#5E7684` | the cut in the bare letter |
| Gold | `#C67A12` | — | the tile's groove; fixed |
| Tile | `#526D7D` | — | the container; a brand constant |
| Cream | `#F6F3EC` | — | the letter reversed out of the tile |
| Wordmark | `#241F1B` | `#E6E2DD` | lockup text |

**The tile does not adapt to the color scheme.** An app-icon tile is a brand
constant — Facebook's `f` stays blue. Letting it follow
`prefers-color-scheme` inverted it into a glaring bright block on dark.

**Why the tile is mid-tone and not near-black.** It was `#25333C`, and that was
a blocking defect: a near-black tile measures 1.27–1.46:1 against the dark
grounds it has to sit on, so the container was invisible exactly where a
container has to hold — a GitHub org avatar. Nothing dark can clear 3:1 against
a dark ground; a visible container must be mid-tone. `#526D7D` is the deepest
slate that clears 3:1 on cream **and** on every one of those grounds:

| Ground | Ratio |
| --- | --- |
| cream `#F6F3EC` | 4.93 |
| GitHub dark `#0d1117` | 3.46 |
| this repo's dark `#101314` | 3.41 |
| zinc-900 `#18181b` | 3.24 |
| VS Code dark `#1f1f1f` | 3.02 |

## What makes it the letter and not two rectangles

Each move was picked against a rendered sweep in both schemes.

- **Stem at 20 of an 84 cap** (0.24). At 25 (0.30) it read as machined angle
  iron; at 16 it went wiry by 24px.
- **Arm at 68.** At 76 it read as a bracket or a carpenter's square at *every*
  stem weight. Note what that does and does not prove: real serif L's go to
  0.93 and stay letters, so the limit is this monoline drawing's, not a general
  one.
- **The arm is lighter than the stem** (`0.80`). A horizontal of equal measure
  reads heavier than a vertical.
- **The crook is bracketed** — a quadratic transition, not a dead 90° miter.
  The single move that makes it read as drawn rather than extruded.
- **No stem taper.** The previous drawing narrowed the stem 3.5 over 84, and
  that slope never lands on the pixel grid: the most prominent vertical
  rendered fuzzy at 48px while the right edge stayed razor sharp.

## The groove

It is drawn as a **stroked centerline**, never outlined by hand, and
**clipped** to the letter so it physically cannot escape the shape it is cut
into. The original seam was a hand-built polygon, and three defects came out of
that one decision: it bulged to 113% at the crook (round inner edge against a
mitered outer one), its recess landed asymmetric because a hand-offset outline
cannot be centered, and it needed a taper fitted by eye. A stroked centerline
with a round linejoin holds constant width around the bend and is symmetric by
construction.

**Both ends run OUT of the letter**, and the clipPath cuts them at the contour.
Stopping them inside left two free ends floating in the plane at two different
lengths, which is what a line *drawn on* a surface looks like — cut material
either reaches an edge or terminates deliberately. Side by side, stopping short
reads as a typographic inline; running out reads as a channel through material.
The cost is small and worth naming: at the two exits the brass meets the tile
at **1.61:1**, so the terminations are soft rather than crisp. For a channel
that runs off an edge, that is arguably correct.

**It is a darker value of the letter, not a hole to the ground.** This is the
difference between reading as an incision and reading as an outline, and it was
got wrong twice:

| Attempt | Why it failed |
| --- | --- |
| brass seam on slate | 1.23:1 on dark — same value, different hue. The letter read as two disconnected pieces and went flat in grayscale |
| brass fenced by a ground-color recess | five bands across a 20-unit stem, and on dark the recess **is** the ground, so it severed the letter into two floating rails |
| a hole cut to the ground | identical value on both sides of the contour, which cannot signal depth — only edge. It read as a hollow inline L or a corner bracket at every size, and below 48px stayed a spindly bracket instead of settling into a letter |

A cut in a surface is darker than the surface. That is what the eye reads as a
cut, and it is why the groove measures **1.41:1** against the letter in light
and **2.17:1** in dark — deliberately below the 3:1 graphical floor. The groove
models depth and carries no information; the **letter** holds 10.6:1 (cream)
and 8.5:1 (dark) against the ground, and the mark is fully legible with the
groove invisible. Pushing it to 3:1 makes it a stripe again.

In the tile the same groove is **brass**, at 3.06:1 against the cream letter.

## The wordmark is a path, not live text

Measured in real Chromium, "Laticent" at font-size 70 / weight 600 /
letter-spacing −1 spans **219.6 to 315.9 units** across the family's own
fallback chain — Fraunces 248.0, Cormorant 219.6, Liberation (what Linux gives
for Georgia and Times) 240.8, DejaVu (what a bare `serif` gives) 315.9,
FreeSerif 236.4. No fixed allotment is both tight and safe across that spread:
the shipped 300 clipped DejaVu by 15.9, and widening it to 316 would leave 68
units of dead space in the intended face.

Fraunces is SIL OFL 1.1, which permits outlining glyphs into artwork. The
resulting path is artwork, not a font. The exact face is pinned by sha256 in
`outline-wordmark.py`, which warns if Google Fonts serves a different one —
without that, a Fraunces release would silently redraw the wordmark, which is
the problem outlining exists to solve, one layer up.

The five sibling lockups still set live `<text>` and still carry this defect.
Changing them is a shared-asset decision, not one this mark can take alone.

## Two things about the SVGs themselves

**Only the adaptive assets carry a `<style>`.** An inline `<svg><style>` in an
HTML document is **document-scoped**, not SVG-scoped. Inlining
`laticent-lockup-on-dark.svg` (a bare `.sf{fill:#9DB2BE}`) alongside
`laticent-mark.svg` (media-queried) let the lockup win on source order and
painted the light-mode mark at **1.99:1 on cream** — a brand page showing the
asset set is exactly that surface. The single-scheme lockups and the
fixed-color tiles now paint by attribute, and the two remaining class names are
prefixed `lat-` so a host page's own `.sf` cannot collide.

**The groove is clipped, not fitted, in BOTH forms**, and the clip is now
load-bearing rather than belt-and-braces: the groove deliberately overruns the
contour at both ends, so the clip is what terminates it. `assert_invariants()`
checks only the LENGTHWISE margins now — a head/tail arm would assert the
opposite of the design. This line claimed both forms while only `mark()` did it — backwards, since
the tile is where escape actually hurts (brass on the tile ground is 1.61:1, so
the groove reads only while cream surrounds it). `assert_invariants()` catches a
bad inset or tail on its own, but a claimed second layer that does not exist is
worse than an honest single one.

## What the generator enforces

`assert_invariants()` proves four things from the geometry at generate time,
and every arm was mutation-tested until it fired.

1. **The groove never breaks out of the letter.**
2. **Nothing is painted past `SAFE_R`.** A round avatar crop is a circle of
   radius 64; `SAFE_R = 58` is that with a ~10% margin. The constant said 54
   while the letter measured 56.4.
3. **The bare lockup's mark sits on the wordmark's baseline**, inside the
   1.2–1.6 cap-height convention. This one **reads the emitted SVG**: computing
   it from `MARK_INK` was tautological and could not fail however badly the
   lockup broke.
4. **The tile's content clears the maskable circle.** That measurement is the
   tile's supporting evidence and was produced only by `audit.py`, which is
   wired to no npm script, no hook and no CI job.

Both measure **painted vertices**, not bounding-box corners — an L has no ink
at its top-right, and measuring the bbox put the tile at 48.2 against
`audit.py`'s real 45.3. A gate that disagrees with the tool it exists to
pre-empt is worse than no gate.

## Rules

- **Clear space:** one stem-width on all sides.
- **Minimum size**, per asset:

  | Asset | Minimum | What fails just below it |
  |---|---|---|
  | `laticent-lockup-on-*` | **260px wide** | 10 ink components down to 255; 11 at 250 — a wordmark stroke splits |
  | `laticent-lockup-bare-on-*` | **240px wide** | 10 down to 240; 12 at 230 |
  | `laticent-tile` | **48px** | the groove's value spread holds at 112 down to 48, falls to 75 at 44 |
  | `laticent-mark` | **40px** | spread holds at 25 down to 40, falls to 19 at 38 |
  | `laticent-mark-min` | **32px** | erosion 40% at 32, 51% at 28 — the stroke goes hairline |
  | `laticent-tile-min` | **16px** | the favicon floor; at 16 the letter is one pixel thin throughout, and it holds only because it is solid ink on a solid ground |

  There is no `-min` lockup, so below 240px the answer is the wordmark alone or
  the symbol — never a shrunken lockup.

  These are measured on three arms: the count of connected ink components (a
  rise means a stroke split, a fall means two merged, either is a failure), the
  share of ink lost to a one-pixel erosion, and the value spread inside the
  letter. **An earlier version of this file gave ~46px for both symbols** on a
  solid-ink-against-mean-alpha ratio, which cannot see a tile at all — a
  full-bleed rounded rect reads 99% at every size whatever happens to the letter
  inside it — and cannot see a stroke splitting. Before that it said 28px, which
  was arithmetic nobody did.

  The arithmetic floor still holds as a lower bound: the groove is 3.4 units in
  a 128 viewBox, so it drops under one device pixel at **128 / 3.4 ≈ 38px**. All
  of this is **DPR-blind** — at 2x the groove survives smaller, and in print or
  on a 1x projector it does not.
- **Dark mode:** ship the adaptive SVG. Never hand-recolor.
- **Names say the ground, not the scheme.** `-on-light` / `-on-dark` are fixed
  color and name the surface you put them on; a bare name means the file adapts.
  `laticent-tile.svg` is the one bare-and-fixed asset, because it brings its own
  ground and goes on any. Family-wide rule: `../README.md` "Naming".
- **The lockup shares one baseline.** In the bare form the mark IS a letter, so
  its foot sits on the wordmark's baseline — flat foot to flat foot, no
  overshoot (that is for curves), at 1.35 cap heights. The first version hung
  the mark **9.2px below the baseline** at 2.1× cap height, because it centered
  the em box with `dominant-baseline="central"` and "Laticent" has no
  descenders, so its mass rides high in that box.
- **The tile shares no baseline** — it is not a letter. It is centered on the
  wordmark's **cap band**, at 1.65 cap heights. At 1.45 it reads subordinate to
  the word; at 1.90 it swamps it.
- **Don't:** put a product hue in it, make the groove a hole or a contrasting
  stripe, put brass on slate, let the tile follow the color scheme, let the
  groove touch the tile (1.61:1), add gradients or shadows, or squash the
  aspect ratio.

## Known limits

- **`prefers-color-scheme` tracks the user's OS, not the surface.** A
  light-mode user on a dark page gets `#2C3A43` at 1.62:1 on GitHub dark and
  2.14:1 on the brand's own bluestone. This is the family's convention — all
  five siblings do it — so it is logged here rather than fixed in this diff
  (HARD RULE #18, off-path), but it is a real limit, not a solved problem.
- **On a dark page, a light-scheme viewer gets the retired hole design back.**
  The groove `#16202A` against GitHub dark is **1.148:1** and against zinc-900
  **1.075:1** — the groove *is* the ground there, so it reads as a hole cut
  through the letter to the page, which is precisely the failure the groove
  replaced. It is the same root cause as the line above and has the same
  status: logged, not fixed here.
- **The groove's rendered strength is not monotonic in size.** Because it is a
  sub-pixel feature, it strengthens and weakens with pixel phase. Nothing in the
  design controls that, and it is why the floors above are set where a measure
  *stays* good rather than at the last size that happens to measure well.
- **Nothing here has been seen on a real device.** Every render is headless
  Chromium. An installed Android icon under a real maskable mask, a live GitHub
  org avatar, an iOS home screen and a print proof are all **UNVERIFIED**.
- The sweeps that chose `TILE_PAD`, `bracket`, the groove width and the two
  lockup constants are not committed, so those conclusions cannot be re-derived
  from the tree — only re-run.

Regenerate after any change: `python3 design/logo/laticent/generate.py`.
