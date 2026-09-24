---
marp: true
theme: indaco
paginate: true
header: "Lattice · heatmap row names"
acronyms:
  AMER: the Americas
  EMEA: Europe, the Middle East and Africa
  APAC: Asia Pacific
---

<!-- _class: title silent -->

# Row names read on one line.

`heatmap · the row-name gutter fits the names`

The row names used to sit in a fixed gutter that held about ten characters. An ordinary month cohort like **September 2026** wrapped onto two lines while **May 2026** sat on one, so the label column read ragged. The gutter now fits the widest name.

---

<!-- _class: heatmap -->
<!-- _footer: "Full month names · every one on a single line" -->

`Retention · 2026 cohorts`

## Retention decays fastest in month two.

|  | M0 | M1 | M2 | M3 |
| --- | --: | --: | --: | --: |
| January 2026 | 100 | 62 | 48 | 44 |
| February 2026 | 100 | 58 | 44 | 41 |
| September 2026 | 100 | 71 | 59 | 55 |
| October 2026 | 100 | 69 | 57 |  |

---

<!-- _class: heatmap -->
<!-- _footer: "Short names · the gutter shrinks and the grid takes the width" -->

`Gross margin · by region`

## Margin recovered everywhere except EMEA.

|  | Q1 | Q2 | Q3 | Q4 |
| --- | --: | --: | --: | --: |
| AMER | 61 | 63 | 66 | 69 |
| EMEA | 58 | 55 | 54 | 52 |
| APAC | 49 | 54 | 60 | 64 |

---

<!-- _class: statement silent -->

## The cells keep their numbers first.

A wider gutter narrows every cell, and a cell too narrow for its number drops the number entirely. So the gutter grows only while every value and column name that printed before still prints. Past that point a long row name wraps to a second line, which a reader still reads in full. A dropped value cannot be read at all.

---

<!-- _class: heatmap -->
<!-- _footer: "Twelve columns · the numbers hold, long names wrap" -->

`Weekly active · by acquisition channel`

## Partner referrals hold their users longest.

|  | W1 | W2 | W3 | W4 | W5 | W6 | W7 | W8 | W9 | W10 | W11 | W12 |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| Partner referral | 100 | 91 | 86 | 82 | 80 | 78 | 77 | 76 | 75 | 74 | 74 | 73 |
| Paid search | 100 | 72 | 60 | 53 | 49 | 46 | 44 | 42 | 41 | 40 | 39 | 38 |
| Organic search | 100 | 80 | 71 | 66 | 62 | 60 | 58 | 57 | 56 | 55 | 54 | 53 |
| Product-led signup | 100 | 64 | 51 | 45 | 41 | 39 | 37 | 36 | 35 | 34 | 33 | 33 |

---

<!-- _class: heatmap -->
<!-- _footer: "A sentence-length name · the gutter stops at its ceiling and wraps" -->

`Renewal rate · by segment`

## Channel accounts renew below direct ones.

|  | FY24 | FY25 | FY26 |
| --- | --: | --: | --: |
| Enterprise accounts sourced through the reseller channel | 81 | 79 | 76 |
| Enterprise direct | 88 | 90 | 91 |
| Mid-market | 84 | 85 | 85 |

---

<!-- _class: statement silent -->

## The ceiling is the bar chart's.

The gutter stops at 96 of the chart's 320 units, the same ceiling `bar` gives its row names. A row name longer than that is a sentence, and the fix is to shorten it. The grid should not give up a third of its width to one label.
