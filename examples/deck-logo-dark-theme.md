---
marp: true
theme: indaco-dark
paginate: true
header: "Lattice · Deck logo on a dark THEME"
meta: "Deck logo · the theme is a canvas too"
logo: ../lib/base/_logo/acme-logo.svg
---

<!-- _class: title silent -->

`Deck mark · the theme decides too`

# A dark theme is a dark canvas

This whole deck is `theme: indaco-dark` — a wrapper whose entire content is `color-scheme: dark` at the root. **No slide here carries a `dark` class.** Every mark you see still reads, because the engine reaches the canvas through the theme's own name.

---

<!-- _class: content -->

`The gap this closes`

## A theme touches no class, so no class rule could see it

Before this, the mark took the **light**-canvas treatment on every slide of a dark-theme deck — a dark watermark on a dark ground.

- What it looked like
  - Not an error, and nothing missing. The slide simply looked as though it had no logo.
- Measured
  - Separation between the mark and its ground fell to **0.0015**, against **0.1382** on the same deck in the light theme.
- Why no gate caught it
  - The contrast checkers audit **text runs**. This mark is a decorative, `aria-hidden` watermark, so it sits outside all of them.

---

<!-- _class: content -->

`How it is reached`

## The theme's own name is the hook

- The rule
  - `section[data-theme$="-dark"]` sets the same token the per-slide `dark` modifier does.
- Why not the theme file
  - A `variant-dark` theme is declared to be a thin wrapper that **only pins the canvas**. A wrapper declaring tokens of its own would be a different kind of theme, and the ownership gate says so.
- Why the suffix is safe
  - All 14 dark themes carry `role: variant-dark` and all 14 are named `*-dark` — the same 14. A test holds those two sets equal, so an off-convention name fails there instead of shipping a deck with an invisible mark.

---

<!-- _class: content light -->

`A light slide inside a dark deck`

## One slide can still opt out

This slide is `content light`. The ground went white, so the mark went **dark** — the per-slide modifier outranks the deck-wide default.

- Order is the whole mechanism
  - The theme rule and `light` have the same weight, so the one declared later wins. The theme rule is declared first, deliberately, which is what makes it a *default*.

---

<!-- _class: content dark light -->

`Stacked modifiers`

## `dark light` resolves once, not twice

Stack both and the later one wins: this slide is light, and so is its mark.

- What used to happen
  - The scheme and the ground went light while the **inverse** filter survived — a brightened mark at 0.45 opacity on white.
- And in the exported player
  - The player has no cascade for the ground; it rebuilds dark from flat rules. Its dark rule excluded only the print band, so it fired here too and the ground stayed dark while the PDF went light.

---

<!-- _class: divider -->

`Bookends`

## A divider is dark whatever the theme

---

<!-- _class: content -->

`What to take away`

## The canvas decides — and there are three ways to set one

- A slide class
  - `dark`, `light`, the bookends, the print band. A bookend stays a dark panel even when the slide is also pinned `light`.
- A theme
  - A `-dark` wrapper, reached by name. `color-mode: inherited` rides on it, because the root it inherits from **is** that theme.
- The receiver, for `color-mode: system`
  - The deck defers the side to the reader's OS, and the mark now defers with it — a media query, not a pin, so it reads the same signal the canvas does. The PDF resolves light and takes the light mark; an OS-following player takes whichever side the reader is on.
- Nobody, and that is the honest gap
  - A cover photograph. No token describes the lightness of a full-bleed image, so nothing can derive the mark from it.
