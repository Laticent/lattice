---
status: shipped
summary: >
  The type-floor alarm reported itself in the vocabulary of the check that raised it —
  `Type 6.6px · floor 7.2px` — and the person who wrote the rule could not read his own
  badge on a slide ("what is it saying, it makes no sense even to me"). Two defects, not
  one. It named a measurement with no verb and no subject, where the clip register beside
  it says "Content clipped" and is understood on sight; and it reported PIXELS, which move
  with the preset, so the same figure was 6.6px at `hd` and 19.8px at `4K` and neither the
  size nor the floor beside it could be carried to another deck. The label now reads
  `Text too small · 4.9pt` and a `title` carries the fix. The unit change is the load-bearing
  half: `minPt`/`floorPt` are the same two sizes on the standard 960x540pt slide page, which
  makes the floor the constant 5.4pt on every preset — the preset-invariance
  `FIGURE_TEXT_FLOOR_RATIO` was chosen for in the first place, finally visible in the number
  the author is shown — and lands the report in the units this engine already documents its
  own type roles in (`meta` 11.25pt, `body` 16pt), so "4.9pt" places itself. Dropping the
  floor from the label is what paid for the plain words: once it is a constant, repeating it
  in the corner of every ringed slide costs width and says nothing that varies. One thing
  found and NOT swept in: the Fix-Me tab has carried a `title` under `pointer-events: none`
  since it was written, so its hint has never been reachable either.
---

# The alarm that could not be read by the person who wrote it

## 0. The report

> "i sometimes see this tab on the top right on diagrams slides, what is that all about?
> what is it saying as it makes no sense even to me."

A phone screenshot of the Studio preview, slide 11 of an 18-slide deck, a Mermaid sequence
diagram, and an amber badge in the corner reading `TYPE 6.6PX · FLOOR 7.2PX`.

The badge was correct. The figure's smallest label really did render at 6.6px against a
7.2px floor, and §8 rule 8 exists precisely because nothing else in the engine can see
that: a viewBox figure never overflows its box, it shrinks its own text, so the overflow
probe is blind to it by construction. The rule worked. The report of it did not.

That distinction is the whole note. This is not a bug in a measurement; it is a measurement
shipped in place of a sentence.

## 1. What was actually wrong with `Type 6.6px · floor 7.2px`

Two separate failures that happened to share a string.

**It had no verb and no subject.** It named a quantity and a threshold and left the reader
to infer the relation, the subject, and the consequence. Compare the register sitting in the
same corner: `Content clipped`. Nobody has ever had to ask what that one means. The type
floor had no equivalent sentence anywhere on the slide — the only plain-language statement of
the condition lived on stderr, which the Studio has no channel for and a phone has no
window for.

The label was written by someone holding the rule in their head, for whom the numbers WERE
the sentence. That is the failure mode: an alarm reads clearly to its author on the day it
is written and to nobody else, ever, and the author is the last person able to notice.

**It reported a unit that does not survive the trip.** `floorPx` is the ratio resolved
against THIS slide's height, so it is 7.2px at `hd`, 10.8px at `square` and 21.6px at `4K`.
One rule, four numbers. An author who learned "the floor is 7.2" learned something false
about every other deck they will open. And `minPx` moves with it: the same unchanged figure
measures 6.6px and 19.8px on two presets, so the reader cannot tell a design that got worse
from a canvas that got bigger.

This is the same trap `FIGURE_TEXT_FLOOR_RATIO` was written to escape. Its own comment says
an absolute px floor "looked preset-invariant and is not", and records the 4.5x spread that
settled it. The RULE moved to a ratio; the REPORT stayed in pixels, and so kept handing the
author exactly the misleading quantity the rule had just finished rejecting.

## 2. Points, on a reference page

`minPt` and `floorPt` are the measured size and the floor expressed on a 960x540pt page:

    pt = (px / slideH) x 540

540 is the height of the standard 16:9 slide in points. It is not an arbitrary anchor:

- It is what PowerPoint and Keynote use, so an author already has intuition for it.
- It is what this engine's own PDF page measures at `hd` — `lattice-emulator.js` sets the
  page to `slideW x 0.75` by `slideH x 0.75`, and 720 x 0.75 = 540. At the commonest preset
  the reported pt is therefore the literal measurement of the printed page, not a proxy.
- Near 16:9 it is the unit `lib/typography/scale.js` documents the type roles in: `meta`
  11.25pt, `body` 16pt, `h2` 28pt. So on an `hd` or `4K` deck "4.9pt" places itself against
  the smallest role in the system — roughly a THIRD of it.

  **That third bullet is aspect-bound, and the bound is worth stating because the first draft
  of this note did not.** `--fs-*` is sized in `cqi` — one hundredth of slide WIDTH — while
  this is a fraction of slide HEIGHT, so the two agree only where the aspect does. The `meta`
  role expressed in this function's own pt units:

  | preset | meta in probe-pt |
  |---|---|
  | hd 1280x720 · 4K 3840x2160 | 11.23 |
  | square 1080x1080 | 11.07 |
  | portrait 1080x1350 | 12.01 |
  | **standard 960x720** | **8.42** |
  | **story 1080x1920** | **8.44** |
  | **mobile 1080x2340** | **6.93** |

  On `mobile`, an author who reads `Text too small · 5.3pt` and calibrates against the
  documented 11.25pt concludes the figure is under half the smallest role; in these units that
  deck's own `meta` is 6.93, so the figure is 76% of it. The old px label got this right on
  every preset, because `6.6px` and `floor 7.2px` and `meta 30.0px` were all real px on one
  page. This is the single respect in which pt is worse, it is not hypothetical, and it does
  not overturn the choice — but it is the honest entry on the other side of the ledger.
  (Re-derive: `SCALES[category].meta * width/100`, then `/ height * 540`.)

Dividing by the slide's own height before scaling is what makes it invariant. The floor is
5.4pt on `hd`, on `square`, on `portrait` and on `4K`, because the floor is a ratio and this
is that ratio in units a human owns.

**What it costs, stated plainly.** Off 16:9 the reported pt is "as if printed at HD" rather
than a measurement of that deck's own PDF page. `PT = 0.75` scales both page axes, so a
`mobile` deck (1080x2340) prints a 1755pt-tall sheet on which a glyph reported here as 5.3pt
really measures **17.4pt** — a 3.3x gap, in a unit whose whole meaning is physical size on
paper. The label and the hint carry no qualifier saying so; adding one would cost the plain
words the change exists to buy, so the disclosure lives here and in the probe's own comment
instead. Anyone quoting these numbers as a physical length off 16:9 is quoting them wrong. That is the same trade the ratio itself makes, and it is the right one: the invariant
an author needs is the glyph's size RELATIVE to the frame, because a deck is displayed
scaled-to-fit and nobody prints a 40-inch page. A number that is literally true of one
artifact and useless for comparison is worth less than one that means the same thing
everywhere.

## 3. Why the floor left the label

Once the floor is a constant, printing it on every ringed slide is repetition, not
information. `Text too small · 4.9pt` is 20 characters against the old 24 — the label got
PLAINER and SHORTER at once, which is only possible because the invariant unit made one of
the two numbers redundant.

The floor is not dropped, it moves: the `title` carries "below the 5.4pt minimum" next to
the fix, where a reader who wants to calibrate can get it, and where it sits beside the
action rather than alone in a corner.

"minimum", not "floor", in author-facing text. `floor` is this codebase's word for the rule.
Writing the hint in the check's own jargon is a smaller version of the same defect the whole
change repairs.

## 4. The hint, and the tab that could never show one

The hint rides in `title` — the carrier `drawFitLabel` already uses for the Fix-Me register,
so the corner keeps one mechanism rather than growing a second tab or a second line.

Which surfaced a defect. `.illegible-tab` was `pointer-events: none`, so a native tooltip on
it could never fire; the hint would have sat in the DOM, correct and unreachable. It is now
`pointer-events: auto`, asserted from computed style in
`test/integration/invariants/legibility-watcher.test.js` because the declaration lives in
`base.modifiers.css` where a later rule could take it back without any JS noticing.

**What that costs, corrected.** The first draft of this section claimed a "~20x190px" strip on
"an AUTHORING surface only — never in an export or a delivered deck". Both halves were wrong,
and the second one was contradicted by this change's own evidence.

- **Measured, the tab's box is 269x23px at hd** — 42% wider than the guess, and 21% of the
  slide width.
- **`author` is a level an EXPORT can be run at.** `--overflow-marker=author` keeps the tab:
  the emulator's strip is `lvl !== 'author'` and its stderr line says "The export carries the
  amber ring and its tag." The rasterized PDF page offered as proof in §5 *is* an author-level
  export with the tab printed on it. The true bound is narrower and still sufficient: no
  READER receives it, because `reader` and `off` — the export default and every delivered
  path — remove the node outright.
- **The consequence worth checking — measured, and it does not occur.**
  `docs/src/playground/chart-interact.js` resolves a pointer to a chart slice via
  `elementFromPoint(...).closest(MARK_SEL)`; over a hit-testable tab that returns the tab, so
  `sliceAt` would answer -1 and a mark under this corner would stop revealing on hover. The
  checker raised it as plausible-but-unreproduced, which was the right call on the evidence
  then available. It is now reproduced against — every shipped chart gallery emitting
  `[data-mark]`, rendered through the real emulator at hd with `.illegible` forced onto every
  slide so the tab paints at full size:

  | gallery | slides | interactive marks | under the tab |
  |---|---|---|---|
  | funnel | 8 | 31 | 0 |
  | gantt | 8 | 44 | 0 |
  | map | 13 | 178 | 0 |
  | piechart | 9 | 40 | 0 |
  | quadrant | 14 | 84 | 0 |
  | radar | 14 | 84 | 0 |
  | **total** | **66** | **461** | **0** |

  Zero by rect intersection *and* by `elementFromPoint` at the overlap centroid. The closest
  any mark came was **162px below** the tab's bottom edge. So the placement note's "no
  component puts content in this corner" is now a number rather than an assertion, and the
  `pointer-events` change costs nothing on the shipped catalog. What would change it is a
  component that starts drawing interactive marks into the top chrome band.

  **(2026-09-08 — the tab is no longer in the corner.** It berths centered under the
  spectrum bar, which invalidates the measurement above rather than the conclusion. Re-run
  against the new berth: same 66 slides, same 461 marks, still **0** under a tab, closest gap
  **139px** — and the clearance is now structural, since the block-start padding keeps
  in-flow content out of the band. `2026-09-08-marker-capsule-berth.md` §4.)

**`.fixme-tab` has the same mismatch and is NOT fixed here — deliberately, and the call is
close enough to write down.** It has carried a `title` (`base.modifiers.css` sets
`pointer-events: none`; `lib/runtime/index.js` sets the title on that same tab) since it was
written, so its "Likely cause — N words, over budget" hint has never been reachable.

The argument for fixing it here is strong: it is one declaration, forty lines away in the
same file, and this change's entire thesis is that a `title` under `pointer-events: none` is
unreachable. Leaving it is a broken window in the room being repaired.

The argument against won, narrowly. HARD RULE #18 does not merely permit logging an off-path
defect, it *prohibits* pulling one into the diff — "rather than ignoring it OR pulling it into
the diff — that boundary keeps #8 and #17 intact". Fix-Me is a separate register with its own
placement history, its hint is set only on the density-guess path, and making a second tab
hit-testable spreads the `elementFromPoint` consequence above to the BOTTOM-right corner,
where charts more often reach. That is a behavior change to a register nobody asked about,
argued for by analogy rather than by a report.

So it is logged, not swept. A reviewer who reads Fix-Me as on-path should say so — it is a
one-word fix and this note is the record that it was seen, weighed, and left.

**A tooltip is not the whole channel, and the design accounts for that.** Hover needs a
pointer, so on the touch preview this report came FROM, the hint is unreachable. That is why
the label states the condition in words and carries the size itself, instead of deferring
both to the hover: the tab has to stand alone, and the hint is the second helping.

## 5. What is verified, and on which surface

Per HARD RULE #23, each claim names the surface it was measured on:

- **The export.** `node lattice-emulator.js --overflow-marker=author` on a deliberately
  over-dense sequence diagram, PDF rasterized and looked at: the corner reads
  `TEXT TOO SMALL · 4.1PT`. stderr reads `(5.4pt = 1.00% of slide height, 7.2px here):
  page 2 at 4.1pt (5.5px, 0.77%)`.
- **The live runtime, real Chromium, real bundle.**
  `test/integration/invariants/legibility-watcher.test.js` — label shape, hint content, and
  `pointer-events: auto` from computed style.
- **The real Studio preview, at 1440x900 and at 390x844** — the phone surface the report came
  from — driven through the actual Source and Preview panes. Tab, `title` and computed
  `pointer-events` all read back as above.
- **The kernel.** `test/unit/core/overflow-probe.test.js` pins that `floorPt` is 5.4 at
  720 / 1080 / 2160 px slide heights while `floorPx` is 7.2 / 10.8 / 21.6 — the invariance
  claim above, asserted rather than argued.

An independent checker re-derived every number here against the tree and found five stated
facts wrong — the export bound (§4), the type-role comparability (§2), the tab's pixel size,
the label's character count, and a test comment describing an emulator channel that prints no
such thing. All five are corrected in place above rather than quietly dropped; the arithmetic,
the injection safety and the rounding all held.

**Not verified, and named rather than implied:**

- **iOS Safari and any real touch device.** Unreachable from this sandbox. The design
  *depends* on the label standing alone there, which makes it the surface this change would
  most like to have driven.
- **The native tooltip actually painting.** The preconditions are verified — hit-testable,
  `title` present, `pointer-events: auto` from computed style — but an OS-drawn tooltip is not
  in the DOM and cannot be screenshotted headless. "The hint reaches a person" is one
  inference deep.
- **A delivered `--player` bundle at `author` level, and PPTX.** Neither was built and driven.
