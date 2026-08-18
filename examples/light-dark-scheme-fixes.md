---
marp: true
theme: indaco
paginate: true
header: "Lattice · Player scheme fidelity"
---

<!-- _class: title silent spectrum -->

# What the toggle used to leave behind.

`export · player · light-dark()`

The shared HTML player splits every dual-mode color at export time, because the CSS
function it replaces does not exist on the engines this file has to open on. Two of the
three places a color can hide were already covered. This deck is the third.

---

<!-- _class: kanban -->
<!-- _footer: "Elevation written as a pair in a real property · kanban" -->

`Sink one · box-shadow`

## A card's elevation is two recipes, not one.

- Light canvas
  - Contact shadow, at 7% black
  - Float shadow, at 8% black
- Dark canvas
  - Inset top rim, at 13% white
  - Float shadow, at 32% black
- Either canvas
  - The idle layer paints clear

---

<!-- _class: progress -->
<!-- _footer: "Fill and chip, canvas-aware · progress" -->

`Sink two · background`

## Every fill mixes its hue into the canvas.

- Card elevation `100%` `done`
- Progress fill and chip `100%` `done`
- State-chart surfaces `100%` `done`
- Spectrum bookend ribbon `100%` `done`
- Chart-frame canvas and status chip `100%` `done`

---

<!-- _class: state-chart lr -->
<!-- _footer: "Node, index and disc surfaces · state-chart lr" -->

`Pair to page`

## Where a color can hide, and which pass catches it.

1. Authored `start`
   - `collapse => 2`
2. Light base `on-track`
   - `token? => 3`
   - `attribute? => 4`
   - `rule? => 5`
3. Token block `done`
4. Inline hoist `done`
5. Private token `end`

*The first two passes shipped earlier; the third is this change.*

---

<!-- _class: split-panel watermark -->
<!-- _footer: "Chrome ink · split-panel watermark" -->

## Chrome sits on the rail, so it takes the rail's ink

`Sink three`

### Why the header changed rung

1. Curated
   - The rail's own ink, tuned per palette against that palette's accent.
1. Derived
   - A 70% alpha of it — sub-AA on seven palettes, invisible on one.
1. Recessive
   - Size and case carry the step down. The alpha was not doing that work.

---

<!-- _class: closing spectrum -->
<!-- _header: '' -->
<!-- _paginate: false -->
<!-- _footer: "Nothing shipped depends on light-dark() · closing spectrum" -->

`The contract, now true`

## Nothing the player ships depends on the function it replaces.

`Check the next sink on the real export, not in the text.`

Each sink was invisible to the gate written for the one before it.
