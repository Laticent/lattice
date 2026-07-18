---
marp: true
theme: indaco
paginate: true
header: "Lattice · stats"
---

<!-- _class: title silent -->

# stats

`Evidence · Stack · Structure`

Row of 3–5 stat tiles, each with a big number and a label.

---

<!-- _class: stats -->
<!-- _footer: "Default · stats" -->

`evidence · stats`

## A row of stats, equal weight, no chrome.

`Each stat is a number and a two-word label — the row does the arguing.`

1. 4
   - stats per row
2. 8
   - words, soft
3. 5
   - the soft ceiling
4. 0
   - decoration allowed


---

<!-- _class: stats -->
<!-- stress-slide -->
<!-- _footer: "Stress test · stats — Six stats — the hard ceiling." -->

`stats · stress`

## Six stats is the row's hard ceiling.

1. 6
   - stats seated
2. 14
   - words, hard
3. 2
   - lines per label
4. 1
   - row, always
5. 5
   - was the soft mark
6. 0
   - room for seven


---

<!-- _class: stats dark -->
<!-- _footer: "Composition: dark · stats dark" -->

`evidence · stats`

## A row of stats, equal weight, no chrome.

`Each stat is a number and a two-word label — the row does the arguing.`

1. 4
   - stats per row
2. 8
   - words, soft
3. 5
   - the soft ceiling
4. 0
   - decoration allowed


---

<!-- _class: stats compact -->
<!-- _footer: "Composition: compact · stats compact" -->

`evidence · stats`

## A row of stats, equal weight, no chrome.

`Each stat is a number and a two-word label — the row does the arguing.`

1. 4
   - stats per row
2. 8
   - words, soft
3. 5
   - the soft ceiling
4. 0
   - decoration allowed


---

<!-- _class: stats accent -->
<!-- _footer: "Composition: accent · stats accent" -->

`evidence · stats`

## A row of stats, equal weight, no chrome.

`Each stat is a number and a two-word label — the row does the arguing.`

1. 4
   - stats per row
2. 8
   - words, soft
3. 5
   - the soft ceiling
4. 0
   - decoration allowed


---

<!-- _class: cards-stack compact -->
<!-- _footer: "Anti-patterns · stats" -->

## When NOT to reach for stats.

- Six or more tiles
  - Past five tiles the row compresses and the numbers shrink below boardroom legibility. Split into two rows or move to `kpi` where the dashboard grid gives each metric its own card.
- Tiles with no number
  - If a tile is mostly prose with a small number, the visual hierarchy inverts and the row reads as a list. Stats is for **bold-number + caption** — anything more belongs in `cards-grid`.
- Status framing without pills
  - If each metric needs a target, a trend, and a status indicator, you're authoring a dashboard, not a stats row. Move to `kpi`, which carries that vocabulary.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `big-number` — one number is enough to carry the slide
- `kpi` — metrics need targets, trends, and status pills
- `split-panel` — one focal KPI with a paragraph of supporting prose
- `piechart` — the numbers are parts of a whole, not independent
- `progress` — the metrics are completion percentages across workstreams
