---
marp: true
theme: indaco
paginate: true
header: "Lattice · line motion"
motion: on
---

<!-- _class: title silent -->

# A plain line chart builds, too.

`Anima · line · plain charts`

Set `motion: on` once and every line chart in the deck draws itself in: first
the lines, then their points, then the words. It used to skip any line chart
that had no detail bullets. The exported PDF is unchanged.

---

<!-- _class: line -->
<!-- _footer: "Default build · no detail bullets on this chart" -->

`Revenue by segment · $M`

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
- Q2 2026
  - Enterprise `3.5`
  - Mid-market `4.6`
  - Services `5.2`

---

<!-- _class: line area -->
<!-- _footer: "area · one series, and the fill builds with it" -->

`Cash on hand · months of runway`

## Cash never dipped below one quarter of runway.

- Jan `8.2`
- Feb `7.6`
- Mar `6.9`
- Apr `7.4`
- May `8.8`
- Jun `9.6`

---

<!-- _class: line step motion-together -->
<!-- _footer: "step · motion-together · the whole chart resolves at once" -->

`List price · per seat`

## The list price held for three quarters, then moved twice.

- Q1 `1,200`
- Q2 `1,200`
- Q3 `1,200`
- Q4 `1,450`
- Q1 `1,450`
- Q2 `1,690`

---

<!-- _class: line stacked-area motion-rise -->
<!-- _footer: "stacked-area · motion-rise · each band slides up into place" -->

`Revenue mix · $M`

## The mix shifted; the total barely moved.

- FY23
  - License `6.2`
  - Support `2.8`
  - Services `1.4`
- FY24
  - License `5.6`
  - Support `3.4`
  - Services `2.0`
- FY25
  - License `4.9`
  - Support `3.9`
  - Services `2.7`
- FY26
  - License `4.1`
  - Support `4.4`
  - Services `3.4`

---

<!-- _class: line motion-off -->
<!-- _footer: "motion-off · the control, so the difference is visible" -->

`Median latency · ms`

## Latency fell by a third after the cache landed.

- Mar `412`
- Apr `398`
- May `305`
- Jun `281`
- Jul `274`
- Aug `269`

---

<!-- _class: content -->
<!-- _footer: "What the reader gets on each surface" -->

## One source, four surfaces.

- Studio, Playground, Present
  - The lines draw in, then their points, then the words.
- The exported PDF
  - The finished chart, still, identical to a deck that never asked.
- Reduced motion
  - The end state, mounted immediately.
- The `--player` export
  - The build travels with the deck.
