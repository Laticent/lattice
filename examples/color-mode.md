---
marp: true
theme: cuoio
paginate: true
color-mode: dark
footer: "SlideWright · color mode"
---

<!-- _class: title silent -->

# One deck, both canvases.

`Feature · color mode`

A deck sets its own light or dark canvas, and any single slide can flip the other way. The website's light/dark toggle no longer overrides a deck that pins its mode — the deck decides.

---

<!-- _class: divider -->

## The deck is dark because it says so — not because the site is.

This whole deck carries `color-mode: dark` in its front matter. Open it under a light website and it stays dark. That is the deck-wide pin: authoritative, saved with the deck, carried into every export.

---

## One key, four intents.

`color-mode:` takes four values. `light` and `dark` **pin** a canvas — the deck opens that way on every device. `system` **defers to the viewer's OS** light/dark setting. `inherited` **adopts the host** — the website toggle here, the reader's OS in a shared file. In the Studio the **Color mode** control writes it for you; the top-bar toggle stays the website's own.

---

## System and inherited, for shared decks.

Pin a mode when the look is the point. Reach for `system` when you'd rather respect the reader's device, and `inherited` when the deck should melt into whatever surface it lands on. A shared `.html` opens the way you set it — pinned, OS-following, or host-following — the way a PDF keeps its look.

---

<!-- _class: light -->

## A bright island in a dark deck.

This one slide carries `_class: light`. It flips to the light canvas on its own, right in the middle of a dark deck — the per-slide pin wins over the deck-wide one. Use it when a single slide reads better bright: a photo, a quote, a breather between dense dark sections.

---

## Back to dark, automatically.

The next slide carries no per-slide pin, so it falls back to the deck-wide `dark`. Light and dark slides coexist in one deck, each stating its own intent, and neither the website nor the other slides can override a slide that pinned its canvas.

---

## The palette is the deck's too.

This deck is `theme: cuoio`, not the website's palette. Change the site theme all you like — a deck that names its own theme keeps it. A deck that names none simply adopts whatever the website is set to.

---

<!-- _class: closing -->

## Independent by default.

`SlideWright · color mode`

The deck owns its theme and its canvas. The website owns the chrome and a shared light/dark default. They stopped fighting over one switch.
