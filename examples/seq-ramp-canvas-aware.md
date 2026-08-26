---
marp: true
theme: indaco
size: hd
paginate: true
header: "Lattice · sequential ramp"
footer: "Canvas-relative stops · #1697"
---

<!-- _class: title -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

# The ramp learns which canvas it is on.

`--seq-50 … --seq-900 · canvas-relative poles`

*A higher stop is always the louder one — which direction that is depends on the canvas.*

---

<!-- _class: cards-grid three -->
<!-- _footer: "The defect · #1697" -->

## One direction cannot serve two canvases.

- The old derivation
  - Stops 600–900 shaded toward **black** on every canvas. On a near-black slide that walks toward the background.
- What it cost
  - Eleven palettes painted weight-4 words at 1.66–3.19:1, under the 3:1 bar for large text.
- Why no gate saw it
  - The base derives these stops from the anchor, so a palette-token audit never scored one.

---

<!-- _class: word-cloud spectrum -->
<!-- _footer: "The four loud tiers are ramp stops · light canvas" -->

## Weight reads as heat on a light canvas.

- execution `5`
- discipline `5`
- velocity `4`
- momentum `4`
- leverage `4`
- talent `3`
- cadence `3`
- runway `3`
- margin `2`
- churn `2`
- backlog `2`
- risk `1`
- drag `1`

---

<!-- _class: word-cloud spectrum dark -->
<!-- _footer: "The same words, the same order, the opposite direction · dark canvas" -->

## And the same heat on a dark one.

- execution `5`
- discipline `5`
- velocity `4`
- momentum `4`
- leverage `4`
- talent `3`
- cadence `3`
- runway `3`
- margin `2`
- churn `2`
- backlog `2`
- risk `1`
- drag `1`

---

<!-- _class: cards-grid three -->
<!-- _footer: "The mechanism · two poles" -->

## The stops interpolate toward a pair, not toward black.

- `--seq-pole-low`
  - The quiet end. Stops 50–400 recede toward it — white on a light canvas, black on a dark one.
- `--seq-pole-high`
  - The loud end, mirrored. Both are `light-dark()` pairs, so a `_class: dark` slide flips the ramp for free.
- Two surfaces pin them
  - `carbone` keeps one dark canvas in both schemes, and printed paper is light whatever the deck is.

---

<!-- _class: cards-grid three -->
<!-- _footer: "The half a pole pair does not fix · headroom" -->

## Poles fix the direction. The anchor owns the headroom.

- Solve the arm against the stop
  - A dark anchor that restates the near-white `--accent` leaves `--seq-700` nowhere to climb.
- Mid-range, hue untouched
  - All fifteen dark arms sit at OKLab L 0.68 — hue and chroma untouched, every stop clear of 3:1.
- Checked where it lands
  - `composed-contrast` scores the derived stops on the real canvas, in both cascade orders.

---

<!-- _class: divider dark -->
<!-- _footer: "" -->

## A brand hue is not a stop on a scale.

`word-cloud spectrum`

An accent's lightness is whatever the palette needed for an accent, so weight 4 out-shouted weight 5 on 20 of 38 palette × canvas pairs. The heaviest tier reads `--seq-900` now.

---

<!-- _class: closing -->
<!-- _paginate: false -->
<!-- _footer: '' -->

# 38 of 38 encodings ordered.

`Tiers below the 3:1 bar: 13 down to 0 · tightest adjacent step: 0.012 up to 0.096 OKLab`
