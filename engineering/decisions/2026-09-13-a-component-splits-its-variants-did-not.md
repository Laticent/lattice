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
`recipeDeclined` is the flag that separates the two, and the `count <= 1` guard is what still
rings a genuinely single-member slide.

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

## What the jank rig cannot see

`tools/check-jank.js` renders `--no-split`, and says so in its own warning. So **no split page
has ever been measured for jank** — not the k-of-N rail, not the "next:" pointer, not the
runhead, all of which are fixed marks a run owns and a growing member can reach.

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
