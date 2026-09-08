---
marp: true
theme: indaco
paginate: true
logo: ../lib/base/_logo/acme-logo.svg
header: "Lattice · the marker corner"
meta: Marker corner · who stays, who moves
---

<!-- _class: title -->

# The corner held four things. Now it holds two.

`Marker corner · stamp, logo, and the band below the bar`

Four absolutely-positioned boxes wanted the slide's top-right, and the arithmetic that kept them apart was wrong four times. This deck renders the answer: the two that were transient moved out.

---

<!-- _class: content -->

`The occupants`

## Two are permanent. Two were passing through.

- The status stamp
  - Paints on the section's own `::before`, flush to the corner. It ships in the export.
- The deck logo
  - The author's mark, at the frame inset. Its geometry belongs to them.
- The clip tab
  - Drawn because a slide is broken. It leaves when the slide is fixed.
- The legibility tab
  - The type-floor alarm, one row below the clip tab.

The first two stay. The last two berth under the bar.

---

<!-- _class: split-panel confidential -->

`One marker, one stamp, one logo`

## Quarterly program review for the regional distribution network and its downstream partners across four operating territories, with a trailing clause that pushes this heading well past what the panel can hold

The panel below can no longer contain the copy it has been handed, so the export tags the slide. The pill hangs from the middle of the bar; the stamp and the mark keep the corner, and neither displaces it by a pixel.

- Throughput
  - Median order-to-dock time fell from 41 hours to 26 hours.
- Cost
  - Unit handling cost is down 12% year over year.

---

<!-- _class: split-panel confidential stamp-notch -->

`The one shape that still reserves`

## Quarterly program review for the regional distribution network and its downstream partners across four operating territories, with a trailing clause that pushes this heading well past what the panel can hold

`stamp-notch` is the one shape that paints across the middle of the top edge, so it is the one shape the pill still has to clear. It drops a single row, measured against the tab's own height rather than a magic number.

- Throughput
  - Median order-to-dock time fell from 41 hours to 26 hours.
- Cost
  - Unit handling cost is down 12% year over year.

---

<!-- _class: content -->

`Why the marker moved instead`

## The corner had four claimants and the engine owned three.

Every earlier fix asked how far the marker should drop to clear whatever was above it. That question was answered wrong four times — once by pushing 21 class names a fixed row when the shapes sat at three different heights, once by a unitless `calc()` that discarded the whole transform, once by a reserve that landed the tab inside the mark it was written to clear.

Two of the four claimants are transient by definition. Moving those two stops the arithmetic instead of re-deriving it.

---

<!-- _class: content confidential stamp-notch -->

`The whole stamp vocabulary`

## Fourteen shapes, and one of them still has to be cleared.

- Anchored right
  - `tab`, `flag` and `pin` at the corner; six more sit lower. None reaches the middle.
- Full width
  - `notch` is a hairline band across the top edge — the one reserve left, shown on page 4.
- Full bleed
  - `mark` and `veil` cover the tab on purpose, from the plane above.

Forgetting a reserve is now safe for every shape that does not cross the middle.

---

<!-- _class: closing -->

## The band under the bar is empty by construction, and that is why it was chosen.

`Two occupants · one reserve`

The stamp used to reserve a row, which landed the clip tab at y 23–46 inside a mark occupying y 24–75, opaque, cutting the top off the logo. A slide pads `6.875cqi` at the block start, so nothing in flow can paint in the band below the bar — and `top: 0` resolves against the padding box, so flush stays flush with no token to keep in step.
