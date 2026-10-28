---
status: in-progress
summary: Fit everywhere. A component designed once must read well on any box and at any distance (a laptop, a boardroom, a stadium, an Instagram or LinkedIn post, a poster, a kiosk, 4K). The model has two independent axes, the box (Fluid; the named sizes are breakpoints) and the venue (type scale for reading distance), and pagination takes what no longer fits. Measured: a square post in a phone feed reads like a boardroom back row (8.7 arcminutes of x-height at the default venue). Before P2, a Monte Carlo harness scores split policies on every real deck, perturbed, at every box and venue, with no clip, no lost content and readability as hard rules and stability ahead of page count.
builds-on: 2026-10-27-fluid-layout-library.md, 2026-09-29-one-reading-size-per-venue.md, 2026-06-16-social-mobile-portrait-sizes.md
---

# Fit everywhere: two axes, and a simulation to tune them (2026-10-28)

**Status: in progress.** The owner set the model and the plan on 2026-10-28 (§5). The harness (§4)
is next.

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

**Cost.** The spikes rendered through the CLI at about 3.4 s a deck. The harness renders in one warm
browser page instead; spike 2 built and scored a slide in about 13 ms. About 20,000 samples should
take 20–40 minutes on four cores. That is an estimate, and the harness's first deliverable is the
measured number.

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
