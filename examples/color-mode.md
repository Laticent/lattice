---
marp: true
theme: cuoio
paginate: true
class: dark
footer: "SlideWright · color mode"
---

<!-- _class: title silent -->

# One deck, both canvases.

`Feature · color mode`

A deck sets its own light or dark canvas, and any single slide can flip the other way. The website's light/dark toggle no longer overrides a deck that pins its mode — the deck decides.

---

<!-- _class: divider -->

## The deck is dark because it says so — not because the site is.

This whole deck carries `class: dark` in its front matter. Open it under a light website and it stays dark. That is the deck-wide pin: authoritative, saved with the deck, carried into every export.

---

## Deck-wide is one line of front matter.

`class: dark` paints every slide on the dark canvas; `class: light` pins the whole deck bright. In the Studio the **Appearance** control writes it for you — Match site, Light, or Dark — while the top-bar toggle stays the website's own light/dark.

---

<!-- _class: light -->

## A bright island in a dark deck.

This one slide carries `_class: light`. It flips to the light canvas on its own, right in the middle of a dark deck — the per-slide pin wins over the deck-wide one. Use it when a single slide reads better bright: a photo, a quote, a breather between dense dark sections.

---

## Back to dark, automatically.

The next slide carries no color-mode class, so it falls back to the deck-wide `dark`. Light and dark slides coexist in one deck, each stating its own intent, and neither the website nor the other slides can override a slide that pinned its canvas.

---

## The palette is the deck's too.

This deck is `theme: cuoio`, not the website's palette. Change the site theme all you like — a deck that names its own theme keeps it. A deck that names none simply adopts whatever the website is set to.

---

<!-- _class: closing -->

## Independent by default.

`SlideWright · color mode`

The deck owns its theme and its canvas. The website owns the chrome and a shared light/dark default. They stopped fighting over one switch.
