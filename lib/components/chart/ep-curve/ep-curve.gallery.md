---
marp: true
theme: indaco
paginate: true
header: "Lattice · ep-curve"
---

<!-- _class: title silent -->

# ep-curve

`Evidence · Canvas · Series`

An exceedance-probability curve: the loss to expect once every N years, with return periods across on a log scale and up to four curves (OEP and AEP, gross and net).

---

<!-- _class: ep-curve -->
<!-- _footer: "Default · ep-curve" -->

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
<!-- stress-slide -->
<!-- _footer: "Stress test · ep-curve — Four curves, eight return periods from 1-in-2 to 1-in-1,000." -->

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


---

<!-- _class: ep-curve dark -->
<!-- _footer: "Composition: dark · ep-curve dark" -->

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

<!-- _class: ep-curve compact -->
<!-- _footer: "Composition: compact · ep-curve compact" -->

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

<!-- _class: ep-curve accent -->
<!-- _footer: "Composition: accent · ep-curve accent" -->

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

<!-- _class: cards-stack -->
<!-- _footer: "Anti-patterns · ep-curve" -->

## When NOT to reach for ep-curve.

- Return period written as a label
  - `- 1-in-100 `$410M`` is a label and a value, which the chart cannot place. Write the point record, return period first: `` `{100, $410M}` ``; the axis prints `1-in-100` for you.
- A probability instead of a return period
  - Write the return period, not the annual probability: 1% is `{100, …}`, 0.4% is `{250, …}`.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `histogram` — how often each band of loss happens, rather than the loss at each return period
- `tower` — the reinsurance program the curve is priced against
- `line` — a quantity over time, on an evenly spaced axis
