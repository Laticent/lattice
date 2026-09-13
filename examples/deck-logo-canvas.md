---
marp: true
theme: indaco
paginate: true
header: "Lattice · Deck logo on every canvas"
meta: "Deck logo · the canvas decides the flip"
logo: ../lib/base/_logo/acme-logo.svg
---

<!-- _class: title silent -->

`Deck mark · the canvas decides`

# The logo reads on every canvas

A `logo:` mark is a monochrome watermark, so it needs the **opposite** treatment on a dark ground from a light one. Getting that wrong does not error — the mark renders at the canvas's own lightness and the slide looks like it has no logo. Every slide here carries one.

---

<!-- _class: content -->

`Light canvas · the default`

## Dark mark on a light ground

On an ordinary body slide the mark darkens to a faint gray watermark, top right. This is the `var()` fallback on `img.deck-logo` — no rule has to fire for it.

- The default
  - `grayscale(1) brightness(0.4) contrast(1.2)` at `opacity: 0.4`.
- Where it comes from
  - Nothing sets `--deck-logo-filter`, so the declaration falls through to its fallback.

---

<!-- _class: content dark -->

`Dark canvas · the flip`

## Light mark on a dark ground

The `dark` modifier declares `color-scheme: dark` and paints the canvas dark, so it sets `--deck-logo-filter` beside that declaration. The mark brightens instead of darkening.

- The flip
  - `grayscale(1) brightness(2.4) contrast(1.1)` at `opacity: 0.45`.
- Declared once
  - Both dark-canvas rules point at `--deck-logo-filter-inverse`, so they cannot drift apart.

---

<!-- _class: divider -->

`Bookends`

## A divider is dark, so the mark is light

---

<!-- _class: divider light -->

## A `divider light` is not

The `light` variant **replaces** the canvas with `var(--bg)`. The mark takes the light-canvas treatment here — and before this fix it did not, because the rule named the layout class `divider` and never asked about the ground. The mark was in the DOM, correctly positioned, and invisible.

---

<!-- _class: closing -->

`Bookends`

# A closing is dark too

---

<!-- _class: content -->

`Paper band`

## Print is a light canvas too

The `print` band is a deck-wide register (`class: print`), not a per-slide class, so it cannot be shown on one slide here. It remaps every consumed token to paper ink, which makes a printed slide a light ground **whatever layout sits under it**.

- The same defect, unreported
  - `title print`, `divider print`, `closing print` and `dark print` all lost their mark for the reason `divider light` did.
- Measured
  - `title print` and `dark print` each gain 1007 differing pixels; the six genuinely dark canvases are unchanged at 0.

---

<!-- _class: content -->

`What to take away`

## The canvas decides, not the class

- One predicate, not two
  - Every rule that declares a dark canvas sets the logo token beside it. There is no selector list to add a new layout to.
- What is still open
  - A `-dark` **theme** flips the root color-scheme without touching a class, so no rule can hang the token on it.
  - Stack two canvas modifiers (`divider light dark`, `dark light`) and the PDF and the exported player disagree about which ground rendered, so no single treatment is right on both. Both tracked separately.
