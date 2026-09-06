---
marp: true
theme: indaco
paginate: true
header: "Lattice · waterfall"
---

<!-- _class: title silent -->

# waterfall

`Progression · Canvas · Series`

A bridge from one total to another through signed contributions, each bar starting where the last one ended.

---

<!-- _class: waterfall -->
<!-- _footer: "Default · waterfall" -->

`FY26 plan · actual`

## Price paid for the volume we lost.

- Plan `12.0M`
- Price `+1.4M`
  - Two list-price rises, both held
- Volume `-0.8M`
- Mix `-0.6M`
- FX `-0.3M`
- Cost base `-1.9M`
- Actual `9.8M`


---

<!-- _class: waterfall zoom -->
<!-- _footer: "zoom · waterfall zoom — Re-bases the axis on the walk itself and tears the anchors it clips. For a compressed bridge — a 12.0M to 9.8M walk moved by steps of a few hundred thousand — where the zero-based default spends most of the plot on the two anchors and renders every driver as a hairline. Opt-in, because a silently re-based axis is the truncated-axis lie; the tear is what makes it honest." -->

`FY26 · cash`

## The drivers are the story, so the anchors are cut.

- Opening cash `12.0M`
- Price `+0.3M`
- Volume `-0.4M`
- Mix `-0.2M`
- Cost base `-1.9M`
- Closing cash `9.8M`


---

<!-- _class: waterfall -->
<!-- stress-slide -->
<!-- _footer: "Stress test · waterfall — Eight bars, a mid-walk subtotal, a step that takes the running total below zero and back, and a level authored as a negative — the geometries that break a naive bridge." -->

## The quarter we went negative and came back.

- Opening cash `2.4M`
- Receipts `+3.1M`
- Payroll `-2.9M`
- Tax settlement `-4.2M`
- Trough `-1.6M` `total`
- Facility draw `+5.0M`
- Working capital `-0.9M`
- Closing cash `2.5M`


---

<!-- _class: waterfall dark -->
<!-- _footer: "Composition: dark · waterfall dark" -->

`FY26 plan · actual`

## Price paid for the volume we lost.

- Plan `12.0M`
- Price `+1.4M`
  - Two list-price rises, both held
- Volume `-0.8M`
- Mix `-0.6M`
- FX `-0.3M`
- Cost base `-1.9M`
- Actual `9.8M`


---

<!-- _class: waterfall compact -->
<!-- _footer: "Composition: compact · waterfall compact" -->

`FY26 plan · actual`

## Price paid for the volume we lost.

- Plan `12.0M`
- Price `+1.4M`
  - Two list-price rises, both held
- Volume `-0.8M`
- Mix `-0.6M`
- FX `-0.3M`
- Cost base `-1.9M`
- Actual `9.8M`


---

<!-- _class: waterfall accent -->
<!-- _footer: "Composition: accent · waterfall accent" -->

`FY26 plan · actual`

## Price paid for the volume we lost.

- Plan `12.0M`
- Price `+1.4M`
  - Two list-price rises, both held
- Volume `-0.8M`
- Mix `-0.6M`
- FX `-0.3M`
- Cost base `-1.9M`
- Actual `9.8M`


---

<!-- _class: cards-stack compact -->
<!-- _footer: "Anti-patterns · waterfall" -->

## When NOT to reach for waterfall.

- Independent magnitudes with no running total
  - Revenue by region, spend by department, five metrics side by side — nothing accumulates, so the floating geometry is a lie. Use `bar`.
- Parts of one total, all positive
  - A decomposition where every contribution is a positive share of one whole is a stack, not a walk: use `stacked-bar`, or `piechart` if there is only one total. A waterfall's whole apparatus — the sign, the two semantic hues, the connectors — buys you nothing when nothing goes down.
- A monotonic pipeline that narrows
  - Visitors to signups to paid is a subset at every stage, not a set of signed contributions. Use `funnel`, whose taper IS the conversion rate.
- Drivers that are 1% of the anchors
  - A walk from 12.0M to 11.9M via steps of 20k gives you two full-height anchors and a row of hairlines. The chart is not wrong, but the picture says 'nothing happened' — which may be the finding, in which case say it in a `big-number`, or drop the anchors and plot the drivers alone as a diverging `bar`.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `bar` — the categories are independent magnitudes with no running total, or you want the drivers alone without the anchors
- `stacked-bar` — the contributions are all positive parts of one total rather than signed changes to it
- `funnel` — each stage is a subset of the one before and the drop-off rate is the story
- `big-number` — the net movement is the whole point and the drivers are not worth a slide
- `line` — the total moved over time and you want the shape of the path, not the attribution
