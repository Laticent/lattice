---
marp: true
theme: indaco
paginate: true
header: "Lattice · tower"
---

<!-- _class: title silent -->

# tower

`Evidence · Canvas · Series`

A reinsurance program as stacked layers, each written as its limit in excess of its attachment and split across the reinsurers who took a share of it.

---

<!-- _class: tower -->
<!-- _footer: "Default · tower" -->

`Property catastrophe program · 2027`

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


---

<!-- _class: tower -->
<!-- stress-slide -->
<!-- _footer: "Stress test · tower — Six layers, eight reinsurers (two fold into Others), one layer part-placed." -->

## A six-layer casualty tower, 85% placed at the top.

- Layer 6 `$100M xs $400M`
  - Acme Re `35%`
  - Globex Re `30%`
  - Helios Re `20%`
- Layer 5 `$100M xs $300M`
  - Acme Re `25%`
  - Vantage Re `25%`
  - Umbra Re `25%`
  - Meridian Re `25%`
- Layer 4 `$100M xs $200M`
  - Orion Re `50%`
  - Atlas Re `50%`
- Layer 3 `$100M xs $100M`
  - Globex Re `50%`
  - Acme Re `50%`
- Layer 2 `$75M xs $25M`
  - Vantage Re `60%`
  - Helios Re `40%`
- Layer 1 `$15M xs $10M`
  - Acme Re `100%`
- Retention `$10M`


---

<!-- _class: tower dark -->
<!-- _footer: "Composition: dark · tower dark" -->

`Property catastrophe program · 2027`

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


---

<!-- _class: tower compact -->
<!-- _footer: "Composition: compact · tower compact" -->

`Property catastrophe program · 2027`

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


---

<!-- _class: tower accent -->
<!-- _footer: "Composition: accent · tower accent" -->

`Property catastrophe program · 2027`

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


---

<!-- _class: cards-stack -->
<!-- _footer: "Anti-patterns · tower" -->

## When NOT to reach for tower.

- Reading the height as the size
  - The layers are drawn at equal height on purpose, so a $40M layer and a $200M layer look the same size. When the audience needs to SEE the size difference, show the limits as a `bar` chart instead.
- Shares that are dollars
  - A share is a percentage of its layer. Write the reinsurer's line as `30%`, not `$12M`: a dollar figure reads as 12 million percent.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `stacked-bar` — the premium or cost of each layer, compared on a scale
- `waterfall` — how a loss or a result walks from one total to another
- `table` — the full placement slip, with every line and every term
