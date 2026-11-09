---
marp: true
theme: indaco
paginate: true
header: "Lattice · Agenda page numbers"
footer: "Acme · release review"
---

<!-- _class: title -->

`Lattice · Feature deck`

# Page numbers that name their section.

A filled agenda prints where each section starts, and only when every line still names it.

---

<!-- _class: agenda -->

## Three parts, in order.

---

<!-- _class: divider -->
<!-- _header: '' -->

`Section 01`

## Ship only after `npm test`

---

<!-- _class: list -->

## The agenda you just saw kept every number.

- The first section's heading ends in inline code, `npm test`
- That code is part of the heading's name, not a page reference
- So the line keeps its number, and so does every other line

---

<!-- _class: divider -->
<!-- _header: '' -->

`Section 02`

## What changed since the last release

---

<!-- _class: agenda agenda-pages -->

## The same list, reordered by hand: no numbers.

1. What changed since the last release
2. Ship only after `npm test`
3. What we ask the room to approve

---

<!-- _class: list -->

## Why the reordered agenda shows no page numbers.

- An exported deck carries the filled list and its `agenda-pages` marker
- Reorder or rename a line there, and the count still matches
- Each number would then point at the wrong section, so none print

---

<!-- _class: divider -->
<!-- _header: '' -->

`Section 03`

## What we ask the room to approve

---

<!-- _class: closing -->
<!-- _header: '' -->

## A number only where it names the section.

The filled agenda reads p.3, p.5 and p.8; the reordered copy reads none.
