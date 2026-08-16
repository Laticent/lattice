---
marp: true
theme: indaco
paginate: true
header: "Lattice · the slide's depth axis"
footer: "Every layer on this deck names its plane"
---

<!-- _class: title -->

# A slide is a stack, not a sheet

`Six named planes, and a local band inside each occupant`

Everything a reader sees sits on a plane the CSS names out loud.

---

<!-- _class: divider -->

# The planes

---

<!-- _class: cards-stack form watermark finish-savile -->

`THE TWO THAT SINK`

## Canvas is the sheet. Atmosphere sits on it, behind the words.

- Canvas
  - The finish field, a full-bleed photo — whatever is printed on.
- Atmosphere
  - Decoration that belongs behind the copy.

The pinstripes here are canvas. The ghost numeral above them is atmosphere.

---

<!-- _class: cards-stack confidential stamp-seal -->

`THE THREE THAT RISE`

## Chrome frames the slide. Marks stamp it. Alarms interrupt it.

- Chrome
  - Header, footer, page number, logo, progress rail — the frame.
- Marks
  - What is stamped onto a delivered slide.
- Alarms
  - Signals that beat everything, so a break cannot hide.

The seal in the corner is a mark: above this slide's header, footer and page number.

---

<!-- _class: cards-stack -->

`INSIDE AN OCCUPANT`

## A component's internals never touch the slide's planes.

- The local band is 0–9
  - A rail behind a node, a counter over a fill.
- The gap does it
  - Content rests at 0, chrome at 30. The band sits between.

Nothing has to be isolated to hold it there.

---

<!-- _class: decision -->

## Reach for the token, never the number.

- Recommended
  - Give a new section-level element a `--z-*` token where it is declared. The build refuses a bare number.
- Why
  - A raw integer is a decision the next author cannot read. Two have already shipped inverted.

If it can be a direct child of the slide, it names a plane. If it always renders inside something else, it stays in the band.

---

<!-- _class: closing -->

# One number line, read the same way everywhere

Every section is its own stacking context, so a plane means the same thing on slide 1 and slide 40.
