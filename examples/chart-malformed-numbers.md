---
marp: true
theme: indaco
paginate: true
header: "Lattice · chart values"
footer: "A mistyped value is no value, never a different one"
---

<!-- _class: title silent -->

# A mistyped value no longer plots as a different number

`--5`, `(5` and `1,2,3` draw nothing and lint names them

---

<!-- _class: bar -->

`Variance to plan · $ thousand`

## Every well-formed spelling reads as it did before.

- Accounting `(120)`
- Minus `-85`
- Currency sign `$-40`
- US groups `1,240`
- EU groups `1.180,5`
- ISO groups `1 020`

---

<!-- _class: bar -->

`Headcount by region`

## A doubled sign is no value, so its bar is not drawn.

- North `--5`
- South `12`
- East `18`
- West `9`

Before, North drew a bar at -5, and the narration said "down negative five".

---

<!-- _class: bar -->

`Units shipped · thousand`

## Digits that are not one number draw no bar either.

- North `1,2,3`
- South `40`
- East `1.2.3.4x`
- West `64`

Before, North drew at 1.2 and East at 1,234, taller than every real bar.

---

<!-- _class: funnel -->

## An unpaired parenthesis reads as zero, not as 840.

- Visitors `12,480`
- Leads `3,120`
- Trials `(840`
- Customers `312`

---

<!-- _class: title silent -->

# Lint names each one, and why

`chart-value-malformed` · two signs · unpaired parentheses · digits that are not one number
