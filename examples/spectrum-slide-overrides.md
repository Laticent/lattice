---
marp: true
theme: indaco
spectrum: duo
paginate: true
header: "Lattice · spectrum overrides"
---

<!-- The deck sets `spectrum: duo`, so every slide carries the blue-to-green bar. A slide that
     makes its own explicit choice -- `accent`, or a semantic tone with `tone-edge` -- keeps its
     own bar, as it does in a default-rainbow deck. -->

<!-- _class: title silent -->

`A fix demo`

# The deck's spectrum, and the slide's own say

`spectrum: duo` is the deck-wide default. An explicit per-slide bar wins over it.

---

<!-- _class: content -->

## A plain slide carries the deck's duo bar

- Nothing on this slide asks for another bar.
- The gradient above is the deck's style.

---

<!-- _class: content accent -->

## An accent slide keeps its single stripe

- `accent` signals "this is the point".
- The bar above is the solid accent, not the duo gradient.

---

<!-- _class: content tone-pass tone-edge -->

## A pass keeps its green

- `tone-pass tone-edge` recolors the bar with the tone.

---

<!-- _class: content tone-fail tone-edge -->

## A fail keeps its red

- Status is information. A gradient cannot say "fail".

---

<!-- _class: content tone-edge -->

## A tone-edge with no tone keeps the duo bar

- With no semantic tone there is nothing to recolor, so the deck's style stays.
