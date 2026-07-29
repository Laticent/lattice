---
marp: true
theme: indaco
paginate: true
header: "Lattice · kpi + stats auto-lift"
---

<!-- _class: title silent -->

`Authoring · Slot-header lift`

# Numbers without the asterisks.

`kpi` and `stats` now bold their figures for you — the `**…**` is optional.

---

<!-- _class: stats -->
<!-- _footer: "stats · nested number + label" -->

`Impact · Pilot Results`

## Six months of results across four product teams.

`Same authoring as every other slot layout: parent item, nested detail.`

1. 73%
   - faster close
2. 4.2×
   - signal recall
3. $1.2M
   - prevented losses
4. −18d
   - avg cycle time

---

<!-- _class: kpi -->
<!-- _footer: "kpi · value + nested detail" -->

## Revenue ahead of plan; margin and cash both expanded.

1. $2.4B
   - Total revenue
   - target $2.2B · +9% `On plan`
2. 42%
   - Gross margin
   - +2pp QoQ `On plan`
3. $1.1B
   - Cash & equivalents
   - +$180M QoQ `On plan`
4. +18%
   - YoY revenue growth
   - vs 14% prior year `Ahead`

---

<!-- _class: list -->
<!-- _footer: "What changed" -->

## One authoring contract, two fewer footguns.

- Parent list item is the number
  - It renders in display type automatically — typing `**$2.4B**` is now an idempotent no-op, never wrong.
- Detail lives in the nested sublist
  - The nested body is what tells the engine where the number ends, exactly like every other slot layout.
- `stats` lost its magic
  - The old parse-and-rebuild into `.stats-row` is gone; the list is styled directly, so all three render paths agree.

---

<!-- _class: closing silent -->

## Same numbers, less markup.

`Related`

- `big-number` — when one figure carries the slide
- `split-panel metric` — one focal KPI with a paragraph of prose
- `stats` — an ungoverned row of headline figures
- `kpi` — value, target, trend, and status pills together
