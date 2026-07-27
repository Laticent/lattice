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
sat still. And word-cloud's key scaled with `--fs-*` (a fraction of the slide)
while the cloud scaled with its svg box, so the two drifted apart as the container
changed — the exact defect the SVG-native legend conversion fixed for the four
keyed charts in #598, on a chart that conversion did not cover.

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
fixed caption band (300 → 349 units) and the name is emitted through the shared
wrapping emitter, so a long series name breaks to a second line instead of
overrunning. The band is a CONSTANT because the minis lay out in a flex row: a
content-sized band would make the one mini with a two-line name taller than its
neighbours and misalign the row.

## 3. The sizing trap, hit exactly where the last conversion said it would be

`2026-06-13-svg-native-legend.md` §7 left a lesson: *"audit the component's
existing `aspect-ratio` / `max-height` first — the kernel is the easy part."*
Both halves of this change hit it.

**radar.** `--radar-mini-size` mapped the 300-unit viewBox to a rendered height.
Growing the viewBox to 349 without touching the CSS would have kept the BOX the
same size and shrunk the diagram inside it by 14% — the caption eating the shape
it names. The height rule now divides by 349 so the diagram still renders at
exactly `--radar-mini-size`, and the band adds below it. Measured, not assumed:
diagram 187.98px before → 188.0px after.

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
positions: 14.98 user units for the label, 40/28/21.38 for the ramp, and gaps
derived from the CSS line boxes they replace (the ramp's `line-height: 0.95` is
why the three A's nest closely — modelling every row at 1.0 spread them out and
shortened the block by 12%).

**Both conversions are deliberately size-neutral.** Nothing here is meant to look
different; the before/after crops are indistinguishable. That is the bar for a
construction change — if it also improved the design, the improvement would be
unreviewable, tangled up with the refactor.

## 4. The gates

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

## 7. Unverified

- **PPTX export** is not measured by the derivation (it reads the HTML sidecar).
  Both components' labels are inside the SVG now, which should only improve that
  path, but it was not checked.
- **Dark mode and non-indaco themes** were not re-measured for the size parity
  numbers above; the sizes are unit constants and the paints are unchanged
  tokens, so no theme-specific difference is expected.
