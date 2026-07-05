---
marp: true
theme: indaco
paginate: true
header: "Lattice · logo-wall"
---

<!-- _class: title silent -->

# logo-wall

`Inventory · Grid · Prose`

A grid of customer, partner, or funder logos as social proof.

---

<!-- _class: logo-wall -->
<!-- _footer: "Default · logo-wall" -->

`inventory · logo-wall`

## The logo wall seats the marks with captions.

- ![Acme](acme.svg)
  - Acme
  - `Series B`
- ![Globex](globex.svg)
  - Globex
  - `Enterprise`
- ![Vantage](vantage.svg)
  - Vantage
  - `Public`
- ![Umbra](umbra.svg)
  - Umbra
  - `Series C`
- ![Meridian](meridian.svg)
  - Meridian
  - `Seed`
- ![Helios](helios.svg)
  - Helios
  - `Public`
- ![Northwind](northwind.svg)
  - Northwind
  - `Anchor`
- ![Cobalt](cobalt.svg)
  - Cobalt
  - `Series A`


---

<!-- _class: logo-wall color -->
<!-- _footer: "color · logo-wall color — Marks keep their brand hues." -->

`logo-wall color`

## color lets the marks keep their brands.

- ![Acme](acme.svg)
- ![Globex](globex.svg)
- ![Initech](initech.svg)
- ![Umbra](umbra.svg)
- ![Vantage](vantage.svg)
- ![Meridian](meridian.svg)
- ![Helios](helios.svg)
- ![Northwind](northwind.svg)


---

<!-- _class: logo-wall dense -->
<!-- _footer: "dense · logo-wall dense — Six columns for the long roster." -->

`logo-wall dense`

## dense packs the long roster, captions off.

- ![Acme](acme.svg)
- ![Globex](globex.svg)
- ![Initech](initech.svg)
- ![Umbra](umbra.svg)
- ![Vantage](vantage.svg)
- ![Meridian](meridian.svg)
- ![Helios](helios.svg)
- ![Northwind](northwind.svg)
- ![Cobalt](cobalt.svg)
- ![Sable](sable.svg)
- ![Quanta](quanta.svg)
- ![Lumen](lumen.svg)


---

<!-- _class: logo-wall dark -->
<!-- _footer: "Composition: dark · logo-wall dark" -->

`inventory · logo-wall`

## The logo wall seats the marks with captions.

- ![Acme](acme.svg)
  - Acme
  - `Series B`
- ![Globex](globex.svg)
  - Globex
  - `Enterprise`
- ![Vantage](vantage.svg)
  - Vantage
  - `Public`
- ![Umbra](umbra.svg)
  - Umbra
  - `Series C`
- ![Meridian](meridian.svg)
  - Meridian
  - `Seed`
- ![Helios](helios.svg)
  - Helios
  - `Public`
- ![Northwind](northwind.svg)
  - Northwind
  - `Anchor`
- ![Cobalt](cobalt.svg)
  - Cobalt
  - `Series A`


---

<!-- _class: logo-wall compact -->
<!-- _footer: "Composition: compact · logo-wall compact" -->

`inventory · logo-wall`

## The logo wall seats the marks with captions.

- ![Acme](acme.svg)
  - Acme
  - `Series B`
- ![Globex](globex.svg)
  - Globex
  - `Enterprise`
- ![Vantage](vantage.svg)
  - Vantage
  - `Public`
- ![Umbra](umbra.svg)
  - Umbra
  - `Series C`
- ![Meridian](meridian.svg)
  - Meridian
  - `Seed`
- ![Helios](helios.svg)
  - Helios
  - `Public`
- ![Northwind](northwind.svg)
  - Northwind
  - `Anchor`
- ![Cobalt](cobalt.svg)
  - Cobalt
  - `Series A`


---

<!-- _class: list -->
<!-- _footer: "Anti-patterns · logo-wall" -->

## When NOT to reach for logo-wall.

- **Names that need a sentence.** If each entity needs a role, a quote, or a metric beside it, this is the wrong layout. Use `actors` (who owns what), `cards-grid` (a short body per item), or `quote` (a single testimonial).
- **Logos nobody recognises.** A wall of unknown marks proves nothing and asks the audience to squint. If the names don't carry on sight, state the count as a `big-number` ('400+ teams') instead.
- **Mismatched raster art.** The mark is rendered as a silhouette (a CSS mask / inline SVG), so it must be clean vector with real transparency — a raster PNG or a logo whose negative space is a white fill won't read. Source SVG marks drawn as filled shapes; color is supplied by the palette token, not the file.

---

<!-- _class: closing silent -->

## See also.

`Related components`

- `actors` — each named entity owns a responsibility, not just lends its logo
- `cards-grid` — each item needs a line of body text, not just a mark
- `big-number` — the proof is a count ('400+ teams'), not the individual marks
- `quote` — one customer's testimonial carries the slide
- `image` — a single visual, not a grid of marks, is the evidence
