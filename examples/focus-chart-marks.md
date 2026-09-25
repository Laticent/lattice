---
marp: true
theme: indaco
paginate: true
footer: "Laticent · focus on a chart mark"
---

<!-- _class: title silent -->

# Point at one bar, not the whole chart.

`Feature · _focus: mark · _focus: series`

A chart slide usually has one number that matters. `_focus: mark 3` names that bar, wedge or funnel band. `_focus: series 2` names one line. The rest of the chart recedes, and the look survives PDF and PPTX.

---

<!-- _class: divider -->

## The chart already knows its marks. Now the deck can name one.

Every chart stamps each mark with its place. `_focus` reads that address, so there is nothing to tag by hand, and the same line works on every chart that has marks.

---

<!-- _class: bar -->
<!-- _focus: mark 3 -->

## EMEA is where the quarter was won.

- North America `$4.1M`
- LATAM `$1.2M`
- EMEA `$6.8M`
- APAC `$2.9M`

---

<!-- _class: bar -->
<!-- _focus: mark 3 -->
<!-- _focusStyle: ring -->

## `ring` keeps every bar at full strength and edges the one that matters.

- North America `$4.1M`
- LATAM `$1.2M`
- EMEA `$6.8M`
- APAC `$2.9M`

---

<!-- _class: piechart -->
<!-- _focus: mark 2 -->

## A fifth of the hours went to meetings about meetings.

- Deck production `46%`
- Meetings about meetings `22%`
- Realigning on priorities `18%`
- Stakeholder management `9%`
- Actually deciding `5%`

---

<!-- _class: funnel -->
<!-- _focus: mark 3 -->

## SMB deals stall at the proposal.

- Qualified leads `12,400`
- Demo held `3,100`
- Proposal sent `870`
- Signed `214`

---

<!-- _class: line -->
<!-- _focus: series 3 -->

## Services grew into the gap enterprise left.

- Q1 2025
  - Enterprise `4.1`
  - Mid-market `2.6`
  - Services `1.2`
- Q2 2025
  - Enterprise `4.4`
  - Mid-market `2.9`
  - Services `1.6`
- Q3 2025
  - Enterprise `4.2`
  - Mid-market `3.4`
  - Services `2.3`
- Q4 2025
  - Enterprise `3.8`
  - Mid-market `3.9`
  - Services `3.1`
- Q1 2026
  - Enterprise `3.6`
  - Mid-market `4.3`
  - Services `4.0`

---

<!-- _class: closing -->

## One line names the mark.

`_focus: mark N · _focus: series N · _focusStyle: ring`

Ordinals count from 1, in the order the list is written. A slide with no chart ignores the axis, and the linter flags a misspelled one.
