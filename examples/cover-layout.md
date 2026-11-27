---
marp: true
theme: indaco
cover-layout: masthead
pagination: true
footer: "Lattice · cover-layout"
logo: sample:logo-acme-mark.svg
---

<!-- @meta{layout=title} -->

# Covers follow the color mode.

`cover-layout: masthead · a light deck`

A light deck opens on its own light canvas. No second switch, no surprise panel.

---

## One key for the shape, one for the color

- `cover-layout:`
  - Sets the composition of the title and closing slides: `plain`, `masthead`, `ledger`, `column`, `label`, `stage`, `frame` or `poster`.
- `color-mode:`
  - Sets the color, on covers and dividers exactly as on every other slide.
- `light` / `dark` on one slide
  - Flips that slide alone, the way it always has on a content slide.

---

<!-- @meta{layout=title, class=dark} -->

# One dark cover in a light deck.

`title dark · the brand panel`

A dark cover paints the theme's inverse panel, so the house navy cover is one word away.

---

<!-- @meta{layout=divider, class=numbered} -->

`Section 01`

## Dividers take the accent as their field.

---

## What a divider paints in each mode

- Light mode
  - The theme's accent, inked with its own on-accent color. The contrast audit already holds the pair to the accessibility bar.
- Dark mode
  - The accent dimmed toward the background, inked white, so a chapter break never flashes in a dark room.
- `divider subsection`
  - The smaller, centered layout for a finer turn. It takes the same field, in either mode.

---

<!-- @meta{layout=divider, class=subsection} -->

`Section 01 · Migration`

## Older decks move over with one lint pass.

---

## Moving an older deck

- `cover: light masthead`
  - Becomes `cover-layout: masthead`. A light cover is now what a light deck does on its own.
- `cover: inverse masthead`
  - Becomes `cover-layout: masthead`, plus `dark` on the title and closing slides, so the deck looks as before.
- `cover-light` · `cover-inverse` on one slide
  - Become `light` · `dark`. One `lint:deck --fix` pass rewrites all of it.

---

<!-- @meta{layout=divider, class=dark numbered} -->

`Section 02`

## The same divider, in dark mode.

---

<!-- @meta{layout=closing} -->

## The back cover follows the mode too.

`cover-layout: masthead · the closing slide`

Same composition, same canvas as the front cover.
