---
marp: true
theme: indaco
paginate: true
header: "Lattice · scatter"
---

<!-- _class: title silent -->

# scatter

`Evidence · Canvas · Series`

An XY plot with real units on both axes — one dot per entity, showing how two measures relate.

---

<!-- _class: scatter -->
<!-- _footer: "Default · scatter" -->

`Annual cost` `Teams adopting`

## The tools we pay most for are the ones nobody adopts.

Cost is the renewal we signed; adoption is the share of teams with a weekly active user.

- Atlas `$420k` `18%`
  - Renewal lands in March
  - Two teams asked to drop it
- Borealis `$310k` `24%`
- Cardinal `$180k` `52%`
- Dovetail `$95k` `61%`
- Everline `$240k` `31%`
- Fathom `$60k` `74%`


---

<!-- _class: scatter bubble -->
<!-- _footer: "bubble · scatter bubble — A third measure sizes each dot by area." -->

`Annual cost` `Teams adopting` `Seats`

## bubble sizes each dot by a third measure.

- Atlas `$420k` `18%` `1200`
- Borealis `$310k` `24%` `640`
- Cardinal `$180k` `52%` `900`
- Dovetail `$95k` `61%` `310`
- Everline `$240k` `31%` `180`
- Fathom `$60k` `74%` `450`


---

<!-- _class: scatter trend -->
<!-- _footer: "trend · scatter trend — A least-squares line through the cloud." -->

`Annual cost` `Teams adopting`

## trend draws the least-squares line through the cloud.

- Atlas `$420k` `18%`
- Borealis `$310k` `24%`
- Cardinal `$180k` `52%`
- Dovetail `$95k` `61%`
- Everline `$240k` `31%`
- Fathom `$60k` `74%`
- Juniper `$400k` `20%`
- Keystone `$88k` `66%`


---

<!-- _class: scatter -->
<!-- stress-slide -->
<!-- _footer: "Stress test · scatter — Twelve entities, four of them inside four points of each other." -->

`Annual cost` `Teams adopting`

## Stress test — twelve tools and a cluster the eye cannot separate.

- Atlas `$420k` `18%`
- Borealis `$310k` `24%`
- Cardinal `$180k` `52%`
- Dovetail `$95k` `61%`
- Everline `$240k` `31%`
- Fathom `$60k` `74%`
- Granite `$182k` `53%`
- Halyard `$178k` `50%`
- Ironwood `$185k` `54%`
- Juniper `$400k` `20%`
- Keystone `$88k` `66%`
- Lantern `$300k` `28%`


---

<!-- _class: scatter dark -->
<!-- _footer: "Composition: dark · scatter dark" -->

`Annual cost` `Teams adopting`

## The tools we pay most for are the ones nobody adopts.

Cost is the renewal we signed; adoption is the share of teams with a weekly active user.

- Atlas `$420k` `18%`
  - Renewal lands in March
  - Two teams asked to drop it
- Borealis `$310k` `24%`
- Cardinal `$180k` `52%`
- Dovetail `$95k` `61%`
- Everline `$240k` `31%`
- Fathom `$60k` `74%`


---

<!-- _class: scatter compact -->
<!-- _footer: "Composition: compact · scatter compact" -->

`Annual cost` `Teams adopting`

## The tools we pay most for are the ones nobody adopts.

Cost is the renewal we signed; adoption is the share of teams with a weekly active user.

- Atlas `$420k` `18%`
  - Renewal lands in March
  - Two teams asked to drop it
- Borealis `$310k` `24%`
- Cardinal `$180k` `52%`
- Dovetail `$95k` `61%`
- Everline `$240k` `31%`
- Fathom `$60k` `74%`


---

<!-- _class: scatter accent -->
<!-- _footer: "Composition: accent · scatter accent" -->

`Annual cost` `Teams adopting`

## The tools we pay most for are the ones nobody adopts.

Cost is the renewal we signed; adoption is the share of teams with a weekly active user.

- Atlas `$420k` `18%`
  - Renewal lands in March
  - Two teams asked to drop it
- Borealis `$310k` `24%`
- Cardinal `$180k` `52%`
- Dovetail `$95k` `61%`
- Everline `$240k` `31%`
- Fathom `$60k` `74%`


---

<!-- _class: cards-stack compact -->
<!-- _footer: "Anti-patterns · scatter" -->

## When NOT to reach for scatter.

- A unitless 2x2 score
  - If the axes are unitless 1-to-10 judgments and the read is which of four named zones an item lands in, use `quadrant`.
- A trend line over a handful of points
  - `scatter trend` refuses a least-squares line under five points. Even at eight it says 'these move together', not 'this predicts'.
- Points closer together than the eye can separate
  - Four tools within four points are four dots inside one dot's width: the ring keeps the overlap visible, but the names travel.
- Time on the x axis
  - A series measured at successive dates is a line, not a cloud — the reader needs the connection between points. Use `line`.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `quadrant` — the axes are unitless scores and the read is which of four named zones
- `matrix-2x2` — items are placed by category, not by coordinate
- `radar` — each entity is rated on more than two measures
- `progress` — one measure per entity, compared as lengths
- `list-tabular` — the exact numbers matter more than the shape of the relationship
