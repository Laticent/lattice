---
marp: true
theme: indaco
paginate: true
header: "Lattice · callouts on bars · placed by measure"
---

<!-- _class: title silent -->

# Notes pin to the bar they name

`Callouts · bars`

A `@callout` ringed on a bar, a stack, a band, a step, a KPI row or a layer, with its words in a lane that sits beside the chart or under it, whichever leaves the plot larger. Render this deck at 16:9, 4:3, 1:1, 4:5 and 9:16 to watch the notes move.

---

<!-- _class: bar -->
<!-- _footer: "bar · a category by name, or one bar of a group as Category/Series." -->

## Revenue climbed every quarter.

- Q1
  - North `120`
  - South `90`
- Q2
  - North `180`
  - South `110`
- Q3
  - North `240`
  - South `150`
- Q4
  - North `310`
  - South `190`

`@callout{[{Price change lifted North, for=Q3/North, detail="List price rose 8% on 1 July."}, {South held steady, for=Q2/South}, {Peak quarter, for=Q4/North}]}`

---

<!-- _class: bar row -->
<!-- _footer: "bar row · the same rule on a row chart." -->

## Support load sits with two teams.

- Billing `412`
- Onboarding `388`
- Data sync `146`
- Reporting `97`
- Admin `64`

`@callout{[{Carry the queue, for=Billing}, {One person covers it, for=Admin}]}`

---

<!-- _class: stacked-bar -->
<!-- _footer: "stacked-bar · a whole stack, or one segment as Category/Series." -->

## Services overtook product in Q4.

- Q1
  - Product `70`
  - Services `50`
- Q2
  - Product `100`
  - Services `80`
- Q3
  - Product `140`
  - Services `100`
- Q4
  - Product `190`
  - Services `220`

`@callout{[{Services repriced here, for=Q2/Services}, {The bundle launch, for=Q4}]}`

---

<!-- _class: waterfall -->
<!-- _footer: "waterfall · a step by its label." -->

`FY26 plan · actual`

## Price paid for the volume we lost.

- Plan `12.0M`
- Price `+1.4M`
- Volume `-0.8M`
- Mix `-0.6M`
- FX `-0.3M`
- Cost base `-1.9M`
- Actual `9.8M`

`@callout{[{Two accounts lost in March, for=Volume}, {Not ours to fix, for=FX}, {Biggest single drag, for=Cost base}]}`

---

<!-- _class: histogram -->
<!-- _footer: "histogram · a band by its label." -->

`[{Claim size}, {Share of claims}]`

## Most claims are small.

- Under 20 `10..20` `12`
- 20 to 30 `20..30` `25`
- 30 to 40 `30..40` `31`
- 40 to 50 `40..50` `18`
- 50 and up `50..60` `9`

`@callout{[{The mode, for=30 to 40}, {Thin but costly tail, for=50 and up}]}`

---

<!-- _class: bullet -->
<!-- _footer: "bullet · a KPI row by its name." -->

## Two of five KPIs cleared the plan line.

- New ARR `4.2M` `5.0M`
- Expansion ARR `3.6M` `3.0M`
- Gross renewal `2.8M` `2.6M`
- Services revenue `1.1M` `1.8M`
- Partner-sourced ARR `0.9M` `1.4M`

`@callout{[{Beat plan on upsell, for=Expansion ARR}, {The miss that matters, for=Services revenue}]}`

---

<!-- _class: tower -->
<!-- _footer: "tower · a layer by its label." -->

## Six reinsurers carry $310M above a $50M retention.

- Layer 3 `$200M xs $160M`
  - Acme Re `30%`
  - Globex Re `25%`
  - Helios Re `20%`
- Layer 2 `$70M xs $90M`
  - Acme Re `40%`
  - Vantage Re `35%`
  - Umbra Re `25%`
- Layer 1 `$40M xs $50M`
  - Globex Re `60%`
  - Meridian Re `40%`
- Retention `$50M`

`@callout{[{Thinly placed, for=Layer 3}, {Most claims land here, for=Layer 1}]}`
