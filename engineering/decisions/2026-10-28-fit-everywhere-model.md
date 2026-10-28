---
status: in-progress
summary: Fit everywhere. A component designed once must read well on any box and at any distance (a laptop, a boardroom, a stadium, an Instagram or LinkedIn post, a poster, a kiosk, 4K). The model has two independent axes, the box (Fluid; the named sizes are breakpoints) and the venue (type scale for reading distance), and pagination takes what no longer fits. Measured: a square post in a phone feed reads like a boardroom back row (8.7 arcminutes of x-height at the default venue). Before P2, a Monte Carlo harness scores split policies on every real deck, perturbed, at every box and venue, with no clip, no lost content and readability as hard rules and stability ahead of page count. The first corpus run leaves four finalists on one frontier, from hysteresis-20-30 (16.6% fewer pages than today, 0.9% jank) to hybrid-sticky (25.9% fewer, 2.3%), and finds that 16:9 at hall clips 435 of 1,158 gallery slides with nothing to split them.
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
laptop and hall), four policies are not beaten on both stability and pages at once. Today's split
is the zero-jank anchor, at the most pages.

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
so they clip where today's split clips (13 to 549 a cell, nearly all "unfixable", meaning the
fit-first arm clips there too). The losses (5 to 36 slides a cell) are today's builders' own, and
the finalists inherit them only where they split.

**Found on the way.** None of these is caused by this work.

1. **At 16:9 and `hall`, 435 of 1,158 slides clip.** Today's split never splits a wide box, so
   nothing catches them. Fit-first, which splits on a measured overflow, clears 288 of them; the
   other 147 clip even one member a page. The P2 hybrid therefore has to split a wide box when it
   overflows at the venue, and the harness has no packed render at hd to score that yet.
2. **Today's split drops content on 41 slides** at every split box. Read from the renders, four
   cases are real. The compare-prose split drops the slide's eyebrow (`Decision · Close Time`,
   seven copies whole, none split). The obligation-matrix split drops its key on one slide. The
   content split joins two paragraphs into one, keeping the text and losing the break. The
   row-to-card reshape drops column 1's header label on about 25 slides, as designed (§5), so
   that one is a choice to confirm rather than a bug. The compare-code pane labels move into the
   running head, so their loss is the harness counting chrome, not a real loss.
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

