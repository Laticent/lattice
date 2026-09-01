---
status: proposed
summary: >
  Card (2) of the #1966 spike: should the ENGINE measure composition at all? The answer is
  yes, but only half of it — and the half it should measure is not the half the question
  assumed. Vertical void splits cleanly into two things a machine can tell apart. MECHANISM
  void is a box that was handed height and did not distribute it to its content; the engine
  owns that, it is objective, and it is the same shape as the INSET assertion check-chart-fit
  already ships. COMPOSITION void is an author putting three lines of prose in a full-height
  stage; that is taste, it is 51% of the sampled corpus, and the engine should not grade it.
  The spike said any composition measure needs a different primitive than its blank-page-row
  script, and it does: LEAF INK — text line boxes, images, svg, hairline rules, but never a
  container's fill — which sees straight through the tinted panel that defeated the old one.
  On the slide the spike named as the case both its instruments missed, the old primitive
  reads 12% void and leaf-ink reads a 72% contiguous band. The discriminator between the two
  classes is SLACK ASYMMETRY, and it is startlingly clean: across 148 cards in 9 exemplars it
  puts `stats` (tight), `kpi` (centered 28 of 30), `list-criteria`, `cards-grid`, `actors` and
  `big-number` (leading, deliberately low) on the composed side with zero false positives, and
  isolates a small defect side — at landscape `decision` (9 cards, 52-55% of the card empty
  below top-pinned content), `matrix-2x2` (12 cards, 36-43%) and one `list-tabular` card at 63%.
  Swept at portrait and square as well, and that corrects the unit twice over. The defect is a
  component x FAMILY cell, not a component: `decision` is defective at wide and composed at the
  other two, while `stats` is nearly the reverse, 61 of 64 tight at landscape and 28 of 36
  trailing at portrait. And a BUG in the classifier was found by inspecting one card in the DOM
  -- it counted `decision`'s absolutely positioned corner tag as flow content, which invented a
  square defect that does not exist and under-reported the wide one. Corrected, `decision` at
  wide reads lead 1px against trail 257px and at square lead 249px against trail 251px: the
  same component, the same content, top-pinned exactly where the existing `safe center` rule is
  not stamped. The classes stay component-clean within every family through both corrections,
  which is the property that was load-bearing. The sharpest instance found anywhere is a
  portrait `stats` page autosplit produced -- no author wrote it, and half the tinted card is
  empty. `decision` is confirmed three independent ways: two instruments sharing no
  machinery agree to the point, the render confirms it by eye, and its own CSS carries
  `justify-content: safe center` for the square, tall and strip families and nothing for wide.
  The author is not at fault — the component's docs ask for "one sentence of rationale" per
  card, which is exactly what all three decks wrote. Recommends: the engine measures mechanism
  void and never composition void, which also settles card (3) — a style judge is text-only by
  DESIGN, with the composition axis owned by the fit layer instead of by a judge.
builds-on: 2026-08-31-exemplar-quality-and-style-judges.md, 2026-06-22-the-fit-spine.md, 2026-07-30-slide-geometry-emitted-not-measured.md, 2026-07-28-capacity-basis.md
---

# Composition is an engine measure — but only the mechanical half

**Date:** 2026-09-01 · **Status:** Proposed (design model; no production code) ·
**Decision owner:** Sharmarke · **Card (2) of #1966**

`2026-08-31-exemplar-quality-and-style-judges.md` ended on three follow-on cards and
called this one the architectural fork: *decide whether vertical void is a defect the
engine should see, because if it is, it belongs next to the Fit Spine rather than in a
style judge.* This is the design model for that call. It ships no production code — the
measurement below is throwaway, deliberately, for the reason §7 gives.

---

## 1 · The answer

**Yes for one half, no for the other, and the split is machine-detectable.**

Vertical void is two different things wearing one name:

| | what it is | who caused it | engine's business? |
|---|---|---|---|
| **Mechanism void** | a box was handed height by its parent and did not distribute it — content pinned to the top of a stretched card | the engine | **yes** |
| **Composition void** | the author put three lines in a stage sized for twelve | the author | **no** |

The spike asked whether the engine should measure "composition". Taken whole, the answer
has to be no: the second row is 51% of the sampled corpus, most of it is fine, and a rule
that calls it a defect is the engine arbitrating taste. But the first row is not taste at
all. It is a box that is the wrong size for what is in it, which is a *fit* fact, and fit
is what the Fit Spine already owns — from the other end.

That is the shape of the whole finding: **the engine already measures one end of fit and
is blind to the other.** `overflow-probe.js` asks whether content exceeds its box.
Nothing asks whether a box exceeds its content. The second question has the same kind of
answer as the first — objective, geometric, no genre in it — and it has never been asked.

**There is already a precedent in the tree, and it is exact.** `check-chart-fit.js` ships
three assertions; two ask whether the chart is too big for its box, and the third (#1598,
the INSET check) asks *"whether its box is needlessly too SMALL"*. Its docblock describes
the failure mode this note is about, one component over: *"That failure is silent in the
other direction: nothing clips, nothing overflows, the chart is simply 64px narrower per
side than it should be, on every chart, forever."* Mechanism void is that same defect
class on the vertical axis, generalized past charts.

## 2 · The primitive, and why the old one could not settle this

The spike closed by naming its own instrument's limit:

> **Whether the void metric can see the void that matters.** It counts blank page ROWS, so
> a tinted panel holding one number reads as fully inked. […] Any composition measure built
> from this needs a different primitive.

The different primitive is **leaf ink**. Walk the rendered DOM inside the content band and
count only the marks a reader actually reads:

- **text** — every text node's line boxes, via `Range.getClientRects()`;
- **graphics** — `img`, `svg`, `canvas`, `video`, measured as a whole box and not descended into;
- **rules** — a painted or bordered box under 6px in its short dimension, plus the border
  edges of larger boxes.

**A container's background fill is not ink.** That single exclusion is the whole difference:
a tinted panel is a box, so the question becomes what is *inside* it, which is exactly what
the row-blankness metric could not ask.

**Tested against the case the spike recorded as the one both its instruments missed.**
`exemplars/corporate/quarterly-business-review.md` slide 11 (`decision`) is two tinted
panels, each about 1180px tall, each holding two lines of text. The old primitive reads it
as inked, because every page row inside a panel has color in it. Leaf ink reads a **72%
contiguous void band** starting 27% down — the largest in the deck. Checked against the
committed PDF by eye, at the real artifact rather than a proxy (HARD RULE #23): the bottom
two-thirds of both panels is empty.

## 3 · The discriminator — slack asymmetry

A primitive that finds void does not yet tell mechanism from composition. `big-number`
leaves a lot of air and is right to. The test that separates them is **where the slack
sits**, measured per card as leading slack (first child's top minus the box's content-box
top) against trailing slack (box bottom minus last child's bottom), with the box's own
padding subtracted so deliberate padding never reads as void:

- **centered** — leading ≈ trailing. The box is distributing its height. Composed.
- **leading** — slack all above. The box is end-aligning on purpose. Composed.
- **tight** — under 15% slack. Nothing to say.
- **trailing** — slack all below, content pinned to the top of a box that grew. **Mechanism.**

## 4 · What the measurement found

**Population:** 9 exemplars across all five families, rendered through the real emulator
and measured in real Chromium at 1920×1080 — 107 slides, 148 cards.

**Slack class by component, and it separates almost perfectly by component rather than by deck:**

| component | tight | centered | trailing | leading | worst trailing slack |
|---|---|---|---|---|---|
| `stats` | 64 | | | | |
| `kpi` | 2 | 28 | | | |
| `list-criteria` | | 12 | | | |
| `cards-grid` | | 4 | | | |
| `actors` | | 3 | | | |
| `content` | | 1 | | | |
| `big-number` | | | | 9 | |
| **`decision`** | | | **9** | | **55%** |
| **`matrix-2x2`** | | | **12** | | **43%** |
| **`list-tabular`** | 3 | | **1** | | **63%** |

**25 of 148 landscape cards, in 5 of the 9 decks, and four components.** Nothing that
composes deliberately lands on the defect side — no false positives at all. That cleanliness
is the argument: a taste threshold would smear across components, and this does not. It is
picking out a mechanical distinction. (The counts here are the corrected ones from §4b; the
first pass of this section read 22 and three components.)

**The `decision` case is confirmed three independent ways**, which matters because the
durable lesson of the last two records is that a single instrument certifies itself:

1. **Two instruments sharing no machinery flag the same cards at comparable magnitude.**
   Leaf-ink row occupancy reports a 72% / 67% contiguous void band on `board-update` slide 11
   and `donor-pitch` slide 13. Pure box arithmetic — card height against its own flow
   children's extent, no row grid, no ink union, no attribution — reports 66% and 61% card
   slack on the same two cards. They are different quantities (void in the stage against
   slack in the card), so the agreement is that both isolate the same cards in the same range,
   not that they produce one number. *An earlier cut cited 775px and 807px here as if the two
   instruments matched to the pixel. They never measured the same quantity, and the absolute
   figures were also read off a differently scaled render, so percentages are what this claim
   can carry.*
2. **The render says so.** Rasterized from the committed PDFs and looked at.
3. **The component's own CSS says so.**
   `decision.styles.css:106` gives `li` `justify-content: safe center` at the `square`,
   `tall` and `strip` families and nothing at `wide`, so the landscape card inherits
   `flex-start` from line 42. §4b measures that rule working exactly where it is stamped —
   the same component, the same content, centered at square (lead 249px, trail 251px) and
   top-pinned at wide (lead 1px, trail 257px).

**The author is not at fault, and this is the part that makes it an engine defect rather
than an authoring one.** `decision.docs.md` says *"Each card is one sentence of rationale"*
per card and warns against paragraphs. All three decks wrote exactly that. The component's
documented density guarantees the void its layout then leaves.

**One number in this note's own first pass was wrong, in the instructive direction.** Card
slack measured as *box height minus content extent* put `stats` at 41% and `kpi` at 48%,
which would have made mechanism void look endemic. Both figures were padding. Subtracting
the box's own padding moves `stats` to tight on 61 of 64 cards and `kpi` to centered on 28 of
30 — the corpus did not change, the instrument did. The first cut of §4 would have reported
a defect class four times its real size.

### 4b · The same sweep at portrait and square, which corrects the headline twice

The first cut of this section stopped at landscape and §7 listed the family axis as where
the measurement was thinnest. Running it there instead of caveating it changed the finding —
and then a **bug in the instrument** changed it again. Both passes are reported, because the
second is the more useful record.

**The instrument bug.** The classifier read a card's content extent from *all* its element
children. `decision`'s corner tag is `position: absolute` — out of flow, pinned to the card's
top-left — so it was counted as if the flex column had laid it out there. That forced leading
slack negative and trailing slack large on cards whose body was in fact centered. An
out-of-flow child says nothing about whether a box distributed its height, so it must not be
read as if it did. Corrected by filtering `position: absolute` and `fixed` children.

**What the bug did to the numbers:**

| cell | reported | corrected |
|---|---|---|
| `decision` at square | trailing ×6, worst 27% | **centered ×7** — composed, not a defect |
| `decision` at wide | trailing ×9, worst 55% | trailing ×9, **worst 66%** — worse than reported |
| `stats` at wide | tight ×64 | tight ×61, trailing ×3 at 27% |

Everything else held. The corrected sweep:

| component | landscape (148 cards, 9 decks) | portrait (76 cards, 5 decks) | square (83 cards, 5 decks) |
|---|---|---|---|
| `decision` | **trailing** ×9, worst 66% | tight ×3, centered ×1 | centered ×7 |
| `matrix-2x2` | **trailing** ×12, worst 43% | tight ×8 | **trailing** ×8, worst 52% |
| `stats` | tight ×61, **trailing** ×3, worst 27% | **trailing** ×28 of 36, worst 51% | tight ×35, **trailing** ×1, worst 18% |
| `list-tabular` | tight ×3, **trailing** ×1, worst 63% | — | tight ×3, **trailing** ×1, worst 73% |
| `kpi` · `list-criteria` · `big-number` · `cards-grid` · `actors` · `content` | composed | composed | composed |

**Three things survive, and one claim does not.**

**The discriminator still does not smear.** At every size, no component lands on both the
composed and the defect side. That was the load-bearing property, it survived the family
sweep, and it survived the instrument correction. Both were harder tests of it, not easier ones.

**The unit is a component × FAMILY cell, not a component.** `decision` is defective at wide
and composed at the other two; `stats` is nearly the reverse — 61 of 64 tight at landscape, 28
of 36 trailing at portrait. Nothing about the corpus changed between those runs. Only the box
shape did, which is precisely what makes it a mechanism fact rather than a taste one. It also
names the right shape for any gate under Option A: per (component × `@size`), which is the
shape `tools/check-family-conformance.js` already uses for a neighboring question.

**`decision` at wide and at square is now the cleanest single demonstration in this note.**
The same component, the same content, two box shapes, measured the same way:

```
wide     lead   1px  ·  trail 257px  of a 393px card   →  top-pinned
square   lead 249px  ·  trail 251px  of a 734px card   →  centered
```

`decision.styles.css:106` applies `justify-content: safe center` at `square`, `tall` and
`strip` and not at `wide`. The rule works exactly where it is stamped and the defect is
exactly where it is not. **This retracts the earlier claim that the square residual was
"unexplained" — there is no square residual. That was the bug.**

**The portrait `stats` case is the sharpest instance found anywhere in this note, because no
author wrote the page.** Autosplit divided one landscape `stats` slide into four single-stat
portrait pages, and each page keeps a tinted card sized for the full stage with the number and
label pinned to its top third — about half the card empty below. Rendered at `size: portrait`
and looked at (`board-update` page 8). An authoring rule has nothing to say about a page the
engine itself produced.

**And the bug is the third instrument error in this line of work**, after the spike's
blank-row primitive and this note's own padding overcount. All three read as settled
measurements, all three were caught only by re-deriving rather than re-running, and none of
them was a claim a gate in this tree could have checked. That is an argument for §5's Option A
carrying a committed instrument eventually, and against trusting the uncommitted ones in §8
any further than the cards they were checked against by eye.

## 5 · The fork

**Option A — measure mechanism void, never composition void. Recommended.**
One geometric assertion: a card whose slack exceeds a threshold and is overwhelmingly
trailing. It rides the render sweeps that already exist rather than adding a pipeline stage.
Composition stays out of scope for grading, stated rather than merely absent.
*Buys:* catches a defect class that is silent in every channel today — no clip, no overflow,
no lint finding, no score movement — and it is already shipping in the reference library
authors copy from. *Costs:* one on-demand check plus a ratchet baseline. *Risk:* threshold
tuning, and the check must be direction-aware or `big-number` is a false positive on day one.

**Option B — measure composition too, and feed it to the scorer.**
*Buys:* the 10/10 bar becomes measurable; card (3)'s judge gets a real composition arm.
*Costs:* structural. `review-core.js` and `lint-core.js` are pure, fs-free and browser-safe
by contract (HARD RULE #7), so geometry at scoring time means either a render dependency in
the scorer or a new geometry-sidecar contract between the two. *Risk:* it makes the engine
arbitrate taste on 51% of the corpus, and it certifies house preference as engine truth —
the exact failure the spike refused for text judges.

**Option C — nothing; declare the rendered page out of scope for grading.**
*Buys:* free, and it settles card (3) cleanly. *Costs:* leaves `decision` shipping a 55%-empty
card in the library that defines "what good looks like", invisible to every gate, forever.
The evidence in §4 is what argues against this.

**Option D — coach, never gate** (HARD RULE #29's posture: *we warn, we coach*).
*Buys:* the author sees it and keeps the choice. *Costs:* it cannot live where coaching lives —
`lint-core.js` has no DOM by contract, so a geometric warning needs a surface that has a
rendered frame. That is the Studio Coach, a different build. *Not exclusive with A*, and it
is the natural later home for the composition half if that is ever wanted.

**Recommendation: A, with B deferred rather than refused.** A is the half that is objective,
has a precedent already in the tree, and pays immediately in real defects. B stays open, and
D is where it would go if it opens.

**A settles card (3) too, which is the point of settling this first.** If the engine owns the
composition axis at the fit layer, then a style judge derived from the exemplars is text-only
**by design and by statement** — not text-only by accident, which is what the spike found and
objected to.

## 6 · Where it would live under A

The engine has three sites that already do this kind of work, and the choice among them is
about *when the question gets asked*, not about how:

| site | what it already does | fit for this |
|---|---|---|
| `lib/core/overflow-probe.js` + `fit-sweep.js` | the runtime's cell-aware "does this overflow?" | the natural conceptual home — it is the same question inverted — but it runs on every mutation in a live preview, and this measure does not need that cadence |
| `tools/check-chart-fit.js` | already carries the INSET assertion, the same defect class | the precedent, but it is chart-scoped and this is not |
| `tools/check-overflow-corpus.js` (`npm run overflow:check`) | renders the whole shipped corpus and ratchets per-deck clipped pages | **the closest match.** It is already the corpus-wide fit ratchet, already on-demand for the same cost reason (HARD RULE #19), and a trailing-slack arm rides renders it is already paying for |

The likely shape is a sibling arm on the corpus ratchet, not a new pipeline stage. **Whatever
the site, §4b fixes the UNIT: the assertion is per (component × `@size`), not per component.**
A gate written per component would have called `stats` clean on 61 of 64 landscape cards while
it was trailing on 28 of 36 portrait ones. `tools/check-family-conformance.js` already freezes a
per-(component × `@size`) oracle for a neighboring question, so the shape has a precedent as
well as a reason. Deciding the site is build work, not this note's; §5 is the fork that has to
close first.

## 7 · What this does not establish

- **The threshold.** §4 sorts cards into four classes with a 15% floor and a 50% asymmetry
  split, and the classes come out component-clean at those numbers. That is not the same as
  having calibrated them. A gate needs a floor derived from the population it will run on.
- **The corpus figure.** 9 decks of 45 at landscape, 5 of those at portrait and square, one
  theme. The cells named are real and confirmed; "these are the only cells" is not claimed,
  and `list-tabular` in particular is one card in four.
- **Whether the named cells should be fixed here.** They should not — this note changes no
  render (HARD RULE #18: found, not caused, and off the path of a decision doc). They want an
  issue each. `decision` at wide does look like a one-line-shaped fix — §4b measures the
  existing `safe center` rule composing the same component correctly at square, so extending
  where it is stamped is the obvious move rather than a guess. It still regenerates committed
  exemplar PDFs and owes visual review.
- **Anything about non-card void.** The whole of §3-§4 measures `li` cards. Trailing void in
  a stage with no cards in it — the `content` slides that are most of §1's second row — is
  measured only by the leaf-ink band in §2 and is deliberately left on the composition side.
- **The portrait and square population is synthetic.** §4b forces `size:` onto decks authored
  for landscape. That is the repo's own idiom (`tools/check-chart-fit.js` sweeps one fixture at
  three sizes), and it is a fair test of engine behavior, but it is not a sample of decks anyone
  ships. Five decks, not nine.
- **How many more instrument bugs there are.** §4b found one by inspecting a single card's
  children in the DOM. The same inspection has not been done for `matrix-2x2`, `stats` or
  `list-tabular`, so their numbers carry the confidence of an instrument that has been wrong
  once. `stats` at portrait and `decision` at wide are the two cells confirmed by eye; the
  rest are instrument-only.
- **The other 32 themes.** Everything here is `indaco`. Type metrics differ across themes, so
  the slack numbers will move; whether any component crosses a class boundary is unasked.

## 8 · How to re-derive

The two instruments are throwaway and are **not committed**, for the reason the spike gave
one level up: an instrument whose thresholds are uncalibrated (§7) would be a gate that
certifies itself. Under Option A the measure earns a home and gets written there. To
reproduce:

```
# the artifact the visual claims are made against, not a proxy
pdftoppm -r 60 -f 11 -l 11 -png exemplars/corporate/quarterly-business-review.pdf out
```

A third pass, §4b's family sweep, is the second script again with `size:` and `autosplit:`
rewritten into each deck's front matter the way `tools/check-chart-fit.js` does it, measured at
1080×1350 and 1080×1080.

Both scripts render each deck with `lattice-emulator.js` and load the HTML sidecar in
Chromium at 1920×1080 — the plumbing `tools/check-chart-fit.js` already uses. The leaf-ink
probe walks `.cell-stage`, unions line-box and graphic rects into a 1px row grid, and reports
the largest contiguous ink-free run. The box-arithmetic recheck reads
`.cell-stage > :is(ul,ol) > li`, subtracts the computed padding, and reports leading against
trailing slack. Neither shares code with the other, which is what makes §4's agreement worth
something.
