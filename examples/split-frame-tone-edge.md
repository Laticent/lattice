---
marp: true
theme: indaco
paginate: true
header: "Lattice · split frames + tone-edge"
---

<!-- A semantic `tone-edge` recolors the slide's top bar. A split frame's bar is its own ribbon, so
     the tone color recolors the supporting-zone segment and the frame keeps ONE bar -- as `accent`
     does. Before the fix a full-width tone border sat above the ribbon and the bar read doubled. -->

<!-- _class: title silent -->

`A fix demo`

# One bar, in the tone's color

`split-panel` and `split-compare` with `tone-edge`: the tone replaces the ribbon, it does not stack on it.

---

<!-- _class: split-panel -->

`Control`

## No tone: the deck's ribbon

The bar across the supporting zone is the deck spectrum.

- Reference
  - This is what one bar looks like.
- Compare against
  - The next slides must show the same bar height.

---

<!-- _class: split-panel tone-pass tone-edge -->

`Pass`

## Tone pass recolors the ribbon

The supporting zone's bar is the pass color. There is no second bar above it.

- On track
  - One bar, tone-colored.
- No doubling
  - Same height as the control.

---

<!-- _class: split-panel tone-fail tone-edge -->

`Fail`

## Tone fail, same rule

The failure color carries the edge.

- Off track
  - One bar, fail-colored.
- Same height
  - As the control slide.

---

<!-- _class: split-compare -->

`Control`

## Compare, no tone

Reference bar for the compare frame.

- Option A
  - a1
  - a2
- Option B
  - b1
  - b2

> The deck's ribbon is the bar.

---

<!-- _class: split-compare tone-warn tone-edge -->

`Warn`

## Compare with a warn edge

The supporting zone's bar is the warn color.

- Option A
  - a1
  - a2
- Option B
  - b1
  - b2

> One bar, tone-colored, same height as the control.
