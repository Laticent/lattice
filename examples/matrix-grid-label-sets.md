---
marp: true
theme: indaco
paginate: true
header: "Lattice · matrix-grid label sets"
---

<!-- _class: title silent -->

# The key that existed for screen readers only.

`Label sets · matrix-grid · and the one shape that gets no name`

This grid's shape vocabulary shipped in a map whose words reached a screen
reader and nobody looking at the slide. The key now draws them — and refuses to
draw one of them, on purpose.

---

<!-- _class: matrix-grid -->
<!-- _footer: "Derived · two shapes named, one deliberately not" -->

`[Wider reach, Deeper cognition]`

## Your level is a cell, not a rung.

| Verb       | Self       | Team       | Org       |
| ---------- | :--------: | :--------: | :-------: |
| Create     | [ ]        | [-]        | [x] Staff |
| Apply      | [-]        | [x] Senior | [-]       |
| Remember   | [x] Junior | [-]        | [ ]       |

---

<!-- _class: matrix-grid -->
<!-- _footer: "Why [x] has no key row" -->

`[Wider reach, Deeper cognition]`

## A filled cell already says what it is.

| Verb       | Self       | Team       | Org       |
| ---------- | :--------: | :--------: | :-------: |
| Create     | [ ]        | [-]        | [x] Staff |
| Apply      | [-]        | [x] Senior | [-]       |

Its own trailing text is its label — Staff, Senior. A key row reading "filled"
would repeat that on every slide, worse.

---

<!-- _class: matrix-grid -->
<!-- _footer: "Overridden · a coverage grid wants other words" -->

`[Wider market, Deeper product]`

## The same grid, for market coverage.

| Segment    | Direct     | Partner    | Self-serve  |
| ---------- | :--------: | :--------: | :---------: |
| Enterprise | [x] Core   | [-]        | [ ]         |
| Mid-market | [-]        | [x] Core   | [-]         |
| SMB        | [ ]        | [-]        | [x] Core    |

`[{[-], within reach}, {[ ], out of band}]`

---

<!-- _class: matrix-grid -->
<!-- _footer: "Derived · a grid of only filled cells needs no key" -->

`[Wider reach, Deeper cognition]`

## No key when there is nothing to decode.

| Verb     | Self        | Team       |
| -------- | :---------: | :--------: |
| Apply    | [x] Senior  | [x] Staff  |
| Remember | [x] Junior  | [x] Mid    |

Every cell labels itself, so the grid draws no key at all.

---

<!-- _class: list -->
<!-- _footer: "What the label set changed here" -->

## What changed.

- The shape words now reach the slide, not just the screen reader
- Only the shapes actually present get a row
- Two shapes are keyable; the filled one is refused, with a reason
- The refusal is declared in the manifest, so the deck lint can explain it
- Two code spans in one paragraph are still the axis names, not a label set
