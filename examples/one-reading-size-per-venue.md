---
marp: true
theme: indaco
paginate: true
header: "Lattice · one reading size per venue"
---

<!-- _class: title silent -->

# Every list, card and table now reads at one size.

`typography · one reading size per venue`

---

<!-- _class: list takeaway -->

`list takeaway · was 21pt`

## A takeaway row reads at the body size now.

- Rows used to sit a full step above card text.
- The venue scaled them, but never brought them in line.
- Now a row, a card and a cell match on every slide.
- A list at laptop holds twice the rows it did.

> A reader's eye no longer has to re-focus between slides.

---

<!-- _class: cards-grid three -->

`cards-grid · was 16pt, unchanged`

## Card bodies set the size everything else now meets.

- Lists come down.
  - From 21pt to 16pt, so a list holds more rows.
- Tables come up.
  - From 13.5pt to 16pt, so a cell reads from farther away.
- Cards stay put.
  - They were already at the reading size.

> The body role, `--fs-body`, is the one reading size.

---

<!-- _class: list-tabular -->

`list-tabular · was 13.5pt`

## A tabular row reads at the same size as a card.

1. Laptop
   - 16pt, for a PDF read on your own screen.
2. Huddle
   - 18.4pt, for four to six people around a TV.
3. Conference
   - 20.8pt, for a room of ten to thirty.
4. Hall
   - 24.0pt, for a stage screen.

> The venue multiplies one size instead of three.

---

<!-- _class: table -->

`table · was 13.5pt`

## A table cell now reads at the body size too.

| Venue | Reading text | Code | Table rows at 12 words |
| --- | --- | --- | --- |
| Laptop | 16pt | 13.5pt | 10 |
| Huddle | 18.4pt | 15.5pt | 8 |
| Conference | 20.8pt | 20.1pt | 7 |
| Hall | 24.0pt | 23.0pt | 3 |

> Bigger cells cost rows: split a long table instead of shrinking it.

---

<!-- _class: glossary -->

`glossary · was 13.5pt`

## Glossary

- Reading text
  - Text read line by line, several items to a slide.
- Display text
  - One sentence or number that is the slide, set bigger on purpose.
- Venue
  - The room a deck is shown in, which sets one multiplier for all type.
- Exception
  - A component that keeps its own size, named in the decision note.

---

<!-- _class: code -->

`code · stays at 13.5pt`

## Code keeps one step down, because it cannot wrap.

```js
// A code line that wraps changes what it says, so code keeps
// its column budget: about 102 columns at laptop.
const reading = venueScale * FS_BODY;         // 16pt at laptop
const code = venueScale * FS_BODY_COMPACT;    // 13.5pt at laptop
```

> Code is the one reading exception, by the owner's ruling.

---

<!-- _class: closing -->

# One reading size, in every room.

`typography.md §7 · one reading size`
