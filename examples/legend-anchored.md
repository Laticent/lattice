---
marp: true
theme: indaco
paginate: true
header: "Lattice · legend plugin · anchored labels"
---

<!-- _class: title silent -->

# Labels a chart did not have

`Legend plugin · Wave 0`

One model for every key, value label and callout. First capability: a heatmap callout, written in one line.

---

<!-- _class: heatmap -->
<!-- _footer: "Before · a heatmap with no callout. The reader has to find the drop-off alone." -->

`Retention · 2026 cohorts`

## Before: the grid carries the data, and nothing points at the story.

|  | M0 | M1 | M2 | M3 |
| --- | --: | --: | --: | --: |
| Jan 2026 | 100 | 62 | 48 | 44 |
| Feb 2026 | 100 | 58 | 31 | 29 |
| Mar 2026 | 100 | 71 | 59 | 55 |
| Apr 2026 | 100 | 69 | 57 |  |

---

<!-- _class: heatmap -->
<!-- _footer: "The default: the first callout is a circle with its number, on the cell and again before the words." -->

`Retention · 2026 cohorts`

## A numbered callout names the cell that matters.

|  | M0 | M1 | M2 | M3 |
| --- | --: | --: | --: | --: |
| Jan 2026 | 100 | 62 | 48 | 44 |
| Feb 2026 | 100 | 58 | 31 | 29 |
| Mar 2026 | 100 | 71 | 59 | 55 |
| Apr 2026 | 100 | 69 | 57 |  |

`@legend{{Onboarding change, row="Feb 2026", col=M2}}`

---

<!-- _class: heatmap -->
<!-- _footer: "The pill's words pick the marker: {…, tag, c4} is the square in color slot 4." -->

`Retention · 2026 cohorts`

## The pill's words pick the marker's shape and color.

|  | M0 | M1 | M2 | M3 |
| --- | --: | --: | --: | --: |
| Jan 2026 | 100 | 62 | 48 | 44 |
| Feb 2026 | 100 | 58 | 31 | 29 |
| Mar 2026 | 100 | 71 | 59 | 55 |
| Apr 2026 | 100 | 69 | 57 |  |

`@legend{{Onboarding change, tag, c4, row="Feb 2026", col=M2, detail="The new flow shipped on Feb 9 and skipped the setup call."}}`

---

<!-- _class: heatmap -->
<!-- _footer: "A list of records. Two on one row stay apart: each has its own shape and color, and nothing crosses the grid." -->

`Retention · 2026 cohorts`

## Two callouts on one row, and neither is ambiguous.

|  | M0 | M1 | M2 | M3 |
| --- | --: | --: | --: | --: |
| Jan 2026 | 100 | 62 | 48 | 44 |
| Feb 2026 | 100 | 58 | 31 | 29 |
| Mar 2026 | 100 | 71 | 59 | 55 |
| Apr 2026 | 100 | 69 | 57 |  |

`@legend{[{Onboarding change, c4, row="Feb 2026", col=M2}, {Setup call cut, c2, row="Feb 2026", col=M1}]}`

---

<!-- _class: heatmap scale -->
<!-- _footer: "With the band key. The callout takes its lane beside the grid and the key keeps its rail beyond it." -->

`Retention · 2026 cohorts`

## The callout and the band key share one figure.

|  | M0 | M1 | M2 | M3 |
| --- | --: | --: | --: | --: |
| Jan 2026 | 100 | 62 | 48 | 44 |
| Feb 2026 | 100 | 58 | 31 | 29 |
| Mar 2026 | 100 | 71 | 59 | 55 |
| Apr 2026 | 100 | 69 | 57 |  |

`@legend{{Onboarding change, tag, c4, row="Feb 2026", col=M2}}`

---

<!-- _class: heatmap -->
<!-- stress-slide -->
<!-- _footer: "Stress · seven by twelve. No room inside a cell, so every marker takes the same badge spot." -->

`Usage · hour by weekday`

## At the density ceiling, callouts still find room.

|  | 7a | 8a | 9a | 10a | 11a | 12p | 1p | 2p | 3p | 4p | 5p | 6p |
| --- | -: | -: | -: | -: | -: | -: | -: | -: | -: | -: | -: | -: |
| Mon | 12 | 30 | 58 | 71 | 69 | 44 | 52 | 66 | 70 | 61 | 40 | 18 |
| Tue | 14 | 33 | 61 | 74 | 72 | 47 | 55 | 69 | 73 | 64 | 42 | 20 |
| Wed | 13 | 32 | 60 | 92 | 70 | 46 | 54 | 68 | 72 | 63 | 41 | 19 |
| Thu | 15 | 34 | 62 | 75 | 73 | 48 | 56 | 70 | 74 | 65 | 43 | 21 |
| Fri | 11 | 28 | 52 | 63 | 60 | 38 | 41 | 50 | 47 | 36 | 22 | 9 |
| Sat | 4 | 6 | 9 | 14 | 18 | 21 | 22 | 20 | 17 | 13 | 9 | 6 |
| Sun | 3 | 5 | 8 | 12 | 15 | 18 | 19 | 18 | 15 | 11 | 8 | 5 |

`@legend{[{All-hands, tag, c4, row=Wed, col=10a}, {Friday fade, row=Fri, col=3p}, {Weekend floor, row=Sun, col=7a}]}`

---

<!-- _class: heatmap -->
<!-- stress-slide -->
<!-- _footer: "Stress · ten rows of four-digit values: no room for a digit, so each cell carries its shape alone." -->

`Revenue · region by month, $K`

## On a crowded grid, the shape alone marks each cell.

|  | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| North | 8611 | 8829 | 8602 | 9520 | 4311 | 4225 | 9587 | 8994 | 4250 |
| South | 2742 | 8516 | 6170 | 3523 | 2685 | 1886 | 7690 | 8621 | 3780 |
| East | 1445 | 2234 | 2175 | 1784 | 4316 | 5163 | 1692 | 8801 | 6545 |
| West | 8417 | 4400 | 9705 | 5028 | 6019 | 9388 | 1275 | 2592 | 8692 |
| Central | 5757 | 7864 | 2563 | 5361 | 6365 | 4962 | 9603 | 5935 | 1687 |
| Coastal | 2350 | 2968 | 7760 | 2966 | 5966 | 7532 | 2294 | 1476 | 1208 |
| Alpine | 4698 | 4636 | 2057 | 8900 | 7351 | 7711 | 8077 | 2396 | 4452 |
| Delta | 5620 | 6719 | 2627 | 6298 | 6649 | 1448 | 7918 | 3133 | 3405 |
| Metro | 5236 | 2855 | 1379 | 2181 | 8817 | 9176 | 4111 | 4286 | 8530 |
| Rural | 9537 | 4324 | 3345 | 8068 | 7487 | 3108 | 7669 | 8093 | 4687 |

`@legend{[{Audit, row=North, col=Jan}, {Price change, row=South, col=Jun}, {Launch, row=East, col=Mar}, {Promo, row=Central, col=Jul}, {Outage, row=Metro, col=Aug}, {Recovery, row=Rural, col=Sep}]}`

---

<!-- _class: statement -->

## One line of Markdown, every surface: the slide, the hover card, the speaker note, narration.

A heatmap callout is the legend plugin's first capability. The other charts' keys move onto the same model one at a time.
