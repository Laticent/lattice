---
status: blocked
summary: The footer band over-subscribes when the running footer and the section label are both long. Two absolutes with no shared budget overprint; promoting the footer to a flex item fixes that but DELETES text from the exported PDF's text layer. Scope of the fix is narrowed to split bands; the general allocation policy is unresolved and named here.
---

# The footer band's allocation problem

**Decision owner:** Sharmarke · **Raised by:** the HARD RULE #25 trio on PR #1215 ·
**Status:** `blocked` — the narrow fix shipped; the general allocation policy needs the owner's call (§ "What is NOT resolved")

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

## Why the obvious fix is wrong

Promote the footer to a flex item (`flex: 1 1 auto; white-space: nowrap; overflow: hidden;
text-overflow: ellipsis`) and the row allocates the width. Flex items cannot overlap, so the
overprint is structurally impossible. That is what PR #1215 first did, for **every** band carrying
a docked mark.

It makes the export **worse**, and the trio caught it:

| | `main` | promoted |
|---|---|---|
| footer, ordinary board deck (`hd`, 150-char confidentiality line) | complete, wrapped over 3 lines | `…or its advisers, or …` — *"any person not named on the distribution schedule"* **absent from the PDF text layer** |
| the section label on that same page | `SECTION 02 · OPERATING LEVERAGE` | `SECTION 02 · OPERAT…` |

Two things make this strictly worse than the overprint it replaces:

1. **`flex-basis: auto` makes the footer BID for the row's width.** Its base size is its full
   single-line intrinsic width, so any long footer over-constrains the row and flexbox shrinks
   *both* items — truncating the rail on pages where it would have fit trivially. A mark the change
   was not meant to touch (HARD RULE #18).
2. **`nowrap` forbids the wrap that was working.** The premise behind the fix — "the band clips the
   two-line wrap" — was never true. The second line renders in full; it spills below the band into
   the bottom margin, which is untidy on the pages where the footer is long and invisible
   everywhere else. Trading a complete wrap for a truncated single line is a downgrade.

And the loss is not a paint artifact: it is baked into the exported text layer, so copy/paste and
PDF search return the ellipsised string. On a confidentiality notice that is a legally meaningful
change to an artifact, which is the QUALITY BAR's export sign-off gate, not a visual-review matter.

Three further consequences the trio measured, all downstream of the same lever:

- `:has(> .tile-progress)` matches on DOM **presence**, so `claim-quiet` — which hides the rail with
  `display: none` — promoted the footer on a page with nothing to collide with, voiding its 52cqi
  budget and deleting 68 characters from a band that was never contended.
- `.dot` / `.dot.on` carry the default `flex-shrink: 1`, so a footer competing for the row deforms
  the progress dots: the "you are here" pill collapsed from a 39×13 pill to an 11×13 circle and the
  off dots to 3×13 slivers, losing the shape that distinguishes them.
- `overflow: hidden` on the base footer's `line-height: 1` is a *vertical* clip as well as a
  horizontal one, shaving every glyph above cap height: `ÜBERPRÜFUNG` printed `UBERPRUFUNG`.
  (Fixed with `line-height: 1.45` on the promoted footer, and pinned — see below.)

## What shipped

The promotion is scoped to **split bands** (`:has(> .lat-split-rail)`) and split covers, which is
where #1191 introduced it and where the trade is right: a fourth mark makes the row genuinely
over-subscribed, and there is no wrap to preserve because the band is already the tightest it gets.

Also shipped, because they are defects in that scope regardless of the wider question:

- `line-height: 1.45` on the promoted footer, so a clipping box contains its own ink.
- `test/integration/invariants/footer-band.test.js` — a genuinely contended, genuinely splitting
  fixture, asserting the flex contract, that the row (not a re-imposed budget) sets the footer's
  width, that the box contains its ink, that neither mark is crushed to zero, and that
  `silent`/`no-footer` still suppress. **Seven of the promoted rule's ten declarations now fail it
  when removed.** The three survivors are named in the file's header rather than rounded away:
  `inset: auto` and `min-width: 0` are provably inert beside `position: static` and
  `overflow: hidden` in the same block (css-flexbox-1 §4.5 suppresses the automatic minimum size
  when main-axis overflow is not `visible` — measured identical widths either way), and only
  `flex-grow` distinguishes `flex: 1 1 auto` from the initial value, on a footer that always
  overflows its share. The first version of the file let seven of nine through because its fixture
  had 21px of slack and nothing ever shrank; the second still let `max-width: none` through because
  the footer's share landed 13.7px *under* its 52cqi cap, so the override had nothing to override —
  the section label was shortened to fix that.

## What is NOT resolved — the owner's call

The un-split band still overprints when both strings are long. Fixing it means choosing an
**allocation policy**, and every candidate spends something:

| option | cost |
|---|---|
| **(a) Do nothing** | the overprint stays on the un-split band. Visible, ugly, but nothing is deleted and nothing lies. |
| **(b) Cap the footer and ellipsise inside its own budget** (`flex: 0 1 auto` + keep `--footerleft-w`) | no bidding for the rail's width, but still trades the working wrap for truncated export text. |
| **(c) Keep the wrap, reserve space so it cannot reach the rail** | preserves every character; costs a taller band or a narrower footer column, and re-introduces the magic-number "yield" §6 deliberately retired. |
| **(d) Route over-subscription into the alarm channel** | `footer.scrollWidth > clientWidth ‖ seg.scrollWidth > clientWidth` → the existing `.overflow` ring. ~5 lines in the watcher. Fixes nothing by itself, but converts the whole family from "invisible forever" to "the author is told" — and it is the only option that closes the *class* rather than an instance. |

**Recommendation: (d) plus (c).** Tell the author their band is over-subscribed, and preserve their
text while they decide. (b) is the tempting one and it is the one that quietly loses words.

Whichever is chosen, two containment fixes belong with it: `flex-shrink: 0` on `.dot` so the dots
cannot deform, and keying the promotion on paint rather than DOM presence so `claim-*` frames are
excluded.

**And the lever that actually moves shrink priority is already in the tree, undeclared as such:**
`min-width: 0` on the docked `.tile-progress` (`stage.css`). Without it the rail's automatic minimum
is max-content — it carries no `overflow: hidden` to suppress that, the way the promoted footer does
— so it stops yielding, and 113px moves from the author's footer to the generated label (measured on
`test/fixtures/footer-band-contended.md`: footer 611.9 → 491.8px, label 141 → 254px of a 466px
string). Both marks stay clipped either way and nothing overlaps, so this is not a defect in either
position; it is the priority dial, and today it is set to "the author's words win" by a declaration
that reads like boilerplate. Whoever settles the policy above should set it on purpose. It is
deliberately NOT pinned by `footer-band.test.js`, because a test there would freeze the answer to
the open question. `flex-shrink` is not the dial — a weight on top of an already-capped basis drives
the rail to 0px, as recorded below.

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
