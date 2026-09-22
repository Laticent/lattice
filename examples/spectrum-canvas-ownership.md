---
marp: true
size: portrait
theme: indaco
color-mode: dark
spectrum: off
finish: atrium
paginate: true
header: "Spectrum canvas ownership"
---

<!-- _class: title -->

`Engine · base.variants.css`

# Turning the bar off stopped turning the panel off with it

Every slide here carries `spectrum: off`. The anchors keep the surface they paint for themselves.

---

<!-- _class: divider -->

`Section 01`

## The rule was clearing a bar and repainting a canvas.

---

<!-- _class: topic -->

`Section 01 · What it said`

## One shorthand, two effects

`background: var(--bg)` clears every background longhand at once — which is how you remove a bar — and restates the color, which is how you lose a panel.

---

<!-- _class: decision -->

`Decision · How to fix it`

- Lower the specificity
  - The rule stops out-specifying the frame, but it also stops beating everything else it was written to beat.
- Say only what you mean
  - `background-image: none` removes the bar and touches no color, so no frame needs a carve-out at all.

---

<!-- _class: split-panel -->

`Measured`

## What the anchors looked like before

- On main
  - `title`, `topic` and `closing` read `rgb(0,29,51)` — the deck ground, not the panel.
- On this branch
  - All three read `rgb(0,61,102)`, off a real render, under `spectrum: off` and `spectrum-edge: left` alike.

---

<!-- _class: topic fact -->

`Section 02 · The accent stripe`

## `accent` was the same rule again

It draws a stripe, and copied a canvas out of the rule it replaced.

---

<!-- _class: divider spectrum-trim -->

`Section 02`

## The structural accents were never the problem — and still are not.

---

<!-- _class: closing -->

## Three rules, one lesson: declare the thing you mean, not the thing that resets it.
