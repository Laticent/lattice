---
marp: true
theme: indaco
paginate: true
logo: ../lib/base/_logo/acme-logo.svg
header: "Lattice · the marker corner"
meta: Marker corner · four occupants
---

<!-- _class: title -->

# The corner holds four things.

`Marker corner · stamp, clip tab, legibility tab, logo`

Every one of them wants the slide's top-right. This deck renders the collision, because the arithmetic that keeps them apart has been wrong four times and every version of it passed CI.

---

<!-- _class: content -->

`The occupants`

## Three are engine chrome. The fourth is yours.

- The status stamp
  - `confidential` and its shape variants paint on the section's own `::before`, flush to the corner.
- The clip tab
  - The overflow marker, reserving a row below whichever stamp is present.
- The legibility tab
  - The type-floor alarm, one row below the clip tab. Authoring only.
- The deck logo
  - The author's mark, at the frame inset — inside the tabs' band.

The first three have engine-owned geometry. The fourth does not.

---

<!-- _class: split-panel -->

`One marker, one logo`

## Quarterly program review for the regional distribution network and its downstream partners across four operating territories, with a trailing clause that pushes this heading well past what the panel can hold

The panel below can no longer contain the copy it has been handed, so the export tags the slide and the clip tab is drawn. It stacks to the **left** of the mark rather than under it.

- Throughput
  - Median order-to-dock time fell from 41 hours to 26 hours.
- Cost
  - Unit handling cost is down 12% year over year.

---

<!-- _class: split-panel confidential -->

`The reported defect`

## Quarterly program review for the regional distribution network and its downstream partners across four operating territories, with a trailing clause that pushes this heading well past what the panel can hold

The stamp reserves a row, which used to land the clip tab at y 23–46 — inside a mark occupying y 24–75. The tab is opaque, so it cut the top off the logo.

- Throughput
  - Median order-to-dock time fell from 41 hours to 26 hours.
- Cost
  - Unit handling cost is down 12% year over year.

---

<!-- _class: content -->

`Why sideways`

## Clearing the mark downward would put chrome in the body.

Stacking the tab below the logo needs about eighty pixels of drop, which lands a marker a third of the way into the slide — where no component expects it. Horizontal keeps every occupant inside the top band, so nothing has to rule on whether a transient marker outranks permanent branding.

`logo:` plus `confidential` is close to the modal delivered board deck, and this is the reader register: the one the whole marker feature exists to serve.

---

<!-- _class: content -->

`Releasing the corner`

## A repositioned logo gives the space back.

- `logo-x` and `logo-y` together
  - Move the mark and switch it to left-anchoring. The corner is free, so the tabs reclaim the full width.
- `logo-scale`
  - Multiplies the mark's box. The reserve is written from the same tokens, so the two cannot drift.

Every logo injector stamps `data-logo-corner`, and only when the mark is left where it lands by default.

---

<!-- _class: closing -->

## The corner is a stack, and the geometry owns the arithmetic.

`Four occupants · one reserve each`

A fifth occupant needs one edit, in the block that already holds the arithmetic.
