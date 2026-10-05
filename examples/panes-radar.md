---
marp: true
theme: indaco
paginate: true
header: "Lattice · panes"
footer: "Radar in a pane — it lays out for the pane's box"
---

<!-- _class: title silent -->

# A radar lays out for its pane

`Panes · radar sizing`

---

<!-- _class: radar -->

`[{Scale, 0..10}]`

`Vendor review · Scale 0–10`

## Northwind leads on support; Contoso on cost.

- Northwind
  - Coverage `8`
  - Integration `6`
  - Cost `5`
  - Support `9`
  - Speed `7`
- Contoso
  - Coverage `6`
  - Integration `8`
  - Cost `8`
  - Support `5`
  - Speed `6`

— Rim labels 11.4px on this slide; 14px on a slide with no note.

---

`Vendor review · A 35% pane`

## In a narrow pane the key drops below the web.

<!-- _class: columns ratio-35-65 -->
<!-- _pane: radar -->

- Northwind
  - Coverage `8`
  - Integration `6`
  - Cost `5`
  - Support `9`
  - Speed `7`

<!-- _pane: list -->

- Northwind leads on support and speed
- Cost is its weakest axis

— Rim labels 13.9px, up from 6.3px (its 5.1px ticks were under the type floor), and the web grew too.

---

`Vendor review · A 50% pane`

## A half-width pane grows its type as far as the web allows.

<!-- _class: columns -->
<!-- _pane: radar -->

- Northwind
  - Coverage `8`
  - Integration `6`
  - Cost `5`
  - Support `9`
  - Speed `7`
- Contoso
  - Coverage `6`
  - Integration `8`
  - Cost `8`
  - Support `5`
  - Speed `6`

<!-- _pane: list -->

- Northwind wins on support and speed
- Contoso wins on cost and integration

— Rim labels 11.3px, up from 9.0px, for 16% of the web. A pane's web may give up to 25%.

---

`Vendor review · A 65% pane`

## A wide pane reads at the slide's size.

<!-- _class: columns ratio-65-35 -->
<!-- _pane: radar -->

- Northwind
  - Coverage `8`
  - Integration `6`
  - Cost `5`
  - Support `9`
  - Speed `7`
- Contoso
  - Coverage `6`
  - Integration `8`
  - Cost `8`
  - Support `5`
  - Speed `6`

<!-- _pane: list -->

- Support decides it
- Cost is the tie-break

— Rim labels 14.0px, up from 11.0px, for 3% of the web.

---

`Operating review · Long axis names, a 50% pane`

## Resilience is the axis that still lags.

<!-- _class: columns -->
<!-- _pane: radar -->

- This year
  - Operational resilience `5`
  - Customer onboarding `7`
  - Cost predictability `6`
  - Release cadence `8`
  - Security posture `7`
- Last year
  - Operational resilience `4`
  - Customer onboarding `5`
  - Cost predictability `6`
  - Release cadence `6`
  - Security posture `6`

<!-- _pane: list -->

- Resilience moved one point in a year
- Onboarding moved two
- Everything else held or rose

— Rim labels 11.3px, up from 9.0px. Long names wrap at the size the page paints, so none runs into the key.

---

<!-- _class: closing silent -->

# The rim labels are what a radar is read by

`Panes · radar sizing`
