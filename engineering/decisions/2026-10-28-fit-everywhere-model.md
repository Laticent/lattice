---
status: in-progress
summary: Fit everywhere. A component designed once must read well on any box and at any distance (a laptop, a boardroom, a stadium, an Instagram or LinkedIn post, a poster, a kiosk, 4K). The model has two independent axes, the box (Fluid; the named sizes are breakpoints) and the venue (type scale for reading distance), and pagination takes what no longer fits. Measured: a square post in a phone feed reads like a boardroom back row (8.7 arcminutes of x-height at the default venue). Before P2, a Monte Carlo harness scores split policies on every real deck, perturbed, at every box and venue, with no clip, no lost content and readability as hard rules and stability ahead of page count. The first corpus run leaves four finalists on one frontier, from hysteresis-20-30 (16.6% fewer pages than today, 0.9% jank) to hybrid-sticky (25.9% fewer, 2.3%), and finds that 16:9 at hall clips 435 of 1,158 gallery slides with nothing to split them. §8: compact spacing is a clip rescue, not a stability fix (rescue-20-30: 148 fewer clipped slides for 0.1 point of jank); stability needs memory, which only a running program holds.
builds-on: 2026-10-27-fluid-layout-library.md, 2026-09-29-one-reading-size-per-venue.md, 2026-06-16-social-mobile-portrait-sizes.md
---

# Fit everywhere: two axes, and a simulation to tune them (2026-10-28)

**Status: in progress.** The owner set the model and the plan on 2026-10-28 (§5). The harness (§4)
is built, and its first corpus run (§7) narrows the split policy to four finalists on one
measured frontier. The owner picks the point on it.

**The goal (owner, 2026-10-28).** A component is designed once and reads well, on brand, on any
screen: a laptop, a boardroom, a stadium, an Instagram or LinkedIn post, a printed poster, a kiosk,
at 4K or at a size not yet invented. It scales with minimal effort per component, and it does not
produce janky results again. This is the feature that gets Lattice adopted in kiosks, boardrooms,
stadiums and social media.

## 1. The model: two axes

**The box.** Fluid lets a slide take any box, not only the named sizes. The named sizes (`hd`,
`square`, `portrait`, `story`, `4K` and the rest) are breakpoints, not the only boxes. The box's
shape picks the layout family (`wide`, `square`, `tall`, `strip`), and component CSS reflows on that
family.

**The venue.** `venue:` scales the type so it reads from the audience's distance
(`engineering/typography.md` §7). It does one thing, and it is independent of the box.

**Pagination** takes what no longer fits at that box and that venue, by the hybrid of
`2026-10-27-fluid-layout-library.md` §13.1: today's page builders, triggered by a measured overflow,
with as many members a page as fit.

A component's obligations stay what they are: use the token system (no fixed pixels), reflow on
the family stamp, and declare its seams or its page builder. Nothing in a component knows about
Instagram or stadiums.

## 2. What each viewing situation needs from the venue

Readability is the angle the text takes up in the eye: `arcminutes ≈ 3438 × text height ÷ viewing
distance` (`typography.md` §7). About 12′ of x-height is comfortable for a mixed audience, 8–12′ is
fluent for young readers, and 5′ is the edge of legibility.

Measured on the inventory gallery's list slide: the rendered body text's x-height at each canvas
(16:9 11 px of 720, square 15 of 1080, 4:5 23 of 1350, 9:16 23 of 1920), times each situation's
shown size over its distance. The shown sizes and distances are assumptions, stated in the first
column.

| Viewing situation | Box | x-height at `laptop` / `conference` / `hall` |
|---|---|---|
| Laptop screen (18 cm tall at 55 cm) | 16:9 | 17.2′ / 21.8′ / 25.3′ |
| Boardroom TV, back row at 5.5 heights | 16:9 | 9.6′ / 12.1′ / 14.0′ |
| Stadium screen at 9 heights | 16:9 | 5.8′ / 7.4′ / 8.6′ |
| Instagram or LinkedIn feed, square, phone (6.4 cm at 35 cm) | square | **8.7′** / 11.1′ / 12.8′ |
| LinkedIn feed, square, desktop (12 cm at 60 cm) | square | 9.6′ / 12.1′ / 14.0′ |
| Instagram feed, 4:5, phone (8 cm at 35 cm) | 4:5 | 13.4′ / 17.0′ / 19.7′ |
| Story or reel, full-screen phone (14 cm at 35 cm) | 9:16 | 16.5′ / 20.9′ / 24.2′ |
| A3 poster at 1.5 m | 4:5 | 16.4′ / 20.8′ / 24.1′ |
| 55″ portrait kiosk at 1.5 m | 9:16 | 33.2′ / 42.2′ / 48.8′ |

- **A square post in a phone feed reads like the back row of a boardroom.** It needs `hall` to reach
  the comfortable line. That is guidance for the author (the venue is "far away" even though the
  phone is close, because the post is small), and nothing tells the author today.
- **4:5, stories, posters and kiosks read well at the default venue.** The portrait hierarchy does
  its job.
- **A stadium cannot get there on type size alone,** as §7 already says. It needs fewer words a
  page, which is pagination's job at `hall`.

## 3. Why simulate

We have tried these ideas one at a time, each judged on a handful of slides. The failures were
interactions: a rule that looked right on the galleries broke on a real deck at another size, or a
small content change moved the page plan, which is the jank. A Monte Carlo simulation tests a policy
against the whole space at once and measures those failure rates directly.

## 4. The harness

**The space sampled.**

- **Content:** every real deck we ship (galleries, examples, exemplars, about 400), plus perturbations
  of each slide: members added or removed, text lengthened or shortened by up to ±40%, longer words,
  a taller image. The perturbations are what reveal instability.
- **Boxes:** the named breakpoints plus boxes between them, since Fluid serves any box.
- **Venues:** `laptop`, `huddle`, `conference`, `hall`.
- **Policies:** the candidate settings. The baseline is today's structural split. The candidates vary
  the trigger (structure or measured fit), packing (greedy or balanced), the cover rule, the
  continuation-page head, the family boundaries and a per-page member cap.
- **Weights:** the owner weights the four groups of viewing situations equally (rooms and screens,
  social feeds and stories, stage and stadium, print and kiosk).

**The score.** Hard rules first, so no objective can buy them back:

1. No clipped content.
2. No lost content: every text leaf and image of the source appears on some page.
3. Readable: body x-height of at least 12′ and labels of at least 8′ for the situation sampled.

Then, in the owner's order: **stability** (how often a ±1-member or ±10%-text edit moves the page
plan), then **page count**, then **page balance** (fill variance across a run), then build time.

**What it cannot judge.** Whether a page is beautiful. The harness narrows the field to the policies
that pass the hard rules and rank best on the objectives; a montage of sampled pages from each
finalist goes to the owner for the aesthetic call.

**Cost, measured.** The first corpus run (§7) rendered 2,632 exports in 1,637 s and scored them in
2,424 s, about 68 minutes on four cores. `--resume` keeps finished renders across a sandbox
restart, `--rescore` scores again without rendering, and `--rearm` recomputes only the arms derived
from the rendered ones, in about 20 s.

**What it leaves behind.** The same harness on a fixed sample, run nightly, is the catalog fit check
deferred in the Fluid note: a new component is sampled at every box and venue, and the first clip or
lost leaf names it.

## 5. Owner decisions (2026-10-28)

1. **Two axes, not targets.** A proposal to fold box and venue into named targets (`ig-feed`,
   `poster-a3`, …) was declined. The named sizes are breakpoints, Fluid frees the box from them, and
   the venue only scales type for distance. §2's table is guidance on which venue a situation needs.
2. **The harness comes first,** before P2, with perturbations, since stability is where jank lives.
3. **Stability wins after the hard rules,** then fewer pages, then balance.
4. **All four groups of viewing situations weigh the same.**
5. **P2 builds hysteresis-20-30** (2026-10-28, D1 A on #2953): stability first.
6. **No plan file, and no type shrink** (2026-10-28). A file that remembers the last page plan
   adds a committed artifact for every deck, and the owner declined it. Shrinking type to fit
   was built once and retired (`2026-09-25-font-scale-fit.md`, Amendment (3)); the standing
   ruling is "shrink padding, not text". §8 measures what that leaves.
7. **Stateful, with three fixes** (2026-10-29, after the outside review in §9): live/export
   parity, undo, and a rejoin rule relative to the slide's own history.
8. **No entry margin** (2026-10-29, §11): a fresh decision is plain fit. This amends decision 5:
   the 20% entry margin is dropped; the 30% rejoin band, the undo stack and the history rejoin
   stay.

## 6. Plan

1. **The harness**, with today's split as the baseline arm, its measured run time and a scored table.
2. **Tune** the hybrid's knobs on it, and bring the finalists, with montages, to the owner.
3. **P2** builds the winner on the Playground, gated by the harness
   (`2026-10-27-fluid-layout-library.md` §13.1).
4. **Venue guidance**: §2's table goes into the venue docs, so an author knows that a square feed post
   wants `hall`. Whether the linter should also say so is decided when this ships.

## 7. Results: the first corpus run (2026-10-28)

`npm run fit:harness -- --sizes hd,square,portrait,story --venues laptop,hall`: the 94 galleries
(1,127 slides at the split boxes, 1,158 at hd), each slide plus up to seven edits, at four boxes and
two venues. The full table is the run's `report.md`. Every number below comes from it.

**The frontier.** Over the six cells where a slide can split (square, portrait and story, each at
laptop and hall), four policies are not beaten on both stability and pages at once by any policy
that passes the hard rules. Today's split is the zero-jank anchor, at the most pages. The packed
arms (`packed-2`, `packed-3`: K members a page, always) score better on both, but they fail the
hard rules: they clip more than today's split (634 against 555 slides at portrait hall), and their
0% jank comes from a fixed K, not from a decision.

| Policy | Pages, six cells | vs today | Jank ±10%, mean | Jank, worst cell |
|---|---|---|---|---|
| structural (today) | 17,860 | — | 0.0% | 0.0% |
| hysteresis-20-30 | 14,904 | −16.6% | 0.9% | 2.0% (square, laptop) |
| hysteresis-10-20 | 14,314 | −19.9% | 1.4% | 2.4% (square, laptop) |
| hybrid-sticky-20-30 | 13,684 | −23.4% | 1.8% | 2.7% (square, laptop) |
| hybrid-sticky | 13,238 | −25.9% | 2.3% | 3.0% (square, laptop) |
| fit-greedy (no memory) | 8,516 | −52.3% | 8.0% | 11.1% (portrait, hall) |

The order holds cell by cell. In every one of the six, the four finalists rank the same on pages,
and hysteresis-20-30 has the lowest jank, tied with 10-20 at portrait hall. Each step down the
table buys about three points of pages for about half a point of jank. The saving sits at laptop,
where most structurally split slides fit whole (square: 2,933 pages today, 1,519 for
hybrid-sticky-20-30). At hall it is 1–15%, because a slide at 1.5× type mostly has to split anyway.
The pure fit-first arms halve the pages but move the plan on about 1 edit in 10 at hall. That is the
jank this work exists to stop, so they are out.

**Hard rules.** Clips are flat across the finalists: they split where today's builders split,
so they clip where today's split clips (13 to 549 a cell). About two-thirds of those are
"unfixable", meaning the fit-first arm clips there too: 737 of 1,137 for hysteresis-20-30, from 1
of 13 at square laptop to 397 of 549 at portrait hall. The losses (5 to 36 slides a cell) are today's builders' own, and
the finalists inherit them only where they split.

**Found on the way.** None of these is caused by this work.

1. **At 16:9 and `hall`, 435 of 1,158 slides clip.** Today's split never splits a wide box, so
   nothing catches them. Fit-first, which splits on a measured overflow, clears 288 of them; the
   other 147 clip under fit-first too. The P2 hybrid therefore has to split a wide box when it
   overflows at the venue, and the harness has no packed render at hd to score that yet.
2. **Today's split drops content on 41 slides** at every split box. Read from the renders, four
   cases are real. The compare-prose and compare-code splits drop the slide's eyebrow
   (`Decision · Close Time`: seven copies whole, none split; likewise three more compare-prose
   slides and `compare-code · stress`). The obligation-matrix split drops its key on one slide. The
   content split joins two paragraphs into one, keeping the text and losing the break. The
   row-to-card reshape drops column 1's header label on about 25 slides, as designed (§5), so
   that one is a choice to confirm rather than a bug. The compare-code pane labels move into the
   running head, so their loss is the harness counting chrome, not a real loss. One lost code
   leaf (`); }`, code gallery slide 3) is not settled; it is probably the same kind of artifact.
   `followups.d/2953-p2-today-split-drops-eyebrow-legend-paragraph-breaks.md`.
3. **The diagram gallery's split emits broken markup** (10 of 62 sections survive), the
   carousel's unclosed `<strong>`:
   `followups.d/2953-p2-split-panel-carousel-unclosed-strong.md`.
4. **Footer-only cuts are common at narrow boxes**, 330 to 366 slides at story. The footer line
   does not fit, while the content does. Splitting cannot fix that, so the harness counts it apart.

**What this run does not cover.** Galleries only, not the ~400 examples and exemplars. Two venues
of four, so `huddle` and `conference` are interpolated. The named sizes only, not the boxes Fluid
serves between them. Jank is measured on the page count alone, not on where members land (the
pair-flip column has that, and it favors today's split by construction). And no montage yet, so
nothing here says the pages look good.

## 8. Memory, spacing and the clip rescue (2026-10-29)

**The question.** hysteresis-20-30 is steady because it remembers the last plan: an edit keeps a
slide's decision unless the slide must change. A live surface (the Playground, Studio, the viewer,
a watch preview) holds that memory in the running program for free. A cold export does not: it
decides fresh, and on a fresh decision hysteresis-20-30 is `margin-20`, at 3.3% mean jank
against 0.9%. Could the slide itself absorb a small edit instead, with no memory?

**The arm.** `elastic` tightens a slide's spacing with the universal `compact` modifier (the
`--sp-*` scale only, `shared.styles.css`) before it splits: whole if it fits, whole and compact
if that fits, today's split otherwise. No type size changes. The harness toggles the class on the
rendered whole slide and asks the export's overflow oracle again, so the arm costs no render.

**Measured** (the same run as §7, re-scored; six split cells, and 16:9 at `hall` for clips):

| Policy | Memory | Mean jank | Pages | Clipped slides |
|---|---|---|---|---|
| fit-then-structural | no | 4.3% | 13,480 | 1,565 |
| elastic | no | 3.6% | 12,241 | 1,424 |
| margin-20 | no | 3.3% | 14,904 | 1,572 |
| hysteresis-20-30 | yes | 0.9% | 14,904 | 1,572 |
| **rescue-20-30** | yes | **1.0%** | 14,844 | **1,424** |

1. **Spacing does not buy stability.** Compact spacing absorbs about a sixth of the plain arm's
   jank, which leaves `elastic` no steadier than a margin. No stateless rule here gets below
   about 3%: a stateless decision has a threshold, and some edit always crosses it. So stability
   needs memory, and memory lives where someone watches a change, which is always a running
   program. A cold export needs to be deterministic, which it already is.
2. **Spacing does rescue clips.** `compact` fits 141 slides that clip under fit-then-structural, 65 of them at
   16:9 and `hall`, where nothing splits and nothing else helped.
3. **So spacing is the rescue, not the decision.** `rescue-20-30` keeps hysteresis-20-30's split
   decision and uses `compact` only for a slide whose pages would clip. It touches only slides
   that are broken anyway: 148 fewer clipped slides than hysteresis-20-30 for 0.1 point of jank, and
   60 fewer pages.

**What P2 builds:** hysteresis-20-30 as the split decision; memory in the running program only;
`compact` spacing as the last-resort rescue for a slide that would clip. No plan file, no type
change, and no state in an exported file.

**Caveats.** `compact` is applied to the whole slide, not to the page a split leaves clipping, so
the rescue on split boxes is a lower bound. The harness toggles a CSS class on a rendered page;
a component whose layout is computed by script at render time would need that script to run
again, and the harness does not run it.

## 9. The adversarial review, an outside review, and the decision (2026-10-29)

**Three reviews.** A red team, an inversion and an independent checker (HARD RULE #25) read §7
and §8. An outside model then assessed a neutral brief of the method and all the measurements.

**What they found that holds.**

1. **Live and export disagree.** A slide written live starts whole, so the 20% entry margin
   never applies to it, while a cold export applies it: 451 authored gallery slides that fit
   whole are split cold (1,499 extra pages). One random walk of ±10% edits: live and cold
   disagree on 9.1% of states. The editor's export re-renders from Markdown, so it is cold today.
2. **Undo does not undo the layout.** Rejoining needs 30% spare, so a slide an edit split stays
   split after the undo: 96 of the 206 add-member edits that caused a split.
3. **Compact spacing is deeper than intended at the split boxes.** It redefines the spacing scale
   without the box's canvas factor: `--sp-md` compact ÷ normal is 0.75 at hd, 0.455 at square,
   0.385 at portrait and 0.342 at story. It also ran on the six components that exclude it, and
   on 7 sections at story/hall it made the content taller (13–57 px).
4. **The margin is off for about 46% of slides** (2,454 of 5,284 fitting sections at
   square/laptop): slides with a drawing or no content cell get no band.
5. **The jank number is narrow.** Only 55% of slides receive edits, it is binary, it ignores
   spacing flips (counting them raises rescue-20-30's jank by about half) and it scores one edit
   from the authored state.

**What did not hold.** The outside review recommended a stateless pipeline (whole, whole and
compact, balanced packing) and estimated 1.6–2.4% jank. Built as `elastic-balanced` and measured
on the same run: **6.83% mean jank** (worst 11.7%), 8,167 pages, 1,666 thin pages, 0 lost,
1,226 clipped slides over eight cells and 1,097 over the six split cells, against rescue-20-30's
1.03%, 14,844, 5,110, 157, 1,424 and 1,054. Its claim that fit-greedy dominates on clipping holds
only through hd/hall, where fit-first splits 16:9 and today's split does not; at the split boxes
fit-greedy clips 1,168 against 1,054. The fit-first arms' zero loss comes from the harness's own
in-page cut, which runs no component builder, so it is not like for like.

**Decision (owner, 2026-10-29): stateful, with three fixes.**

- **A. Parity.** An export started from a running program uses that session's plan. A deck's
  memory is seeded from the cold decision when it opens, so a reload starts from what an export
  produces. A CLI export of a file still decides fresh.
- **B. Undo.** The split decision rides on the undo stack with the edit.
- **C. Rejoin.** A split slide rejoins when its content returns to a size at which it last fit
  whole, instead of at a fixed 30%.

Memory is keyed by slide identity, box and venue, and decided once in the parent program, then
passed to the preview, presenter and stage frames.

**Adopted for every policy:** compact spacing scaled by the canvas factor, vertical only,
honoring `excludes`, re-probed after it is applied, with its own hysteresis; a 16:9 slide splits
when it overflows at its venue; the split builders keep eyebrows, legends, paragraph breaks and
headers; a weighted disruption score in place of binary jank; edit chains with undo and a cold
export; edits to headings, paragraphs, quotes and code; huddle, conference, boxes between the
named sizes, the example decks and WebKit in the grid; the metrics split by whether a slide has a
margin; and a nightly cross-engine run with a montage and per-component clip counts that may
only go down (the nightly ratchet is owner-approved). A fast per-PR adversarial set with hard
invariants (no lost content, undo restores the layout, a session's export matches its plan,
compact never grows a slide) is proposed, not approved: it adds a CI step, which is the owner's
call.

**Open.** Whether the in-page cut makes acceptable pages next to the component builders (no
visual review yet); what fix C does to jank and pages (not built); and the outside review's
Knuth–Plass formulation as the packing step inside the stateful design (not evaluated).

## 10. The nightly fit ratchet (2026-10-29)

`fit-nightly.yml` runs the harness every night on the 94 galleries at square, portrait and story,
at `laptop` and `hall`, and `--ratchet test/fit/baseline.json` compares each component's clipped,
unreadable and lost-content slides, per box and venue, with the committed baseline
(`tools/lib/fit-harness/ratchet.js`). A count may only go down, and a component the baseline does
not name starts at zero, so a new component that clips is named on its first night. Blessed from
the nightly's own command (`--edits none`, authored slides only): 94 sources, 564 cells, 1,161
clipped, 108 unreadable (with the overlap check) and 246 lost-content slides, every cell scored.
The first bless came from the full §12 run, with perturbed copies in each gallery deck: 1,146
clipped and 6 cells **not scored** (the diagram gallery, whose split emitted broken markup with
the copies in it). Without the copies the diagram gallery renders and adds 18 clipped slides, and
three counts fall by one. Two runner runs checked it. The first (run 40839485067, with edits)
found no count above the first baseline and measured the cost that moved the nightly to
`--edits none`: 74 minutes against a 75-minute ceiling. The second (run 40856957057, `--edits
none`) took 38 minutes and disagreed with the sandbox bless by one slide in two cells of the mixed
baseline gallery (portrait@hall 90 to 91, story@hall 45 to 44). The probe already ignores a cut
of up to 12 layout px (`FRAME_TOLERANCE`, `lib/core/overflow-probe.js`), and a few of that
gallery's split pages sit just past it: text runs 16 to 22 px under the page's "next" pill or into
its footer. A small difference in font metrics between machines wraps a line differently and moves
such a page across the line. These are real cuts, visible on both machines (a word hidden under the
pill, a sentence sliced at the frame); only the count by one moves. Raising the tolerance would
hide them, so it stays. (An earlier draft of this paragraph said the pages clip by 0 to 1 px. That
read the harness's `px: 1`, which is a flag for "the content-clip probe fired", as a depth.) The committed baseline takes the
runner's counts, and every nightly now writes the baseline it measured into its artifact, so a
re-bless copies a runner's file rather than blessing on a laptop. The same machine agrees with
itself: two full `--edits none` sweeps in one sandbox, 30 and 37 minutes under different load,
matched in all 564 cells. So the flaps are between machines, not between runs; two runs on the
runner image itself are not yet compared, and the nightly is report-only, so a one-slide flap
there would cost a look, not a blocked merge.

- **Not scored is a result, not a silence.** A gallery whose renders fail or whose markup the
  harness rejects produces no rows, and comparing only the rows a run produced would read that
  run as clean. So every gallery × box × venue the run was asked for is compared: a cell with no
  rows is NOT SCORED, a cell the baseline scores that this run did not exits 3, and a run that
  scored nothing at all exits 3. The workflow files that as "did not score every gallery", never
  as green. The checker found the first version reading an all-renders-failed run as clean;
  that run now exits 3.

- **It ratchets the split the engine ships** (the `structural` arm), not a simulated policy: a
  simulated arm is not shipped code (§9). When P2 lands, the ratchet moves to P2's real path.
- **It complements `overflow-nightly.yml`,** which renders every shipped deck at its own size;
  galleries are mostly 16:9 at `laptop`, so a component that clips in a square post at `hall`
  never shows there.
- **Report-only**, as every browser check here is until it has an observed green streak
  (`2026-06-28-experience-gating-playwright.md` §3): the run stays green and a rolling issue
  carries the finding. Its posture is pinned in `test/unit/tools/nightly-alarm-contract.test.js`:
  comment, never close, since `--bless` can lower the floor.
- **Proved it can fail:** a planted baseline one below the real count for one component and cell
  (`code.gallery.md` at square/laptop) exits 1 and names the component, cell and metric; the
  real baseline exits 0.
- **Cost** is estimated at about 30 minutes plus setup (1,128 renders, no packed renders); the
  first dispatched run measures it.
- **Not yet:** the cross-engine run and the montage §9 adopts, and the per-PR adversarial set,
  which is a proposal.

## 11. Edit chains, and the entry margin dropped (2026-10-29)

**What the single-edit number hid.** `tools/lib/fit-harness/chains.js` replays every slide as
authored → edit → undo, and as 20-step random walks across the text-length variants, under each
policy, from two starts: memory seeded from a cold decision, and a slide typed live in the editor.
A typed slide starts "whole while it fits", without the 20% entry margin. Measured over the six
split cells:

| Policy | Start | ±10% jank | Undo strands (no fix B) | Live ≠ fresh export | Walk: page changes a step | Walk: live ≠ fresh |
|---|---|---|---|---|---|---|
| stateless (margin-20) | — | 3.28% | 0% | 0% | 3.75% | 0% |
| h2030+C | cold seed | 0.91% | 17.96% | 0.08% | 1.14% | 3.72% |
| h2030+C | typed live | 2.99% | 0% | 10.01% | 2.64% | 9.28% |
| **h0-30+C** | either | **2.99%** | **0%** | **0%** | **2.64%** | **2.48%** |

1. **hysteresis-20-30's 0.91% holds only for a slide whose first decision was cold.** The 20%
   entry margin had pre-split the slides near the fit edge, so a ±10% edit could not move them.
   A slide typed live moves on 2.99% of edits under any memory policy here. Those moves are
   mostly correct splits of content that no longer fits, which no policy avoids.
2. **The entry margin is where live and export part.** A typed slide is whole while it fits;
   its fresh export applies the margin and splits it. That is 10% of single-edit chains and 9.3%
   of walk steps, and seeding memory from the cold decision (fix A as first written) would
   carry the same split into a deck the next time it opens.
3. **The margin also costs pages:** 14,855 authored pages over the six cells against 13,405 with
   plain fit.

**Decision (owner, 2026-10-29): no entry margin.** P2 builds **h0-30+C**:

- a fresh decision is plain fit, so a typed slide, a reopened deck and a CLI export start from the
  same decision;
- a whole slide stays whole until it overflows;
- a split slide rejoins at 30% spare, or when it fits at a content size no larger than the size at
  which it last fit whole (fix C);
- the split decision rides on the undo stack (fix B);
- an export from a session uses that session's plan (fix A); with no margin, seeding a reopened
  deck from the cold decision no longer moves a slide that fit.

The cost: a reopened deck loses the margin's head start, 2.64% page changes a walk step against
h2030+C's 1.14% from a cold seed. The rescue (compact spacing on a slide that would clip) is
unchanged. Residual divergence between a long live session and a fresh export of the same
content is 2.48% of walk steps, from the rejoin band; fix A covers an export from the session.

**Limits.** Chains use the harness's variants (±10%, ±40%, ±1 member, long words), ordered by
content size; real typing moves in smaller steps. Fix C is modeled on that size order, not on a
measured content height.

## 12. Readable is part of fitting, the corrected rescue, and a montage (2026-10-29)

**What the montage showed.** The first montage of the decided policy kept a four-card grid whole
on a story page at `hall`: every word inside the frame, so the export's overflow probe passed it,
and every card five characters a line with words cut ("Quadra", "Compa"). Readable was the one
hard rule (§4) the harness never measured, so every earlier "fits" could hide a crammed slide.

**The readability probe** (`tools/lib/fit-harness/page.js` `readable`): a page fits only when no
body-size text is cut off by an ancestor that hides its overflow, and no text run of 24+
characters wraps onto three or more lines at fewer than 12 characters a line. Chart and figure
labels, collages, QR cards, KaTeX, display type and captions are left out. It was checked by eye
three times: a first version flagged 6 true of 12 sampled slides; a second, about 10 of 12; the
third fixed three defects that check found (a card's short title skewing its body's average, KaTeX's
hidden copy of a formula, and a slide whose only cut was its footer skipping the check), and flags
1 of 70 slides at hd/laptop, where the galleries are designed. A crammed page is cut
`unreadable`, counted apart from clips.

**Overlap, added after the montage (2026-10-29).** The montage showed redline's split NEW column
drawn over itself at story/hall. The probe now also fails a page where two different text runs share
a line box: more than 4px across and over half the shorter line's height, so lines that only touch
pass. Redline already counted as a clip there (the overflow probe cuts it), so the new check changed
no redline verdict. Re-scoring the nightly's six cells moved 5 slide-cells from fit to `unreadable`,
and all 5 are real on sight: statute-stack's citation chip runs under its status pill at square/hall
(3), and topic slide 3's eyebrow and basis line overprint at square/hall and story/hall (2). The
baseline was re-blessed for them (unreadable 103 to 108); the table below predates the check.

**The rescue at its intended size.** `section.compact` redefines the spacing scale without the
box's canvas factor (§9). The harness now sets each spacing token to 0.75 of the slide's own and
skips the six components that exclude `compact`; the engine fix is P2's.

**Measured** (same 2,632 renders, re-scored; clipped, unreadable and lost over all eight cells,
pages and ±10% jank over the six split cells):

| Policy | Clipped | Unreadable | Lost | Pages | ±10% jank |
|---|---|---|---|---|---|
| today's split | 1,581 | 116 | 246 | 17,860 | 0% |
| **rescue-0-30 (decided)** | **1,483** | **103** | **151** | **13,819** | **3.02%** |
| hysteresis-20-30 | 1,572 | 114 | 158 | 15,105 | 1.28% |
| elastic-balanced (stateless) | 1,360 | 74 | 0* | 8,293 | 7.28% |

\*The fit-first arms cut the rendered page themselves and run no component builder, so their
lost count is not comparable with the builders'.

The decided policy is ahead of today's split on every hard rule and uses 22.6% fewer pages. Its
jank is measured from the authored state; a slide typed live gets the same (§11).

**The montage** (13 gallery slides, `.scratch/montage.js`, kept out of the tree): where the
policy keeps a slide whole it shows one readable page against today's cover and three or four
nearly empty member pages (compare-prose, comparison, decision, table, verdict-grid); the spacing
rescue fits agenda, statute-stack and content on one page; a slide that would be crammed whole
(cards-grid, matrix-2x2, stats) splits as today. Two still clip as today: pricing, and redline,
whose split pages draw overlapping text in the NEW column, a pre-existing component defect the
probe does not see (`followups.d/2962-p2-redline-split-overlapping-text.md`).

**What remains unreadable** (103 slide-cells under the policy, across 23 galleries) is led by
agenda (13), legal (9), list-steps (9), the mixed baseline gallery (8), list (7),
regulatory-update (7), statute-stack (7) and checklist (6): layouts whose columns or rails do not
adapt to a narrow box at a large venue. A split policy cannot fix a layout that is cramped on every page;
that is the Fluid family-reflow work (2026-10-27-fluid-layout-library.md), and the ratchet now
counts it per component (§10).

