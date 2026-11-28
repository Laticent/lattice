---
marp: true
theme: carta
mode: sketch
pagination: true
---

<!-- @meta{layout=title, class=silent} -->

`mode: sketch`

# One key, a hand-drawn deck.

Set the *mode* once in front matter and every slide inherits the rendering
mode. A **finish** backdrop can layer on top — they're separate axes now.

---

## Mode is the rendering hand — separate from the backdrop.

`mode:` names the whole-deck *hand* in a single token — how the content itself
is drawn. It's orthogonal to `theme:` (the palette) and to `finish:` (the
backdrop painted behind). The engine reads it once and appends the mapped
classes to every slide, so you never repeat `sketch` per slide.

- Boardroom
  - The clean baseline — omit the key and you get it.
- Sketch
  - Felt-tip headings, a hand-sans for prose, drawn boxes.
- Sketch-clean
  - Hand headings and boxes, but a clean body for dense slides.

---

<!-- @meta{layout=cards-grid} -->

## It composes with per-slide layouts.

A per-slide `_class:` is appended to, not overwritten by, the deck-wide
mode — so `cards-grid` here renders as a hand-drawn grid with no extra markup.

- Append, not replace
  - `mode: sketch` + `_class: cards-grid` becomes `cards-grid sketch`.
- Palette-blind
  - The mode wobbles type and geometry; the theme still colors it.
- Two render paths
  - The owned engine and the live preview both read the same key.

---

## Mode and finish are two axes — layer a backdrop on the hand.

Because they're separate registers, a deck can wear both: the sketch *hand* over
an atrium *backdrop*, with no magic and no fighting for one key. Add a per-slide
`class=boardroom` to make one slide clean while the deck stays hand-drawn.

- One deck, both axes
  - `mode: sketch` + `finish: atrium` = a hand-drawn deck on a gridded glow.
- Opt out per slide
  - `class=boardroom` renders that one slide clean, backdrop intact.
- No magic
  - The mode and the backdrop each have their own readable key.

---

<!-- @meta{layout=agenda, class=progress-2} -->

## How the deck is wired.

1. Front matter declares `mode: sketch` `once`
2. Every slide inherits the hand mode `auto`
3. A `finish:` backdrop layers on top `separate axis`
4. Per-slide layouts compose too `cards-grid`
5. The linter guards both keys against typos `unknown-mode`

---

## A typo can't ship silently.

An unrecognized value resolves to no classes, so a misspelling like
`mode: sketchh` would quietly render the boardroom baseline. The deck linter
catches it first — the same guard covers `finish:`.

- The guard
  - `npm run lint:deck` flags it as an `unknown-mode` warning.
- The fix
  - Use one of `boardroom`, `sketch`, or `sketch-clean`.
- The principle
  - No magic default — the baseline has a name you can read.

---

<!-- @meta{layout=title, class=silent} -->

`one line to re-hand the room`

# Change the mode, keep the content.

Flip `mode:` to `boardroom` and the same Markdown ships as a clean deck — no
edits to a single slide, and any `finish:` backdrop rides along untouched.
