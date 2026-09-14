---
status: shipped
summary: A census of all 69 component galleries re-rendered at portrait found that "auto-split covers the catalog" was true of components and false of their VARIANTS: a component declares one reader, and a variant whose rendered DOM is a different shape got no split at all. Four causes, all fixed here — a declined strategy ended the slide's chances instead of falling through to the derived axis; `readRows` dropped any row with no nested clause, so 5 of `list-tabular`'s 14 variants never split and a mixed list silently lost rows; the four native-slice strategies emitted no cover, so one deck read two shapes for one operation; and `code` had a treatment with no processor at all since the catalog was written. Also records the run's own footer (said once, on the page that opens the run — it was clipping 28 pages of a shipped gallery), the owner's reversal of the `matrix-2x2` and `obligation-matrix` atomic placements, and the one thing the jank rig cannot see.
builds-on: 2026-09-01-autosplit-splits-on-structure.md, 2026-07-22-structure-derived-split-patterns.md
supersedes: the native-slice cover question left open by 2026-09-01-autosplit-splits-on-structure.md; the 2026-07-22 atomic placement of `matrix-2x2`; the atomic placement of `obligation-matrix`
---

# A component splits; its variants did not

**Date:** 2026-09-13 · **Status:** Shipped · **Decision owner:** Sharmarke

## What the census measured, and why a census

Every claim in this note comes from re-rendering all 69 per-component galleries at
`size: portrait` through the real emulator and diffing the emitted sections — page counts,
`data-split-run` groupings, `data-split-role` sequences, and the overflow probe's verdict.
The galleries are the right corpus because each one demonstrates every variant its component
declares, which is exactly the axis the prose kept collapsing.

**TWO INSTRUMENTS, AND THE DIFFERENCE BETWEEN THEM IS WORTH STATING BEFORE ANY NUMBER.** The
base-to-head sweeps that produced the deltas below were run two ways. A FAST one calls
`render()` and then `splitDoc()` directly, which makes a 245-deck × 4-size sweep affordable —
and **it over-reports, because `splitDoc` does not gate on the size family**; only the
emulator decides whether auto-split runs at all. A REAL one drives `dist/lattice-emulator.js`
in both trees, which is the surface an author gets.

Measured against each other on every deck the fast sweep says moves, at portrait: they agree
on 27 of 29 decks, and the fast sweep counts ONE slide too many (a `kanban` page in
`data-viz-gallery` that `splitDoc` splits and the emulator leaves whole). So the fast sweep is
a SUPERSET by construction, useful for finding candidates and not for stating a total.

**Every total in this note is the REAL one**, from the emulator, both trees. The base they are
measured against is the merge base AT THE TIME OF MEASUREMENT, `7d68461` — `main` has moved since
and the current merge base is later, so re-deriving them against `origin/main` today will not
give these numbers back. That is the hazard HARD RULE #9 names about a moving HEAD, and the fix
is the same: quote the base with the number. The intervening commits are logo/vetrina/editor work
that touches no split path.

| size | newly split (1 → n) | already splitting, +1 page | split LESS |
|---|---|---|---|
| portrait | 32 | 44 | 0 |
| square | 32 | 24 | 0 |

The 44/24 gap is the landscape veto, on the real surface: 20 of the portrait gains are
`journey` and `roadmap` slides, and at square exactly one of them is. `journey.gallery`
renders `[1,4,4,4,4,4,1,4,4,4,4,1]` pages per slide at portrait and `[1,1,1,1,1,1,1,1,1,1,4,1]`
at square — the board stays whole, which is what its strategy's own comment promises.

`story` and `mobile` were swept with the fast instrument only; both report the same shape as
portrait, and neither total is quoted here for that reason.

The collapse is worth naming, because it is the shape of the whole finding: **`split-facts.js`
places a TREATMENT per component, and every reader is written against the shape that
component's DEFAULT variant renders.** Nothing in the tree asked whether the other variants
render that shape. They do not, and the answer had never been measured.

## Four causes, and each one is a different kind of blindness

### 1. A declined strategy ended the slide's chances

`splitDoc` returned the slide whole the moment a component's declared carousel strategy handed
back null. A strategy declining means **"this is not my shape"**. It is not the claim "this
slide has no seam", and the two were the same line of code.

| variant | what its reader wanted | what it renders |
|---|---|---|
| `compare-prose axis` | two `.pane`s | a lede, then numeral-led facet cards |
| `split-panel pullquote` | an `<h2>` feature | the quote IS the feature; no `<h2>` |

Both hold a plain top-level list of independent members. Both clipped at portrait. Neither
split. They do now, through the same derived axis a plain layout is asked for.

**What the fallback must NOT do, and the distinction that keeps it honest.** A page the recipe
ALREADY emitted (`lat-split-native`) still takes the recipe's declared axis or none. That is
the case the old comment was about — deriving there cut `redline`'s reasoning away from the
passage it explains — and the recipe never declined on such a page; it produced it.
`recipeDeclined` is the flag that separates the two.

**AND THE FALLBACK IS AN ALLOWLIST, NOT A DEFAULT — the first version of this change got that
wrong, and the correction is the more useful half of this record.** Five strategies are shape
READERS: they parse a specific DOM and re-author it, and their `null` genuinely means "not my
shape". Four others return `null` to ENFORCE a scope their own comments state —
`journey-stages` and `roadmap-horizons` keep the landscape board whole, `redline-blocks` keeps a
single passage whole, `kanban-lanes` keeps a single-lane board whole. Re-deriving an axis there
overrides the component's own veto with whatever list the DOM happens to carry.

Measured, when the fallback was unconditional: a `journey` slide at `size: square` became a
cover plus SEVEN body pages, each repeating the whole board and differing only by one item of
the MOOD LEGEND — nine of the ten slides in `journey`'s own gallery, and eight of `roadmap`'s.
`redline annotated`, one passage plus a three-item why-list, was cut into three pages carrying
the reasoning without the amendment it explains. The remaining four strategies
(`cover-paginate`, `cover-cards`, `compare-options`, `code-cards`) are out for a third reason:
they route through the envelope already, so their `null` means there is no collection at all
and re-asking gets the same answer.

**The `count <= 1` guard was credited with keeping `redline annotated` ringing, and it never
did.** That slide holds one passage AND a three-item why-list, so the count is three and the
guard never fires. The guard does what its own line says and no more: it stops a single-member
collection from paginating. What rings `annotated` is the allowlist. The claim was written into
a code comment and into this record before either was checked, and the checker that caught it
found the veto regression on `square` — a family the portrait-only first census could not see,
which is why the census below now sweeps all four splitting families.

### 2. `readRows` required a clause, so a flat register was not a register

`.filter((r) => r.title && r.body)`. A row authored flat — ``1. Coverage `98.4% of policies` ``,
a chip and no nested clause — yielded zero rows, the strategy declined, and **5 of
`list-tabular`'s 14 variants never split at all**: `metric`, `register`, `metric solid`,
`register outline`, `fit-meta`. Their nested-clause siblings did, which is why the omission
read as a variant quirk rather than a filter.

The MIXED case is the sharper one and nothing could have caught it: flat rows were dropped
from the member set while the strategy still succeeded on the rest, so the page count was
right and the content was not. The rule-6 conservation gate is a word-multiset containment
check — it reports a shortfall only when it runs, and it runs on the strategy's output.

The same function also flattened the title with `.replace(/<[^>]+>/g, '')`, throwing away the
`<code>` chip that IS the register's second column: a `def` row authored ``1. Label `Term` ``
reached its split page as the bare word "Label", while the body — which comes from
`subjectBody` — kept its markup. One member's two halves, two standards.

### 3. A native-slice run opened on its first member

The four native strategies emitted `body` pages only, so a split `roadmap` opened straight into
"Phase 01 · Q1" while a split `content` slide beside it in the same deck opened on the shared
accent field. The 2026-09-01 record logged this as an open question and marked it the owner's
call; the call is to add the cover. It carries the slide's masthead plus a lead-in naming the
first member, through the same `introOf`/`labelOf` the body pages use for "next:", and it
declines rather than inventing one where there is no masthead.

### 4. `code` had a treatment and no processor

§0c has read `code-cards (by line / block — PROPOSED)` since the catalog was written. Nothing
was built, so a listing past the component's own stated wall rang at every presentation size —
while the component's docs tell authors *"ten lines reads from the back row; fourteen is the
wall … split it"*, which is a pagination instruction the engine could not carry out.

Two seams, in this order, and the order is the design. **By block first**: more than one fenced
block is the structural case, and the page is the section with the other blocks removed, so
`code.styles.css` is reused whole. **By line-run** when there is exactly one block over the
budget — the case that actually clips, because the canonical code slide IS one block.

The line cut closes and re-opens its highlight spans. Highlighted code is HTML and a span can
legitimately cross a newline; cutting at a `\n` leaves one page with an unclosed `<span>` and
the next starting inside a tag that never opened.

## The run's own footer is said ONCE

The 2026-09-01 chrome ruling says a split page carries *"the page number and the k-of-N pill
rail. Nothing else."* `stripDeckChrome` implemented that for the DECK's band and deliberately
left a per-slide `_footer:` alone, because deleting an author's caption from an unsplit slide
is silent content loss — the defect `deckChromeFrom` exists to avoid.

But a split RUN is one slide unfolded, so the slide's own caption belongs to the run, not to
each of its pages. Repeating it is the same repetition the ruling removed from the deck frame,
one level down.

**And it is what clips.** The caption lands in the shared Form footer band, whose budget is one
line. Measured on `split-panel cat-1` at portrait:

| | result |
|---|---|
| unsplit, the gallery's real caption | **fits** |
| split, same caption | **3 of 3 pages clip** |
| split, a short caption | 0 of 3 clip |
| a plain unsplit `content` slide, same caption | **clips** |

Geometry is byte-identical between the second and third rows (`.cell-footer` 1281.7 → 1329.8
either way), so it is the text and not the layout. 28 pages of the shipped `split-panel`
gallery clipped this way; it is 11 now, and every remaining one is a COVER hitting the band's
one-line budget — which the fourth row shows is pre-existing and shared by every component, so
this change does not pretend to fix it. What it stops is the split walking a component into
that limit N times over.

Keyed on the run's FIRST page rather than on `data-split-role="cover"`. Same page wherever a
cover exists, and still right where one does not — which mattered for exactly as long as the
native strategies had no cover, and will matter again for the next strategy that emits none.

## Two atomic placements reversed, on the owner's call

Both were deliberate resolutions with reasons, and both are reversed here deliberately rather
than tidied away. The reversal is recorded at each component's entry in `split-facts.js`, in
full, including the text of what it replaces.

**`obligation-matrix`** is `compare-table`'s shape — a wide read-across grid — and gets
`compare-table`'s reader, `cover-cards`, which reshapes each regime row into a card whose
column headers become in-card labels. Landscape renders the native grid untouched. The
measurement that moved it: **8 of 10 pages of its own gallery clip at portrait**, including the
default, so "keep it whole and ring" was in practice "show part of the grid and say nothing".

**`matrix-2x2`** is the harder one and the cost is accepted rather than denied. Its retired
note read: *"a 2x2 quadrant read is destroyed by splitting BETWEEN quadrants (you would see 2
of 4 cells with no axis structure)"*. That is still true of an unadorned slice, and it is the
#1193 defect class. What makes the enrollment survivable is that **the quadrant's own label IS
its position on both axes** — `High impact · Low effort` — so a page says where it sits without
the grid being present, and `capacity.relationship: comparison` puts an `Option N of 4` rail on
every page. A paged 2×2 is a worse read than a 2×2 that fits. It is a better read than the 4 of
7 gallery pages that clipped, where the reader saw part of the grid and was told nothing.

## What the jank rig cannot see — and what a split-page sweep found once it was looked at

`tools/check-jank.js` renders `--no-split`, and says so in its own warning. So **no split page
had ever been measured for jank** — not the k-of-N rail, not the "next:" pointer, not the
runhead, all of which are fixed marks a run owns and a growing member can reach.

**Measured now, on 1,456 split pages across 22 decks at portrait and square:** pairwise overlap
between every mark that can land in a page's bands — the forward pointer, the k-of-N rail, the
deck page number, the running header and the running footer. Two results and one method note:

- **One collision this change caused, on one page class — and the FIRST FIX FOR IT WAS WRONG
  AT A SIZE THE SWEEP DID NOT ASK ABOUT.** `split-panel pullquote` splits coverless (it leads
  with the quotation, so there is no `<h2>` for a reader OR a cover), and those pages are not
  Forms, so they have no `.cell-footer` row to dock the marks in. `dockInFooterCell` appends
  both at section level — and on this layout the section is the PANEL FLEX CONTAINER, which is
  the whole of it: the pointer arrives as a flex ITEM of the panel row.

  At portrait the container is a column, so the pointer stacked under the panels and landed in
  the band: the rail's segments printed through the pill's label by 42.1×6.5px, and the pill
  over 206.6×24.5px of the running footer's INK. **At square the container is a row, and the
  same item becomes a third COLUMN** — `.panel-right` squeezed from half the slide to 252px
  (the column set one word per line) and the pill ran to x1133 in a 1080px section, clipped at
  the slide edge.

  The first fix reserved the band with `padding-bottom` on the section. It closed the portrait
  collision at all four tall sizes and was wrong anyway: at square the panels are side-by-side,
  so the reservation cut the DARK panel short too and left a 92.9×629px white band under a
  full-bleed navy field. **Reserving space in a container cannot be right when the mark should
  not be in the container at all** — which is the general lesson, and it is why a sweep that
  reports a pair of rectangles is not the same as looking at the page.

  The pointer is now POSITIONED in the band the rail already owns, clear of it and of the
  footer's ink, instead of laid out in the panel row. The panels get their whole box back at
  every size, so no reservation is needed; the pill cannot squeeze a panel or be squeezed by
  one; and the two marks stop overlapping because they are placed rather than stacked. The
  8.6cqi offset is what the footer's ink measured, not a round number.
- **One collision that is not this change's**, proved by running the same sweep against the
  merge base: `compare-split` in `portrait-prose-deboost` at square, 81.5×5.8px of
  pointer-over-rail, identical at base and at HEAD on the same page class (the page INDEX moves,
  25→29, because this branch inserts pages ahead of it). Off-path and recorded, not pulled in.
- **The method note is load-bearing: measure INK, not boxes — on BOTH sides of the pair.** The
  first revision of this sweep compared bounding boxes and reported seven collisions. A running
  footer's box spans the band (988px) while its string does not, so it reported the rail as
  colliding with a footer whose text stopped 11px earlier — three of the seven were that. A
  `Range` over each element's contents gives the union of its text's own rects, and the count
  fell to one. The first write-up then reported the surviving overlap as 230×46px, which is the
  pointer's BOX against the footer's ink: the same one-sided comparison this note warns about,
  applied to the note's own headline number. Ink to ink it is 206.6×24.5px.

**MARK AGAINST CONTENT — the blind spot in the sweep above, found by a checker reading it.** The
collision sweep compares a mark to other MARKS. A mark that is absolutely positioned paints over
whatever the page flowed underneath it, and neither that sweep nor the overflow probe can see it:
the probe reads FLOW height, and an out-of-flow mark contributes none. A third checker pass
measured 102.2x38.0px of the `split-panel` pointer's opaque pill over a body line, on a page the
engine considered to fit — after a fix on this branch took that pointer out of flow. (That figure
did not reproduce on a later attempt and is replaced by a sweep in the closing section below: the
same deck at seven body lengths, which gives the whole band rather than one number.)

So a second probe, over the same corpus: every wayfinding mark's ink against the ink of every box
carrying readable text. 1,456 pages, 9 hits, all accounted for:

- **8 are pre-existing decoration.** The k-of-N rail and the page number crossing a `watermark`
  letterform — a single `S` or `W` set at display size as background. Re-rendered from the merge
  base, all eight reproduce with IDENTICAL numbers (120.5x5.8, 18x40, 70.9x5.8, 13.3x30); only
  the page indices move, because this branch inserts pages ahead of them. `check-jank`'s own
  doctrine already classifies a mark touching DECORATION as chrome rather than a defect, and for
  the reason its header gives: one engine-drawn mark deliberately touching another is a design
  choice a geometry rig cannot second-guess.
- **1 is an artifact of the sweep itself.** `examples/autosplit-coverage` at `size: square` — a
  deck authored `size: portrait`, forced to a canvas it was not written for, on a page the engine
  ALREADY marks `overflow clip-marked`. At its own size the deck has zero hits.

**DRIFT ACROSS A RUN'S PAGES — the other half of the question, also asked for the first time.**
`check-jank` sweeps ONE slide's content and asks whether an anchor holds position. A run asks
the same thing along a different axis: a reader sees its pages in sequence, seconds apart, so a
fixed mark that sits somewhere else on page 3 than on page 1 wobbles exactly the way that rig's
own header describes — "fine in a still; it wobbles across a deck". Nothing had asked it,
because the rig renders `--no-split`.

Measured per RUN over the same corpus — 315 runs, 1,456 pages, the spread of each wayfinding
mark's position across a run's BODY pages, in the section's own right/bottom coordinates (a
cover is a different treatment by design and is excluded rather than counted as drift):

- **26 marks move more than 2px.** Almost all are the forward POINTER on the vertical axis,
  19–64px, on Form pages where it is laid out in FLOW — so its altitude follows the page's
  content height, and a three-member page puts it 64px from where a one-member page did.
  Two are the k-of-N rail moving HORIZONTALLY (18px on `checklist`, 26.5px on `roadmap`),
  which is the rail's berth shifting with the section-rail reservation beside it.
- **Every one of them is pre-existing, and this was verified per GROUP rather than per class.**
  The 26 hits fall into 19 distinct deck x page-class x mark groups, and all 19 were re-rendered
  from the merge-base tree: every one reproduces with the IDENTICAL number — `dy 63.9` on
  `cover-paginate`'s glossary run, `dy 57.9` on `portrait-prose-deboost`, `dy 37.6` and `dy 24.1`
  across `split-panel`'s seven, `dy 57.8` on `read-across-carousel`, `dy 32` on `premise`,
  `dx 18` on `checklist`. Nothing here creates or worsens the class.

  The per-group check is the point, not diligence for its own sake. An earlier pass checked one
  representative of each CLASS — six of the nineteen — and wrote "every one is pre-existing" off
  that. Two of the thirteen unchecked groups were on `split-panel`, the component this change
  edits; they turned out identical, but the claim had been an extrapolation from class membership
  rather than a measurement. The first attempt at the full check then reported a false regression
  on `read-across-carousel` at portrait, because the base render for that one deck sat in a
  different directory and was silently absent from the comparison. Both are the same failure in
  miniature: a corpus that does not contain the case cannot clear it.
- **One base finding is GONE at head**: `roadmap`'s rail drifted 26.5px horizontally at the
  merge base and does not at HEAD, because the native-slice cover changed that run's shape.

Recorded, not fixed: the pointer's altitude is a consequence of laying it out in flow, and
pinning it would move every Form split page in the corpus — the same "belongs in its own change"
boundary the band reservation above respects.

**WHAT IS STILL NOT MEASURED ON A SPLIT PAGE, AND WHY A QUICK VERSION DOES NOT COUNT.** CROWDING,
and DRIFT in `check-jank`'s own sense (sweep ONE slide's content and watch its anchors). Both need
the rig to render WITH splitting, which is a change to the tool.

CROWDING was attempted here with a standalone probe — ink union against the section's content box,
`--tight 12`, the rig's own definition — and the attempt is worth recording because of how it
failed: **1,440 of 1,456 pages came back crowded.** A 99% hit rate is not a finding, it is the
cry-wolf failure `check-jank`'s own header warns about, and the cause is that the naive
reimplementation lacks everything that makes the real one trustworthy — the frame's reserved band
rather than the section's (near-zero) padding, the chrome classifier that keeps a mark in its own
berth from reading as content, and the anchor exclusion. Rebuilding those is rebuilding
`check-jank` (HARD RULE #15 says not to), so the honest state is: not measured, and a probe that
says otherwise should be disbelieved.

`premise` is the other coverless shape in the corpus and it does not collide — its content
stops ~400px above the band. That is content-dependent luck rather than a reservation, and the
same fragility is still there; it is pre-existing, this change does not tip it, and it is
recorded below rather than fixed here.

What WAS measured, across every component × every gallery modifier set at `wide` and `tall`
(534 sweeps, plus a 63-mark anchor pass):

- **DRIFT: none.** The one hit, `image split`'s `div.image-text::after` at 21px, moves only at
  the sweep step where the section already overflows — the probe flags that page, so it is not
  the silent class this tool exists for.
- **COLLISION: none that the overflow probe does not already report.** Of 14 raw hits, ten name
  a full-bleed element (`lattice-bg-full`, `image-scrim`, `scene-figure` on `spotlight` and
  `statement`) as the anchor, which is a misuse of the tool — those cover the slide by design.
  The rest sit on pages the probe flags from step 1.
- **CROWDING: 260 advisories**, of which 120 fire at step 1 and most of those are 1.8–5px of a
  chart figure filling its stage.

The rig's own falsifiability was re-checked before any of that was believed: sweeping
`divider numbered` with its band neutralized still reports a −3.6px COLLISION the overflow
probe calls fine.

## What is not resolved

- **`citation-card` was examined for enrollment and DECLINED, against this change's own first
  reading.** The census flagged 7 of its 10 gallery pages clipping at portrait and its
  `triptych` variant is described as "three authorities abreast", which read as three members.
  The rendered DOM says otherwise: one `<code>` citation, one `<blockquote>`, and a two-item
  list whose members are two READINGS of that one quote ("In plain English" / "What we must
  do"). `triptych` is a three-COLUMN composition of one citation, not three citations. Splitting
  between the readings separates them from the quote they read. It stays atomic and rings, and
  the clipping is a fit problem in its own type scale rather than a missing seam.
- **`closing index` and the `math` step variants are named and not done.** `closing index` ends
  on a real reference list and clips in three separate galleries (`bullet` p14, `line` p15,
  `q-and-a` p40 — all the "See also" slide, five items); `math derivation` / `theorem` /
  `decompose` are each a run of independent steps. Both are genuine seams. Both also need a
  decision this change did not take: `split-facts.js` places a treatment per COMPONENT, so
  enrolling `closing` moves `title` and `divider`'s sibling out of `anchor` for one variant's
  sake, and a deck whose last slide becomes a six-page run is a real change to how a deck ends.
- **`regulatory-update diff-bands` does not split**, and it is the one variant whose shape no
  existing reader fits: four `### band` headings each with its own `<ol>`. `firstList`
  (`lib/core/collections.js`) takes the single list with the most `<li>` children, so it sees
  one band's one item and the envelope is built from that. A band-aware reader is a new shape,
  not a fix to an existing one.
- **The footer band's one-line budget is untouched**, and it is what the 11 remaining
  `split-panel` cover clips are. It is pre-existing and shared: a plain unsplit `content` slide
  with a long enough `_footer:` clips identically. Widening it is a change to every component's
  band.
- **A COVERLESS `split-panel` PAGE CAN STILL PRINT ITS POINTER OVER LONG CONTENT — accepted on
  the owner's call, with what is and is not fixed stated exactly.** The layout's section IS its
  panel flex container, so the forward pointer arrives as a flex item of the panel row and has to
  be taken out of it; out of flow, it is an opaque pill at `--z-chrome` over a column that clips
  at its PADDING box. Four independent checker rounds each found a different defect in that
  geometry, the last two of them shipping:

  | round | defect | state |
  |---|---|---|
  | 1 | rail printed through the pill's label; pill over the footer's ink | fixed, pinned |
  | 2 | section-level reserve cut the dark panel short at square | fixed, pinned |
  | 3 | `:not(.form)` left an authored `form` page with every round-1 defect | fixed, pinned (4 of 28 arms) |
  | 3 | pointer out of flow with no reserve → pill over body text | partly fixed — see below |
  | 4 | `mirror` row-reverses the panels; the reserve was on the wrong column | fixed, pinned (4 of 40 arms) |
  | 4 | the run's last page has no pointer, so it alone got no reserve → 31-44px content drift | fixed, pinned (8 of 40 arms) |
  | 5 | round 4's fix reserved BOTH panels and inflated the dark panel at every stacked size | fixed, pinned (3 of 40 arms) |
  | 5 | the arm pinning round 4's `mirror` fix could not see its own defect — vacuously green | fixed; the mutation now fails 4 arms, was 0 |
  | 5 | the k-of-N rail draws in canvas ink and lands on the PANEL under `mirror` — 1.00:1 | fixed, pinned (8 of 56 arms) |
  | 6 | round 5's rail fix keyed on `mirror`, and two corners never have a mirror in them | fixed, pinned (4 + 4 of 56) |
  | 6 | the `.panel-right` reserve was ungated on `mirror`, holding ~89px of dead band | fixed, pinned (4 of 56) |
  | 6 | four `mirror` seam arms were placebo, and three quoted figures did not reproduce | fixed |

  **Round 5's three are one finding wearing three hats, and it is the same one as rounds 1-4.**
  Round 4 widened WHICH PANELS reserve the band; nobody widened WHAT THE PROBE LOOKS AT. The test's
  content list was `.panel-right li, strong, p`, and the mirrored overprint lands on
  `.panel-left cite` — so the arm written to pin the mirror fix asserted `overContent === null`
  against a set that structurally could not contain the defect, and stayed green with the fix
  deleted. The inflation and the rail were both invisible to every geometry probe on this branch
  and both were caught by RASTERIZING the split deck, which is what the QUALITY BAR asks for and
  what nobody had done for round 4's change.

  **The seam.** `.panel-left` in a COLUMN is a flex item sized by its content, so bottom padding
  grows the panel instead of shrinking a content box: the dark/light seam went 49.3% → 55.0% of the
  slide at portrait, 35.9% → 39.4% at story, 29.9% → 32.6% at mobile. At square nothing moved, a
  row's panels being full height already — which is why the round-4 comment's "on the panel the
  pointer never reaches, the padding is invisible" read true and was not. The reserve now goes to
  `.panel-right`, and to `.panel-left` only under `.mirror`, which is the one configuration that
  puts the pointer over that panel and is always a row.

  **The rail.** `.lat-split-rail .seg` draws in `currentColor`. Under `mirror` the bottom-right
  corner is the panel, so it draws canvas ink on the panel fill: swept across all 33 shipped
  palettes × six variants, 52 of 198 cells under WCAG 1.4.11's 3:1, bottoming at 1.00:1. It now
  takes the ink of the field it lands on, from the four-token table this layout's header and footer
  already use. 0 of 198 after, worst cell 5.33:1. The first attempt at this fix made it WORSE —
  two arms instead of four caught `metric` and `steps`, whose panels are light, and took the sweep
  to 76 failing cells. The header table above it warns about exactly those two variants by name.

  **Round 6 is the same lesson one level out: `mirror` was never the question.** Round 5 wrote the
  rail rules as "under `mirror` the corner is the panel", and a sixth round found two corners that
  are not the panel and have no mirror in them. The rail lands wherever the section's bottom-right
  corner is, and THREE things decide what is there — measured with a probe that reports which box
  the rail's own rect sits inside, over 22 configurations at two sizes:

  - **An insetting Form frame lifts both panels off the corner.** `.lat-split-rail` is absolutely
    positioned on the SECTION at `bottom: 2.35cqi`, and a coverless native page has no
    `.cell-footer` to dock it into — so on `form` the panels end at y983.5 of a 1080 section and
    the rail sits at y1051.3, on the frame's white margin. Round 5's rule painted it the panel's
    ink there: **1.00:1** on `form mirror`, `form mirror claim-quiet` and `watermark form mirror`,
    at both sizes, where before the rule it was 11.50:1. A regression this branch introduced.
    `claim-hero` and `claim-bleed` zero the inset, so the panel does reach the corner on those and
    the panel ink is right; that set is measured, not assumed.
  - **`metric` inverts the panels** (`.panel-right { background-color: --surface-inverse }`), so on
    an UNMIRRORED `metric` page the corner is the dark one and canvas ink measured **1.02:1** — the
    identical defect on a surface no `.mirror` selector can reach. The 33-palette sweep could not
    see it because every deck in that sweep was mirrored: a corpus that does not contain the case
    cannot clear it, for the fourth time on this branch.

  The rules now key on the corner panel, and the sweep grew with them: **627 cells (33 palettes x
  19 configurations), 90 under 3:1 before, 0 after, floor 5.11:1.** The same correction applies to
  the RESERVE: it was ungated on `mirror`, so a mirrored page reserved the band on both columns
  while the pointer is in one. Measured over 22 configurations, the pointer overlaps the corner
  panel by 347-390px of its 390px width and the other by 0-43px — and an unmirrored page's
  other-panel sliver, 0-7px, has never had a reserve. The ungated arm held ~89px of dead band and
  lifted that column's content 44.4px off where the unsplit slide puts it.

  **And four seam arms were a placebo.** The seam arm can only catch a panel inflating, which only
  happens in a flex COLUMN; `mirror` forces `row-reverse` at every size, so its four arms were
  trivially true. They now assert the row-ness that makes them unnecessary, so a reflow change
  trips them.

  **Three more quoted figures did not reproduce, and the reason is the same every time: nobody
  said which measure.** The mirror overprint has now been written up as 199.5x23.1, 217.1x28.4 and
  236.7x26.0 by three different passes. It is quoted here as OPAQUE PILL BOX against CITE INK — the
  pill is filled, so its box is what paints over the words — on this file's own fixture, page 1:
  portrait 361.4x51.5, square 305.0x38.5, story 381.6x45.9, mobile 390.1x41.8. Also corrected: the
  band reserve's `.mirror` selector is (0,4,1), not the (0,3,1) a commit message claimed for the
  pair; `1c14463` says "two slides" added to `autosplit-coverage.md` and one was; and the
  blast-radius count is 66 authored `_class:` split-panel slides across 14 decks, or 78 rendered
  sections, not the 71 across 13 a PR body said.

  **What the reserve does NOT do, measured rather than argued.** It repositions content that
  FITS — which is the drift fix and the mirror fix, and both are real. It cannot hold longer
  content out of the band, because `.panel-right` is `overflow: clip` and a clip edge is the
  padding box. Swept on a four-member portrait deck at seven body lengths: 8 and 12 words clear;
  16 words prints 351.5x14.6px of pill over the last line without the reserve and nothing with it;
  20, 24, 28 and 32 words print the pill's full 51.5px height either way.

  **What the engine and the linter actually say, after two wrong answers.** The first version of
  this section said the engine flags these pages; round 5 refuted it and the replacement
  over-corrected to "the engine does not flag them", which round 6 refuted in turn. Both are
  deck-dependent: a 20-word body of short words measures `scrollHeight === clientHeight` with no
  `overflow` class and no CLI warning while the pill covers the words, and a 24-word body of
  ordinary words trips the class on all four pages. The linter is deck-dependent too, and naming
  one of its rules was the same error: `lint:deck` calls `density-crowd` past this component's
  16-word soft target and `density-overflow` past its 24-word hard limit, and which fires at a
  colliding length depends on the element's TITLE, because the rule counts the whole element —
  measured, same body length, two title widths:

  | body words | 3-word title | 8-word title |
  |---|---|---|
  | 12 | nothing (15 total) | `density-crowd` (20) |
  | 16 | `density-crowd` (19) | `density-crowd` (24) |
  | 20 | `density-crowd` (23) | `density-overflow` (28) |
  | 24 | `density-overflow` (27) | `density-overflow` (32) |

  The durable claim, and the only one worth writing down, is the weak one: **a page whose content
  fits its panel can still have the pill over its words, and nothing in the engine says so.** Both
  linter rules are advisory and neither blocks.

  **The root fix is a kernel change and is deliberately not taken here.** `dockInFooterCell`
  appends both marks at SECTION level whenever a page has no `.cell-footer` row; docking the
  pointer inside the content flow instead would make it unable to overlap content on ANY layout
  rather than this one. That moves shipped pages across every splitting component and wants its
  own change and its own review.

  **And the pattern is the durable finding, not the six defects.** Each round's fix held for the
  cases it was measured against and broke on one it had not been tried against — portrait but not
  square, non-`form` but not `form`, `.panel-right` but not `mirror`, pages with a pointer but not
  the last one. Three hand-authored test fixtures in a row could not reach the defect they were
  written for. The lesson is one line: **a corpus that does not contain the case cannot clear
  it**, and on a layout that reflows by size AND by modifier the corpus has to be the cross
  product, not a representative.
- **The long-run `k/N` rail form is under the 4.5:1 a TEXT run owes on some palettes, and that is
  pre-existing and repo-wide.** Past `RAIL_DOT_MAX` (12 pages) the rail prints `k/N` instead of
  pills, and `.lat-split-rail .seg-count` carries `opacity: 0.8` from `base.modifiers.css`. Swept
  33 palettes x 5 mirrored variants at 15-member runs: all 165 cells clear the 3:1 a graphical
  object owes; 15 are under 4.5, worst 3.60. It is NOT this change's: on the NON-mirror surface at
  cuoio and laguna, 10 of 10 cells are under 4.5, worst 1.90 — the dim is short of the text floor
  on ordinary split pages too, and the re-inking here took the mirrored case from ~1-2:1 to
  4.09-13.08. Removing the dim on the re-inked arms was measured (5.33 / 5.49 / 7.19 worst) and
  deliberately NOT taken: it would make this PR's mirrored count louder than every other split
  page in the same deck, to partially fix a condition whose home is `.lat-split-rail .seg-count`
  itself.
- **`split-panel`'s running footer is illegible on its coverless split pages, and was before
  them.** The layout inks its chrome `--on-dark-secondary` — white at 0.76 alpha — because that
  chrome normally sits over the dark panel. At portrait the panel is on TOP and the footer sits
  on the white half, so the text is white on white. Measured identical at base and at HEAD, and
  on the UNSPLIT slide too, so it is pre-existing and off this change's path. It is also why the
  pointer collision above rasterized as a ghost rather than as solid overprint — and why fixing
  the collision was still worth doing: the day that ink is corrected, the overprint becomes
  visible.
- **A coverless split page on a NON-Form layout has no reserved band, only a lucky one.** The
  fix above is scoped to `split-panel` because that is the only page class the 1,456-page sweep
  found colliding. `premise`'s seven coverless pages carry the same two marks with the same
  absolute berth and no reservation; they clear it only because their content is short. The
  general fix is a band reservation in the shared chrome, which moves seven shipped pages and
  belongs in its own change.
- **`list principles bullet` IS BROKEN ON `main`, AND ITS COMMITTED GOLDEN WAS HIDING IT.**
  Found by rebuilding the gallery PDFs this change's CSS edits made stale — the rebuild is
  mechanical, and `golden-diff` then reported one changed slide on `list` in both moods, which
  is the only gallery in the corpus it did not call "rebuild-only".

  It is not this change's. Rendering `list.gallery.md` from the merge-base tree and from this
  branch gives a PIXEL-IDENTICAL slide 8 (`ImageChops.difference(...).getbbox()` → `None`), the
  section markup is byte-identical, and the only CSS rules that differ between the two bundles
  are `obligation-matrix`'s and `split-panel`'s. What differs is `main`'s COMMITTED golden,
  which still shows the styled register — display-weight statements, accent dots, hairline
  dividers — while `main`'s own code renders a bare `1. 2. 3.` in body type with the whole
  `principles` register gone. The golden was blessed before the regression and never rebuilt.

  **The mechanism is a NAME COLLISION, and half of it is already defended.** `bullet` is a
  declared VARIANT of `list` (`list.manifest.json`, beside `lettered` and `roman`) *and* a
  standalone chart COMPONENT. So `<!-- _class: list principles bullet -->` carries two
  component names and the layout resolver has to pick one. `bullet.styles.css` already guards
  its own side — every rule in it is scoped `:is(section.bullet:where(:not(.list)), …)` — so
  someone met this collision before and defended the chart from the list. Nothing defends the
  list from the chart.

  **The golden stays rebuilt.** It now shows what the engine produces instead of what it
  produced before the regression, which is what a golden is for; a baseline that hides a live
  defect is worse than one that shows it. Off the path of this change (nothing here touches
  `list`, the `bullet` modifier, or the chart), so it is recorded rather than fixed — but it is
  recorded as a defect on `main`, not as churn.

  **AND IT IS NOT THE ONLY STALE GOLDEN — the staleness is the finding.** Checking the other
  changed goldens the same way turned up a second one straight away: `portrait-journey`'s split
  pointer reads `A :1 task is then unmistakable` in `main`'s committed golden and `A:1 task …`
  in what either tree renders today, so the space before an inline `<code>` chip is being lost
  and the golden still shows it intact. Same verdict — base render and head render are
  identical, so it is not this change's — and the same shape: a committed baseline that
  silently stopped describing the engine.

  Both were found only because an unrelated CSS edit forced a gallery rebuild. **Nothing
  routinely asks whether a committed golden still matches what the engine renders**, and
  `golden-diff` cannot ask it either — it compares the PR's goldens against the BASE's, so two
  equally stale goldens agree and report nothing. The gate that would catch this is a fresh
  render against the committed golden (`tools/regression-gate.mjs` asks exactly that question,
  for the author, at bless time), run on a cadence over the whole corpus rather than on the
  decks a PR happens to touch. That is a CI-contract change and belongs to its owner, not to
  this PR.
- **`split-panel mirror` renders its right panel entirely off-slide at every STACKED size** —
  `{left: -62.4 to 1531.6, right: -451.6 to -62.4}` on a 1080px slide at portrait, the same shape
  at story and mobile. Identical with `--no-split` (one whole slide, `overflow clip-marked`), so
  it is pre-existing and not this change's; found by the round-4 checker and unrecorded anywhere
  else. **The cause is now known**, which it was not when this bullet was first written:
  `section.split-panel.mirror { flex-direction: row-reverse }` (`base.modifiers.css`) and
  `section.split-panel[data-orientation="portrait"] { flex-direction: column }` have the SAME
  specificity (0,2,1), and the mirror rule sits later in the bundle — so a mirrored section never
  takes the portrait reflow and a 38/62 row overflows a narrow slide. The fix is one line in
  whichever file should win, and picking which is a layout-ownership call, not a split one. The
  seam arm in `split-panel-coverless-band.test.js` asserts the off-slide shape rather than
  skipping it, so a fix trips the arm and says to turn the comparison back on.
- **The band reserve's selector is (0,3,1), down from (0,4,1) before this change** —
  `section.split-panel.lat-split-native > .panel-right` versus the `:has(> .lat-split-rel)` form
  it replaced. It still beats every `.panel-right` padding rule in the bundle, including
  `watermark`'s, on source order (verified: `155.52px` computed on all 28 variant/size
  combinations). But a THEME stylesheet loads after the engine bundle, so a (0,3,1) theme rule on
  `.panel-right` would now win where it previously lost. No theme carries one — themes supply
  tokens, not layout — so this is latent rather than a defect, and it is recorded because the
  thing that would make it real is a theme starting to ship layout.
- **Two more marks in the split page's own corner are canvas ink on the panel under `mirror`, and
  both are PRE-EXISTING.** Found by rasterizing the new demo deck rather than by any probe, which
  is the third time on this branch that a raster saw what the geometry did not.
  - The DECK PAGE NUMBER is `section::after`, not a split mark, so the rail fix does not reach it:
    `rgb(92,111,138)` on `watermark`'s accent panel measures **1.07:1**, read off the raster
    (an `elementsFromPoint` probe reported white there and was wrong — the sections below the
    fold are outside the viewport it queries).
  - A `cat-N` panel's OWN QUOTATION and cite are white at **1.34:1** and **1.27:1** on the tinted
    fill, against the categorical contract's own rule that every text run on a tinted panel takes
    `--cat-on-fill`. `watermark`'s cite is 3.84:1, under the 4.5:1 a text run owes.
  Both are byte-identical on the `--no-split` render of the same deck, so neither is this change's
  and neither is folded in (HARD RULE #18's off-path arm). The `cat-N` one is the more serious:
  the quotation is the slide's whole content, and `split-panel pullquote cat-N` is unreadable at
  every size, split or not.
- **A split page's lone member sits where the variant's own `justify-content` puts it**, which on
  `watermark` is the top of an otherwise empty column. Pre-existing: `split-panel watermark` with
  an `<h2>` splits 1 -> 4 identically at base `7d68461` and at head. It is the shape
  one-element-per-page splitting has on a `flex-start` column, not something this branch caused.
- **`split-panel steps` overflows at `wide` from step 1 of the jank sweep** — the component's
  own skeleton, at its own authoring size, with a six-word heading. Pre-existing, off this
  change's path, and recorded here rather than walked past (HARD RULE #18's off-path arm).
- **A component's variant styling reaches its split pages only if the component asks.** The
  modifiers ride as `data-split-mods`, an attribute, and `split-panel`'s eight `cat-N` variants
  are the only consumer today. Every other component's variant selectors still do not match its
  split pages — which is correct by default (a `cards-grid.three` rule has no business on a
  `content` cover) and is untested for each of them. The census that would say which ones LOOK
  wrong is the same script as below, and it measures page counts, not color.
- **Nothing gates the variant axis.** The census that found all of this is a script, not a
  check. `split-facts.js` still places one treatment per component and every reader is still
  written against the shape the default variant renders; the next variant that renders
  something else will be as invisible as these were. The cheapest containment is the census
  itself, run on demand — which is what `tools/` would have to grow to close this, and it is
  not built here.
