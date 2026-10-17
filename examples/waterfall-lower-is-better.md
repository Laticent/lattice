---
marp: true
theme: indaco
paginate: true
header: "Lattice · Waterfall lower-is-better"
meta: "Lower is better"
---

<!-- _class: title silent -->

`Charts · waterfall`

# When a rise is bad news

A waterfall paints a rise green and a fall red. For a loss ratio, claims or cost, that is backwards. Add `lower-is-better` and the colors follow the meaning.

---

<!-- _class: waterfall -->

`Underwriting result · default`

## Higher is better here, so a rise is green.

- Plan `42`
- Cat above budget `-18`
- Reserve release `+9`
- Rate increases `+6`
- Expenses `-2`
- Actual `37`

---

<!-- _class: waterfall lower-is-better zoom -->

`Combined ratio · %`

## Cat losses pushed the combined ratio 6 points above plan.

- Plan `94`
- Cat losses `+8`
- Small losses `+1`
- Rate `-2`
- Expenses `-1`
- Actual `100`

---

<!-- _class: waterfall lower-is-better -->

`Incurred claims · USD M`

## Two hurricanes added $210M of claims; reinsurance took back $140M.

- Expected `520`
- Hurricane Ida `+120`
- Hurricane Lee `+90`
- Ceded `-140`
- Reserve release `-35`
- Incurred `555`

---

<!-- _class: waterfall lower-is-better zoom -->

`Expense ratio · %`

## Automation cut the expense ratio by 1.4 points.

- 2025 `31.4`
- Claims bots `-1.1`
- Brokers `+0.4`
- Headcount `-0.9`
- Systems `+0.2`
- 2026 `30.0`

---

<!-- _class: waterfall lower-is-better -->

`Customer churn · % of policies`

## Churn ended the year below plan, despite the price rise.

- Plan `11.0`
- Price rise `+1.4`
- Service fixes `-1.8`
- Retention offers `-0.9`
- Actual `9.7`

---

<!-- _class: content -->

## What changes and what does not.

- The colors swap: a rise wears the fail hue and a fall wears pass, in every finish and theme.
- The direction stays: bars still climb and fall, labels keep their signs, and print textures still mark up and down.
- Write it as `<!-- _class: waterfall lower-is-better -->`; it combines with `zoom`.
