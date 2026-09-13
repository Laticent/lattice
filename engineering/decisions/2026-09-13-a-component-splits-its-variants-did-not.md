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
engine considered to fit — after a fix on this branch took that pointer out of flow.

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
