---
marp: true
theme: indaco
pagination: true
header: "Lattice · panes"
footer: "Row labels in a pane — the label column keeps its slide width"
---

<!-- @meta{layout=title, class=silent} -->

# A row label keeps its width in a pane

`Panes · progress and matrix-grid`

---

<!-- @meta{layout=progress} -->

`H1 2026 · Phase 1 readiness`

## On a slide, the name column is a fifth of the width.

- Signal intake review `92%` `on-track`
- Scoring policy draft `68%` `at-risk`
- Decision log rollout `81%` `on-track`
- Calibration cadence reset `34%` `deferred`
- Adoption across teams `12%` `blocked`

— This slide is unchanged: the fix applies only inside a pane.

---

`H1 2026 · A 50% pane`

## In a half-width pane the names still read in full.

<!-- @meta{layout=columns} -->
<!-- @meta{pane=progress} -->

- Signal intake review `92%` `on-track`
- Scoring policy draft `68%` `at-risk`
- Calibration cadence reset `34%` `deferred`
- Adoption across teams `12%` `blocked`

<!-- @meta{pane=list} -->

- Two workstreams are behind plan
- Calibration waits on the scoring draft

— Before: a 105px column set every name one word per line, and the pane clipped at its fifth row.

---

`H1 2026 · A 35% pane`

## A narrow pane gives each name its own row.

<!-- @meta{layout=columns, class=ratio-35-65} -->
<!-- @meta{pane=progress} -->

- Signal intake review `92%` `on-track`
- Adoption across teams `12%` `blocked`

<!-- @meta{pane=list} -->

- A pane squarer than the slide sets the name above its bar
- The bar keeps the pane's full width

---

`H1 2026 · A stacked pane`

## Stacked, the pane is slide-wide and nothing moves.

<!-- @meta{layout=rows, class=ratio-55-45} -->
<!-- @meta{pane=progress} -->

- Signal intake review `92%` `on-track`
- Scoring policy draft `68%` `at-risk`
- Decision log rollout `81%` `on-track`

<!-- @meta{pane=list} -->

- A stacked pane's label column is the slide's own

---

`Capability rubric · A 65% pane`

## Each row name reads on one line, and so does each cell.

<!-- @meta{layout=columns, class=ratio-65-35} -->
<!-- @meta{pane=matrix-grid} -->

`[Wider reach, Deeper cognition]`

| Verb | Self | Team | Org | Field |
| --- | :-: | :-: | :-: | :-: |
| Frame the problem | [ ] | [-] | [x] Level 1 | [ ] |
| Weigh the options | [ ] | [-] | [x] Level 2 | [ ] |
| Decide under risk | [-] | [x] Level 3 | [-] | [ ] |

<!-- @meta{pane=list} -->

- Each verb is a row the reader scans first
- A filled cell names the level it reaches

— Before: the row-name column was one fifth of the pane, and each name set one word per line.

---

<!-- @meta{layout=matrix-grid} -->

`[Wider reach, Deeper cognition]`

## On a slide, the grid is unchanged.

| Verb | Self | Team | Org | Field |
| --- | :-: | :-: | :-: | :-: |
| Frame the problem | [ ] | [-] | [x] Level 1 | [ ] |
| Weigh the options | [ ] | [-] | [x] Level 2 | [ ] |
| Decide under risk | [-] | [x] Level 3 | [-] | [ ] |
| Review the outcome | [x] Level 4 | [-] | [ ] | [ ] |
