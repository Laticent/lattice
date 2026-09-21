---
marp: true
size: portrait
theme: indaco
color-mode: dark
finish: atrium
paginate: true
header: "Dark canvas ownership"
---

<!-- _class: title -->

`Engine · base.modifiers.css`

# The dark deck stopped repainting its own frames

Nine of them lost the canvas they paint for themselves, because the deck-wide one was declared later and won.

---

<!-- _class: divider -->

`Section 01`

## The anchors get their accent panel back.

---

<!-- _class: topic -->
<!-- _track: The anchors | [The covers] | What the gate holds -->

`Section 01 · Dark canvas`

## The covers

An accent cover under dark had kept its accent ink and lost its accent ground.

---

<!-- _class: decision -->

`Decision · Dark canvas`

## A frame keeps the canvas it paints.

- Keying on sovereignty
  - Ten frames are sovereign, four of them paint. The list would miss all five covers.
- Keying on the painted surface
  - A frame painting something other than the deck ground keeps it. One painting `var(--bg)` loses nothing.

---

<!-- _class: split-panel -->

`Measured`

## What the covers looked like before

- On main
  - `decision-cover` kept its accent ink and lost its accent ground: 1.52:1 in Chromium.
- On this branch
  - The same slide keeps its ground, and the same ink reads 6.10:1.

---

<!-- _class: closing -->

## The list cannot rot — a gate reads the stylesheets and fails if it drifts.
