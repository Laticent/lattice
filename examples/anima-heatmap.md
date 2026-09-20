---
marp: true
theme: indaco
paginate: true
header: "Lattice · heatmap motion"
motion: on
acronyms:
  EMEA: Europe, the Middle East and Africa
  APAC: Asia Pacific
---

<!-- _class: title silent -->

# The grid assembles itself.

`Anima · heatmap · in-place cell motion`

Set `motion: on` once. Every cell a heatmap draws already declares its motion
role, so the grid builds itself — and the exported PDF is unchanged.

---

<!-- _class: heatmap -->
<!-- _footer: "Default build · cells arrive in reading order" -->

`Retention · 2026 cohorts`

## Retention decays fastest in month two.

- Jan 2026
  - M0 `100`
  - M1 `62`
  - M2 `48`
  - M3 `44`
- Feb 2026
  - M0 `100`
  - M1 `58`
  - M2 `44`
  - M3 `41`
- Mar 2026
  - M0 `100`
  - M1 `71`
  - M2 `59`
  - M3 `55`
- Apr 2026
  - M0 `100`
  - M1 `69`
  - M2 `57`

---

<!-- _class: heatmap motion-together -->
<!-- _footer: "motion-together · the whole matrix resolves at once" -->

`Support load · by weekday`

## Tuesday carries the week's backlog.

- Morning
  - Mon `82`
  - Tue `96`
  - Wed `74`
  - Thu `61`
  - Fri `48`
- Afternoon
  - Mon `71`
  - Tue `88`
  - Wed `66`
  - Thu `59`
  - Fri `37`
- Evening
  - Mon `34`
  - Tue `41`
  - Wed `29`
  - Thu `24`
  - Fri `12`

---

<!-- _class: heatmap motion-rise -->
<!-- _footer: "motion-rise · each cell slides up into place" -->

`Gross margin · by region`

## Margin recovered everywhere except EMEA.

- Americas
  - Q1 `61`
  - Q2 `63`
  - Q3 `66`
  - Q4 `69`
- EMEA
  - Q1 `58`
  - Q2 `55`
  - Q3 `54`
  - Q4 `52`
- APAC
  - Q1 `49`
  - Q2 `54`
  - Q3 `60`
  - Q4 `64`

---

<!-- _class: heatmap motion-off -->
<!-- _footer: "motion-off · the control, so the difference is visible" -->

`Defect density · by service`

## Checkout carries three times the defect load.

- Checkout
  - Jan `31`
  - Feb `28`
  - Mar `34`
- Catalog
  - Jan `11`
  - Feb `9`
  - Mar `12`
- Search
  - Jan `8`
  - Feb `7`
  - Mar `6`

---

<!-- _class: content -->
<!-- _footer: "What the reader gets on each surface" -->

## One source, four surfaces.

- **Studio, Playground, Present.**
  - The grid builds, derived from the chart's own marks.
- **The exported PDF.**
  - The finished grid, still — byte-identical to a deck that never asked.
- **Reduced motion.**
  - The end state, mounted immediately.
- **The `--player` export.**
  - The build travels with the deck.
