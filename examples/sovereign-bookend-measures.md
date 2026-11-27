---
marp: true
theme: indaco
pagination: true
header: "Lattice · Sovereign bookend measures"
---

<!-- @meta{layout=title, header="", footer=Heading measure · title} -->



# A measure counts characters, not slide width

`Measure · #1303`

Sixteen em, about thirty-three characters — the default heading measure.

---

<!-- @meta{layout=divider, header="", footer=Heading measure · divider} -->



`Section 01 · The defect`

## The old cap bound on every divider slide it was measured on

---

<!-- @meta{layout=content, footer=What changed · content} -->


`Diagnosis · Units`

## A fraction of the slide is not a count of characters.

The two agree only while the type size holds still — and it doesn't. Lattice curates `--fs-*` per orientation, so one `cqi` cap allowed about 22 characters per line on landscape and 12 on portrait.

- `--measure-bookend-heading` — `16em`, about 33 characters
- `--measure-bookend-lede` — `26em`, about 56 characters
- Both overridable from front-matter `style:`

---

<!-- @meta{layout=divider, class=subsection light, header="", footer=Lede measure · divider light} -->



`Section 02 · The lede`

## A subtitle takes the reading measure, not the frame

The frame alone would allow roughly ninety characters on one line, well past the point where the eye loses the line return.

---

<!-- @meta{layout=closing, class=index, header="", footer=List rows · closing index} -->



## Where the measure is written down.

`Reference`

- `typography` — section 8 defines measure alongside size
- `base.docs` — the two tokens, under the headline register
- `decision` — the measurement, and why landscape moved

---

<!-- @meta{layout=closing, header="", footer=Heading and lede · closing} -->



## Balance decides the breaks; the measure decides the width

`Closing`

Widening a cap to cure an orphaned last word only moves the orphan, and buys a longer line for nothing.
