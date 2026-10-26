---
marp: true
theme: indaco
paginate: true
header: "Lattice · histogram"
---

<!-- _class: title silent -->

# histogram

`Evidence · Canvas · Series`

One quantity cut into bands that join end to end: each bar is as wide as its band and its area is the band's share, with an optional log axis for bands that widen toward the tail.

---

<!-- _class: histogram -->
<!-- _footer: "Default · histogram" -->

`[{Annual loss, $1M..$250M, log}, {Share of years}]`

## Most years stay under $10M; one in thirty tops $100M.

- `$1M..$10M` `55%`
- `$10M..$50M` `30%`
- `$50M..$100M` `12%`
- `$100M..$250M` `3%`


---

<!-- _class: histogram -->
<!-- stress-slide -->
<!-- _footer: "Stress test · histogram — Twelve equal bands on a linear axis, the tail bands under one percent." -->

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

<!-- _class: histogram dark -->
<!-- _footer: "Composition: dark · histogram dark" -->

`[{Annual loss, $1M..$250M, log}, {Share of years}]`

## Most years stay under $10M; one in thirty tops $100M.

- `$1M..$10M` `55%`
- `$10M..$50M` `30%`
- `$50M..$100M` `12%`
- `$100M..$250M` `3%`


---

<!-- _class: histogram compact -->
<!-- _footer: "Composition: compact · histogram compact" -->

`[{Annual loss, $1M..$250M, log}, {Share of years}]`

## Most years stay under $10M; one in thirty tops $100M.

- `$1M..$10M` `55%`
- `$10M..$50M` `30%`
- `$50M..$100M` `12%`
- `$100M..$250M` `3%`


---

<!-- _class: histogram accent -->
<!-- _footer: "Composition: accent · histogram accent" -->

`[{Annual loss, $1M..$250M, log}, {Share of years}]`

## Most years stay under $10M; one in thirty tops $100M.

- `$1M..$10M` `55%`
- `$10M..$50M` `30%`
- `$50M..$100M` `12%`
- `$100M..$250M` `3%`


---

<!-- _class: cards-grid -->
<!-- _footer: "Anti-patterns · histogram" -->

## When NOT to reach for histogram.

- Categories that are not a number line
  - Regions, products or lines of business are separate things, not bands of one quantity. Use `bar`, which leaves gaps between them.
- A dash for a range
  - `$1M-$10M` is not a band: the dash reads two ways beside a negative number. Write `$1M..$10M`.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `bar` — separate categories compared by size, not bands of one quantity
- `ep-curve` — the chance of a loss above each amount, read as a return period
- `line` — one quantity over time
