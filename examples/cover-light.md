---
marp: true
theme: indaco
cover: light
paginate: true
footer: "Lattice · cover register"
logo: sample:logo-acme-mark.svg
---

<!-- _class: title -->

# The cover can sit on the light canvas.

`cover: light · the front cover`

One line in the front matter repaints the title and the closing slide together.

---

## One register sets both covers

- `cover: inverse`
  - The default: the dark inverse panel every deck has today. It stamps nothing, so existing decks do not move.
- `cover: light`
  - Title and closing take the deck's own light canvas, with the heading, subtitle and eyebrow inks a content slide uses.
- `cover-inverse` on one slide
  - Keeps the dark panel on that cover inside a `cover: light` deck.

---

<!-- _class: title cover-inverse -->

# The default cover, for comparison.

`cover-inverse · the same deck`

A slide that names `cover-inverse` keeps the inverse panel.

---

<!-- _class: title finish finish-atrium -->

# A finish mixes toward the light canvas.

`cover: light · with finish atrium`

The backdrop and its clearance mask read the surface the cover paints.

---

<!-- _class: divider -->

## Dividers keep their own surface.

`cover: reaches title and closing only`

---

## What stays the same

- `title light`
  - Still sets a color scheme and keeps the dark panel. The new word is `cover-light`, so nothing that already writes `light` moves.
- Dark decks
  - A light cover is the light canvas in both color modes, as `divider light` is. Leave the key out for dark covers.
- Print
  - Under `color-mode: print` a cover is paper either way.

---

<!-- _class: closing index -->

## Where the light cover reaches.

`cover: light · the back cover`

- `title` — the front cover
- `closing` — the back cover, its list included
- `divider` — keeps its panel

---

<!-- _class: closing cover-inverse -->

## The default back cover, for comparison.

`cover-inverse`

The inverse panel, unchanged.
