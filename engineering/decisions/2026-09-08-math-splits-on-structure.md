---
status: shipped
summary: >-
  `math` splits on its rendered STRUCTURE, not on its variant name: eight variants render four
  structures, so `math-structures` dispatches over four arms — equation+legend and the derivation
  step table delegate to the shared `cover-paginate` kernel (the equation and the `<thead>` repeat
  on every body page), while theorem's card stack and compare's columns slice one member per page
  by removing spans; `stats` and `canvas` are fixed scaffolds and keep the whole slide. Moves
  `math` from `atomic` to `read-across`, the treatment that requires a strategy rather than
  permitting a bare axis. Adds the Fit Spine's missing COLLAPSE move for equations:
  `lib/core/tex-linebreak.js` breaks a display equation too long for the slide onto `aligned`
  lines, descending into the delimiter group that dominates the long side, and gates on the same
  non-`wide` family test autosplit uses — so every 16:9 render is byte-identical. Measured on
  `math feature`'s sample at portrait: 2587px of ink against a 972px stage, 1850px broken, 925px
  at the multi-line display scale keyed on the marker the pass emits. Fixes three kernel defects
  the enrollment surfaced — a display equation hoisted to the cover as a lede and lost from every
  body page, a forward pointer reading "X X X" off KaTeX's a11y mirror, and a claimed blockquote
  set cut from every page onto a closing page.
builds-on: 2026-09-01-autosplit-splits-on-structure.md, 2026-07-22-structure-derived-split-patterns.md, 2026-06-22-the-fit-spine.md
---

# math splits on structure, and a long equation is broken before it is typeset

**Date** 2026-09-08 · **Issue** #2136 · **Follows** #2129 (math onto the shared Form frame)

## The ruling

> "we split on structure, unique structure gets a split preprocessor"
> — owner, 2026-09-08

…plus **both** levers for an equation wider than the slide: a TeX line-break preprocess **and** a
re-test of the tall families' display scale-up.

## Why math needed a seam at all

The Fit Spine's axiom order is **collapse → shed → split → never scale**
(`2026-06-22-the-fit-spine.md`). `math` was `atomic`, so the third rung did not exist for it, and
#2129's portrait work reached for the fourth at every turn — `1.15em` on the derivation table,
`1.55em` on decompose's equation, tighter card padding on theorem. Each bought fit by spending
legibility. One structural element per page sets each equation on one line at full size.

## Four structures, not eight variants

Measured off the committed manifest samples, rendered at `hd`:

| variant | rendered stage children | structure |
|---|---|---|
| bare / `feature` / `matrix` / `decompose` | `p > ul` | equation + legend |
| `derivation` | `table` | step table |
| `theorem` | `blockquote × 3` | card stack |
| `compare` | `h3 > p > p` × 2 | columns |
| `stats` | `p > blockquote > p` | fixed scaffold |
| `canvas` | `p > p > div.functionplot` | fixed scaffold |

`math-structures` (`lib/core/carousel.js`) dispatches on that shape.

**Two arms are the shared kernel, not new code.** equation+legend is a `<ul>` under a `<p>` and
the step table is a `<table>` — exactly what `cover-paginate` paginates, with the equation and the
`<thead>` repeating on every body page because they sit outside the collection. A legend page
without its equation is unreadable, which is the same argument the `journey` oracle entry makes
about repeating its mood key.

**Two arms have no collection, which is why they need a preprocessor.** Markdown renders theorem's
cards as sibling `<blockquote>`s and compare's columns as a flat `h3, p, p, h3, p, p` run. Both
slice by REMOVING SPANS rather than re-authoring the body — the plain envelope's discipline, and
`redline-blocks`'s — so every wrapper, cell and chrome node stays where the engine put it. Both
stamp `data-split-label`, because `membersIn` resolves a page's members as its first list and
neither structure has one, so the forward pointer would otherwise be silent.

**`stats` and `canvas` fall out rather than being special-cased.** `stats` has one blockquote,
below the two-member floor; `canvas` has a plot and no repeating collection. The strategy returns
null and both keep ringing.

## Placement: read-across, for roadmap's and journey's reason

`read-across` is the treatment that REQUIRES a strategy instead of permitting a bare axis
(`treatmentViolations` in `lib/core/split-facts.js`). That is the guarantee wanted: a bare `item`
axis would let a later change paginate the two scaffolds off the first `<ul>` it found. It is also
true of the content — an equation and its legend ARE read across.

No `capacity.relationship`. The carousel signal is universal since 2026-09-01 and `sequence` is its
default; the four structures disagree about what a declared relationship would be (a proof chain is
a sequence, a symbol legend is a set), and one value cannot serve both.

## The two levers, measured

`math feature`'s committed sample (the logistic log-likelihood) against a 972px stage:

| form | portrait ink | over the box |
|---|---|---|
| as authored, one line | 2587px | 1615 |
| `aligned`, broken at the top-level `=` | 2606px | 1634 |
| …plus the `+` inside the bracket (what the pass emits) | 1850px | 878 |
| …at the multi-line display scale | 925px | **fits** |

Two things in that table decide the design. **Breaking at the top-level `=` alone is WORSE than
not breaking** — the `aligned` column adds width and the long side never moves — so a depth-0-only
pass is a regression, not a weak fix. And the win comes from DESCENDING into the delimiter group
that dominates the long side, which is where the author's `+` actually lives. #2136's own table
stopped one break short and concluded line-breaking hits a floor at 1694px; it does not.

`lib/core/tex-linebreak.js` is the rule, `displayBlock` in `lib/engine/math.js` is the seam, and
the pass runs **only for a non-`wide` family** — the same gate `AUTOSPLIT_APPLIES` uses, for the
same reason: a deck is authored at 16:9, so an equation that fits the box the author had in front
of them is one they composed. Every 16:9 render in the repo is byte-identical across this change.

### The second lever is scoped to what the first one broke

`math.styles.css` keys the multi-line display scale off the `data-math-reflow` attribute the pass
emits. A single-line hero keeps its 2.4em, so no slide that fits today moves. This is not the
shrink-to-fit axiom 3 bans: a one-line hero and a three-line derivation are different shapes, and
setting the multi-line one at the single-line size is what made it unreadable.

The 2.4em itself is left alone, and #2129's CSS comment explains why one rule cannot serve both
samples: bare's hero renders 914px inside a 972px box at 2.4em, so dropping the declaration to fit
`feature` would take it from 112.75px to 42.28px — trading one defect for another.

## Three kernel defects this surfaced, all fixed here

Each was found by rendering `examples/math-split-structure.md` at portrait and reading the pages,
not by any gate.

1. **The equation was hoisted to the cover as a LEDE and lost from every body page.**
   `ledeSpansIn` treats a `<p>` between the masthead and the collection as framing prose, and a
   `$$…$$` renders as exactly that. The cover then set a display equation inside
   `.split-feat-lede`, which takes inline content. Fixed in `split-envelope.js`: a `<p>` carrying
   a display equation is the slide's subject, never its framing.
2. **The forward pointer read "→ X X X".** KaTeX prints its content three times — `<mi>`, the
   `x-tex` annotation, and the visual span — and `textOf` flattened all three. Fixed in
   `relationship.js` by removing the a11y mirror before the tag strip.
3. **All three theorem cards were cut from every page and dumped on a closing page.** `math`
   claims `blockquote` and `trailing-paragraph`, and on three of its four structures the claimed
   element IS a member. `math-structures` joins `MEMBER_CLAIM_STRATEGIES`.

## What this costs, stated plainly

A bare `math` slide with a four-symbol legend that FITS portrait today becomes five pages. That is
the standing structural-split policy (`2026-09-01-autosplit-splits-on-structure.md`), applied
consistently rather than excepted for math: the trigger is the seam, not the fit. The alternative
was a math-only exception to a rule every other enrolled component follows.

## Verified

`examples/math-split-structure.md` at `size: portrait`, indaco — 8 slides out to 28 pages, nothing
clipped, rasterized and read page by page. `math feature` reads clean through
`probeSectionOverflow` at all five registered sizes (hd, square, portrait, story, mobile), against
four of five over before this change. The `verified.math` entry in `test/oracle/split-oracle.json`
carries the per-structure detail.
