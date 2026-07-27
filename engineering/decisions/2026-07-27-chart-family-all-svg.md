---
status: shipped
summary: The last two HTML labels in the chart family moved into their viewBoxes — word-cloud's size key and radar's small-multiple captions — so every chart that draws SVG at all now draws all of it. Both flip from `render: hybrid` to `svg`, proven by the derivation rather than asserted. Also corrects a six-week-old false claim in the SVG-legend decision that the derivation is what surfaced.
---

# The last two HTML labels in the chart family

**Date:** 2026-07-27
**Status:** Adopted
**Closes:** #1202
**Touches:** `lib/components/chart/_chart-family/svg-legend.js`,
`lib/components/chart/word-cloud/{word-cloud.transform.js, word-cloud.styles.css}`,
`lib/components/chart/radar/{radar.transform.js, radar.styles.css}`,
the radar + word-cloud manifests, `test/unit/components/svg-label-css-mirror.test.js`,
`engineering/decisions/2026-06-13-svg-native-legend.md` (correction)

---

## 1. What this closes

#1201 added `render` to the manifests and derived it from the real export. Two
components came back `hybrid`, each on the strength of one small label:

| | HTML side | chars |
|---|---|---|
| `radar` | four `<figcaption>`s under the small-multiples minis | 22 |
| `word-cloud` | the `size = frequency` key rail | 243 |

Everything else in both was already SVG. Neither seam was a design position —
both were leftovers, and the derivation is what made them visible as a pair.

**Why it mattered, concretely.** A small-multiples radar exported as a standalone
`.svg` came out as four unnamed shapes; a word cloud exported without the legend
that explains its one encoding. Chart-motion animated the minis while their names
sat still.

And the labels were **slide-relative where everything around them was
chart-relative** — sized from the `--fs-*` scale while the figure they belong to
scaled with its own box. In landscape at the default size the two happen to agree,
which is why this went unnoticed. They do not agree elsewhere, measured on the
print surface:

| | old (HTML, `--fs-*`) | new (viewBox units) |
|---|---|---|
| word-cloud key label, portrait | **26.5px** — 42% of the biggest word | 11.1px — 17.8%, same as landscape |
| radar mini caption, portrait | **23.9px** on a 175px diagram | 10.1px — 5.74%, same as landscape |
| radar mini caption, `--radar-mini-size` retuned 20.4cqi → 34cqi | **10.8px, unchanged** while the diagram grew 188 → 313px | 18.0px — tracks the mini |

The portrait word-cloud case was not merely disproportionate, it was **broken**:
the key overflowed its own rail, wrapping "SIZE = FREQUENCY" onto two lines that
escaped above the spine. So this conversion is size-neutral where it was already
right and a fix where it was not. That is the same defect the SVG-native legend
conversion fixed for the four keyed charts in #598 — on the two labels that
conversion did not cover.

## 2. What changed

**`buildSpine` extracted** (`svg-legend.js`). The five gradient stops that draw
the accent rule between a diagram and its key existed inline twice (landscape and
portrait). word-cloud needed the same rule, and a third copy is how a family stops
looking like one family. One builder, `axis` picks the direction. **The extraction
is byte-identical** — piechart, radar, map and quadrant render exactly as before,
verified by diffing rendered output against `main` rather than by inspection.

**word-cloud's key moved into the cloud's viewBox.** `buildSizeKey()` emits the
heading, the `more`/`less` edges, the A-ramp and the spine as SVG in the same
`0 0 1100 320` box the words already live in. The `.wc-key` div, the
`.word-cloud-canvas::after` CSS spine, the `--chart-spine*` trio and the
`--wc-cloud-frac` custom property are all gone — nothing reads them now.

**radar's mini captions moved into each mini's viewBox.** The viewBox grew a
caption band and the name is emitted through the shared wrapping emitter, so a
long series name breaks to a second line instead of overrunning.

The band is sized **per chart, from the longest name** — one line (viewBox 334)
or two (354), plus the last line's descent so a wrapped `…Ledger` stays inside
the box. Every mini in a chart shares the value, so the grid row stays aligned.
The first cut reserved two lines unconditionally and made every mini 12px taller
than the HTML caption it replaced, whether or not any name wrapped: height the
Fit Spine has to find, since the overflow probe measures the rendered box. A
constant band spends the slide's budget on whitespace and can tip a tight deck
into an autosplit it did not need. Content-sized, the common case is
height-neutral (206.7px before → 206.2px after).

**No number crosses into CSS.** The mini fills its grid cell (`width:100%;
height:100%`) and `preserveAspectRatio: meet` fits the viewBox inside, so the
band's share of the drawing is settled by the viewBox alone. An earlier cut had
CSS divide by the emitted height via a `--radar-mini-vb` custom property; the
grid made even that unnecessary. The best mirror is no mirror.

## 3. The sizing trap, hit exactly where the last conversion said it would be

`2026-06-13-svg-native-legend.md` §7 left a lesson: *"audit the component's
existing `aspect-ratio` / `max-height` first — the kernel is the easy part."*
Both halves of this change hit it.

**radar.** `--radar-mini-size` mapped the 300-unit viewBox to a rendered height.
Growing the viewBox while CSS still divided by 300 would have kept the BOX the
same size and shrunk the diagram inside it by up to 14% — the caption eating the
shape it names. Two cuts chased this (a hard-coded divisor, then a
kernel-emitted one) before the grid removed the question: the cell has a size,
`meet` fits the viewBox into it, and no divisor exists to be wrong. Measured, not
assumed: diagram 187.98px before → 188.0px after, landscape unchanged.

**Type size is the same trap one level down.** The family's key rule is
`FS = 0.045 · diagram height`, which equalizes the PHYSICAL size of every chart's
key — and it assumes a diagram rendered at the full chart body. A mini renders at
a fraction of the body (~188px against a ~1037px body), so applying the constant
naively rendered the caption at 8.5px where the HTML one had been 10.8px: the
family rule defeating its own intent. The caption is therefore anchored to the
mini's own axis-label size (`FS_AXIS × 1.565`), both user units in the same
viewBox, and lands at 10.78px — the same number, measured on the emulator's print
surface at the viewport it prints at.

word-cloud's key sizes were solved the same way, from measured before/after
positions: **16.09** user units for the label and **42.97 / 30.08 / 22.96** for
the ramp, with gaps derived from the CSS line boxes they replace (the ramp's
`line-height: 0.95` is why the three A's nest closely — modelling every row at
1.0 spread them out and shortened the block by 12%). Those constants are the
measured px divided by **0.83783**, the canvas's true uniform scale; see §6.5 for
the 6.9% error that came of dividing by the height ratio instead.

**Both conversions are size-neutral at the landscape default** — the before/after
crops there are indistinguishable, which is the bar for a construction change. The
portrait and retuned cases above are the exception, and deliberately so: matching
the old numbers there would have meant reproducing the defect.

## 4. The gates

- **A chart-relative guard** (`svg-label-css-mirror.test.js`). The property that
  makes these labels responsive is that the KERNEL owns their size, in viewBox
  units. A CSS `font-size` on `.radar-mini-label` / `.wc-key-*` would silently
  hand that back to the slide scale and re-introduce exactly the portrait defect
  above, with nothing failing. The test asserts no such declaration exists AND
  that the kernel really emits the attribute, so it cannot pass vacuously.
- **A second CSS-mirror test** (`svg-label-css-mirror.test.js`). The kernel's
  viewBox height and the CSS divisor are two numbers that must agree, and nothing
  else would fail if they drifted — the mini would just render slightly wrong.
  The test reads the REAL rendered viewBox and asserts the CSS matches, so it
  cannot be satisfied by a stale re-derivation of the same arithmetic.
- **The truth gate proves the outcome.** `npm run check:render-nature` now derives
  `svg` for both, with `html[text 0 marks 0]` — radar's 913+22 SVG chars became
  935, word-cloud's 731+243 became 974. The manifests were updated to match and
  the gate agrees; the claim is checked, not asserted.

## 5. The correction

`2026-06-13-svg-native-legend.md` §7 said word-cloud was left out of the legend
conversion because *"word-cloud never had a key."* It had one. The scoping
decision was still correct — a size ramp is not the swatch·label·value row model
`buildSvgLegend` builds, so it could not have ridden that fan-out — but the stated
reason was false for six weeks.

It surfaced because the `render` derivation reported `hybrid` and the question
"why?" led back to a paragraph that had already answered it wrongly. A dated
correction is appended in place rather than rewriting the record.

This is the second time in three branches that a derived fact has caught a
hand-written claim, and the ratio is now hard to argue with: the machine-checked
half has never been wrong, and the prose half has been wrong four times.

## 5.5 The piechart model — portrait key-below and container-fill

Moving the labels inside the viewBox was the precondition for two behaviors the
piechart has had since #598 and these two components did not.

**Key below at portrait.** word-cloud's key now sits UNDER the cloud in a tall
box, with the horizontal accent rule and a left→right A-ramp — the shape
`buildPortrait` gives the four keyed charts, threaded through `ctx.orientation`
the way roadmap already selects `horizons`. In a tall box the scarce axis is
width: a side rail squeezes the cloud and cramps the key at the same time, which
is why the old HTML key overflowed its rail there. The portrait cloud also packs
the FULL width against a taller canvas (1100×760), because the landscape canvas
is 3.4:1 and `meet` fits that by width, stranding the height.

**Fill the container.** word-cloud joins the chart-family container-fill rule
and now fills **88%** of its chart body — the same number the piechart posts.
It could not join before: the absolutely-positioned HTML key needed
`.word-cloud-canvas` as a sized positioning context, so the canvas was pinned at
`85.9375cqi × 25cqi`. One viewBox means one box to fill.

radar's small-multiples became a **grid** rather than a wrapping flex row.
Portrait fill goes from **5% to 43%** and the minis lay out 2-up instead of 3+1.
Landscape is unchanged on purpose: four minis already fill the row width, and
square tiles in a 2.4:1 body cannot exceed ~40% whatever you do.

**Why a grid and not `flex: 1 1 basis`.** The flex form shipped here briefly and
was wrong: six series wrap 4+2, the two survivors stretch to fill a four-wide
row, and their height (derived from the viewBox) grows with them — **607.8px
against a 449.1px stage, 115.8px of chart clipped off the top.** `auto-fit` +
`minmax(basis, 1fr)` gives every cell the same width whatever row it lands in,
and `grid-auto-rows: 1fr` splits the available height between rows, so the minis
fit both axes by construction. The same deck now clears the stage by 130px.

## 6. Consequences

- The chart family is **seven SVG, two hybrid, four HTML** (was five/four/four).
  The two remaining hybrids — `state-chart`, `journey` — are hybrid for
  structural reasons, not stray labels: state-chart's `<ol>` is the measuring
  harness its edge routing needs, and journey's board is a table of text.
- **word-cloud's key now animates** with the cloud, since chart-motion collects
  every `<text>` in the section's first `<svg>`. It fades in with the words rather
  than being present from the first frame. Accepted: the key explains the words,
  so arriving with them reads better than preceding them.
- Both components export whole. A standalone `.svg` of either now carries its own
  labels.
- `--chart-spine` / `-w` / `-h` and `--wc-cloud-frac` are deleted. The cleanup
  §7 of the legend decision anticipated is done, by removal rather than
  relocation.

## 6.5 What the checker caught

Four confirmed defects, all fixed here; recorded because three of them are
instructive rather than incidental.

- **The key was 6.9% small.** Converting the measured px sizes to user units, I
  divided by 0.9 — the canvas HEIGHT ratio — when `preserveAspectRatio: meet`
  makes that box WIDTH-bound at 0.83783. Every constant inherited the error, and
  three documents called the result size-neutral. Fixed to `KEY_FS = 16.09` and
  re-verified with `getScreenCTM`, which reports the actual uniform scale instead
  of letting me assume which axis binds.
- **The minis left the accessibility tree.** The mini `<svg>` is
  `aria-hidden="true"`, correct when its meaning lives in surrounding prose. It
  is not correct once the series NAME moved inside it: four option names that
  used to be an exposed `<figcaption>` became unreadable, leaving the slide with
  only its heading. A labelled mini is now `role="img"` with an `aria-label`.
  The word-cloud key's `aria-hidden` got an explicit justification; radar's minis
  got none, which is exactly how a11y regressions ship.
- **The caption band did not hold a descender.** `gap + lines·LH` measures to the
  final BASELINE, so a wrapped name ending in `g`/`p`/`y` painted ~1.6 units
  outside the viewBox — visible only because the svg is `overflow: visible`, i.e.
  it looked fine and was wrong. The band now adds `BASELINE_EXTENT`'s descent.
- **The new CSS guard was evadable.** Matching `prelude { body }` pairs cannot see
  into an at-rule: for `@media (…) { .wc-key-a { font-size: … } }` the class sits
  in the BODY, so the block was filtered out and the exact declaration the guard
  exists to stop passed green. It now scans from each mention of the class to its
  matching close brace, and I verified it fails on the evasion.

## 7. Unverified

- **PPTX export** is not measured by the derivation (it reads the HTML sidecar).
  Both components' labels are inside the SVG now, which should only improve that
  path, but it was not checked.
- **Dark mode and non-indaco themes** were not re-measured for the size parity
  numbers above; the sizes are unit constants and the paints are unchanged
  tokens, so no theme-specific difference is expected.
