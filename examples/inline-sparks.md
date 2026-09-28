---
marp: true
theme: indaco
paginate: true
header: "Lattice · inline sparks"
---

<!-- _class: title silent -->

# A spark is a chart the size of a word.

`Lattice · inline sparks`

Written like a pill, drawn like a chart, and it goes wherever text goes.

---

<!-- _class: table table-fill -->

## Five series types, three sizes, one grammar.

| Type | Written as | `sm` | `md` | `lg` |
| --- | --- | --- | --- | --- |
| line | `~{…}` | `~{12 14 13 17 16 21 24}:sm` | `~{12 14 13 17 16 21 24}` | `~{12 14 13 17 16 21 24}:lg` |
| area | `:area` | `~{12 14 13 17 16 21 24}:area:sm` | `~{12 14 13 17 16 21 24}:area` | `~{12 14 13 17 16 21 24}:area:lg` |
| bar | `:bar` | `~{12 14 13 17 16 21 24}:bar:sm` | `~{12 14 13 17 16 21 24}:bar` | `~{12 14 13 17 16 21 24}:bar:lg` |
| step | `:step` | `~{2 2 3 3 3 5 4}:step:sm` | `~{2 2 3 3 3 5 4}:step` | `~{2 2 3 3 3 5 4}:step:lg` |
| win–loss | `:winloss` | `~{1 1 -1 1 0 -1 1 1}:winloss:sm` | `~{1 1 -1 1 0 -1 1 1}:winloss` | `~{1 1 -1 1 0 -1 1 1}:winloss:lg` |

---

<!-- _class: table table-fill -->

## Two types measure one value against a whole.

| Type | Written as | `sm` | `md` | `lg` |
| --- | --- | --- | --- | --- |
| ring | `\~{72%}` | `~{72%}:sm` | `~{72%}` | `~{72%}:lg` |
| ring, of a total | `\~{18/24}` | `~{18/24}:sm` | `~{18/24}` | `~{18/24}:lg` |
| bullet | `\~{72/80}:bullet` | `~{72/80}:bullet:sm` | `~{72/80}:bullet` | `~{72/80}:bullet:lg` |
| bullet, past target | `\~{91/80}:bullet` | `~{91/80}:bullet:sm` | `~{91/80}:bullet` | `~{91/80}:bullet:lg` |

---

<!-- _class: table table-fill -->

## Markers point at a value; color and frames match pills.

| Modifier | Effect | Spark |
| --- | --- | --- |
| `:end` `:minmax` | dot the latest value; the low and the high | `~{31 28 33 30 38 35 41 44}:lg:end` `~{31 28 33 30 38 35 41 44}:lg:minmax` |
| `:c3` `:c5` | a categorical color slot | `~{31 28 33 30 38 35 41 44}:lg:c3:end` `~{44 41 35 38 30 33 28 31}:lg:c5:end` |
| `:framed` | a pill's capsule behind it, same height | `~{31 28 33 30 38 35 41 44}:framed:end` `{ON PLAN}` `~{72%}:framed` |
| `:framed:c3` | the slot's fill and edge, like `{X}:c3` | `~{31 28 33 30 38 35 41 44}:framed:c3` `{ON PLAN}:c3` `~{3 4 2 5}:bar:framed:c3` |
| negatives | zero line appears when data crosses it | `~{4 2 -1 -3 1 3 5}:bar:lg` `~{4 2 -1 -3 1 3 5}:lg:end` |

---

<!-- _class: content -->

## A spark sits in a sentence at the size of the words.

Weekly signups climbed from 1,200 to 2,050 `~{12 13 12 15 17 16 19 21}:end` over eight weeks, while churn held flat `~{4 4 5 4 4 4 5 4}:zero`.

- Sprint outcomes this quarter `~{1 1 -1 1 1 1 -1 1}:winloss:sm` — six hits, two misses.
- Onboarding completion `~{72%}:sm` against a goal of 80.
- Headcount by month `~{40 40 42 42 45 45 48}:step:sm` — three hiring waves.

---

<!-- _class: table -->

## In a table, every row's trend reads at a glance.

| Region | Q3 revenue | Last 8 quarters | Plan |
| --- | ---: | --- | --- |
| North America | $4.2M | `~{3.1 3.3 3.2 3.6 3.8 3.9 4.0 4.2}:end` | `~{4.2/4.0}:bullet` |
| Europe | $2.8M | `~{2.9 2.8 2.9 2.7 2.8 2.6 2.7 2.8}:end` | `~{2.8/3.1}:bullet` |
| Asia Pacific | $1.9M | `~{0.8 0.9 1.1 1.2 1.4 1.5 1.7 1.9}:end` | `~{1.9/1.6}:bullet` |
| Latin America | $0.6M | `~{0.7 0.7 0.6 0.6 0.5 0.6 0.6 0.6}:end` | `~{0.6/0.9}:bullet` |

---

<!-- _class: table table-fill -->

## A line shows shape; `:zero` shows size.

| Series | Default: low to high | With `:zero` |
| --- | --- | --- |
| Churn, 4–5% for eight weeks | `~{4 4 5 4 4 4 5 4}:lg` | `~{4 4 5 4 4 4 5 4}:lg:zero` |
| Uptime, 99.2–99.9% | `~{99.2 99.9 99.7 99.8 99.4 99.9}:lg` | `~{99.2 99.9 99.7 99.8 99.4 99.9}:lg:zero` |
| Revenue, $1.6B–$2.4B | `~{1.6 1.7 1.9 2.0 2.2 2.4}:area:lg` | `~{1.6 1.7 1.9 2.0 2.2 2.4}:area:lg:zero` |
| Bars always start at zero | `~{1.6 1.7 1.9 2.0 2.2 2.4}:bar:lg` | — |

---

<!-- _class: kpi -->

## Revenue ahead of plan; margin and cash both expanded.

1. $2.4B
   - Total revenue
   - `~{1.6 1.7 1.9 2.0 2.2 2.4}:fill:area:lg:end`
   - target $2.2B · +9% `On plan`
2. 42%
   - Gross margin
   - `~{38 39 39 40 41 42}:framed:end` +2pp QoQ `On plan`
3. $1.1B
   - Cash & equivalents
   - `~{0.8 0.9 0.85 0.95 1.0 1.1}:bar` +$180M QoQ `On plan`

---

<!-- _class: big-number -->

`Monthly active readers`

- 1.2M
  - up from 640K a year ago `~{64 70 71 78 84 90 95 101 104 110 116 120}:lg:end`

---

<!-- _class: table table-fill -->

## A broken spark stays code, and lint:deck says why.

| Written | What `lint:deck` reports |
| --- | --- |
| `\~{1,200 1,450}` | `1,200` is not a number: no units, commas or currency signs |
| `\~{72%}:bar` | a bar needs a series of two or more numbers, not one value |
| `\~{3 5 4}:bar:end` | `:end` only goes on line, area and step, not bar |
| `\~{3 5 4}:c13` | `:c13` is not a spark modifier |
