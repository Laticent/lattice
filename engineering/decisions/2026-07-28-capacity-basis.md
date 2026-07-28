---
status: proposed
summary: The capacity ceilings are ungrounded, but not for the reason the reflow note gave. Swapping the declared `density.soft` basis for each component's own `skeleton` — the fix that note proposed and #1234 group D asks for — makes the numbers WORSE on 8 of 25 components, because a skeleton is a shape template with placeholder filler, not a length specimen, and a terser basis measures a HIGHER ceiling. Measured deeper, the count ceiling is not a well-defined quantity at all: holding `inventory` at 4 members and ~10 words, the same slide fits or clips depending on its look modifier and whether it carries a trailing insight. Recommends demoting `capacity` to the authoring advisory it already is, and making the real-gallery overflow oracle the fit gate — it already catches the slide the declared numbers miss.
builds-on: 2026-07-27-family-stamp-replaces-container-queries.md, 2026-06-17-content-capacity-contract.md, 2026-06-22-the-fit-spine.md
---

# The capacity basis — why the proposed fix is the wrong one

**Date:** 2026-07-28 · **Status:** Proposed (design model; no production code) ·
**Decision owner:** Sharmarke

Design model for #1234 group D, requested before any code. It is a **correction**
to the plan carried in the reflow note and restated in the issue, so the first
half is the evidence for not doing what both of them say.

---

## The plan this replaces

The reflow note (`2026-07-27-family-stamp-replaces-container-queries.md`, "What is
NOT fixed") diagnosed the capacity numbers like this:

> **capacity cannot be grounded until density is honest**, and the right basis is
> neither `density.soft` nor any constant — it is each component's own SKELETON,
> the canonical authored element already sitting in every manifest.

Issue #1234 restates it as the group's whole point: *"The real fix is the basis…
ceilings should be measured against each component's own skeleton."*

**The diagnosis is right and the prescription is wrong.** `density.soft` really is
a bad basis. The skeleton is a worse one, for the components that matter most.

## Why `density.soft` is a bad basis — confirmed

`tools/calibrate-capacity.js` holds words-per-element fixed and grows the count
until the slide clips. It holds them at the component's declared `density.soft`.
Nobody had checked whether that number describes what anyone writes.

    node tools/audit-capacity-basis.js

It does not. Across the 25 components with a builder, a manifest skeleton and a
gallery, `density.soft` is **more generous than real authoring on 23, and tighter
on none.** `stats` is the case the reflow note already named — declared 8, real
3.5 — but it is the rule, not the exception: `agenda` 10 vs 6.3, `list-tabular` 12
vs 5.4, `statute-stack` 16 vs 7.7, `timeline-list` 16 vs 10.0.

That direction matters. A too-generous basis measures a too-LOW ceiling, so the
linter warns about slides that actually fit. Annoying, and safe.

## Why the skeleton is worse

A skeleton is a **shape template**, not a length specimen. It exists to show an
author the structure, so it fills the slots with the shortest possible placeholder.
`inventory`'s, in full:

    - **First entry.** One-sentence description.

Four words. Its own gallery writes:

    - **One part per row.** A name and one clause of body.

Ten. The skeleton runs **more than 30% terser than real authoring on 8 of 25**
components — `agenda`, `decision`, `inventory`, `list`, `list-criteria`,
`regulatory-update`, `split-panel`, `timeline-list` — and `decision` is the worst
at 8.0 against 20.3.

**A terser basis measures a HIGHER ceiling.** Same component, same box, three
bases:

| basis for `inventory` at `tall` | words/element | measured ceiling |
|---|---|---|
| `density.soft` (today) | 14 | **3** |
| gallery (real authoring) | 10 | 4 |
| skeleton (the proposal) | 4 | **5** |

Reproduce with `node tools/calibrate-capacity.js inventory --family tall --words N`.

So the proposed fix moves `inventory`'s ceiling from 3 to 5 — **away** from the
truth, and in the direction that makes the linter quieter about slides that clip.
The issue anticipated the number moving the other way ("a measured 3 is probably as
pessimistic as `stats`'s was"). For `stats` that intuition holds — its skeleton and
its gallery agree, 3.3 against 3.5. For `inventory`, the component the whole item
was written about, it is backwards.

**This is the same defect one level up.** "The skeleton is the honest basis" was
written down once, in a note whose entire subject is assertions nobody re-derives,
and never checked against the skeletons.

## The deeper finding: the ceiling is not a well-defined number

Fixing the basis would still leave the number wrong, because the quantity it names
does not have one value.

`inventory` declares `adapt.capacity.tall.hard: 8`. Render its own gallery at
`size: portrait` — eight slides, seven of them with 4 members, one with 5:

    page 4 (4 members)  CLIPPED
    page 5 (5 members)  fits

More members, fits. Fewer members, clips. Holding the count at 4 and the words at
~10 and varying only what else is on the slide:

| the slide | result |
|---|---|
| `editorial` + eyebrow + trailing insight (the real page 4) | **CLIPPED** |
| `editorial` + eyebrow, no insight | fits |
| `editorial`, no eyebrow, no insight | fits |
| `compact` + eyebrow + insight | fits |
| default look + eyebrow + insight | fits |

Only the *combination* of the `editorial` look and a trailing insight overflows.
The member count is identical in all five. **The count is not the variable.**

Two things are invisible to a per-(component, family) count ceiling, and both are
load-bearing:

1. **The look modifier.** `editorial`, `compact` and the default are different
   layouts with different budgets. One number cannot describe all of them.
2. **Everything else on the slide** — eyebrow, lede, trailing insight, below-note.
   `calibrate-capacity`'s synthetic deck omits them by construction, and
   `calibrate-core.js`'s own header already admits it: *"a few layouts carry a
   lead/subtitle paragraph in their real sample that these builders omit — so a
   calibration reads a slightly MORE generous ceiling than reality."* That note is
   filed as harmless. It is not: it is the whole gap on the one slide that clips.

So a synthetic probe at ANY word basis is measuring a slide nobody ships. The basis
is the second-order error; the first-order error is that the probe deck is not the
real slide.

## What is already right, and unused

The repo already renders the real thing. `tools/check-family-tiers.js`'s overflow
oracle renders **each component's own gallery slide at all five registered @sizes**
and freezes which ones clip, with the reasoning stated in its own source:

> The gallery is the repo's own canonical authoring — if a component clips THERE,
> it clips for a user who followed the docs.

That is ground truth, it runs in the nightly tier, and it already catches
`inventory` at portrait — the exact slide the declared `tall.hard: 8` misses. The
fit question is answered. What is not answered is the *authoring* question, which
is a different question and wants a different instrument.

## Recommendation

**Stop asking `capacity` to be a fit predictor. It is an authoring advisory, and it
is already good at that.**

- **A. `capacity` stays editorial, and says so.** Its consumer is `lint:deck`
  telling an author "six entries is crowded here". That judgment does not need
  sub-pixel accuracy and never did. Document the numbers as an editorial budget,
  drop the implication that they bound the geometry, and stop gating on
  `calibrate-capacity`'s exceed check — a gate whose reference is a slide nobody
  writes produces false failures in both directions.

- **B. The overflow oracle is the fit gate.** It already renders real slides at
  real sizes. Promote it from "record what clips" to "no NEW clip ships", which it
  already does, and treat a clip in it as the actionable signal — not a declared
  number being exceeded.

- **C. If a calibrated ceiling is still wanted, calibrate the real slide.** Not a
  synthetic deck at a chosen word count, but the component's own gallery slides,
  per **(component, look, family)**, taking the WORST fitting slide rather than the
  mean. `audit-capacity-basis.js --json` reports `galleryMax` for exactly this: a
  ceiling that only holds for the average element still clips on the long one.

- **D. Fix `inventory` as a consequence, not a special case.** Its declared
  `tall.hard: 8` exceeds every measured basis (3, 4 or 5). Under A it becomes an
  editorial number and should read like its siblings; under B the editorial slide's
  clip is already recorded and is a layout bug to fix in `editorial` — a look that
  cannot hold four rows plus the trailing insight its own gallery pairs it with.

**Rejected: swap the basis and re-derive all 61 numbers.** It is the plan of
record, it is a day's work, and the measurements above say it would move
`inventory` from 3 to 5 while leaving the editorial slide clipping. Shipping it
would replace one set of unverified numbers with another — which is the exact
sentence the reflow note used to justify *not* shipping the current ones.

## What this doc does NOT decide

- Whether the `editorial` look should hold four rows plus a trailing insight, or
  whether that pairing is an authoring error in the gallery. That is a design call
  on the component and it is the owner's.
- Whether `capacity.hard` should force a split on a slide that fits — already open
  in the split note's rule 10, and untouched here.
- The per-family `adapt.capacity` blocks. Recommendation A makes them editorial
  too; whether they earn their complexity at that point is a separate question.

## How to re-derive everything above

    node tools/audit-capacity-basis.js                    # the three bases, all 26
    node tools/calibrate-capacity.js inventory --family tall --words 14   # ceiling 3
    node tools/calibrate-capacity.js inventory --family tall --words 4    # ceiling 5
    node tools/check-family-tiers.js --bless             # the real-slide clip set

No figure in this note is a constant someone has to trust. That is deliberate: the
claim it corrects was one.
