---
marp: true
theme: cuoio
paginate: true
header: "Lattice · Form"
footer: "SlideWright · Form"
meta: "Q2 FY26 · Board Pack | Owner · S. Aden"
form: standard
---

<!-- _class: title silent -->

# Slides as Form

`Composition Model · the deck-wide toggle`

A slide is a Frame plus a fixed set of Cells — and as of this release, that composition is the default. The masthead band, a populated bay, a footer progress rail, and section watermarks appear on every deck unless it opts out with `form: off`. Palette-blind, across every render path.

---

<!-- _class: divider -->

`Section 01`

## The Lift

---

<!-- _class: content confidential watermark -->

`Context · The Toggle`

## One flag turns the model on for the whole deck.

`form: standard` resolves to the `form` class on every eligible slide — so the band, bay, and rail just appear. Bookends (this section's divider, the title, the closing) are skipped automatically; a single slide can opt out with `no-form`.

---

<!-- _class: cards-grid -->

## The band composes with components untouched.

- Body stays a section child
  - Cards, lists, charts, and tables remain direct children of the section, so every `section.X > …` selector keeps matching.
- Only the masthead moves
  - The eyebrow and first heading lift into the band; the rest is left exactly where the author put it.
- Skipped where it shouldn't apply
  - Bookends, `math` / `compare-code`, the sovereign split layouts, and imagery are left alone.

---

<!-- _class: divider -->

`Section 02`

## The Bay

---

<!-- _class: stats -->

`Evidence · Same Engine, Three Paths`

## The flag resolves identically across every render path.

`The toggle becomes the form class in marp-cli and the emulator alike — one eligibility helper, one source.`

1. 1
   - front-matter flag
2. 3
   - render paths
3. 0
   - slides hand-tagged

---

<!-- _class: content wip -->

`Takeaway · The Bay`

## The bay docks the meta and status Tiles.

> Key insight: the `meta:` line and a status chip (this slide is `wip`) ride the bay — no per-slide `form` token needed, the deck flag supplies it.

---

<!-- _class: divider -->

`Section 03`

## Orientation

---

<!-- _class: content watermark -->

`Footer · The Progress Rail`

## The footer orients the audience.

The progress Tile reads the deck's `divider` slides as sections and stamps a dot-rail into the footer center of every Form slide — current section elongated and accented. The watermark echoes the section number behind this text.

---

<!-- _class: closing silent -->

# Form, by default.

The Frame · Cell · Tile model now composes every deck out of the box — opt out per deck with `form: off`, per slide with `no-form`.
