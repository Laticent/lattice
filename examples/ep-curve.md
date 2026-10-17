---
marp: true
theme: indaco
paginate: true
header: "Lattice · EP curve"
meta: "EP curve"
acronyms:
  OEP: occurrence exceedance probability
  AEP: aggregate exceedance probability
---

<!-- _class: title silent -->

`Charts · ep-curve`

# The loss to plan for, once every N years

Write each point as `{return period, loss}`. The return period runs across on a log scale, so 1-in-10, 1-in-100 and 1-in-1,000 sit evenly apart, and each curve is named at its end.

---

<!-- _class: ep-curve -->

`[{Return period}, {Loss}]`

## A 1-in-100 year costs $410M a single event, $480M a year.

- OEP
  - `{10, $120M}`
  - `{25, $190M}`
  - `{50, $300M}`
  - `{100, $410M}`
  - `{250, $560M}`
- AEP
  - `{10, $150M}`
  - `{25, $230M}`
  - `{50, $350M}`
  - `{100, $480M}`
  - `{250, $650M}`

---

<!-- _class: ep-curve -->

## One curve prints its losses.

- `{10, $120M}`
- `{25, $190M}`
- `{50, $300M}`
- `{100, $410M}`
- `{250, $560M}`

---

<!-- _class: ep-curve -->

`[{Return period, 5..1000}, {Loss}]`

## The program takes $320M off the 1-in-100.

- Gross
  - `{10, $120M}`
  - `{50, $300M}`
  - `{100, $410M}`
  - `{250, $560M}`
  - `{1000, $900M}`
- Net
  - `{10, $60M}`
  - `{50, $80M}`
  - `{100, $90M}`
  - `{250, $180M}`
  - `{1000, $520M}`

Above 1-in-250 the tower is exhausted, and net climbs with gross again.

---

<!-- _class: ep-curve dark -->

`[{Return period}, {Loss}]`

## The same curves, dark.

- OEP
  - `{10, $120M}`
  - `{25, $190M}`
  - `{50, $300M}`
  - `{100, $410M}`
  - `{250, $560M}`
- AEP
  - `{10, $150M}`
  - `{25, $230M}`
  - `{50, $350M}`
  - `{100, $480M}`
  - `{250, $650M}`

---

<!-- _class: ep-curve -->

## Four curves, eight return periods.

- Gross OEP
  - `{2, $20M}`
  - `{5, $55M}`
  - `{10, $120M}`
  - `{25, $190M}`
  - `{50, $300M}`
  - `{100, $410M}`
  - `{250, $560M}`
  - `{1000, $900M}`
- Gross AEP
  - `{2, $35M}`
  - `{10, $150M}`
  - `{100, $480M}`
  - `{1000, $1.1B}`
- Net OEP
  - `{2, $20M}`
  - `{10, $50M}`
  - `{100, $90M}`
  - `{1000, $400M}`
- Net AEP
  - `{2, $30M}`
  - `{10, $70M}`
  - `{100, $130M}`
  - `{1000, $500M}`
