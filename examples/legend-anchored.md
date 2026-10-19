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
<!-- _footer: "A bare label (the default): no plate, no border, no icon. It sits on the canvas beside the grid, the named cell is ringed, and a leader runs along the gap between rows." -->

`Retention · 2026 cohorts`

## A bare label names the cell that matters.

|  | M0 | M1 | M2 | M3 |
| --- | --: | --: | --: | --: |
| Jan 2026 | 100 | 62 | 48 | 44 |
| Feb 2026 | 100 | 58 | 31 | 29 |
| Mar 2026 | 100 | 71 | 59 | 55 |
| Apr 2026 | 100 | 69 | 57 |  |

`@legend{{Onboarding change, for="Feb 2026 · M2"}}`

---

<!-- _class: heatmap -->
<!-- _footer: "A plate is the pill: {…, tag, c4} draws the label on a tag in categorical slot 4, the same words a pill takes." -->

`Retention · 2026 cohorts`

## On a plate, the callout carries the pill's shape and color.

|  | M0 | M1 | M2 | M3 |
| --- | --: | --: | --: | --: |
| Jan 2026 | 100 | 62 | 48 | 44 |
| Feb 2026 | 100 | 58 | 31 | 29 |
| Mar 2026 | 100 | 71 | 59 | 55 |
| Apr 2026 | 100 | 69 | 57 |  |

`@legend{{Onboarding change, tag, c4, for="Feb 2026 · M2", detail="The new flow shipped on Feb 9 and skipped the setup call."}}`

---

<!-- _class: heatmap -->
<!-- _footer: "Several labels in one legend: a list of records. Each takes its place in the lane level with its own cell." -->

`Retention · 2026 cohorts`

## Two callouts, two stories, one line of source.

|  | M0 | M1 | M2 | M3 |
| --- | --: | --: | --: | --: |
| Jan 2026 | 100 | 62 | 48 | 44 |
| Feb 2026 | 100 | 58 | 31 | 29 |
| Mar 2026 | 100 | 71 | 59 | 55 |
| Apr 2026 | 100 | 69 | 57 |  |

`@legend{[{Onboarding change, chip, c4, for="Feb 2026 · M2"}, {Best cohort, chip, c2, for="Mar 2026 · M3"}]}`

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

`@legend{{Onboarding change, tag, c4, for="Feb 2026 · M2"}}`

---

<!-- _class: heatmap -->
<!-- stress-slide -->
<!-- _footer: "Stress · seven by twelve, three callouts. The lane stacks labels in the order their cells sit, so no two leaders cross; a label the lane cannot hold is dropped and reported, never drawn over another." -->

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

`@legend{[{All-hands, tag, c4, for="Wed · 10a"}, {Friday fade, for="Fri · 3p"}, {Weekend floor, for="Sun · 7a"}]}`

---

<!-- _class: statement -->

## One line of Markdown, every surface: the slide, the hover card, the speaker note, narration.

A heatmap callout is the legend plugin's first capability. The other charts' keys move onto the same model one at a time.
