---
marp: true
theme: indaco
paginate: true
header: "Lattice · Spectrum keys"
footer: "spectrum: solid left band · card-spectrum: match band · trim-spectrum: restrained"
spectrum: solid left band
card-spectrum: match band
trim-spectrum: restrained
---

<!-- _class: title -->

`Spectrum · three keys`

# One name for each stripe

Three keys now set the spectrum, each with one word per part: the slide edge, the cards and the structure.

---

<!-- _class: content -->

`spectrum: solid left band`

## The slide edge takes a style, an edge and a weight

This deck writes `spectrum: solid left band`, so every slide carries a heavy solid band on its left edge. The words go in any order, and a part left out keeps its default.

---

<!-- _class: content spectrum-hairline -->

`_class: spectrum-hairline`

## One slide can change one part and keep the rest

This slide adds `spectrum-hairline`, so its stripe drops to one pixel. It stays solid and stays on the left, because the slide changed only the weight.

---

<!-- _class: content spectrum-top spectrum-regular -->

`_class: spectrum-top spectrum-regular`

## The default of each part is a class of its own

`spectrum-top` and `spectrum-regular` put this slide back on the default edge and weight, inside a deck that set both. Nothing else on the slide moves.

---

<!-- _class: cards-grid three -->

`card-spectrum: match band`

## Each card carries a stripe that matches the slide edge

- Match
  - The card stripe follows the slide edge's solid style.
- Band
  - The weight word makes it a heavy band, ten pixels at this size.
- Left
  - The edge is the default, so the deck did not write it.

---

<!-- _class: cards-grid three card-spectrum-rainbow card-spectrum-top card-spectrum-hairline -->

`_class: card-spectrum-rainbow card-spectrum-top card-spectrum-hairline`

## The card stripe keeps its own three parts

- Rainbow
  - Pinned to the theme's full ribbon, while the slide edge stays solid.
- Top
  - Moved to the top edge of each card.
- Hairline
  - Set to the thinnest weight.

---

<!-- _class: table -->

`trim-spectrum: restrained`

## The trim carries a quiet single-hue ramp

| Key | Sets | Default |
|---|---|---|
| `spectrum:` | The stripe on the slide edge | rainbow top regular |
| `card-spectrum:` | The stripe on each card | off left regular |
| `trim-spectrum:` | The accent on tables, timelines and rules | quiet |

---

<!-- _class: content dark -->

`spectrum: solid left band · dark`

## The band holds its place on a dark slide

The same deck setting on a dark slide: the band draws in the accent's dark-canvas ink, and the heading, the body and the chrome sit exactly where they sit on a light slide.

---

<!-- _class: closing -->

# Spectrum, card spectrum, trim spectrum

- Old keys are errors, and `lint:deck --fix` rewrites them
- Deck settings use the same three names
