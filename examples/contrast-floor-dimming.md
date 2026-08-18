---
marp: true
theme: indaco
paginate: true
header: "Lattice · Contrast floor + de-emphasis"
---

<!-- _class: title -->
<!-- _header: '' -->
<!-- _paginate: false -->
<!-- _footer: "Title slide · title" -->

# The contrast floor, and what "dimmed" should mean

`Engine · #1722 + #1717`

Two fixes that turn out to be one: how the gate measures text size, and how a slide
de-emphasizes the thing it is not pointing at

---

<!-- _class: list-tabular -->
<!-- _footer: "The unit bug — #1722 · list-tabular" -->

`The unit bug`

## One token, two thresholds — decided by the front matter.

1. `--fs-body` on an `hd` deck
   - Resolves to 21.4px — 16.03pt
   - _Normal text · owes 4.5:1_
2. `--fs-body` on a `4k` deck
   - Resolves to 64.1px — still 16.03pt
   - _Graded as large text · owed only 3:1_
3. One gallery, both sizes
   - 317 runs passed as 4k, failed as hd
   - _Only `size:` changed_

So the gate stopped grading on size. One floor, 4.5:1, applied to every run.

---

<!-- _class: agenda progress-2 -->
<!-- _footer: "Fixed — the dimmed row and its counter · agenda progress-2" -->

## What this deck covers, in order.

1. The unit bug — page 2
2. The agenda wash — page 3
3. The other two instances — page 5
4. What is still owed — page 7

---

<!-- _class: agenda checks progress-3 -->
<!-- _footer: "Past ticks, current arrow, future box · agenda checks progress-3" -->

## Past sections tick off; the current one keeps the arrow.

1. Measure the rendered deck, not the token table
2. Decide the floor before fixing to it
3. Replace the wash with an ink
4. Log what the fix cannot reach

---

<!-- _class: kanban -->
<!-- _footer: "Fixed — the done column recedes without fading · kanban" -->

`Board · The de-emphasis backlog`

## Done recedes by ink and elevation, not by fading.

- Backlog
  - Palette tune, `--fail` pair
- In progress
  - Deck-scale threshold `in-progress`
- Review
  - Exempt-tier ceiling `review`
- Done
  - Agenda row + counter `done`
  - Kanban done column `done`
  - Losing compare card `done`

---

<!-- _class: compare-prose decision -->
<!-- _footer: "Fixed — the struck card keeps a legible label · compare-prose decision" -->

`Decision · Opacity vs ink`

## The losing card recedes, and its label stays readable.

- Dim with opacity
  - Composites ink and backdrop together, so it weakens each ink by the headroom it had. The element with the least headroom is rarely the one you were watching.
- Dim with an ink
  - The palette already names a de-emphasis role, and a role token is scheme-aware for free. Markers and status keep full strength.

Still struck. Only the wash that took its label to 3.24:1 is gone.

---

<!-- _class: list-tabular -->
<!-- _footer: "What the wash actually did · list-tabular" -->

`Measured on the rendered gallery`

## The biggest, boldest element on the row was the illegible one.

1. Agenda row title
   - `--text-heading`, 18.13:1 undimmed
   - _Through the wash — 2.97:1_
2. Agenda counter
   - `--accent`, 5.47:1 undimmed — larger and bolder
   - _Through the wash — 2.00:1_
3. Kanban inline token
   - 5.00:1 undimmed
   - _Through the wash — 2.12:1_

When the largest thing on a row is the least legible, the instrument is wrong.

---

<!-- _class: closing -->
<!-- _header: '' -->
<!-- _footer: "Closing bookend · closing" -->
<!-- _paginate: false -->

`What Is Still Owed`

## One entry left in the ledger, and it is a palette question.

`redline`'s struck clause measures 4.25:1 on the dark canvas. It carries no wash to
remove — its ink is `--fail` on a 10% tint of `--fail` — so closing it means tuning a
token pair across 32 palettes. Logged with an exact count rather than swept into this
change.
