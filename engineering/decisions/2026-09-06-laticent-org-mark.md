---
status: proposed
summary: The Laticent mark is an incised L — a letter with the load path cut INTO it as a groove, a darker value of the letter itself, down the stem and out along the arm. It arrived by elimination and then survived three rebuilds, each forced by an independent checker. Five original concepts all landed on an unintended first-second reading (a papal cross, a bank-lobby arch, a chain-link fence, a carpenter's square, a Rubik's cube) and the owner rejected all but the monogram. The rebuilds are the interesting part. A near-black container measured 1.27-1.46:1 against every dark ground it has to sit on, so the container that was the whole argument was invisible on a GitHub org avatar. Brass on slate is 1.23:1 on dark, and the ground-color recess meant to fence it severed the letter rather than framing it. Cutting the channel to the ground instead put IDENTICAL VALUE ON BOTH SIDES OF THE CONTOUR, which cannot signal depth — only edge — so it read as a hollow inline L. The groove that replaced it is darker than the letter and clipped to it, deliberately below the 3:1 graphical floor because it models depth and carries no information. Along the way the wordmark turned out to be live text whose width spans 219.6 to 315.9 units across its own fallback chain (now outlined from Fraunces and pinned by sha256), and the outliner's own normalizer was corrupting twelve path commands. The lasting lesson is not any of those: it is that FOUR load-bearing justifications in these documents were composed rather than checked, every one of them the headline sentence of its section, while every merely descriptive number verified exactly.
---

# The Laticent mark is an incised L

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

`SAFE_R` now clamps every horizontal extent (it read 54 here and in the generator while the letter measured 56.4; it is 58 now, and asserted rather than claimed), and `audit.py` measures every
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

## What the first rebuild added — and how much of it is now retired

This table is kept because the *reasoning* is still the record, but three of
its five rows describe a seam that no longer exists. Read it as history.

| Move | Why | Status |
| --- | --- | --- |
| arm at 0.80 of the stem | a horizontal of equal measure reads heavier than a vertical | **kept** |
| bracketed crook (a quadratic, not a miter) | the single change that makes it read as drawn rather than extruded | **kept** |
| seam bends on a radius echoing the bracket | a mitered seam inside a bracketed letter is two drawing languages in one mark | **retired** — the seam is a stroked centerline now, so the bend is free |
| seam tapers to 0.72 along the arm | load concentrates in the stem and diminishes as it spreads | **retired** — 1.46 units total, 0.2px at 24px, invisible |
| the seam sits in a ground-color recess | real inlay sits in a cut channel | **retired** — see below; it severed the letter on dark |

Four executions were tried and dropped on the evidence: a seam that **exits
below the baseline** and one that **runs straight through as a pile** both read
as gold leaking out of the letter; a **chiseled arm terminal** read as a slip
rather than as craft; a seam **tracing the counter's inner edge** made the void
busy.

## The recess was the right diagnosis and the wrong cure

Gold and slate measure **1.23:1 on dark** — the same value, separated only by
hue. A grayscale render of the seam-on-slate version showed the mark collapsing
to a plain slate L. That much was correct and it is why the seam is gone.

The cure was not. Fencing the seam with a ground-color recess makes the stem
FIVE bands wide — slate / near-black / gold / near-black / slate across 20
units — and on dark the near-black recess *is* the ground, so it does not frame
the seam, it severs the letter into two floating rails. Rendered side by side
against the flush seam it is visibly the worse of the two, and it shipped
because it was only ever judged on light.

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

That left containment, argued at the time as "the parent differs by CLASS —
a contained mark beside five free-standing ones reads as the thing they live
inside", and supported with a precedent that **does not exist**. This note
claimed "Alphabet, Meta and P&G all do this at the corporate register." None of
them does: Alphabet is a bare wordmark, Meta a free-standing loop, P&G a
wordmark with a moon-and-stars device. Not one differentiates from its children
by containing the parent. The real containered-letter precedent — Facebook's
`f`, Pinterest's `P` — is for **product** marks. An independent critic
separately reported that "different class" and "doesn't belong" look identical
here, with no shared construction, stroke weight, geometry or ground to
separate them.

The argument was replaced rather than patched, and the replacement is in
§ "Two forms, two jobs" below. It rests on a measurement instead of a claim
about hierarchy.

The container pays for itself three more times:

- it converts a *letter* into an *object*, so the lockup stops reading as
  "L Laticent" — the Facebook / Pinterest device;
- its content is the only form here that clears the **Android maskable safe
  circle** (45.3 against 51.2), which the bare letter does not (56.4) — but
  NOT, as this note first claimed, the only form in the family that does:
  `lattice-mark.svg` measures 46.1 and `lente-mark.svg` 41.0. The 43.7 written
  here was also wrong; `audit.py` says 45.3;
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

- `design/logo/laticent/generate.py` — the tile, the mark, minimal variants, lockups
- `design/logo/laticent/outline-wordmark.py` — re-outlines the wordmark (on demand, needs network)
- `design/logo/laticent/wordmark.py` — generated: the wordmark as a path
- `design/logo/laticent/audit.py` — the crop / bounding-box gate
- `design/logo/laticent/laticent-*.svg` — the eight master assets
- `design/logo/laticent/README.md` — palette, rules, regeneration

## The third rebuild — a checker on the second

A second independent checker read the rebuilt mark. It found two shipped
correctness bugs, refuted the headline design claim, and named the reason the
central idea was not landing. All of it held up.

### The wordmark path was geometrically corrupt

`outline-wordmark.py` normalized the outline to start at x=0 by regexing the
serialized path and subtracting `x0` from every coordinate **pair**.
`SVGPathPen` also emits single-number `H` (horizontal-lineto) commands, whose
values are absolute x. Twelve of them went un-offset, which cut white slits
through the `e` and both `t` crossbars and stepped the `L`'s serifs. It shipped
in all four lockups.

The tell was in the data: the path's largest `H` is 246.58, and `INK_W` is
244.76 — a difference of exactly the 1.82 that was never subtracted, followed
by a 2.27-unit backward jump into the next curve.

Worse than the visible damage: `SVGPathPen` drops the command letter on
repeats, so two adjacent `V`s serialize as `V-4.31 -10.00` — a *pair* the regex
would have matched, silently corrupting a **y** coordinate. Today's string
happens to contain no adjacent V pair. A different name, weight or font release
would.

**The fix is not a better regex.** The offset is folded into the glyph
transform, in a two-pass run that learns `x0` first. A transform cannot
misidentify which numbers are x.

### The channel could not read as depth, by construction

The mark was an "incised L" whose channel was a hole cut to the ground. The
checker's observation is the one that matters:

> identical color on both sides of the contour cannot read as depth; it can
> only read as outline.

That is exactly right, and it explains every reading it reported — a hollow
inline L, a corner bracket, a crop mark — and why below 48px it stayed a
spindly bracket instead of settling into a letter. The cure had reproduced the
disease: "severed the letter into two floating rails" was written in this very
file about the *brass recess*, and the hole did the same thing in a different
color.

**A cut in a surface is darker than the surface.** The groove is now a darker
value of the letter, clipped to it. Rendered against the hole and against a
solid letter at 128/48/24 in both schemes, it is the only one of the three that
reads as a solid letter with a cut in it.

Two consequences worth noting:

- The groove sits at **1.41:1** (light) and **2.17:1** (dark) against the
  letter, deliberately under the 3:1 graphical floor. It models depth and
  carries no information — the letter holds 10.6:1 and 8.5:1 against the
  ground. Every earlier attempt failed by insisting the channel clear 3:1,
  which is what makes it a stripe.
- The bare mark and the tile are now both **fills**, so they share one width.
  The two-width "a void reads wider than a fill" optical correction was true of
  the hole and is now moot.

### An inline `<style>` is document-scoped

Inlining `laticent-lockup-dark.svg` (bare `.sf{fill:#9DB2BE}`) beside
`laticent-mark.svg` (media-queried `.sf`) let the lockup win on source order
and painted the light-mode mark at **1.99:1 on cream**. A brand page showing
the asset set is precisely that surface. Only the two adaptive marks carry a
`<style>` now, their rules byte-identical; everything else paints by attribute,
and the class names are prefixed.

### The invariants had a tautology in them

The baseline assertion recomputed the foot from `MARK_INK`, which is derived
from `_geom` — so it was algebraically `BASELINE` and could not fail however
badly the lockup broke. Mutation-testing caught it: six arms fired, that one
was inert. It now parses the emitted SVG's transform, and fires on a wrong
`ty` that the model-side version could never see.

Two arms were also measuring **bounding-box corners**. An L has no ink at its
top-right, so the tile's content reported 48.2 against `audit.py`'s real 45.3.
A gate that disagrees with the tool it exists to pre-empt is worse than no gate.

## Three false claims, one habit

This is the part worth remembering.

| Claim | Reality |
| --- | --- |
| "Alphabet, Meta and P&G all differentiate by containing the parent" | None of them does |
| "the tile's content is the only form in this family that clears the maskable circle" | `lattice-mark` 46.1 and `lente-mark` 41.0 also clear 51.2 |
| "a Garamond L is nearer 0.60 of its cap; this mark's 0.81 is broad" | EB Garamond's L measures **0.847** — *wider* than the mark. Every serif measured runs 0.74–0.93 and 0.81 is mid-range |

Each was the load-bearing sentence of a section. Each was composed rather than
checked. And the second and third were written **into the correction of the
first** — the note that retired the fabricated precedent introduced the
maskable claim in the same edit, and `audit.py`, which disproves it, sits in
the same directory and takes four seconds to run.

The pattern is not carelessness about facts in general: every one of the twelve
contrast ratios in these documents verified exactly, and so did the whole
font-advance table. It is specific to **justifications** — the sentence that
says why a decision is right is the one that gets composed to fit the decision.
Numbers that merely describe get measured; numbers that argue get invented.

The mitigation in the tree is that the tile's maskable figure and the mark's
crop radius are now **asserted by the generator**, so the claim and the
measurement cannot drift apart again. The mitigation in practice is to treat
any "this is the whole argument" sentence here as unverified until re-run.

## Still unverified

- **No real device.** Every render is headless Chromium. An installed Android
  icon under a real maskable mask, a live GitHub org avatar, an iOS home
  screen and a print proof are all UNVERIFIED (HARD RULE #23).
- **`prefers-color-scheme` tracks the OS, not the surface.** A light-mode user
  on a dark page gets the mark at 1.62:1 on GitHub dark. This is the family's
  convention — all five siblings share it — so it is logged, not fixed here.
- **The sweeps are not committed.** `TILE_PAD`, `bracket`, the groove width and
  the two lockup constants were each chosen against a rendered comparison that
  lives only in a scratch directory. The conclusions can be re-run but not
  re-derived from the tree.

## A fourth rebuild, and the fourth composed claim

A second checker read the groove version. Its verdict on the central question
is worth recording in full, because it is a judgment rather than a measurement
and the evidence under it is not in dispute:

> **The groove does not read as an incision.** At 128 light it reads as a
> pinstripe; at 128 dark as a bevel-and-emboss. At 48 light it is a smear; at
> 24 light it is gone. In light mode it never exceeds 1.41:1 at any size and is
> under 1.27:1 at the sanctioned minimum.

Its structural reasons, which are the useful part:

1. **One dark line, no light counterpart.** A cut in a lit surface has two
   walls of *opposite* value. "Darker than the surface" is necessary and not
   sufficient; darker-and-lighter together is what signals a channel. A single
   darker line is what a *drawn stroke* looks like.
2. **Two free ends at two different lengths** (`inset: 15`, `tail: 8`). Cut
   material either runs out at an edge or terminates deliberately; these stop
   mid-plane, inconsistently with each other.
3. **It is concentric with the letter's own contour.** Concentricity is the
   signature of a typographic *inline*, which is exactly what the eye reports.

It also measured the rendered strength as **non-monotonic in size** — 46px
reads stronger than 48px, because a sub-pixel feature strengthens and weakens
with pixel phase. That is now in README.md's limits.

### The defects it found, all confirmed

| | Evidence |
| --- | --- |
| `MIN` was a different letterform, not a reduction | `sw: 23` against `FINAL`'s 20 — a 15% heavier stem, which widened the arm and bracket with it. A leftover from the hole design, where a channel that *removed* ink needed compensating. No rationale anywhere in four documents that all called it "a reduction". Now 20; verified to hold at 16px |
| `laticent-lockup-bare.svg` was badly off-center | 27.50 units of pad on the left against 4.75 on the right, 39.00 below against 21.75 above. `PAD` went to the mark's *box origin* on the left but the wordmark's *ink* on the right, and the mark's ink starts 30 units into its box. Both lockups are padded by ink on all four sides now: 4.00/4.00 and 4.00/4.25 |
| `generate.py` still asserted all three retracted claims | The file README.md calls "source of truth" carried the Garamond 0.60 claim, the hole's "10.6:1 / 8.5:1 channel", and the 28px minimum — every one retracted elsewhere. Docstring rewritten |
| The clipping guarantee was false for the tile | README claimed both forms clip; only `mark()` did. Backwards: brass on the tile ground is 1.61:1, so the tile is the form where escape hurts. Both clip now |
| Duplicate `clipPath` ids | The two bare lockups shared one; so did the tile and both tile lockups. Harmless only because the clip content was byte-identical. All six ids are unique now |
| Dead style rules shipped | `laticent-mark-min.svg` carried `.lat-gv` with no element using it — a dead rule in a document-scoped stylesheet is still live for the rest of the page, which is the exact mechanism this diff was written to fix. `style_for()` emits only what the asset uses |
| The groove returns to a hole on a dark page | `#16202A` against GitHub dark is 1.148:1. For a light-scheme viewer on a dark page the groove *is* the ground — the failure the groove replaced. Logged in the limits |

And one it found in a fix from the same round: the ink-padded lockup's first
`ty` used the mark's *height* where it needed its ink-bottom *coordinate*,
putting the foot 14.95 units low. The invariant that reads the emitted SVG
caught it immediately, which is the entire argument for that arm existing.

### "Same visual density" — the fourth

`README.md` argued the bare letter belongs beside the product marks because it
has "the same visual density". Measured at 256px:

| | ink coverage | contour density |
| --- | --- | --- |
| **laticent-mark** | **15.1%** | **0.90** |
| lattice | 19.9% | 1.54 |
| cadenza | 9.7% | 1.62 |
| lente | 11.8% | 1.73 |
| suono | 19.6% | 3.74 |
| vetrina | 14.7% | 2.17 |

On ink coverage it holds. On contour density — what the eye reads as
busy-ness — the parent is **1.7x to 4.2x sparser than every child**. Half true,
stated as measured, and the half that matters is the false one.

That makes four, and the pattern from the previous section is now confirmed
rather than suspected: **every claim in these documents that argues has needed
correcting; every claim that merely describes has verified exactly.** The two
checkers between them re-derived every contrast ratio, the whole font-advance
table, the L-width table, and both crop figures — all exact.

## Where this leaves the design

Four channel treatments have now been tried — brass flush, brass in a recess, a
hole cut to the ground, and a darker-value groove — and all four failed in the
same class: **a 3.4-unit feature in a 128 box is about 1.3 device pixels at
48px**, and no treatment survives that. The failure is not the treatment. It is
that the idea is being asked to live in a detail smaller than the medium can
hold.

The uncomfortable corroborating fact: in a three-way render the *solid* letter
is the strongest of the three at every size in light and at 24 in dark, and the
solid letter is what `-min` already ships.

That is a direction question, not a defect, and it is the owner's:

- **Ship the solid letter** and let the restraint be the point — arguably the
  brief itself ("great structures don't draw attention to how they are built"),
  at the cost of a mark with no device in it.
- **Give the groove a value pair** — the dark wall plus a light one — so it
  reads as a channel rather than a line. The checker's own highest-leverage
  suggestion, and it risks the bevel reading it already reports on dark.
- **Move the idea out of the detail** and into the silhouette, which is a
  genuine redesign rather than another sweep.

### Testing the checker's own suggestions before putting the fork to the owner

The checker offered two fixes for the inline reading: give the groove a value
*pair*, or run one end out through the arm's terminal. Both were rendered
against the current groove and against a solid letter before asking anything.

| | Result |
| --- | --- |
| **value pair** (dark wall + light wall) | Reads as bevel-and-emboss. It is the cheap-3D look the checker already reports for the dark scheme, made worse. Rejected |
| **one end runs out** | Better — but the head still floats, so the letter keeps one unexplained stop |
| **BOTH ends run out** | The one that works. A continuous channel from the stem's top edge, down, and out through the arm's right edge. No free ends, and it reads as cut material at 128 and 48, closing into a solid letter at 24 |
| **solid** | Clean and confident, and still the baseline this has to beat |

Both ends now overrun the contour and the `clipPath` terminates them, which
makes the clip load-bearing rather than defensive. `assert_invariants()`
therefore checks only the **lengthwise** margins — a head/tail arm would be
asserting the opposite of the design — and all six arms were re-mutation-tested
against the new geometry.

The cost is worth stating: at the two exits the brass meets the tile at
**1.61:1**, so the terminations are soft rather than crisp. For a channel that
runs off an edge that is arguably correct, but it is a tradeoff, not a free win.

This does not settle the direction question in the section above. It removes
the *specific* structural objection the checker raised — two free ends floating
in a plane — and it leaves the deeper one intact: a 3.4-unit feature is about
1.3 device pixels at 48px, and the solid letter is still the thing to beat.
