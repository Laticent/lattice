---
status: shipped
summary: The footer band over-subscribed because up to four marks shared one width with no stated priority. Promoting the footer to a flex item while the rail still carried a nowrap section label made it worse — it DELETED text from the exported PDF. Resolved by an ORDER instead of an arbitration - page number > dots > the author's words > the section name - with the section name removed from the markup and the dots bucketed to a fixed count, so the row has exactly one flexible item and nothing has to be measured.
---

# The footer band's allocation problem

**Decision owner:** Sharmarke · **Raised by:** the HARD RULE #25 trio on PR #1215 ·
**Status:** `shipped` — the owner set the priority order on 2026-07-27; see § "The policy, as decided"

## The defect

`design/forms.md` §6 created the footer Cell to retire "three absolutes at the same baseline with
no shared budget". One mark never finished migrating: the running `footer:` text is still
`position: absolute` with a fixed `--footerleft-w` (52cqi) cap, while the docked section rail
(`nav.tile-progress`) is an in-flow flex item with a `white-space: nowrap` label.

A cap is not a negotiation. Neither side can yield, so when both strings are long they overprint.
Measured on the shipped 117-page gallery: p78 painted `…content tint-vignette tint-edge at-right`
straight through `THE ANNEXES · APPROVED DECORATION` — 105.2px of real ink overlap, measured by
rasterizing the band. p47/p58 wrapped the footer onto a second line that renders completely but
spills below the band, into the page's bottom margin.

## Why the obvious fix was wrong — and what made the same fix right

Promote the footer to a flex item (`flex: 1 1 auto; white-space: nowrap; overflow: hidden;
text-overflow: ellipsis`) and the row allocates the width. Flex items cannot overlap, so the
overprint is structurally impossible. That is what PR #1215 first did, for **every** band carrying
a docked mark.

Read the shipped CSS and you will find that exact declaration block, on a selector that is *wider*
still. The difference is not in the rule — it is that the rule now runs in a row containing one
flexible item instead of two. Keep the section below in mind before touching either.

The first time, it made the export **worse**, and the trio caught it:

| | `main` | promoted |
|---|---|---|
| footer, ordinary board deck (`hd`, 150-char confidentiality line) | complete, wrapped over 3 lines | `…or its advisers, or …` — *"any person not named on the distribution schedule"* **absent from the PDF text layer** |
| the section label on that same page | `SECTION 02 · OPERATING LEVERAGE` | `SECTION 02 · OPERAT…` |

Two things made it strictly worse than the overprint it replaced:

1. **`flex-basis: auto` makes the footer BID for the row's width.** Its base size is its full
   single-line intrinsic width, so any long footer over-constrains the row and flexbox shrinks
   *both* items — truncating the rail on pages where it would have fit trivially. A mark the change
   was not meant to touch (HARD RULE #18). **This is the one the policy fixes**: the rail is no
   longer a second bidder, because it no longer contains a string. Nothing over-constrains a row
   whose other items have a fixed, known width.
2. **`nowrap` forbids the wrap that was working.** The premise behind the fix — "the band clips the
   two-line wrap" — was never true. The second line renders in full; it spills below the band into
   the bottom margin, which is untidy on the pages where the footer is long and invisible
   everywhere else. **This one the policy accepts rather than fixes**, at the owner's call: the
   footer ellipsises, so a very long one still loses its tail from the exported text layer — just
   later, and by decision. See "What it costs" below.

And the loss is not a paint artifact: it is baked into the exported text layer, so copy/paste and
PDF search return the ellipsised string. On a confidentiality notice that is a legally meaningful
change to an artifact, which is the QUALITY BAR's export sign-off gate, not a visual-review matter.

Three further consequences the trio measured, all downstream of the same lever, and all closed:

- `:has(> .tile-progress)` matches on DOM **presence**, so `claim-quiet` — which hides the rail with
  `display: none` — promoted the footer on a page with nothing to collide with, voiding its 52cqi
  budget and deleting 68 characters from a band that was never contended. *Closed by deleting the
  condition:* the promotion applies to every `.cell-footer`, so there is no presence test to get
  wrong, and no budget left to void.
- `.dot` / `.dot.on` carry the default `flex-shrink: 1`, so a footer competing for the row deforms
  the progress dots: the "you are here" pill collapsed from a 39×13 pill to an 11×13 circle and the
  off dots to 3×13 slivers, losing the shape that distinguishes them. *Closed twice over:* the rail
  is `flex: 0 0 auto` so nothing reaches the dots, and the dots are pinned anyway.
- `overflow: hidden` on the base footer's `line-height: 1` is a *vertical* clip as well as a
  horizontal one, shaving every glyph above cap height: `ÜBERPRÜFUNG` printed `UBERPRUFUNG`.
  *Closed* with `line-height: 1.45`, and pinned by an ink-containment assertion — no box or extent
  measurement can see this, because the loss is sub-box paint.

## What shipped alongside the policy

- `line-height: 1.45` on the footer, so a clipping box contains its own ink.
- `--footer-center-w` retuned 30cqi → 20cqi. It was a truncation reserve for a label of unbounded
  length; the rail's width is now computable (9 × 0.85cqi + 2.6cqi + 9 × 0.9375cqi = **18.69cqi**),
  so the old value reserved ~10cqi of empty band that the undocked split rail had to stand clear of.
- `test/integration/invariants/footer-band.test.js` — a genuinely contended, genuinely splitting
  fixture asserting the properties that guarantee the rendering: one flexible item, no label on the
  rail, the flex contract, the row (not a re-imposed budget) setting the width, the box containing
  its ink, the dots keeping their shape, and `silent`/`no-footer` still suppressing.
- `test/unit/forms/progress-tile.test.js` — the bucketing arithmetic at its boundaries: identity at
  or under the cap, and over it, monotone, first section on the first dot, last on the last, every
  dot reachable.
- **A cache-invalidation defect in `test/helpers/render.js`, found by this work and fixed here.**
  `listFiles(lib, '.js')` was a one-level `readdirSync`, and `lib/` has almost nothing at its top
  level — so the emulator's render cache did not invalidate on a change to essentially any engine
  source. Locally, an integration test could load a PDF rendered *before* your edit and pass. It
  surfaced when removing the section label left `footer-band.test.js` green: not a weak assertion,
  a stale render. CI sets `CI=true` and skips the cache, so this only ever misled locally — which
  is worse, since local is where you decide whether an assertion works at all. Now recursive, and
  `lib/**/*.css` is hashed too.

**Mutation results, measured after that fix and not before it.** Removing `flex: 0 0 auto` from the
docked rail fails "the footer is the row's ONLY flexible item". Re-emitting the section label fails
two tests. Removing `flex: 0 0 auto` from `.dot` fails nothing — it is redundant while its container
is rigid, and the CSS says so rather than claiming a guard it isn't providing. Every earlier
mutation number in this branch's history was measured through the broken cache and is not to be
trusted; these were re-measured.

## The policy, as decided

The owner's call, 2026-07-27, and it is better than the options below because it does not
arbitrate at all — it **ranks**, and every rank is a fixed declaration rather than a measurement:

| rank | mark | behaviour when the band runs out |
|---|---|---|
| 1 | the page number | never yields |
| 2 | the section dots | never yield — **bucketed** to `MAX_DOTS` (10) so the rail's width is bounded by construction, not by a cap |
| 3 | the author's footer text | takes everything left, `…` past that |
| 4 | the section name | **gone** — not hidden, not emitted |

Rank 4 is what makes the rest work, and it is the answer to the trio's objection rather than a
way around it. The reverted attempt failed because promoting the footer put *two* unshrinkable
strings in one row, and flexbox resolves that by shrinking both. Delete one of the strings and
there is exactly **one flexible item** in the row: the author's words, taking the remainder of a
width every other mark's claim on is fixed and known. Nothing measures anything; nothing can
overprint, because flex items don't; and the failure family this document is mostly about — a
plausible number that is not the truth — has no place left to occur.

Ranks 2 and 4 are markup, not CSS (`lib/forms/tile/progress/progress.transform.js`): a label
hidden with `display: none` is still a node that could be un-hidden, and the whole policy rests
on the row containing one string. Rank 3 is `section.form > .cell-footer > footer` in
`stage.css`, which states the order in full. `footer-band.test.js` pins "the footer is the row's
ONLY flexible item" — the property, not the pixels it produces.

**What it costs, accepted deliberately.** A footer longer than the band no longer wraps to a
second line; it ellipsises. So the tail is absent from the exported PDF's text layer, not merely
off-screen — the same class of loss that got the earlier attempt reverted, but ~3× less of it
(the label's removal hands its width back to the footer: 132 of a 199-character confidentiality
line survives, against ~40 before) and now a stated trade rather than a side effect. Signed off
on a rendered before/after.

## The options that were considered and not taken

Recorded because each is the obvious next idea, and three of them are traps. The un-split band
used to overprint whenever both strings were long; fixing that by **arbitration** means choosing
among these, and every candidate spends something:

| option | cost |
|---|---|
| **(a) Do nothing** | the overprint stays on the un-split band. Visible, ugly, but nothing is deleted and nothing lies. |
| **(b) Cap the footer and ellipsise inside its own budget** (`flex: 0 1 auto` + keep `--footerleft-w`) | no bidding for the rail's width, but still trades the working wrap for truncated export text. |
| **(c) Keep the wrap, reserve space so it cannot reach the rail** | preserves every character; costs a taller band or a narrower footer column, and re-introduces the magic-number "yield" §6 deliberately retired. |
| **(d) Route over-subscription into the alarm channel** | `footer.scrollWidth > clientWidth ‖ seg.scrollWidth > clientWidth` → the existing `.overflow` ring. ~5 lines in the watcher. Fixes nothing by itself, but converts the whole family from "invisible forever" to "the author is told" — and it is the only option that closes the *class* rather than an instance. |

My recommendation at the time was **(d) plus (c)**, and the decision taken is better than it. Every
option in that table accepts the premise that the band must arbitrate between two strings at layout
time, and then argues about how. Removing one of the strings dissolves the question: (a)'s overprint
cannot happen (flex items don't overlap), (b)'s bidding cannot happen (one flexible item), (c)'s
magic number is unnecessary, and (d) has nothing left to warn about on this axis. The lesson worth
keeping is that four costed options all sharing a false premise still look like a complete analysis.

**The containment fixes named here shipped with it:** `flex: 0 0 auto` on `.dot` so the dots cannot
deform, and the promotion no longer keys on `:has(> .tile-progress)` at all — it applies to every
`.cell-footer`, so a `claim-quiet` frame that hides the rail is no longer a special case to get
wrong.

**The lever that used to move shrink priority is gone with the problem.** `min-width: 0` on the
docked `.tile-progress` decided who yielded — removing it moved 113px from the author's footer to
the generated label (measured on `test/fixtures/footer-band-contended.md`: footer 611.9 → 491.8px,
label 141 → 254px of a 466px string) — and it read like boilerplate while doing it. With the label
removed and the rail `flex: 0 0 auto`, there is no shrink to prioritise: the rail's width is a
constant. Both `min-width` and `max-width` are off that rule entirely, and `flex-shrink` never was
the dial — a weight on top of an already-capped basis drove the rail to 0px, as recorded below.

## A note on measurement, because this cost four attempts

Every wrong answer here came from a plausible number that was not the truth:

- **footer BOX vs rail box** → "42 of 117 pages are broken". An absolute footer's box is its 52cqi
  budget, not its text; most had no ink anywhere near the rail.
- **text extent via a `Range`** → "the fix made it worse". `getClientRects()` returns *laid-out*
  text and `overflow: hidden` clips paint without moving layout, so a correctly-ellipsised run still
  measures full width.
- **`flex-shrink: 8` to give the footer priority** → the rail measured **0px wide**, dots and all.
  A shrink weight on top of an already-capped basis drives it to zero rather than making it yield.
- Only **rasterizing the band and looking**, and reading the **PDF text layer** with `pdftotext`,
  gave answers that held. The test asserts the properties that *guarantee* the rendering rather than
  any measurement of it, for exactly this reason.
