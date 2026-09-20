---
marp: true
theme: cuoio
paginate: true
header: "Lattice · Form"
footer: "Laticent · Form"
meta: "Q2 FY26 · Board Pack | Owner · S. Aden"
---

<!-- _class: title silent -->

# Slides as Form

`The composition model · Frame · Cell · Tile`

A slide is not content with chrome bolted on. It is a Frame that divides the canvas into Cells, and each Cell holds a Tile. Every deck composes this way, on every render path, with nothing to switch on.

---

<!-- _class: divider -->

`Section 01`

## The model

---

<!-- _class: content confidential watermark -->

`Context · One Model`

## Form is how a slide is composed, not a setting you turn on.

There is no `form:` key and no per-slide token. Every slide carries the model, so the masthead band, the meta and status bay, and the progress rail are simply where slides put those things. The question an author answers is never *whether* Form — only which Frame a component brings with it.

---

<!-- _class: cards-grid -->

## Three nouns, and only two kinds of object.

- Frame — a slicer
  - Carves a box into sub-boxes. The root Frame carves the whole slide.
- Cell — a typed slot
  - An empty, sized, positioned box. The seam between a slicer and what fills it.
- Tile — a filler
  - Leaf content sized to fill exactly one Cell. Frame-blind, so it travels.
- Medium — the renderer
  - `2d` today. A spatial renderer would change this, and nothing else.

---

<!-- _class: divider -->

`Section 02`

## Sovereign Frames

---

<!-- _class: content -->

`Contrast · Nine and One`

## A bookend is not Form switched off. It is a Frame with one Cell.

The chrome-hosting `standard` Frame declares nine Cells. Each of the nine sovereign Frames — title, divider, closing, image, premise, scene, split-panel, split-compare, compare-code — declares exactly one, the stage. They carry no band and no rail because their Frame has nowhere to put one, which is a fact about the component, not a flag on the deck.

---

<!-- _class: stats -->

`Evidence · One Composition, Three Paths`

## The same model resolves identically wherever a deck renders.

`The owned engine, the emulator and the browser runtime share one eligibility helper — so a deck composes the same in an export, a preview and a raw Marp tool.`

1. 3
   - render paths
2. 1
   - shared helper
3. 0
   - ways to opt out

---

<!-- _class: content wip -->

`Takeaway · The Bay`

## The bay docks the meta and status Tiles.

> Key insight: the `meta:` line and a status chip (this slide is `wip`) ride the bay because the Frame reserves a Cell for them — not because the deck asked for one.

---

<!-- _class: divider -->

`Section 03`

## Orientation

---

<!-- _class: content watermark -->

`Close · Orientation`

## The footer orients the audience, on every slide that has one.

The running footer, the page number and the section rail sit in Cells the chrome-hosting Frame reserves. A sovereign slide shows none of them, and the deck still reads as one deck — the bookends are the pauses, and the rail picks up again on the other side.

---

<!-- _class: closing silent -->

# Form, always.
