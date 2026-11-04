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


## 13. Responsive by text room: the shared rule and tier 1 (2026-10-29)

**The rule.** A component reflows by the characters a line holds, not by the box's shape (owner,
2026-10-29). The slide is the `lattice` size container, its font size is `--fs-body`, and `em` in a
container query resolves against the container's own font size, which already carries the
venue's `--fs-scale`. So `@container lattice (width < Nem)` reads "under about 2N characters of body
text a line" at any box and venue (body text averages about 0.49em a character). Measured content
boxes, in `em` of the section's font:

| Box | laptop | conference | hall |
|---|---|---|---|
| hd, standard, 4K (any landscape) | 53.9 | 41.5 | 35.9 |
| square | 32.1 | 24.7 | 21.4 |
| portrait, story, mobile | 20.7 | 15.9 | 13.8 |

Three shared thresholds, and no others (pinned by `test/unit/css/text-room-thresholds.test.js`):

- **medium, `width < 34em`** (~70 characters): square at laptop and conference. Only a row of four
  or more fields side by side reflows here (regulatory-update's changelog row, statute-stack's
  four-column lane table, statute-stack's three rails).
- **narrow, `width < 23em`** (~47 characters): square@hall and portrait or story at laptop. A row
  of three fields stacks, a fixed-width tab becomes a band (list-steps chevron), a two-column
  form goes to one (authority-chain's side rail, list-steps' horizontal row).
- **tight, `width < 17em`** (~35 characters): portrait and story at conference and hall. A row's
  marker gutter (an ordinal, a check, a label column, a page reference, the split cover's arrow)
  moves above, below or inline with its text, so the text keeps the full width.

No threshold reaches a landscape box: hd measures 35.9em even at hall, so every 16:9 deck renders
as it did. `--col-min` (19ch, 24 characters), `--col-max` and `--fluid-cols` are the shared grid
half of the rule (`base.tokens.css`, `base.elements.css`): as many columns as keep 24 characters
each, never more than designed. `--fluid-cols` is declared on every element under a slide, because
an unregistered custom property substitutes its `var()`s where it is declared.

**What each tier-1 layout does below its threshold.** agenda (tight): the ordinal or "you are here"
arrow heads the title and the page reference drops under it; `rail` stacks too and drops its
journey line, since a smaller ring in its row still left four lines of eleven characters.
checklist (tight): the mark heads its row and a trailing pill drops under the text. list and
inventory (tight): the ordinal runs in at the start of the text; stacking it above was measured
first and clipped a lettered page at portrait@hall that fit before. premise (tight): ordinal and
label share the first line, the gloss takes the row. list-steps (narrow): the chevron tab becomes
a full-width band over its card ("PROBLEM" was cut to "ROBLE"), and the horizontal row stacks.
statute-stack: the status pill returns to the label's flow and wraps (narrow; it printed over
"FEDERAL", the p5 follow-up), the label's pills trim their side padding at tight so the citation
still shares the label's line, the `lane` table's rows become cards under one line of column names
(medium), and the three rails go to one column (medium). regulatory-update (medium): the
five-field row stacks beside its counter, `priority` and `cards` included, and at tight the
counter heads the column; `cards` takes `--fluid-cols` with at most two. authority-chain (narrow):
the side-rail grid gives way to the wrapping row and the tier label takes the first line; the
label sizes to its content, since a tracked "STATUTE" at hall outgrew its fixed 14cqi basis and
ran into the citation on `bracket`. glossary (narrow): each entry stacks, the term over its
definition, with the header kept as one line of column names (hidden text would count as lost).
list-tabular (narrow, then tight): the row's block flow, and at tight the meta on its own line.
math `matrix` (narrow, then tight): the legend's 5em hanging indent goes, and at tight a formula
label takes its own line. video (narrow): poster over copy. topic `fact` (narrow, then tight):
the eyebrow joins the flow at the position it was pinned to, so a second line pushes the name down
instead of printing over it, and the claim steps from `--fs-h1` to `--fs-h2`. The split cover's
lead-in (tight) sets its arrow inline after the last word and steps down to the body size. A
lone member on a split page keeps the body size at tight instead of stepping up to
`--fs-emphasis`, which left a padded checklist row eleven characters a line.

**Family rules retired.** As the owner's conditions ask, a component that moved to text room
no longer keys a column rule on `data-family`: regulatory-update (medium), statute-stack's three
rails (medium; every square and tall preset measures under 34em, so the presets render as
before), authority-chain, list-steps, video, list-tabular and math `decompose` (narrow), glossary
(narrow; it keyed on `strip` alone, and `mobile` has exactly `portrait`'s room). Text room adds
square@hall (21.4em) to the narrow ones, which has the room of a portrait box at laptop. Two
exceptions stay on the stamp: premise's section-level block, because a container query cannot
style its own container, and list's strip-only `gap`, which is spacing, not a column rule.
math's other variants keep theirs (followups.d/2962-p3-…). The adaptive-manifest gate
(`checkAdaptDeclarations`) and the family-tier roster (`check-family-tiers.js`) now count a
text-room rule as reflow, and agenda, checklist and topic declare `adapt.mode: reflow`.

**The probe, corrected.** The readability probe measured each TEXT NODE against its own lines. A
paragraph broken up by inline `code` became fragments that start and end mid-line, so "with
Mermaid); work across dates is" read as three lines of twelve in a paragraph thirty characters
wide (flowchart's and pricing's "When NOT to" cards at story@hall). It now measures each BLOCK
against its own lines, with lines clustered by vertical center so an inline chip's taller box is
not a line of its own. The checker found two holes in the first version, and the full corpus run
found three more; each is closed and each has a case:

- an `inline-block` or `inline-flex` chip is its own block (a crammed chip is still caught), and
  its characters also count on its parent's lines ("`list` — declared statements — the
  `principles` variant" read as short lines when the chips' characters were dropped);
- a block is body text when most of its characters are body size, so a code chip in a paragraph
  counts and an eyebrow set as inline code does not (a divider's "GROUP 02 · EXPERIMENTAL
  DIAGRAMS");
- a block broken by `<br>` (the engine sets `breaks: true`) or holding KaTeX is measured a node at
  a time, by its interior lines, which are whole; that fallback passes formula prose of 17
  characters a line that the old probe failed;
- code in a `<pre>` gets no cram check, since its line breaks are the author's; it is still
  checked for cuts and overprints.

Checked against the original crams (agenda, checklist and list pages still fail) and against
synthetic pages (an 80px inline-flex chip and a 70px inline-block chip fail; `<br>`-separated stat
lines pass).

**Measured** (`--edits none`, 94 galleries at square, portrait and story, laptop and hall, the
nightly's own command; `main`'s stylesheet scored again with this probe to split the two causes):

| Stylesheet + probe | Unreadable | Clipped | Lost |
|---|---|---|---|
| `main` + the old probe (the committed baseline) | 108 | 1,161 | 246 |
| `main` + this probe | 101 | 1,160 | 246 |
| **this branch + this probe** | **0** | **1,084** | **246** |

The probe correction accounts for 7 of the 108 (the false positives above) and 1 clip; the
layouts account for the other 101, every tier-1 gallery to 0, and 76 fewer clipped slide-cells.
No count rose except compare-prose at portrait@hall (clip 9 to 10), and that is the cross-machine
flap §10 describes: scored in this sandbox, `main` and this branch give the same verdict on every
compare-prose page at that cell. A landscape box is untouched: 444 slides of the touched galleries
rendered at hd, at laptop and at hall, with `main`'s stylesheet and this one, are pixel-identical.

**Not yet.** On a live surface, Fluid's bucket watcher (2026-10-27-fluid-layout-library.md §4.4) is
not built, so the opt-in fluid viewer, whose slide follows the window, can cross a threshold on a
raw resize. Every export and every preset box is fixed and cannot. Tier 2 (text components that
clip) and the general table form (label/value cards from a column-label stamp, which tables
outside statute-stack need) are the next tier; charts are tier 3 (§15).


## 14. The carousel template: the presentation half (2026-10-30)

The owner's rulings for a split run (followups.d/2962-p6-carousel-template.md) come in two halves.
The PRESENTATION half is built: the title and eyebrow appear on the cover only; a content page
carries no running header, repeated heading, "(cont.)", pointer pill, progress rail or page number;
the ending page drops the title; and every content page starts on one line at the top of its stage,
its member at natural height, where the lone-member rules had centered it in a page-tall box. It is
CSS on the role stamp every split page carries (`data-split-role`, split-envelope.js `withRole`),
so the envelope's markup and its conservation are unchanged, and a 16:9 deck, which never splits,
is untouched. A deck's `meta:` line (a date, an owner, a "Confidential" marking) stays on every
page: it docks in the masthead's bay, which the cover does not carry, so only the masthead's
heading half is hidden.

**Checked.** An independent checker found the first cut covering only the shared envelope's pages:
on the read-across strategies (compare-prose, split-panel, list-tabular, decision) the heading
repeated as a `.split-runhead`, the pointer pill sat straight under the section where a descendant
selector could not reach it, the page centered its content, and the k-of-N rail survived at section
level on a deck with `paginate: false`; a lone table row (glossary) stayed centered by a heavier
rule; and hiding the whole masthead dropped the `meta:` line from the run. Each is fixed and
checked on a real render (glossary, compare-prose and checklist at story with `meta:` and
`paginate: false`). compare-code's runhead is kept: it is the code block's own label.
`test/unit/css/split-signal-scope.test.js` now pins that every page shape hides the signal, and
still pins its chrome styling on a cover-stamped copy of each shape.

The DENSITY half is not: a slide that fits whole stays a normal slide, no member is left alone on a
page, pages are 60 to 85% full, a paired unit never splits, one type scale runs through a carousel.
Each needs a measured decision, and today's split is structural, one member a page (`planSlide`,
docs/src/lib/fluido/plan.ts). A measured cut in the CLI alone would make the CLI and the Studio split
one deck differently (HARD RULE #1); the measured plan is Fluid's P2.

**Measured** (the nightly's six cells, 94 galleries, against the §13 baseline): clipped
slide-cells 1,084 to 848, unreadable 0 to 0, lost 246 to 246, and no count rose. The space the
repeated heading took is what most of the 236 recovered. Getting there took four fixes the corpus
run found and no unit test would have: a lone card in a row collection held at its max-content width
(its text ran off every narrow page), a lone matrix-2x2 quadrant cut to its title (`overflow:
hidden` drops a flex item's minimum height to 0), a lone kpi tile one track wide in its grid, and
pages that used to clip and now fit but read crammed (regulatory-update `diff-bands` rows, pricing's
"MOST POPULAR" ribbon printing over a long tier name), each fixed in its component at the narrow
threshold.

**Judged.** An independent judge scored contact sheets of two decks (a six-slide demo,
`examples/carousel-split.md`, and `examples/auto-split.md`) in indaco, indaco-dark and cuoio, at
portrait and story, against today's split: 3.5 to 4.5 and 2.5 to 3.5 out of 10, "better by about one
point", a modest net gain to ship. Its three costs: pages mostly empty (one member a page, unchanged),
a start line that moved with each member's length (fixed since: the top-anchored start), and
`examples/auto-split.md` describing the old split (corrected). It put the ceiling without packing at
5 to 5.5, and with packing and fit-whole at 8 to 8.5; 9 needs a judgment of real packed pages. It also
named one real loss: the page counter is gone, which a 14-member run feels.

**Blessed on a runner** (2026-10-30). The counts above were scored in a sandbox. At the owner's
call, `fit-nightly.yml` ran on this branch (run 41045849942, ubuntu-latest, the nightly's own
flags): no count rose, and one fell, the mixed baseline gallery at square@hall from 30 clipped
slides to 29. A second runner run after #2997 landed (run 41547352127) read that cell as 30 again
and matched the first on every other cell. Three local runs of the cell read 30 with the same 30
slides each time, so the flap is between runner runs, not between machines alone. A ratchet only
fails on a rise, so the baseline keeps the higher reading: `test/fit/baseline.json` equals run
41547352127's `baseline.json`, and the clipped total the nightly starts from is 848. The first run on
`main` (run 40996342102, before this branch) rose by one in two cells of the same kind and filed
#2989; a runner-blessed baseline is the remedy §10 names.

## 15. Charts and diagrams: the design round (2026-10-30)

The chart and diagram galleries clip 272 slide-cells after §13, and 129 of them are text slides in
those galleries (the shared "See also" closing slide alone is 79), which belong to tier 2. The rest
fall into five families that reflow differently: list-shaped charts, grids, time axes, Mermaid
diagrams, and plotted charts, which clip almost nothing but shrink their labels below reading size, a
failure the fit probe does not yet measure. Options per family, mockups and a recommended order:
`2026-10-30-chart-reflow-narrow-boxes.md`, waiting on the owner's pick.

## 16. The packing bake-off: measure, then pack (2026-11-03)

**The question (owner, 2026-11-03).** Stop splitting at one member a page. Measure what fits,
keep a slide whole when it fits, and pack an overflowing slide by measured height. Bake off the
packers from the owner's catalog, remembering that a split run always has a cover and may have a
closing page.

**What is built.** It is one path, shared by every packer:

1. **Measure.** The CLI renders the deck whole at its box and venue. `lib/core/fit-measure.js`
   then reads, for each authored slide that does not fit, its members' natural heights and the
   room a body page leaves for them. The members are the first list's items or the first table
   body's rows.
2. **Pack.** The pure packer `@laticent/fluido` `pack` (`docs/src/lib/fluido/pack.ts`) turns the
   heights into page sizes.
3. **Build.** `splitDoc` builds those pages through today's builders (`{ plan }`, keyed by slide
   number). Cover, closing page and carousel chrome stay as they are. A plan that does not place
   every member exactly once is refused, and that slide falls back to today's split.
4. **Verify.** A body page that still does not fit tightens its slide's room and plans again, for
   at most three rounds. After that the slide falls back to today's split, so the measured path
   is never worse than today's on any slide.

The CLI exposes it as `--fit-pack greedy|balanced|knuth-plass`. The harness scores it as the
`measured-<packer>` arms (`--fit-packs`), through the same CLI.

**One fit verdict.** The first full run (6,948 slide-cells) found 35 new clipped slides and 115
new unreadable ones. The cause: the measured split decided "fits whole" with the overflow probe
alone, while the harness also fails a page whose content is clipped inside the frame or whose
prose is crammed (§12). The harness's verdict moved into `lib/core/fit-measure.js`, and the
harness and the measured split now both call it (#1). With it, the counts against today's split
are 0 new clipped, 0 new unreadable and 0 new lost slides, under every packer.

**Results.** The 94 galleries at square, portrait and story, laptop and hall, authored slides
only (6,948 slide-cells):

| Arm | Pages | Clipped | Unreadable | Lost | Body pages under 40% full |
|---|---|---|---|---|---|
| today's split | 18,066 | 848 | 6 | 246 | 8,806 of 11,118 (79%) |
| measured greedy | 12,610 | 840 | 6 | 153 | 2,889 of 5,662 (51%) |
| measured balanced | 12,589 | 841 | 6 | 153 | 2,791 of 5,641 (49%) |
| measured Knuth–Plass | 12,581 | 840 | 6 | 153 | 2,777 of 5,633 (49%) |

Per cell, the measured split cuts pages by 12% (portrait@hall) to 50% (square@laptop). It fixes
7 to 8 clipped slides and 93 that lose content today, and makes nothing worse on any hard rule.
Today's split reproduces the earlier run to the slide, except for the square@hall cell that
flaps by one (848 against 847, see "Blessed on a runner" above).

**Jank, without memory.** These arms are stateless: each render packs from scratch. A sample
with ±10% text edits (agenda, list-steps, cards-grid, checklist; portrait and story; laptop and
hall) reads:

| Arm | Jank | Pair flips | Pages |
|---|---|---|---|
| today's split | 0.0% | 0.0% | 1,136 |
| hysteresis-0-30 (the owner's pick, §11) | 3.5% | 7.0% | 787 |
| measured greedy | 11.0% | 5.8% | 509 |
| measured balanced | 11.0% | 12.5% | 509 |
| measured Knuth–Plass | 12.0% | 13.2% | 510 |

An export is rendered once, so jank is an editing-surface property: it is what the Studio would
show if it packed with no memory. A live surface owes the §11 memory on top of whichever packer
ships: the split decision on the undo stack, rejoin at 30% spare, and members-per-page kept while
they still fit. Knuth–Plass rebalances the whole run on every edit, so it flips member pairs
across pages more than twice as often as greedy.

**Timing.** For 250 members, a pack takes 0.04 ms (greedy), 0.32 ms (Knuth–Plass) and 0.62 ms
(balanced): all far inside a live edit's budget. The cost of the measured path is the render: a
whole render plus one re-split, and one more re-split per verify round that tightens. Measured on
one sandbox, one run each, while another suite ran (about ±10%): measuring a deck takes 25 to
200 ms on a component gallery and 0.5 s on the 98-slide mixed gallery, and planning every slide
takes under 4 ms. A whole export with Knuth–Plass runs as fast as today's split or faster on a
component gallery, because it renders fewer pages (agenda at portrait@laptop: 7.0 s and 109 pages
against 4.9 s and 22). On the mixed gallery it costs 22 s against 29 s (+32%), from a second split
round and four slides that go back on today's split. A slide whose tighter room packs the same
pages now falls back at once instead of using the remaining rounds, which took the mixed gallery
from three split rounds to two. The CLI prints the measure time, plan time, split rounds and
fallbacks on every measured render. Re-rendering only the slides a round changed would remove
most of what is left.

**Not in this round.** Guillotine/BSP belongs to the component CSS layer. Skyline, Cassowary,
FM/KL, spectral and SMAWK were excluded in the catalog itself.

**The judge's read.** An independent judge scored contact sheets: agenda, cards-grid and
list-steps at story@laptop and portrait@hall in indaco, plus cards-grid and list-steps at story in
indaco-dark and cuoio. Today's split scored 3 everywhere, the measured split 5 to 8. Greedy and
Knuth–Plass rendered byte-identical sheets in 3 of 6 cells. Where they differed, Knuth–Plass won
on runs greedy ends with a lone member (2 + 2 against 3 + 1, 2 + 3 against 4 + 1). It lost where it
put the lone member first (1 + 2) or in the middle (2 + 1 + 2). The judge saw no theme-specific
defect. It found three things to fix:

1. **Knuth–Plass's lone member.** A lone member now costs twice as much on any page but the last,
   so three members that cannot share a page pack as 2 + 1 and five as 2 + 2 + 1
   (`pack.ts`, `ORPHAN`).
2. **cards-grid `three` and `four` crammed at narrow boxes.** The N-up card widths applied on every
   box, so two cards on a story page sat side by side at about 230 px and read as crammed. The
   verdict rightly failed those pages, and the slide fell back to one card a page; every gallery's
   anti-pattern slide (`cards-grid three`) did the same. The N-up widths now step down at the
   shared text-room thresholds: 2-up under 34em (one column where the box's family already
   stacks), one column under 23em. At story, cards-grid goes from 20 pages to 13, with `three`,
   `four` and the anti-pattern slide whole and readable. A 16:9 box never reaches either
   threshold.
3. **"See also." clips at portrait** in today's split too. It has no members to pack, and §15
   already tracks it as tier 2.

Timeline variants still split one dot a page, because a horizontal axis overflows sideways and
packing cannot fix that. They belong to the chart-reflow note (§15, "time axes").

**The pick: Knuth–Plass.** With the lone-member fix it reads at least as well as greedy wherever
the two differ, and it ties on every hard rule and on page count. Its one cost, twice greedy's
pair flips, applies to a live surface without memory, and the §11 memory removes it there. The
export path renders once and is unaffected.

**Shipped opt-in.** The measured split changes the bytes of an exported deck, so making it the
default (`heal` gaining packing) waits on the owner's sign-off of dark and light renders
(CLAUDE.md, export changes). Until then a deck asks for it with `fit: pack`, on every surface at
once (below).

**Every surface, one switch: `fit: pack` (2026-11-03).** A measured split in the CLI alone would make
the Studio and the PDF disagree about one deck (HARD RULE #1), so the measured split became a value
of the `fit:` register rather than a CLI flag. `fit: pack` is `heal` with a measured split. The CLI
reads it (`lib/core/resolve-guards.js` `fitPacks`; `--fit-pack` still picks the packer for any
deck), and so do the three browser surfaces: the Studio's live preview, the Playground and the
Studio's webpage export. Each one renders as before, then `docs/src/lib/measured-split.ts` writes
the deck, stamped but unsplit (`splitForPreview`'s `plan: 'whole'`), into a hidden frame built and
sanitized exactly as its own frame is. It measures with the shared `measureFit`, and plans and
verifies with the shared `measuredSplit` loop (`lib/core/fit-measure.js`), so all four surfaces
make the same decision from the same code. The module loads only for a `fit: pack` deck, because
the eager bundles sit at their byte ceilings. Two findings from driving the real Studio: the
export's slide finder reads only the export's document (`main#deck`, `body`), so the preview frame
passes its own (top-level stamped sections); and an unsplit browser render carries no slide
numbers until the split pass stamps them, hence `plan: 'whole'`. Verified on the real Studio,
Playground and webpage export, on Chromium, WebKit and Firefox (`docs/e2e/measured-split.spec.ts`):
a fitting slide stays whole, and an 18-item square slide packs as 9 + 9 on every surface, as in
the CLI.

**The memory (§11), and headroom.** A live surface keeps what it decided last time
(`nextMemory`): a slide that stops fitting splits at once (no entry margin); a split slide rejoins
only when the whole slide fits with 30% of its content area spare (fix C); its items stay on their
pages while they still fit; when they no longer do, it keeps its page count if any packing still
can (`packInto`); and the Studio also records each slide's decision against its exact text, so undo
restores the split a slide had for that text (fix B). The CLI takes the same memory through
`--fit-memory FILE`, which is how it was measured. On agenda, list-steps, cards-grid and checklist
at portrait and story, laptop and hall, with every slide rendered alone and edited ±10% (`nudgeUp`
and `nudgeDown`, the harness's own edits):

| Run | Jank, all slides | Jank, slides that split | Pages |
|---|---|---|---|
| stateless (the export renders once) | 12.7% | 14.6% | 926 |
| memory | 8.4% | 7.3% | 933 |
| memory, fresh pages packed to 90% | 4.4% | 0.4% | 980 |

Every change left in the last row but one is a slide that fitted and, 10% longer, no longer fits: it
must split or clip, and the owner chose no entry margin (§11). Memory alone left 18 runs gaining a
page, because Knuth–Plass packs pages close to full and a full page has no room for a longer item.
So a fresh pack now fills a page to 90% of its room (`HEADROOM`), and a page the memory keeps may
fill to all of it. That costs about 6% more pages on this sample, and it applies to the CLI too, so
every surface keeps splitting a deck the same way.

**The corpus again, as shipped (2026-11-03).** With the cards-grid step-down and the 90% fresh pack,
`fit: pack` on the 94 galleries (6,948 slide-cells): 12,405 pages against today's 18,066; slides that
lose content 153 against 246 (93 fixed, none new); clipped 841 against 847 and unreadable 6 against
6, with no slide newly unreadable. One slide reads newly clipped: the baseline gallery's state chart
at square@hall, whose first cut lands 1px from both the footer line and the content, and which reads
"footer" or "content" from run to run under every arm, the measured ones included (the cell that
flaps between 847 and 848 in "Blessed on a runner" above). Body pages under 40% full: 46% against 79%.
The 90% fresh pack cost nothing in pages here, because the cards-grid step-down removed more.

**The jank numbers are the CLI's.** They were measured through `--fit-memory`, which keys memory by
slide number. The Studio keys it by deck and slide index, plus each slide's text for undo, and
applies it only to the same members (an item added or removed packs afresh). That is checked on the
real Studio for one deck (an edit that wraps a line keeps the run's pages; undo restores them) on
Chromium, WebKit and Firefox, not measured across a corpus.

**Open: what the preview shows after edits.** Memory keeps a live slide's pages while the author
types; the PDF and the webpage export render once without it. After a run of edits the preview can
therefore show a split the export would not make (three pages kept for items that now fit on two).
Three ways to close it were put to the owner: settle to the stateless plan when the author pauses,
let the Studio's exports reuse the preview's decisions, or record the decision in the deck file.

**Tested on two of the owner's own decks (2026-11-04).** "Remembering Sir Patrick Stewart" (7 slides,
portrait@hall) needs no split either way: 6 pages under both. "Yearn already has the hard parts"
(53 slides, 18 photographs, a 16:9 deck) rendered at portrait and story, laptop, light and dark,
found three things the galleries had not:

1. **`cards-stack horizontal` crammed at narrow boxes**, as cards-grid's N-up did: the row rule ran
   at every box, so three cards sat side by side on a portrait page, the verdict failed the page,
   and the slide fell back to one card a page. It now stacks under the 34em threshold.
2. **`cover-paginate` ignored the plan** (premise, pricing and the dense legal lists): it paced its
   own pages. It now takes a plan that places every member, as the other recipes do. The premise
   slide went from 7 pages to 3.
3. **Runs ended on a page holding one key insight.** The trailing beats (the key insight and the
   below-note) now close the last body page when they fit there: the plan decides it for a packed
   list (`withFold`, from the beats' measured height), and for every other builder a pass after
   the split measures the closing page against the free room under the last body page's drawn
   content (`foldableBySlide`), folds it, verifies, and undoes a fold that overflows. The recipe
   dispatcher (`carouselize`) and `splitEnvelope` both honor `foldCoda`.

Yearn at portrait went from 144 pages to 94, and at story from 144 to 72, with no slide back on
today's split. The Playground's plan for the deck (fit: pack, portrait) matches the CLI's on all 51
measured slides. What stays: the comparison slides keep one side a page at portrait, because at that
type size two sides do not fit one page (measured: about 1,250 px against 1,175); one title
("What I need before I order is straightforward") clips at portrait and story under both splits, a
long word wider than the box; and premise's body pages repeat its title with "(cont.)", as they do
under today's split. A calibration pass (repacking from the ink a body page really used) was tried
and removed: on these decks it found no page to save and cost two renders.

**Card alignment on split pages (owner, 2026-11-04).** The carousel template (§14) started every content
page at the top so a run read on one line. With packed pages that overrode the author: a deck's
`cards:` setting never reached a split page, and a lone card or a short last page rode high over an
empty page. The owner ruled that cards center by default and that the author's setting is respected.
A content page now follows the slide's `cards:` (deck or `_class: cards-*`), and centers when none is
set: `centerUnchosenCards` (lib/core/auto-split.js) stamps `data-cards="center"` on a content page with
no `cards-*` class, and base.modifiers.css places the member group by it (`--split-place`), filling the
page only under `stretch`. Members keep their natural height. The cost the owner accepted: a short
last page sits lower than a full one, so the start line can shift between pages; `cards: top` brings
the single start line back. Pinned by test/unit/core/measured-plan.test.js and
test/integration/parity/list-row-fit.test.js.

## 17. One box for every narrow rule, after PR 3021 (2026-11-04)

PR 3021 (responsive tables) landed on `main` while this PR was open. It taught tables and fourteen
card components to reflow in their **content area** (`.cell-stage`, the `lat-cards` container),
only on wide and square decks. This PR's text-room rules (§13) queried the **slide** (the `lattice`
container) on every deck shape. Six components carried both, and the rebase conflicted in all six.
The owner's direction: components should be responsive natively, by their own box, so the split
only has to measure what they already did.

**One container.** `base.elements.css` now makes every content area a width container carrying
both names: `section:not(.collage):not(.chart-frame) > .cell-stage { container: lattice lat-cards / inline-size; }`.
A query from inside the content area answers with the nearest container, the content area itself.
On a slide with no panes that box is as wide as the slide's content box, so nothing moves, unless
the content area pads or borders itself; in a pane, the text-room rules now reflow as they would
on a narrow slide. The declaration replaces
PR 3021's own, which named only `lat-cards` and only wide and square decks (`container` names an
element's whole list, so two rules would drop one name). Breakpoints stay in `em`: a query's `em` is
the container's own text size, so a width in `em` counts characters a line at any venue, which a
`cqi` or `px` breakpoint cannot.

**What the one box cost, measured** (79 galleries plus `examples/panes`, at hd, square, portrait and
mobile, 320 renders hashed before and after):

| Change | Verdict |
|---|---|
| `collage` lost its grid width: its content area is sized by the photo grid inside it, and a width container ignores its contents when it sizes | left out of the rule (`:not(.collage)`) |
| `list-steps` chevron took PR 3021's narrow-pane row on tall decks, over the tall deck's designed stacked tab | that rule keeps off tall and strip decks |
| `pricing`'s stacked tiers shrank to their text and sat left (square decks on `main` too): the list wraps, and the `cards:` register centers the line | the stacked column sets `flex-wrap: nowrap`, as statute-stack's already did |
| `list` principles, `kpi`, `q-and-a`, `inventory` on portrait and mobile take PR 3021's narrow forms | kept: each reads at least as well (the principle line gains its width back) |
| charts under `claim-bleed` pad their content area, so a raw `cqi` inside measured a narrower box: progress and kanban labels moved at hd (found by the checker; no gallery uses `claim-bleed`) | charts left out (`:not(.chart-frame)`); a claim-bleed progress and kanban deck is pixel-identical to no container |
| `policy-recommendation` pads and borders its content area: 117 to 140 pixels of corner anti-aliasing a slide, at every size | kept: invisible |

`collage` slide 6 also differed, but it differs between two screenshots of the same file, so it is
not this change. The fit ratchet over the 94 galleries at square, portrait and story, laptop and
hall: no count rose and 30 fell.

**One rule per component.** Where PR 3021's rule now covers the same box, this PR's went:
cards-grid's 34em and 23em step-downs, cards-stack's `horizontal` at 34em and inventory `cards` at
23em (each gallery pixel-identical at four sizes after the removal), and statute-stack's status-pill
rule (this PR's at 23em; PR 3021's, with the same declarations, at 24em, so it now applies a little
sooner). What stays is what PR 3021 does not do: pricing's
ribbon, the ordinal run-in under 17em, glossary on tall decks, and statute-stack's 17em pill padding.
The statute-stack `lane` table keeps its own cards (from 34em) and leaves PR 3021's generic table
cards, the same way glossary and math derivation do.

**Split before hold.** PR 3021 holds a table or card row in its wide form when the narrow one would
overflow its slide. The CLI runs the measured split before that hold, so a narrow form that
overflows is split onto pages it fits, and the hold acts only where nothing can split the slide.

**Bytes.** This PR's split code sits in the ESM engine every surface loads: +1.8 KB of `engineJsGz`
over `main`, 1.0 KB past its ceiling. The owner raised the ceiling 2 KB in its own PR (#3028).


**The live preview measures at rest, not per keystroke (2026-11-04).** A measurement lays the slide out
in a hidden frame on the main thread, and layout cannot move to a worker (a worker has no DOM). The
Studio measured every render: on the owner's phone each page step re-measured (0.85 to 2.3 s on an
emulated iPhone), and typing measured per keystroke. Now (docs/src/lib/measured-split.ts `studioPlan`,
in the lazy chunk): a plan is cached by the slide's text, box, mode and stylesheet, so stepping pages
reuses it (155 to 238 ms a step); the first render of a slide measures at once; an edit redraws with
the slide's last plan and measures once, 0.7 s after the author pauses, in idle time, cancelled by the
next keystroke. On WebKit at tablet size, twelve keystrokes ran no measurement (three before) and the
preview showed the text 12 to 17 ms after the last key (713 to 743 ms before). Pinned by
docs/e2e/measured-split.spec.ts ("does not measure while the author types").
