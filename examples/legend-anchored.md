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
<!-- _footer: "The default: a numbered circle on the cell, the same number before the words." -->

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
<!-- _footer: "The marker is the pill: {…, tag, c4} puts the number on a tag in color slot 4." -->

`Retention · 2026 cohorts`

## The marker carries the pill's shape and color.

|  | M0 | M1 | M2 | M3 |
| --- | --: | --: | --: | --: |
| Jan 2026 | 100 | 62 | 48 | 44 |
| Feb 2026 | 100 | 58 | 31 | 29 |
| Mar 2026 | 100 | 71 | 59 | 55 |
| Apr 2026 | 100 | 69 | 57 |  |

`@legend{{Onboarding change, tag, c4, row="Feb 2026", col=M2, detail="The new flow shipped on Feb 9 and skipped the setup call."}}`

---

<!-- _class: heatmap -->
<!-- _footer: "A list of records. Two on one row stay apart: a number crosses nothing." -->

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
<!-- _footer: "Stress · seven by twelve. On a small cell the marker moves onto the corner, clear of the value." -->

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

<!-- _class: statement -->

## One line of Markdown, every surface: the slide, the hover card, the speaker note, narration.

A heatmap callout is the legend plugin's first capability. The other charts' keys move onto the same model one at a time.
