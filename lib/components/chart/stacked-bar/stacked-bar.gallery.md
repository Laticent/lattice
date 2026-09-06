---
marp: true
theme: indaco
paginate: true
header: "Lattice · stacked-bar"
---

<!-- _class: title silent -->

# stacked-bar

`Evidence · Canvas · Series`

Bars split into parts, so one chart carries both the total for each category and the mix inside it.

---

<!-- _class: stacked-bar -->
<!-- _footer: "Default · stacked-bar" -->

## Each bar is a total; the bands inside it are the mix.

- FY23
  - Licenses `18.4`
  - Services `6.2`
  - Support `4.1`
- FY24
  - Licenses `19.1`
  - Services `9.8`
  - Support `4.6`
- FY25
  - Licenses `19.6`
  - Services `15.4`
  - Support `5.2`


---

<!-- _class: stacked-bar share -->
<!-- _footer: "share · stacked-bar share — Every bar normalized to 100 %, so only the mix is comparable — the absolute total moves to a caption above the bar." -->

## share normalizes every bar, so only the mix is compared.

- FY23
  - Licenses `18.4`
  - Services `6.2`
  - Support `4.1`
- FY24
  - Licenses `19.1`
  - Services `9.8`
  - Support `4.6`
- FY25
  - Licenses `19.6`
  - Services `15.4`
  - Support `5.2`


---

<!-- _class: stacked-bar row -->
<!-- _footer: "row · stacked-bar row — The stack runs horizontally, so long category names sit in a left column instead of wrapping under a bar." -->

## row turns the stack on its side for long category names.

- Professional services
  - Delivery `4.2`
  - Training `1.6`
  - Advisory `0.9`
- Platform subscriptions
  - Delivery `11.8`
  - Training `2.1`
  - Advisory `1.4`
- Managed operations
  - Delivery `6.4`
  - Training `0.8`
  - Advisory `2.2`


---

<!-- _class: stacked-bar share -->
<!-- stress-slide -->
<!-- _footer: "Stress test · stacked-bar — Six parts across six categories — the perceptual cap on both axes at once, with a 2 % sliver in every bar." -->

## Six parts, six periods, one sliver that should have been folded in.

- Q1 FY24
  - Enterprise `41`
  - Mid-market `24`
  - SMB `16`
  - Channel `11`
  - Marketplace `6`
  - Other `2`
- Q2 FY24
  - Enterprise `39`
  - Mid-market `25`
  - SMB `17`
  - Channel `12`
  - Marketplace `5`
  - Other `2`
- Q3 FY24
  - Enterprise `37`
  - Mid-market `26`
  - SMB `18`
  - Channel `12`
  - Marketplace `5`
  - Other `2`
- Q4 FY24
  - Enterprise `35`
  - Mid-market `26`
  - SMB `19`
  - Channel `13`
  - Marketplace `5`
  - Other `2`
- Q1 FY25
  - Enterprise `33`
  - Mid-market `27`
  - SMB `20`
  - Channel `13`
  - Marketplace `5`
  - Other `2`
- Q2 FY25
  - Enterprise `31`
  - Mid-market `28`
  - SMB `21`
  - Channel `14`
  - Marketplace `4`
  - Other `2`


---

<!-- _class: stacked-bar dark -->
<!-- _footer: "Composition: dark · stacked-bar dark" -->

## Each bar is a total; the bands inside it are the mix.

- FY23
  - Licenses `18.4`
  - Services `6.2`
  - Support `4.1`
- FY24
  - Licenses `19.1`
  - Services `9.8`
  - Support `4.6`
- FY25
  - Licenses `19.6`
  - Services `15.4`
  - Support `5.2`


---

<!-- _class: stacked-bar compact -->
<!-- _footer: "Composition: compact · stacked-bar compact" -->

## Each bar is a total; the bands inside it are the mix.

- FY23
  - Licenses `18.4`
  - Services `6.2`
  - Support `4.1`
- FY24
  - Licenses `19.1`
  - Services `9.8`
  - Support `4.6`
- FY25
  - Licenses `19.6`
  - Services `15.4`
  - Support `5.2`


---

<!-- _class: stacked-bar accent -->
<!-- _footer: "Composition: accent · stacked-bar accent" -->

## Each bar is a total; the bands inside it are the mix.

- FY23
  - Licenses `18.4`
  - Services `6.2`
  - Support `4.1`
- FY24
  - Licenses `19.1`
  - Services `9.8`
  - Support `4.6`
- FY25
  - Licenses `19.6`
  - Services `15.4`
  - Support `5.2`


---

<!-- _class: cards-stack compact -->
<!-- _footer: "Anti-patterns · stacked-bar" -->

## When NOT to reach for stacked-bar.

- Tracking a part that is not at the bottom
  - Only the bottom segment shares a baseline across bars. Every segment above it floats on the ones below, so a reader cannot see whether ‘Services’ grew — they can only see where its band sits. If ONE part is the story, put it at the bottom of the stack, or use `line` to plot it directly.
- Parts that are not parts
  - Stacking independent metrics — revenue, headcount, NPS — produces a bar whose height means nothing. The parts must sum to something a reader would name. Use `bar` for independent magnitudes.
- A long tail of slivers
  - A 2 % part is about one unit of bar height: too thin to see, impossible to label, and it pushes everything above it around. Consolidate the tail into one ‘Other’ part before authoring, or drop to the four parts that carry the claim.
- One category
  - A single stacked bar is a pie chart drawn as a column, and a pie reads proportions better. Use `piechart` for one total; this chart earns its shape from the comparison ACROSS bars.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `piechart` — one total to decompose, with no comparison across categories
- `progress` — independent attainment bars with no parts and no shared value axis
- `funnel` — the stages are a narrowing pipeline, not parts of a total
- `matrix-grid` — the cells are qualitative judgments rather than values that sum
