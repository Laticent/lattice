---
marp: true
theme: indaco
paginate: true
size: square
header: "Lattice · Histogram edge labels"
meta: "Histogram edge labels"
---

<!-- _class: title silent -->

`Charts · histogram`

# A long last edge stays on the chart.

An edge label that would cross the chart's end now turns inward. One that fits stays centered under its tick.

---

<!-- _class: histogram -->
<!-- _footer: "Linear axis · the last edge, `$120k`, ends on the plot's right end" -->

`[{Claim size}, {Share of claims}]`

## Twelve bands, a long thin tail.

- `$0..$10k` `31%`
- `$10k..$20k` `22%`
- `$20k..$30k` `15%`
- `$30k..$40k` `10%`
- `$40k..$50k` `7%`
- `$50k..$60k` `5%`
- `$60k..$70k` `4%`
- `$70k..$80k` `2.5%`
- `$80k..$90k` `1.5%`
- `$90k..$100k` `1%`
- `$100k..$110k` `0.6%`
- `$110k..$120k` `0.4%`

---

<!-- _class: histogram -->
<!-- _footer: "Log axis · `$250M` turns inward at the end" -->

`[{Annual loss, $1M..$250M, log}, {Share of years}]`

## Most years stay under $10M; one in thirty tops $100M.

- `$1M..$10M` `55%`
- `$10M..$50M` `30%`
- `$50M..$100M` `12%`
- `$100M..$250M` `3%`

---

<!-- _class: histogram -->
<!-- _footer: "A wide last label · `$1,000,000` reads in full" -->

`[{Contract value}, {Share of contracts}]`

## Half of all contracts sit under $250,000.

- `$0..$250,000` `50%`
- `$250,000..$500,000` `28%`
- `$500,000..$750,000` `14%`
- `$750,000..$1,000,000` `8%`

---

<!-- _class: histogram -->
<!-- _footer: "Short labels · every edge stays centered under its tick" -->

`[{Seconds}, {Share of requests}]`

## Nine requests in ten answer within three seconds.

- `0..1` `52%`
- `1..2` `27%`
- `2..3` `11%`
- `3..4` `6%`
- `4..5` `4%`

---

<!-- _class: histogram dark -->
<!-- _footer: "Dark · the inward last edge keeps the tick ink" -->

`[{Annual loss, $1M..$250M, log}, {Share of years}]`

## The tail holds three years in a hundred.

- `$1M..$10M` `55%`
- `$10M..$50M` `30%`
- `$50M..$100M` `12%`
- `$100M..$250M` `3%`

---

<!-- _class: histogram compact -->
<!-- _footer: "Compact · the tightest box the fit nightly scored" -->

`[{Annual loss, $1M..$250M, log}, {Share of years}]`

## Compact still prints `$250M` in full.

- `$1M..$10M` `55%`
- `$10M..$50M` `30%`
- `$50M..$100M` `12%`
- `$100M..$250M` `3%`

---

<!-- _class: title silent -->

`Measured`

# Six fit cells back at baseline.

The fit harness on Chrome 157, nightly flags: every histogram cell scores at its baseline.
