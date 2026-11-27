---
marp: true
theme: indaco
pagination: true
header: "Lattice · scatter"
---

<!-- @meta{layout=title, class=silent} -->

# scatter

`Evidence · Canvas · Series`

An XY plot with real units on both axes — one dot per entity, showing how two measures relate.

---

<!-- @meta{layout=scatter, footer=Default · scatter} -->

`[Annual cost, Teams adopting]`

## The tools we pay most for are the ones nobody adopts.

Cost is the renewal we signed; adoption is the share of teams with a weekly active user.

- Atlas `{$420k, 18%}`
  - Renewal lands in March
  - Two teams asked to drop it
- Borealis `{$310k, 24%}`
- Cardinal `{$180k, 52%}`
- Dovetail `{$95k, 61%}`
- Everline `{$240k, 31%}`
- Fathom `{$60k, 74%}`


---

<!-- @meta{layout=scatter, class=bubble, footer="bubble · scatter bubble — A third measure sizes each dot by area."} -->

`[Annual cost, Teams adopting, Seats]`

## bubble sizes each dot by a third measure.

- Atlas `{$420k, 18%, size=1200}`
- Borealis `{$310k, 24%, size=640}`
- Cardinal `{$180k, 52%, size=900}`
- Dovetail `{$95k, 61%, size=310}`
- Everline `{$240k, 31%, size=180}`
- Fathom `{$60k, 74%, size=450}`


---

<!-- @meta{layout=scatter, class=trend, footer="trend · scatter trend — A least-squares line through the cloud."} -->

`[Annual cost, Teams adopting]`

## trend draws the least-squares line through the cloud.

- Atlas `{$420k, 18%}`
- Borealis `{$310k, 24%}`
- Cardinal `{$180k, 52%}`
- Dovetail `{$95k, 61%}`
- Everline `{$240k, 31%}`
- Fathom `{$60k, 74%}`
- Juniper `{$400k, 20%}`
- Keystone `{$88k, 66%}`


---

<!-- @meta{layout=scatter, footer="Stress test · scatter — Twelve entities, four of them inside four points of each other."} -->
<!-- @meta{stress-slide} -->

`[Annual cost, Teams adopting]`

## Stress test — twelve tools and a cluster the eye cannot separate.

- Atlas `{$420k, 18%}`
- Borealis `{$310k, 24%}`
- Cardinal `{$180k, 52%}`
- Dovetail `{$95k, 61%}`
- Everline `{$240k, 31%}`
- Fathom `{$60k, 74%}`
- Granite `{$182k, 53%}`
- Halyard `{$178k, 50%}`
- Ironwood `{$185k, 54%}`
- Juniper `{$400k, 20%}`
- Keystone `{$88k, 66%}`
- Lantern `{$300k, 28%}`


---

<!-- @meta{layout=scatter, class=dark, footer=Composition: dark · scatter dark} -->

`[Annual cost, Teams adopting]`

## The tools we pay most for are the ones nobody adopts.

Cost is the renewal we signed; adoption is the share of teams with a weekly active user.

- Atlas `{$420k, 18%}`
  - Renewal lands in March
  - Two teams asked to drop it
- Borealis `{$310k, 24%}`
- Cardinal `{$180k, 52%}`
- Dovetail `{$95k, 61%}`
- Everline `{$240k, 31%}`
- Fathom `{$60k, 74%}`


---

<!-- @meta{layout=scatter, class=compact, footer=Composition: compact · scatter compact} -->

`[Annual cost, Teams adopting]`

## The tools we pay most for are the ones nobody adopts.

Cost is the renewal we signed; adoption is the share of teams with a weekly active user.

- Atlas `{$420k, 18%}`
  - Renewal lands in March
  - Two teams asked to drop it
- Borealis `{$310k, 24%}`
- Cardinal `{$180k, 52%}`
- Dovetail `{$95k, 61%}`
- Everline `{$240k, 31%}`
- Fathom `{$60k, 74%}`


---

<!-- @meta{layout=scatter, class=accent, footer=Composition: accent · scatter accent} -->

`[Annual cost, Teams adopting]`

## The tools we pay most for are the ones nobody adopts.

Cost is the renewal we signed; adoption is the share of teams with a weekly active user.

- Atlas `{$420k, 18%}`
  - Renewal lands in March
  - Two teams asked to drop it
- Borealis `{$310k, 24%}`
- Cardinal `{$180k, 52%}`
- Dovetail `{$95k, 61%}`
- Everline `{$240k, 31%}`
- Fathom `{$60k, 74%}`


---

<!-- @meta{layout=cards-grid, class=claim-hero, footer=Anti-patterns · scatter · 1 of 2} -->

## When NOT to reach for scatter.

- A unitless 2x2 score
  - If the axes are unitless 1-to-10 judgments and the read is which of four named zones an item lands in, use `quadrant`.
- A trend line over a handful of points
  - `scatter trend` refuses a least-squares line under five points. Even at eight it says 'these move together', not 'this predicts'.

---

<!-- @meta{layout=cards-grid, class=claim-hero, footer=Anti-patterns · scatter · 2 of 2} -->

## When NOT to reach for scatter.

- Points closer together than the eye can separate
  - Four tools within four points are four dots inside one dot's width: the ring keeps the overlap visible, but the names travel.
- Time on the x axis
  - A series measured at successive dates is a line, not a cloud — the reader needs the connection between points. Use `line`.

---

<!-- @meta{layout=closing, class=silent index} -->

## See also.

`Related components`

- `quadrant` — the axes are unitless scores and the read is which of four named zones
- `matrix-2x2` — items are placed by category, not by coordinate
- `radar` — each entity is rated on more than two measures
- `progress` — one measure per entity, compared as lengths
- `list-tabular` — the exact numbers matter more than the shape of the relationship
