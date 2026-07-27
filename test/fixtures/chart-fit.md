---
marp: true
theme: indaco
paginate: true
---

<!-- _class: title -->

# Chart fit fixture

Stress shapes for `tools/check-chart-fit.js` — every slide here must render with
its chart INSIDE the stage clip. These are the shapes that actually broke:
series counts around the row-wrap boundary, a name long enough to wrap the
caption band, and a below-note eating the stage.

---

<!-- _class: radar small-multiples -->

## Two series — the widest cell.

- Atlas
  - Speed `8`
  - Cost `6`
  - Risk `7`
- Beacon
  - Speed `5`
  - Cost `9`
  - Risk `4`

---

<!-- _class: radar small-multiples -->

## Four series — the four-up row the pad was tuned for.

- Atlas
  - Speed `8`
  - Cost `6`
  - Risk `7`
- Beacon
  - Speed `5`
  - Cost `9`
  - Risk `4`
- Cinder
  - Speed `7`
  - Cost `4`
  - Risk `8`
- Drift
  - Speed `6`
  - Cost `7`
  - Risk `5`

---

<!-- _class: radar small-multiples -->

## Six series with a wrapping name and a below-note.

- Northwind Logistics and Distribution Group
  - Speed `8`
  - Cost `6`
  - Risk `7`
- Atlas
  - Speed `5`
  - Cost `9`
  - Risk `4`
- Beacon
  - Speed `7`
  - Cost `4`
  - Risk `8`
- Cinder
  - Speed `6`
  - Cost `7`
  - Risk `5`
- Drift
  - Speed `4`
  - Cost `8`
  - Risk `6`
- Ember
  - Speed `9`
  - Cost `5`
  - Risk `3`

*A below-note, because the stage the row has to fit shrinks when one is present —
that is what tipped 5–8 series into clipping.*

---

<!-- _class: radar small-multiples -->

## Nine series — the far end of the grid.

- Atlas
  - Speed `8`
  - Cost `6`
  - Risk `7`
- Beacon
  - Speed `5`
  - Cost `9`
  - Risk `4`
- Cinder
  - Speed `7`
  - Cost `4`
  - Risk `8`
- Drift
  - Speed `6`
  - Cost `7`
  - Risk `5`
- Ember
  - Speed `4`
  - Cost `8`
  - Risk `6`
- Flint
  - Speed `9`
  - Cost `5`
  - Risk `3`
- Garnet
  - Speed `3`
  - Cost `7`
  - Risk `9`
- Harbor
  - Speed `8`
  - Cost `3`
  - Risk `5`
- Iris
  - Speed `6`
  - Cost `6`
  - Risk `6`

---

<!-- _class: word-cloud -->

## A word cloud, whose key sits in the rail here and below the cloud at portrait.

- execution `5`
- discipline `4.5`
- velocity `4`
- talent `3`
- risk `2`
- cadence `1`
