---
marp: true
theme: indaco
paginate: true
header: "Lattice · the chart form kernel"
---

<!-- _class: title silent -->

# A chart is a Lattice

`Chart form kernel · bar, quadrant, risk-matrix, radar`

On a page read on a phone, the kernel draws each chart once, on a canvas the shape of its box: the plot, its axes, its key and its notes each take the room their text needs at its role size.

---

<!-- _class: bar -->
<!-- _footer: "bar · names set whole" -->
<!-- bar · the category band is as tall as its names: North America sets whole on two lines. -->

`Revenue · FY26`

## Growth is concentrated in two regions.

- North America `$4.2M`
- EMEA `$3.1M`
- APAC `$1.8M`
- LATAM `$0.6M`

---

<!-- _class: bar grouped -->
<!-- _footer: "bar grouped · the key is a tile" -->
<!-- bar grouped · the key is a tile the kernel places under or beside the plot. -->

## We beat plan everywhere but APAC.

- Americas
  - Plan `3.2`
  - Actual `3.9`
- EMEA
  - Plan `2.6`
  - Actual `3.1`
- APAC
  - Plan `1.9`
  - Actual `1.4`

---

<!-- _class: bar row -->
<!-- _footer: "bar row · the name column fits" -->
<!-- bar row · the name column widens until every name sets whole. -->

## Every unit named in full, nothing abbreviated.

- Commercial Banking `$182M`
- Wealth & Asset Management `$154M`
- Global Transaction Services `$121M`
- Insurance & Protection `$96M`
- Markets & Securities `$74M`
- Retail & Small Business `$61M`
- Corporate Real Estate `$38M`
- Private Credit Partnerships `$12M`

---

<!-- _class: quadrant -->
<!-- _footer: "quadrant · names on their dots" -->
<!-- quadrant · names sit on their dots while they can, and move to a numbered key when they cannot. -->

`[{Effort, 0..10}, {Reach, 0..100}]`

## The quadrant scatters items on two axes.

- Quick Wins
  - Weekly signal digest `{2, 82}`
  - Slack intake bot `{3, 72}`
- Strategic Bets
  - Scoring model v2 `{8, 88}`
  - Decision-log API `{7, 74}`
- Defer
  - Per-team weighting UI `{2, 28}`
  - Maturity self-assessment `{1, 20}`
- Time Sinks
  - Bespoke board exports `{8, 18}`
  - Custom calibration tooling `{9, 26}`

---

<!-- _class: quadrant -->
<!-- _footer: "quadrant · a numbered key" -->
<!-- quadrant · fourteen names cannot sit clear of their dots: each dot carries its number. -->

## Fourteen initiatives, one owner.

- Strategic Bets
  - Scoring model v2 `{3, 72}`
  - Per-team calibration `{5, 85}`
  - Multi-source signal dedupe `{4, 78}`
  - Decision-log audit trail `{2, 66}`
- Quick Wins
  - Weekly signal brief `{8, 80}`
  - Snapshot exports `{9, 55}`
  - Adoption dashboard `{7, 62}`
- Defer
  - Vendor scoping `{2, 30}`
  - Manual recalibration `{1, 22}`
  - Legacy intake shim `{3, 14}`
- Time Sinks
  - Custom audit log UI `{7, 18}`
  - Bespoke board export `{9, 28}`
  - Per-decision profiles `{8, 12}`
  - Self-assessment generator `{6, 25}`

---

<!-- _class: risk-matrix -->
<!-- _footer: "risk-matrix · discs give way" -->
<!-- risk-matrix · ten risks, three in one cell: the discs give way, the numerals never do. -->

## Ten risks, three in the same cell.

- Cyber outage `{4, 5}` `{2, 4}`
- Ransomware `{4, 5}`
- Cloud provider failure `{4, 5}`
- Hurricane season `{3, 5}` `{3, 3}`
- Reserve shortfall `{3, 4}`
- Regulatory fine `{2, 4}`
- FX swing `{4, 2}`
- Key person loss `{2, 3}`
- Pandemic `{1, 5}`
- Office flood `{1, 2}`

---

<!-- _class: risk-matrix -->
<!-- _footer: "risk-matrix · notes at role size" -->
<!-- risk-matrix · authored notes print at their role size; the grid gives them room. -->

`Enterprise risk register · Q4 2026`

## Cyber and hurricane risk sit in the red; both have a plan.

- Cyber outage `{4, 5}` `{2, 4}`
- Hurricane season `{3, 5}` `{3, 3}`
- Reserve shortfall `{3, 4}`
- FX swing `{4, 2}`
- Key person loss `{2, 3}`
- Pandemic `{1, 5}`

`@callout{[{Plan cuts likelihood to unlikely, for=Cyber outage}, {Reinsurance caps the loss, for=Hurricane season}, {Unhedged since March, for=FX swing}]}`

---

<!-- _class: radar -->

`Vendor scorecard · 2026`

## Meridian leads on performance and security.

- Meridian
  - Performance `9`
  - Pricing `6`
  - Support `8`
  - Ecosystem `5`
  - Security `9`
- Vantage
  - Performance `7`
  - Pricing `8`
  - Support `5`
  - Ecosystem `8`
  - Security `6`
- Helios
  - Performance `6`
  - Pricing `9`
  - Support `7`
  - Ecosystem `6`
  - Security `5`
