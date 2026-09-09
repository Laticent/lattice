---
status: shipped
summary: >-
  `math` splits on its rendered STRUCTURE, not on its variant name: eight variants render four
  structures, so `math-structures` dispatches over four arms — equation+legend and the derivation
  step table delegate to the shared `cover-paginate` kernel (the equation and the `<thead>` repeat
  on every body page), while theorem's card stack and compare's columns slice one member per page
  by removing spans; `stats` and `canvas` are fixed scaffolds that refuse BY NAME, and the two
  paginated arms run last and only on a direct-child collection. Moves
  `math` from `atomic` to `read-across`, the treatment that requires a strategy rather than
  permitting a bare axis. Adds the Fit Spine's missing COLLAPSE move for equations:
  `lib/core/tex-linebreak.js` breaks a display equation too long for the slide onto `aligned`
  lines, descending into the delimiter group that dominates the long side, and gates on the same
  non-`wide` family test autosplit uses, which is the same gate the split and the pointer label sit
  behind, so nothing in the MATH work can reach a 16:9 render (the #2132 stylesheet guards below
  do, by design). Measured on
  `math feature`'s sample at portrait: 2587px of ink against a 972px stage, 1850px broken, 925px
  at the multi-line display scale keyed on the marker the pass emits. Fixes nine kernel defects
  the enrollment surfaced — a display equation hoisted to the cover as a lede and lost from every
  body page, a forward pointer that read "X X X" off KaTeX's a11y mirror and then a literal
  `\sigma` off its TeX annotation before it settled on the MathML symbols, a `derivation` step
  page labeled with its own equation instead of the step, and a claimed blockquote set cut from
  every page onto a closing page.
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

**Two arms are the shared kernel, not new code — and they run LAST.** equation+legend is a `<ul>`
under a `<p>` and the step table is a `<table>` — exactly what `cover-paginate` paginates, with the
equation and the `<thead>` repeating on every body page because they sit outside the collection. A
legend page without its equation is unreadable, which is the same argument the `journey` oracle
entry makes about repeating its mood key.

The ORDER is load-bearing and the first cut had it backwards. `cover-paginate` asks one question —
is there a list or a table with two or more members anywhere in the stage — because `firstList` is
deliberately nesting-tolerant. Run first, it outranked the two structural arms whenever a card or a
column happened to contain a list of its own: a `theorem` whose Proof card carried a three-step
list came out having dropped the Definition and Theorem cards entirely and repeating one step
across two pages; a `compare` with bullets under each `###` put BOTH columns on every page and
sliced only the first column's list, out of order. Both measured on real renders. The structural
arms go first now, and the paginated arms additionally require the collection to be a DIRECT child
of the stage — which also means `stageMembers` had to stop using `directChildren` (it tracks
nesting of ONE tag, so a `<ul>` inside a `<div>` reads as a child of the string) and use a real
top-level walk.

**Two arms have no collection, which is why they need a preprocessor.** Markdown renders theorem's
cards as sibling `<blockquote>`s and compare's columns as a flat `h3, p, p, h3, p, p` run. Both
slice by REMOVING SPANS rather than re-authoring the body — the plain envelope's discipline, and
`redline-blocks`'s — so every wrapper, cell and chrome node stays where the engine put it. Both
stamp `data-split-label`, because `membersIn` resolves a page's members as its first list and
neither structure has one, so the forward pointer would otherwise be silent.

**`stats` and `canvas` REFUSE BY NAME, and the first cut of this was wrong about that.** It let
them "fall out of the rules" — `stats` has one blockquote, below the two-member floor, and `canvas`
has a plot rather than a collection — and was pleased with itself for not special-casing them. That
is a claim about the two COMMITTED SAMPLES, not about the variants, and one authoring keystroke
breaks it: write the stats reading as a list instead of a paragraph, which is what this repo's
house style trains an author to do, and `cover-paginate` claims the slide. Measured at portrait:
four pages, the cover carrying the CI and p-value stripped of their panel while the estimate they
qualify sits on the next page — verbatim the failure the demo deck's own slide text says the design
avoids.

Being indivisible is a fact about the VARIANT. The manifest already asserted it in prose; it is
asserted in code now, where the engine can act on it — the same argument that placed math
`read-across` so a bare axis could never paginate these two, which the dispatch was quietly undoing
on its own first line. Found by the HARD RULE #25 inversion.

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

*(Re-derived 2026-09-08 on the real surface, by a second instrument written from scratch rather
than the one that produced the table: typeset each of the four forms with the same KaTeX the engine
uses, inject it into a real rendered portrait slide so the theme cascade reaches it, and measure at
`max-content` — the laid-out rect is clipped to the box and reads 972 for everything, which is the
trap the instrument exists to avoid. Against a 972px stage: **2587 / 2606 / 1848 / 924**. The first
two are exact; rows three and four come in 2px and 1px under, which is subpixel rounding, not a
different answer. The table is left as first measured and this is the check on it. `.scratch/measure-ink.js`
is the probe; it is throwaway, so the method is written out here rather than the path.)*

Two things in that table decide the design. **Breaking at the top-level `=` alone is WORSE than
not breaking** — the `aligned` column adds width and the long side never moves — so a depth-0-only
pass is a regression, not a weak fix. And the win comes from DESCENDING into the delimiter group
that dominates the long side, which is where the author's `+` actually lives. #2136's own table
stopped one break short and concluded line-breaking hits a floor at 1694px; it does not.

`lib/core/tex-linebreak.js` is the rule, `displayBlock` in `lib/engine/math.js` is the seam, and
the pass runs **only for a non-`wide` family** — the same gate `AUTOSPLIT_APPLIES` uses, for the
same reason: a deck is authored at 16:9, so an equation that fits the box the author had in front
of them is one they composed.

**"Nothing on this branch can change a 16:9 render" is what this said, and it is false as written.**
Three of the branch's own stylesheet guards (#2132, the component-id / variant-token collisions)
change 16:9 renders BY DESIGN — the PR body says so in its own section. What is true is the scoped
claim: **the MATH work** cannot reach one, because the reflow, the split and the forward-pointer
label all gate on the same non-`wide` family test (`installMath(… reflow: family !== 'wide')`,
`AUTOSPLIT_APPLIES`, and both new `math.styles.css` blocks keyed on `[data-math-reflow]` /
`.lat-split-native`). That is a claim about the GATES, not a byte-comparison of every deck — one
was not run. (HARD RULE #25 checker; the sentence read as a blanket claim about the branch and was
quoted as one.)

### The second lever is scoped to what the first one broke

`math.styles.css` keys the multi-line display scale off the `data-math-reflow` attribute the pass
emits. A single-line hero keeps its 2.4em, so no slide that fits today moves. This is not the
shrink-to-fit axiom 3 bans: a one-line hero and a three-line derivation are different shapes, and
setting the multi-line one at the single-line size is what made it unreadable.

**The pass reaches every layout; the compensating scale does not, and that is measured rather than
overlooked.** `installMath` is in the shared markdown pipeline, so a display equation on a
`content` slide is reflowed too, while `math.styles.css`'s scale is scoped to `section.math`. It
does not need to be wider: outside math's scaled-up hero the base display size is much smaller —
the logistic log-likelihood on a `content` slide at portrait renders 932px of ink in a 932px box
after the break alone, with no overflow warning. An equation that still does not fit rings, which
is what the watcher is for. Recorded so the next reader knows the asymmetry was priced.

The 2.4em itself is left alone, and #2129's CSS comment explains why one rule cannot serve both
samples: bare's hero renders 914px inside a 972px box at 2.4em, so dropping the declaration to fit
`feature` would take it from 112.75px to 42.28px — trading one defect for another.

## Eleven kernel defects this surfaced, all fixed here

**The heading said "Three" while the list below it held five, and the PR body said eight.** Nobody
re-counted; the number was written when the list was short and never moved with it. That is the
same failure this branch's own subject is about, in the document making the argument — so the
count is stated here as a count of the numbered entries below, and a reader who adds one is
expected to change this word.

The first five were found by rendering `examples/math-split-structure.md` at portrait and reading
the pages, not by any gate. The last four were found by an independent checker reading the final
integrated state (HARD RULE #25), and three of them are in code the earlier five had already been
through — which is the more useful fact about them.

1. **The equation was hoisted to the cover as a LEDE and lost from every body page.**
   `ledeSpansIn` treats a `<p>` between the masthead and the collection as framing prose, and a
   `$$…$$` renders as exactly that. The cover then set a display equation inside
   `.split-feat-lede`, which takes inline content. Fixed in `split-envelope.js`: a `<p>` carrying
   a display equation is the slide's subject, never its framing.
2. **The forward pointer read "→ X X X", and took three tries to set right.** KaTeX prints its
   content three times — a MathML `<mi>` mirror, an `x-tex` annotation, and a visual half built
   from one `<span>` per glyph box — and `textOf` flattened all three. Removing the a11y mirror
   left the visual half, so `$y_i$` read `y i ␀`. Reading the annotation instead put the author's
   SOURCE on the slide: `\sigma →` on p4.2 and `X^\top X →` on p3.4 of the shipped PDF. The
   MathML mirror is the copy that is neither duplicated nor source — joined without a separator it
   reads `σ`, `X⊤X`, `n×p` — so that is what `textOf` reads. The annotation stays behind it as a
   GUARD, not a live fallback: the annotation lives INSIDE the MathML, so a render with no `<math>`
   has neither source, and no shipping path asks for one (`lattice-emulator.js` sets
   `htmlAndMathml`; `'html'` was removed there for accessibility). The real no-MathML degradation
   is the mirror-strip, which returns the visual half. Two shapes stay honestly imperfect and are
   pinned as such: an accent is written base-then-mark (`\hat\beta` → `β^`) and a subscript loses
   its level (`y_i` → `yi`); KaTeX's four invisible math operators are stripped, because a label
   carrying one looks right and is not.
3. **A `derivation` step page pointed at its own equation — a defect the FIX ABOVE created.**
   Worth stating precisely, because an earlier draft of this note said the string was read off the
   shipped PDF and it was not. On `beec5d8` those chips read `continues`: the annotation-sourced
   label ran past `LABEL_MAX` and `labelOf` declined. Reading the MathML instead made the same
   label FIT — the run-together `limh→0f(x+h)−f(x)h=f′(x) take the limit` came in under the
   42-character budget —
   so the row's own equation started printing where a name belongs. The row is
   `| equation | what you did |` and the flat label path took the whole row. AN EQUATION IS NOT A NAME, the math twin of the "a figure is not a name" rule
   already in `labelOf`: a symbol names a thing and stays (`σ →`), but leading math carrying a
   RELATION makes a claim, so it is dropped and the member's prose becomes the label
   (`take the limit →`). A member that is only an equation keeps the equation, and the length
   budget still judges what is left. The relation test is KaTeX'S OWN CLASSIFICATION, not our
   reading of the Unicode charts: 219 characters it declares `rel`, plus 7 it builds with a macro so
   no `rel` line mentions them. The set has been hand-built twice and wrong twice — an enumeration
   missed `\equiv` `\simeq` `\supset` `\longrightarrow` `\implies`, and the Unicode ranges that
   replaced it missed 69 of the 219 — so a census re-derives both halves from the installed KaTeX and
   fails in both directions. Operators are absent by construction, which is what keeps `n×p` a name.
   `\top` falls out for free (KaTeX calls it `ord`), which is what keeps `X^\top X` a name; `\perp`
   is IN, because KaTeX calls it `rel`, and taking its word costs at most a `⊥`-led member preferring
   its prose.
4. **A curated HARD RULE #29 shape glyph reached the chip.** Reading the MathML puts an author's
   `\to` in as U+2192, set in the deck's TEXT face beside the engine-drawn `--shape-arrow-right`:
   one pill, two arrows, two faces. A math-derived label carrying one now DECLINES rather than
   printing it or deleting it — `F:A→B` is not `F:AB`, and '' degrades to the un-labeled pointer,
   which still points — but only because `cycle` and `hierarchy` were given un-labeled forms in the
   same breath. They returned `''` for a missing label, and `''` emits no element at all, so the
   decline DELETED a cycle's closing chip on a real render before that hole was closed. Scoped to
   math by a real KaTeX span: an author's typed arrow in prose stays #29's coaching warning.
5. **All three theorem cards were cut from every page and dumped on a closing page.** `math`
   claims `blockquote` and `trailing-paragraph`, and on three of its four structures the claimed
   element IS a member. `math-structures` joins `MEMBER_CLAIM_STRATEGIES`.
6. **The SPLITTER's own stamp bypassed both label rules.** `withMemberLabel` (carousel.js) stamps
   `data-split-label` with a member's title, and `applyRelationshipSignals` reads that back as an
   already-FLATTENED plain string — so `dropLeadEquations` found no `.katex` span in it and
   `mathSafe`'s span-scoped test returned −1. Both guards no-opped, and a theorem card titled
   `**$A \to B$ Theorem.**` shipped the chip `A→B Theorem`: a typed arrow two characters from the
   engine-drawn `--shape-arrow-right`, which is the exact input defect 4 above says was removed.
   `math` was `atomic` on `origin/main`, so no math member could reach a chip at all — this branch
   opened the path, which makes it a window this branch created (HARD RULE #18). Fixed by exporting
   the label kernel as `safeName` and having the stamp call it, so there is ONE definition of what a
   name is (HARD RULE #1) rather than a copy per caller.
7. **The four label paths were two copies of the same four rules, and the copies disagreed.**
   `- **Recency** — decays toward $A \to B$` kept its name; `- Recency — decays toward $A \to B$`
   declined, for content that renders the same chip either way. Two more ordering defects fell out
   of the same read: `mathSafe` ran BEFORE the clause break, so a glyph in the description half —
   which is thrown away — declined the whole label; and it was handed the PRE-drop source, so a
   dropped equation still poisoned the prose that survived it. All three are gone with the copy.
8. **The carousel slot title was read with the lazy `</span>` pair this file bans twice over.**
   `/<span class="split-pt-t">([\s\S]*?)<\/span>/`, on the read that is checked FIRST, in the file
   whose headline fix is that KaTeX nests `<span>`s. A slot title carrying `$X^\top X$` captured up
   to the first inner close, left unbalanced spans behind, and both of `stripMathMirror`'s loops
   bailed: the chip read `X ⊤ X X^\top X` — the visual half AND raw TeX — on a rendered slide.
   Byte-identical on `origin/main`, so not this branch's regression; the same function, the same
   defect class and this branch's headline subject, which is what #18 means by ON THE PATH.
9. **A chip could print a character the deck's type face cannot set.** `mathSafe` refuses the
   curated #29 shape glyphs and knows nothing about `⊤ σ ≠ ℓ β λ`. The committed demo PDF proves
   what that costs: pages 10, 13 and 18 embed `DejaVuSans-Bold` and no other page does, and those
   three are exactly the chips reading `X⊤X`, `σ` and `divide by h≠0`. At 300dpi page 10's reads
   `XTX` — DejaVu's `⊤` at pill tracking is a capital T — so a math-literate reader sees a
   DIFFERENT EXPRESSION from the equation directly above it. Where the untypeable math LEADS the
   member the equation is now dropped and the description beside it becomes the name (`- $\sigma$
   — the logistic link` reads `the logistic link`); where it cannot be spared, the chip degrades to
   the un-labeled `continues →`.

10. **A member whose math fails to TYPESET was named by its broken source.** KaTeX has two failure
   renderings and only one carries a class: a `ParseError` is
   `<span class="katex-error" style="color:#cc0000">\frac{a</span>` — no `.katex` wrapper, no
   MathML — so the span scan walked past it and `stripTags` flattened the author's raw TeX into the
   chip. `lib/engine/math.js` had already learned this and says so in a docblock; this file learned
   half of it twice, and the second half took two folds because the first fix bounded the new test
   with `[^>]*`, which is the tag-bounding disagreement the file had already removed twice.
11. **A block between two members printed on every page of the run.** Neither a member nor trailing
   material, so it stayed in the trunk. It rides the page of the member it FOLLOWS now. A block
   before the first member is framing and still repeats — the opposite call, made deliberately: a
   premise every card is read under behaves like the equation that repeats over every legend page.

## What the gates could not have caught, and what now pins it

Four of this branch's own claimed fixes had **no test that could fail**, and one of them sat behind
an arm that was vacuous in exactly the way this document criticizes elsewhere. Found by mutation,
not by reading:

| claim | mutation that SURVIVED | pinned now by |
|---|---|---|
| a display equation is not a lede (defect 1) | `isDisplayMathP = () => false` | `split-envelope.test.js`, both renderers' display wrappers |
| a broken reflow falls back to the author's source | drop the `#cc0000` half; `if (true)` | `math-reflow.test.js`, on `\Bigra` — which errors with NO error class |
| the #29 decline on the named label paths | delete `mathSafe` from `named()` | structural: one `safeName`, so every label arm reaches it |
| an author's own `\\` is left as written | delete the guard | `tex-linebreak.test.js`, on a fixture that DOES reflow (39 lines) |
| an ellipsizing box must not also wrap | delete the `nowrap`/`pre` test | `overflow-probe.test.js`, a `wrap` arm the harness could not express |

The `math-reflow` case is worth stating plainly because it is the trap this branch keeps walking
into: the arm asserted `bad(reflowed) === bad(original)` over three equations that all render
CLEAN, so it was `false === false` whatever the seam did. Getting a fixture that can fail took a
hunt — the pass is sound enough that a fuzz over the corpus's real display equations found zero
reflows that introduce an error — and the one that works errors in BOTH renders, so what the guard
actually owes is not a clean render but the refusal to CLAIM one: no `data-math-reflow`.

## What this costs, stated plainly

A bare `math` slide with a four-symbol legend that FITS portrait today becomes five pages. That is
the standing structural-split policy (`2026-09-01-autosplit-splits-on-structure.md`), applied
consistently rather than excepted for math: the trigger is the seam, not the fit. The alternative
was a math-only exception to a rule every other enrolled component follows.

## Verified

`examples/math-split-structure.md` at `size: portrait`, indaco — 8 slides out to 28 pages, nothing
clipped, rasterized and read page by page (all 28, which is how items 2 and 3 above were found:
the first pass read 8 and both defects sat outside them). `math feature` reads clean through
`probeSectionOverflow` at all five registered sizes (hd, square, portrait, story, mobile), against
four of five over before this change. The `verified.math` entry in `test/oracle/split-oracle.json`
carries the per-structure detail.
