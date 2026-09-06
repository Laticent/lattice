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
- It is the unit `lib/typography/scale.js` documents the landscape type roles in: `meta`
  11.25pt, `body` 16pt, `h2` 28pt. So "4.9pt" is instantly placeable against the smallest
  type the deck sets anywhere — roughly a THIRD of the smallest role in the system.

Dividing by the slide's own height before scaling is what makes it invariant. The floor is
5.4pt on `hd`, on `square`, on `portrait` and on `4K`, because the floor is a ratio and this
is that ratio in units a human owns.

**What it costs, stated plainly.** On a non-landscape preset the reported pt is "as if
printed at HD" rather than a measurement of that deck's own PDF page — a portrait deck's page
is 810x1440pt, and 4.9pt there is not a length you could measure with a ruler on the printed
sheet. That is the same trade the ratio itself makes, and it is the right one: the invariant
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
`base.modifiers.css` where a later rule could take it back without any JS noticing. The cost
is bounded: a ~20x190px strip stops passing clicks through, on an AUTHORING surface only —
the tab renders solely under `overflow-marker: author`, never in an export or a delivered
deck.

**`.fixme-tab` has the same mismatch and is NOT fixed here.** It has carried a `title` under
`pointer-events: none` since it was written, so its culprit hint has never been reachable
either. That is a pre-existing defect in a different register, off the path of this change,
so HARD RULE #18 logs it rather than sweeping it into this diff.

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

Not verified: iOS Safari, which cannot be reached from this sandbox. The change is a string
and one CSS declaration, so the risk there is low, but "low" is not "checked".
