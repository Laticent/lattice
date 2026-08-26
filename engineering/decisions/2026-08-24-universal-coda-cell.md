---
status: shipped
summary: >
  The two universal editorial blocks — the Key Insight panel and the below-note — attached by
  SELECTOR SHAPE: `section > blockquote` and `section > .cell-stage > blockquote`, guarded by a
  hand-written `:not()` chain that a unit test parsed back out of the CSS. Two exact DOM paths and
  a hand list, so any component whose transform introduced a wrapper silently lost the block while
  the manifest went on advertising it. Measured across all 61 layouts: EIGHT were wrong —
  compare-code, image, scene and split-panel SWALLOWED the blockquote into a sub-container where it
  rendered as unstyled body text; contact, wifi and video DROPPED it outright when they rebuilt
  their section; premise laid it out as a third column beside the body. The rhythm was wrong
  everywhere else: the step before the panel was whatever `row-gap` its host happened to carry
  (8px in the stage), which on a card list is HALF the 16px between the list's own cards — the
  separator between two different kinds of block smaller than the separator between peers. Fixed by
  giving the beats a HOST: one `.cell-coda` Cell, harvested by a kernel that runs FIRST in the
  registry (before any rebuilder can swallow or delete them), docked by the section's declared
  outer STRUCTURE rather than by component name — measured in Chromium, only three shapes occur
  across the catalog — and carrying one `--coda-step` of its own. Exclusions become `coda.claims` in the
  component manifest, so the published contract and the render read one predicate and the CSS
  `:not()` chain (and the test that parsed it) are gone. 49 of the 51 coda-hosting layouts land on
  exactly the step; the two that do not are compositions whose own centering supplies the difference.
---

# The universal blocks needed a host, not a longer selector

**Date:** 2026-08-24
**Status:** shipped
**Follows:** `2026-07-14-one-frame-model.md` (the `stage: flow|canvas|sovereign` axis this borrows
its shape from), `2026-06-27-stage-flow-no-margins.md` (why the step is `padding`/`gap`, never
`margin`), #1651 (which fixed the CONTRACT and left the ATTACHMENT alone).
**Rules touched:** none changed. HARD RULE #1 (one predicate, two callers), #15 (one peel, every
rebuilder), #20 (padding, not margin) all apply as written.

---

## 1. The report, and what it turned out to be

The report was about spacing: *"there seems to be an issue with the gap between key insight box and
certain components like code and code compare."* Rendering the corpus found the gap complaint was
real and universal, and that it was sitting on top of a much larger correctness defect on the two
components named.

`code` measures a correct 8px step — the same as every other stage-hosted layout. What makes it
read badly is that both sides are PAINTED: a filled code panel 8px above a filled insight panel.
`compare-code` renders no panel at all. The author's `> …` ends up inside `.code-cols > .code-col`,
where it prints as unstyled body text under the right-hand code block — no panel, no eyebrow, not
even full width.

So the question behind the report was the right one to answer instead: *the way we support these
blocks should be determined by the kind of structure a component uses — our universal stuff should
support the structures, not the components.*

## 2. Why selector-shape attachment fails, measured

The Key Insight panel had no transform at all. It was pure CSS, matching two DOM positions:

```css
section:not(.quote):not(.math):not(.citation-card):not(.policy-recommendation):not([class*="layout-"]) > blockquote,
section:not(.quote):not(.math):not(.citation-card):not(.redline):not(.inventory):not(.policy-recommendation):not([class*="layout-"]) > .cell-stage > blockquote { … }
```

Every rule in the family was written twice (direct child, and the position the masthead lift moves
it to), and each arm carried its own `:not()` chain. `KEY_INSIGHT_EXCLUDED` in
`lib/core/authoring-blocks.js` mirrored that chain by hand, and a unit test parsed the CSS to keep
them in step. below-note was better off — it had a real kernel — but it ran LAST, after every
structural transform, and matched only a direct child.

Rendering one probe slide per component through the real emulator and measuring in real Chromium:

| what happened | layouts | how |
|---|---|---|
| panel renders, 8px step | 43 | the stage's own `row-gap` |
| **swallowed, unstyled** | compare-code, image, scene, split-panel | the transform wrapped the tail into `.code-cols` / `.image-text` / `.scene-text` / `.panel-right`, so neither selector arm matched |
| **dropped outright** | contact, wifi, video | the transform rebuilds the section from the authored list and never re-emits the node |
| **misplaced** | premise | the section is a flex ROW, so the panel became a third column: −243.8px of "gap" |

All eight advertised support in `authoring.blocks`, the deck lint accepted the markup, and Compose
offered the register. The author applied it and got silence — the failure #1651 exists to close,
still open because #1651 fixed the contract and not the attachment.

The below-note half told the same story from the other end. Of 11 canvas layouts, ZERO were
wrapped: seven silently became the component's own `.chart-caption` (a different treatment than the
one advertised), and the same three dropped it.

## 3. The rhythm defect, separately

On a `list` slide the gap between two peer cards is **16px** and the gap between the whole list and
the Key Insight panel is **8px**. The separator between two different KINDS of block was half the
separator between peers inside one block, so the panel read as a fourth list item. That is not a
`code` problem; it was every layout, and it followed from the panel having no step of its own — it
inherited whatever `row-gap` its host declared (8px in the stage, 0 on a sovereign, 64px on
premise's row).

## 4. What shipped

**A cell.** `lib/core/coda.js` harvests the trailing beats into one
`<div class="cell-coda" data-dock="…">`, declared as a Form Cell
(`lib/forms/cell/coda/coda.cell.json`, region `coda`, with a `coda` Tile) and styled by
`lib/forms/cell/coda/coda.css`. Everything downstream addresses the cell: the panel chrome in
base.modifiers.css is now six single-arm rules with no `:not()` chain, and the CSS-parsing drift
test is deleted because there is nothing left to parse.

**Running first.** The kernel is the FIRST entry in the transformer registry. This is not an
optimization: for the three components that delete the node there is nothing left to re-parent by
the time a last-running pass could look. Every rebuilder that re-slices a section body now peels
the cell the same way it already peeled a trailing `<footer>` — one shared `peelCoda`, called from
six places rather than six ideas of what the tail contains (HARD RULE #15).

**Docking by structure.** A full-width band beneath the body has to be placed differently depending
on the section's outer structure, and measuring all 61 layouts in Chromium found only three
shapes: **55 column, 4 row, 2 grid**.

The first cut of this note said "57 column, 3 row, 1 grid — measured, not assumed", and that
was wrong in a way worth recording, because it is the failure mode this whole change is about.
Those were the DECLARED values, tallied out of the catalog the change itself wrote. The probe
behind them only measured layouts that actually HOST a coda, so `math` and `split-compare` —
which claim both beats and therefore host none — were silently defaulted to `column` and never
measured at all. Measured, they are `grid` and `row`. The declarations were inert today (a
layout that hosts no coda docks nothing), but the schema defines `dock` as the section's outer
structure, so they were a latent lie of exactly the kind `coda.claims` exists to end. Corrected;
the numbers above are now the measurement. So the CSS has one arm each and names no component; a layout declares its
shape once as `coda.dock`, and `column` is the default, so a new component declares nothing. The
row arm also zeroes `row-gap`, which corrects an accident rather than a choice: a row layout's
`gap` is a COLUMN GUTTER, and the shorthand sets both axes, so the moment the row wraps a 64px
(premise) / 48px (video) gutter nobody meant vertically reappears above the band.

**One step.** `--coda-step` (`--sp-md`, 24px) is deliberately wider than any intra-block step, the
widest of which is a card list's 16px. The cell SUBTRACTS the host's own gap rather than stacking
on it: a host that puts a gap before its last child declares `--coda-host-gap` beside the gap it
sets (the stage, diagram's re-tuned stage, scene's two stacked compositions). `padding`, never
`margin` — HARD RULE #20, and the band paints no surface, so the padding adds no box.

**Declared claims.** `coda.claims` in the component manifest replaces both exclusion lists. It
carries two reasons, and the second was not previously expressible at all:

- **USED** — the layout renders that element as its own anatomy (quote's quotation, math's display
  equation, a chart's caption via `liftChartCaption`, split-panel's pull-quote).
- **NO ROOM** — the layout is a POSTER whose body fills the stage by construction. `contact` and
  `wifi` measure a 527px card in a 524px stage; there is no band position that does not crush it.
  Before this field the engine simply dropped the node; when the coda first carried it through, the
  slide overflowed and was tagged "Content clipped". Declaring the claim makes the deck lint tell
  the author, which is the honest answer.

## 5. What the numbers say now

**51 layouts host a coda, and 49 land on exactly 24px.** The two that do not are `image` and
`scene`: both are centered figure compositions, and the difference is the composition's own slack
between its ink and the box the band docks to, not the band's step. The panel now renders on every
layout that publishes one, including all eight that were broken.

*(An earlier draft of this section read "52 layouts … 49 land on exactly 24px … `image` (52px),
`video` (45px), `scene` (26px)" and contradicted §7's own count in the same file. A checker could
not reproduce 52 under any counting — 51 publish `key-insight`, 55 publish either beat, 61 layouts
exist — and the outlier figures were from a different probe than the one §7 reports. The numbers
here are the current sweep. `video` left the outlier list for a real reason, recorded in §8.)*

The published contract (`authoring.blocks`) changed for **13** layouts, not the four the first
draft of this note named. In full:

| layout | before → after | why |
|---|---|---|
| `contact`, `wifi` | both → none | poster layouts; the card fills the stage |
| `split-compare`, `split-panel` | key-insight → none | the element is their own anatomy |
| `compare-code` | key-insight → both | the #1363 substring wart is gone; it claims neither |
| `funnel`, `journey`, `map`, `quadrant`, `radar`, `word-cloud` | both → key-insight | the trailing `<p>` becomes `.chart-caption`, and always did |
| `matrix-grid`, `state-chart` | both → key-insight | see below |

The eight chart layouts are the ones the first draft missed entirely, and two of them are claimed
for a reason that is **not true as written**. The schema and `lib/base/base.docs.md` justify
`trailing-paragraph` on a chart as "turns its final paragraph into the chart caption". Six do.
`matrix-grid` and `state-chart` render **neither** a caption nor a below-note — measured
identical before and after — so their claim is correct in effect (nothing is lost) and wrong in
reason. They are claimed because they render no note today, not because they consume the
paragraph. Worth revisiting: if either should host a below-note, the claim is what is stopping it.

Separately, `compare-code`, `premise`, `scene` and `video` gain blocks they now actually render —
but that is a RENDER change, not a contract change; their `authoring.blocks` was already correct
and unchanged.

## 5b. The cell is CONDITIONAL, not a reserved band (owner-confirmed)

`.cell-footer` is a reserved band: the frame sets aside its height whether or not the deck
declares any footer text, because the slide's geometry depends on that reservation. The coda
is deliberately NOT that. It is content, it sits in normal flow on the content plane
(`position: static`, `z: 2` against the footer's `absolute`, `z: 3`), and when a slide has no
trailing beat **the element is not emitted at all** — there is nothing to collapse or hide.
Measured on two slides of one deck: footer present on both (h=24), coda absent on the slide
without a beat and 95px on the slide with one.

The alternative — a reserved band, dimensionally stable like the footer — was considered and
rejected. It would charge every slide in every deck the band's height for a block most slides
do not have: a permanent tax on the whole corpus to serve a minority of slides, and a worse
defect than the one this change fixes. A slide with no trailing beat must lay out exactly as it
did before this change, and it does.

Two consequences worth knowing. The step's cost is bounded to slides that actually carry a
beat — it is never paid for absent content. And a component that never hosts a coda pays
nothing at all for its existence, which is what makes the opt-out default honest rather than
merely convenient.

## 6. What was NOT taken

**#1363's substring wart is resolved as a side effect, not re-litigated.** below-note's old matcher
tested `cls.includes(x)`, so `compare-code` inherited `code`'s exclusion and `pull-quote` inherited
`quote`'s. Declared claims are per layout and token-exact, so each name answers for itself. The
corpus delta is reported in the PR rather than argued here.

**`gantt`'s 13,496px probe reading is not a coda defect and is not fixed here.** It is a
`div.chart-details` laid out at zero height, present before this change at the identical number —
a pre-existing, off-path defect, logged rather than pulled into this diff (HARD RULE #18).

**split-panel's base variant still renders no Key Insight panel.** It claims the blockquote because
its `pullquote` variant genuinely uses it, and a variant-scoped claim is a bigger design question
than this change. Today's rendering is unchanged; only the contract stopped lying about it.

**Declared capacity is coda-blind, and that is a separate card (#1875).** Sweeping every layout's
own gallery-default slide and adding one line of key insight, seven layouts clip: `kpi` 95px,
`logo-wall` 87px, `regulatory-update` 82px, `q-and-a` 74px, `agenda` 48px, `obligation-matrix`
33px, `matrix-grid` 32px. The proof that this is a contract defect rather than authoring debt is
`q-and-a`: 4 items against a declared hard cap of 6 — inside its own published budget — clipped by
74px with a coda on it. The declared number describes a slide with no coda, and nothing subtracts
the coda's cost. That is pre-existing and off the path of this change (the beat's cost went UP
here, but a coda-blind budget was already wrong at the old cost), so it is logged, not pulled in
(HARD RULE #18). The four slides this branch DID fix are the other case — beats we ourselves added
to test decks, over budget, trimmed in place.

## 7. The Cell is the STAGE'S SIBLING, not its child (owner-directed)

The first cut put the cell at the end of the stage body. That was wrong, and the way it
was wrong is worth recording because it looked right in every test.

Inside `.cell-stage` the cell is a flex item of the COMPONENT's own column, so it
inherits whatever vertical alignment the component (or the author) set. The frame's
editorial band therefore MOVED when an author wrote a base alignment modifier. Measured
in Chromium, distance from the band's bottom edge to the stage floor:

| layout | `align-top` | `align-middle` | `align-bottom` |
|---|---|---|---|
| `cycle` | 171px | 85px | 0px |
| `content` | 117px | 58px | 0px |
| `list` | 0px | 0px | 0px |
| `cards-grid` | 0px | 0px | 0px |

`list` and `cards-grid` show nothing because their bodies GROW to fill the stage, so
there is no slack for the alignment to distribute. That is exactly why the defect read
as a per-component quirk — "why do these two components look different?" — rather than
as the frame-level leak it is.

**The fix is the peel, not a nudge.** The frame already peels a trailing Marp `<footer>`
out of the body before wrapping the rest in `.cell-stage`, because the footer belongs to
the section, not the component. The coda is the same kind of thing, so it is peeled at
the same site, by the same `peelCoda` the rebuilders already use (HARD RULE #15), on both
arms. `.cell-stage` is `flex: 1 1 auto` and `.cell-coda` is `flex: 0 0 auto`, so the
stage absorbs the slack and the band sits at content height above the footer. No
`position`, no `margin` (HARD RULE #20), and no component CSS touched — which was the
constraint: the component keeps aligning exactly as designed, and the frame stops
borrowing its alignment.

After: every layout × every alignment modifier reports the band 0px from the floor.

**What this cost, and what it unexpectedly fixed.** Moving the cell changes its host, so
`--coda-host-gap` — the seam the band subtracts — is now the SECTION's gap rather than
the stage's. Declaring that default on the section (`section:has(> .cell-masthead)`,
keyed on the same condition as the gap itself) rather than on `.cell-coda` is
load-bearing: on the cell it would be a direct rule and would beat, through inheritance,
every host that re-tunes its own gap — diagram's prose variant, scene's two clean
compositions. On the section it is one inherited declaration among peers and ordinary
specificity settles it (verified with the frame default declared LAST, scene still
winning at 36px).

The unexpected part: the old rule was `section .cell-stage > .cell-coda`, which never
matched the canvas layouts whose cell was ALREADY a section child. Fourteen of them —
funnel, gantt, journey, kanban, map, matrix-grid, piechart, progress, quadrant, radar,
roadmap, state-chart, timeline-list, word-cloud — had been stacking the section's 16px
gap on top of the full 24px step for a 40px seam, on a rule whose entire purpose was to
make the step uniform. Measured across all 51 coda-hosting layouts, exactly-24px went
from 34 to 48. The ones that remain are `image` and `scene`, where "previous element sibling" is not
the visual predecessor; both measure byte-identical before and after. (An earlier draft called
these "the grid and row docks" and named `video` among them. `scene` was declared `column` at the
time — see §8 — so the description was wrong about two of the three.)

**One arm-parity caveat, recorded because it is a trap.** The both-arms test does NOT
catch this class of defect: reverted, the string arm and the DOM arm swallow the cell in
the same way, still agree, and pass. The whole 7,201-test suite passed with the cell
inside the stage and outside it. What pins it now is one STRUCTURAL assertion per arm
(`test/unit/transformers/masthead-lift.test.js`), each verified to fail on a revert.


## 8. What the adversarial trio found, and what it cost

The trio (HARD RULE #25) ran against the final shipping diff after §7 landed. An earlier trio had
audited an earlier version, and everything after that point — including the two highest-blast-radius
files — was unaudited. All three lenses independently found the same critical defect, which is worth
recording as evidence that the tier earned its cost rather than as a formality.

**The peel blinded the split envelope.** `split-envelope.js` bounds every trailing-material scan by
`extractStage`; §7 moved `.cell-coda` outside that bound, so all five scans returned empty. On this
subsystem's own committed demo deck, `examples/split-envelope.md`:

| | before §7 | after §7 | fixed |
|---|---|---|---|
| pages | 26 | 27 | 26 |
| key insight | 1× | **6×, one per body page** | 1× |
| below-note | 1× | **lost outright** | 1× |
| insight pages | 2 | **0** | 2 |

That is FM-2 — the duplication the module's own header says it exists to kill — plus content loss in
a delivered PDF. Two integration tests named it (`split-veto`, `split-envelope-css`), both red on the
branch and green with the peel reverted. **The integration tier had not been run.** The unit suite was
green throughout because its fixture hand-authored the cell inside the stage under a comment claiming
that was the engine's shape: eight tests passing against a DOM that cannot occur. A fixture that
drifts from the render does not merely fail to catch a bug — it certifies it.

**Five CSS families had silently stopped matching**, all still addressing `> .cell-stage > …`: the
sketch finish's hand-drawn insight box (box-shadow gone), `head-center`/`head-right`'s flex, the
split-insight page's size-up, and the split note's compact size (46.98px against
`--fs-body-compact`'s 39.96px). This is the SAME failure class the whole change exists to kill — a
universal block bound to an exact DOM position — reproduced one layer up by the change that killed
it. Worth stating plainly: moving a universal cell is not a local edit, and the gate that would have
caught it is a census of who addresses the cell, which does not exist.

**Two dock declarations disagree with what their layouts compute, and NEITHER is fixable by
declaring harder.** `scene` computes as a GRID on its clean composition and a flex COLUMN on its
gallery one; `video` computes as a flex ROW on `.companion` and a column on its base variant. One
manifest value cannot describe a per-variant structure — the axis simply does not have the
resolution.

I tried declaring `scene` as `grid` anyway. It fixed the clean composition (439px band → full
width) and BROKE the gallery one, whose band went from a centered pill to left-aligned, because the
grid arm's `align-self: start` means *vertical placement* in a grid and *width* in a flex column.
That is the identical hazard this section documents for `video`, reintroduced by the fix for it.
Reverted: `scene` takes the column default, its clean composition keeps a narrower band than it
could have, and that is a pre-existing shape rather than a regression (on `main` the beat renders
as unstyled body text — `scene` is one of the eight broken layouts).

What DID survive is making the arms axis-agnostic — `width: 100%` rather than `flex-basis: 100%`,
`justify-self: stretch` beside `grid-column: 1 / -1` — which is why `video`'s wrong declaration
costs nothing today. That is insurance, not a defense of the axis, and the axis remains the open
question this note flagged from the start.

**And I mistook a design for a defect.** `diagram` had carried a per-component
`align-self: stretch` since the cell landed; sweeping the corpus found `title`, `closing` and
`divider` with narrow bands too, so I made stretch the cell's default and deleted diagram's rule.
That was wrong, and a second checker caught it: those three layouts keep a CAPPED, CENTERED
measure by design, and a global stretch turned `closing`'s centered pill into a full-width band
with its text optically off-center (251.59px centered → 1152px at left 64). I had reasoned from
this file's own phrase "a full-width band beneath the body" to "not full width is a defect",
without rendering the three slides. Reverted; diagram's per-component rule is back, with a comment
saying why it stays per-component.

The corrected numbers: **47 of 51 bands span full width**; `title`, `closing` and `divider`
shrink-wrap by design, and `scene` varies by composition.

**The honest summary of the tier's value:** the machine gates were green — 7,282 unit tests, lint,
`build:check`, and an overflow ratchet identical to baseline — while the export lost content. Every
one of those gates was measuring something real; none of them was measuring this.
