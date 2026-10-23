---
marp: true
theme: indaco
paginate: true
---

<!-- _class: title silent -->

# One record per row, every field drawn.

`bullet · progress · heatmap · the {> …} description`

A chart row is a label plus one record in braces. Bullet's band and floor and progress's note used to need nested rows; now they ride the record. A heatmap cell, column and row carry a `{> …}` description.

---

<!-- _class: bullet -->

`Service levels · Q3`

## Uptime sits below plan, and its scale starts at 99 percent.

The record carries the floor and the cut point, so the zones and the axis come from one line per KPI.

- Uptime `{99.4%, target=99.9%, floor=99.0%, band=[99.5%]}`
- Availability `{99.7%, target=99.9%, floor=99.0%, band=[99.5%]}`
- Error budget kept `{82%, target=90%, floor=50%, band=[70%]}`

---

<!-- _class: bullet -->

`Service levels · Q3 · the same rows, written as nested keyword rows`

## The older spelling draws the identical chart.

Both spellings read through the same row schema until the codemod rewrites the old one.

- Uptime `99.4%` `99.9%`
  - Floor `99.0%`
  - Band `99.5%`
- Availability `99.7%` `99.9%`
  - Floor `99.0%`
  - Band `99.5%`
- Error budget kept `82%` `90%`
  - Floor `50%`
  - Band `70%`

---

<!-- _class: progress -->

`Launch readiness`

## Two workstreams are slipping, and the note on each record says why.

- Build `{68%, at-risk, note="Waiting on the Q4 vendor slot"}`
- Docs `{90%, on-track}`
- Security review `{35%, blocked, note="Pen test not scheduled"}`
- Training `{20%, pilot}`

---

<!-- _class: heatmap -->

`Retention · 2026 cohorts`

## Month two is where the cohorts split.

A description after a value notes the cell, one in a header cell notes the column, and a column headed `{>}` notes each row. They show on hover and in the speaker note.

| Cohort | M0 | M1 `{> The onboarding change shipped here}` | M2 | `{>}` |
| --- | --: | --: | --: | --- |
| Jan 2026 | 100 | 62 `{> dipped, then recovered}` | 48 | Launch cohort |
| Feb 2026 | 100 | 58 | `{> not reached yet}` | Pilot pricing |
| Mar 2026 | 100 | 71 | 55 | After the redesign |

---

<!-- _class: statement silent -->

## What stays the same.

An author who writes none of this sees nothing change: the old spans, the nested keyword rows and `note=` all still read, and the lint says when a `{> …}` is somewhere nothing reads it.
