---
marp: true
theme: indaco
paginate: true
header: "Lattice · Histogram"
meta: "Histogram"
---

<!-- _class: title silent -->

`Charts · histogram`

# How a quantity is spread, band by band

Write each band as a range, `$1M..$10M`, and its share. Bars touch because the bands join end to end, and each bar's area is its share, so bands of different widths draw honestly.

---

<!-- _class: histogram -->

`[{Annual loss, $1M..$250M, log}, {Share of years}]`

## Most years stay under $10M; one in thirty tops $100M.

- `$1M..$10M` `55%`
- `$10M..$50M` `30%`
- `$50M..$100M` `12%`
- `$100M..$250M` `3%`

---

<!-- _class: histogram -->

`[{Claim size}, {Share of claims}]`

## Two in three claims settle under $20k.

- `$0..$10k` `38%`
- `$10k..$20k` `27%`
- `$20k..$30k` `17%`
- `$30k..$40k` `10%`
- `$40k..$50k` `6%`
- `$50k..$60k` `2%`

---

<!-- _class: histogram -->

`[{Annual loss, log}]`

## Named bands keep the market's words.

- Attritional `$1M..$5M` `61%`
  - Owner: the cedent's retention
- Working layer `$5M..$25M` `27%`
- Mid layer `$25M..$100M` `9%`
- Cat layer `$100M..$400M` `3%`
  - The tail the program is bought for

---

<!-- _class: histogram -->

`[{Annual loss}, {Share of years}]`

## Unequal bands on a linear axis: the wide tail flattens.

- `$0..$10M` `55%`
- `$10M..$50M` `30%`
- `$50M..$100M` `12%`
- `$100M..$250M` `3%`

Add `log` to the axis line when the bands widen toward the tail, as on slide 2.

---

<!-- _class: histogram dark -->

`[{Annual loss, $1M..$250M, log}, {Share of years}]`

## The same distribution, dark.

- `$1M..$10M` `55%`
- `$10M..$50M` `30%`
- `$50M..$100M` `12%`
- `$100M..$250M` `3%`

---

<!-- _class: histogram -->

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
