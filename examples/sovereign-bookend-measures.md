---
marp: true
theme: indaco
paginate: true
header: "Lattice · Sovereign bookend measures"
---

<!-- _class: title -->
<!-- _header: '' -->
<!-- _paginate: false -->
<!-- _footer: "Heading measure · title" -->

# A measure counts characters, not slide width

`Measure · #1303`

Sixteen em, about thirty-three characters — the default heading measure.

---

<!-- _class: divider -->
<!-- _header: '' -->
<!-- _paginate: false -->
<!-- _footer: "Heading measure · divider" -->

`Section 01 · The defect`

## The old cap bound on every divider slide it was measured on

---

<!-- _class: content -->
<!-- _footer: "What changed · content" -->

`Diagnosis · Units`

## A fraction of the slide is not a count of characters.

The two agree only while the type size holds still — and it doesn't. Lattice curates `--fs-*` per orientation, so one `cqi` cap allowed about 22 characters per line on landscape and 12 on portrait.

- `--measure-bookend-heading` — `16em`, about 33 characters
- `--measure-bookend-lede` — `26em`, about 56 characters
- Both overridable from front-matter `style:`

---

<!-- _class: divider light -->
<!-- _header: '' -->
<!-- _footer: "Lede measure · divider light" -->

`Section 02 · The lede`

## A subtitle takes the reading measure, not the frame

The frame alone would allow roughly ninety characters on one line, well past the point where the eye loses the line return.

---

<!-- _class: closing index -->
<!-- _header: '' -->
<!-- _paginate: false -->
<!-- _footer: "List rows · closing index" -->

## Where the measure is written down.

`Reference`

- `typography` — section 8 defines measure alongside size
- `base.docs` — the two tokens, under the headline register
- `decision` — the measurement, and why landscape moved

---

<!-- _class: closing -->
<!-- _header: '' -->
<!-- _paginate: false -->
<!-- _footer: "Heading and lede · closing" -->

## Balance decides the breaks; the measure decides the width

`Closing`

Widening a cap to cure an orphaned last word only moves the orphan, and buys a longer line for nothing.
