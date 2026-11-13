---
marp: true
theme: cuoio
paginate: true
header: "Lattice · Anchor chrome"
footer: "Confidential · © 2026 Acme"
progress-rail: on
---

<!-- _class: title -->

`Lattice · Feature deck`

# What stays on a stage slide

The title names the deck, so the running header steps back. The confidential line stays.

---

<!-- _class: agenda -->

## Three parts, one rule

1. Which bands stay
2. Where the marker sits
3. How to override

---

<!-- _class: divider -->

`Part one`

## Which bands stay

---

## A band stays unless the slide already does its job

- The header says which deck this is, so only the title drops it
- The footer is the deck's standing note, so every anchor keeps it
- The page number gives way to the divider's marker and the topic's track
- The logo says whose deck it is, so it stays everywhere

---

<!-- _class: divider light -->

`Part two`

## Where the marker sits

---

## The marker teaches where to look

- A divider draws its section marker where the rail will be
- By default that is the bottom-right corner, where the page number sits
- `progress-rail: center` moves both to the middle of the footer band
- `progress-rail: edge` stands the marks upright on the right edge

---

<!-- _class: divider numbered -->

`Part three`

## How to override

---

<!-- _class: topic -->

## One slide at a time

Every band is a switch, so one anchor brings a band back with `with-header`, and drops one with `no-footer`.

---

## The overrides are the switches you already have

- `divider no-footer` drops the note on one divider
- `title with-header` brings the header back on the cover
- `class: no-footer` in front matter drops it on every slide

---

<!-- _class: closing -->

## Thank you

The footer above is the same on every slide in this deck.
