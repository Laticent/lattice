---
marp: true
theme: indaco
paginate: true
header: "Lattice · list-tabular"
---

<!-- _class: title silent -->

# list-tabular

`Inventory · Ledger · Structure`

Hairline-ruled ledger of items — name on the left, body on the right.

---

<!-- _class: list-tabular -->
<!-- _footer: "Default · list-tabular" -->

## The tabular list rules rows into a register.

1. Rows
   - Label, clause, optional meta line.
   - _Twelve soft · sixteen hard_
2. Looks
   - Eight named looks reskin the rows.
   - _def · spec · register_
3. Escalation
   - Long content leaves for a table.
   - _split past eight rows_


---

<!-- _class: list-tabular def -->
<!-- _footer: "Editorial (def) · list-tabular def — Counter spans rows; eyebrow above." -->

## def pairs each term with its role.

1. Label `Term`
   - def styles the register as definitions.
2. Chip `Role`
   - The inline code becomes a right-hand chip.
3. Body `Clause`
   - One clause under each term.


---

<!-- _class: list-tabular metric -->
<!-- _footer: "Tile (metric) · list-tabular metric — Values in bordered tiles." -->

## metric turns the chips into figures.

1. Rows carry values `12 / 16`
2. Figures right-align `100%`
3. Labels stay short `4 rows`


---

<!-- _class: list-tabular spec -->
<!-- _footer: "spec · list-tabular spec — Mono keys for flags and params." -->

## spec documents flags and their types.

1. `LATTICE_THEME` `string`
   - spec sets code labels beside type chips.
2. `LATTICE_DEBUG` `bool`
   - One clause explains each flag.


---

<!-- _class: list-tabular register -->
<!-- _footer: "register · list-tabular register — Status pills on each row." -->

## register pairs names with status chips.

1. cards-grid `stable`
2. split-panel `stable`
3. radar `beta`
4. word-cloud `preview`


---

<!-- _class: list-tabular def rule -->
<!-- _footer: "def + rule · list-tabular rule — Accent rail down the left edge." -->

## rule draws a hairline under every row.

1. Hairlines `On`
   - rule adds the horizontal separators.
2. Density `Same`
   - Budgets do not change with the look.


---

<!-- _class: list-tabular metric solid -->
<!-- _footer: "metric + solid · list-tabular solid — Filled value tiles for headlines." -->

## solid fills the register with panel color.

1. Net new rows `4`
2. Panel fill `on`
3. Best for `headline metrics`


---

<!-- _class: list-tabular spec stacked -->
<!-- _footer: "spec + stacked · list-tabular stacked — Clause drops below the name." -->

## stacked drops the clause under its label.

1. `GET /plans/:name` `200 | 404`
   - stacked gives each row two decks of text.
2. `GET /gallery/:name` `200`
   - The clause wraps below, full width.


---

<!-- _class: list-tabular register outline -->
<!-- _footer: "register + outline · list-tabular outline — Outline pills — a lighter register." -->

## outline boxes each row in a keyline.

1. cards-grid `stable`
2. split-panel `stable`
3. quote `stable`


---

<!-- _class: list-tabular register -->
<!-- stress-slide -->
<!-- _footer: "Stress test · list-tabular — Eight rows — the register's page." -->

## Eight rows is the register's practical page.

1. title `stable`
2. big-number `stable`
3. cards-grid `stable`
4. split-panel `stable`
5. funnel `stable`
6. map `stable`
7. radar `beta`
8. word-cloud `preview`


---

<!-- _class: list-tabular dark -->
<!-- _footer: "Composition: dark · list-tabular dark" -->

## The tabular list rules rows into a register.

1. Rows
   - Label, clause, optional meta line.
   - _Twelve soft · sixteen hard_
2. Looks
   - Eight named looks reskin the rows.
   - _def · spec · register_
3. Escalation
   - Long content leaves for a table.
   - _split past eight rows_


---

<!-- _class: list-tabular compact -->
<!-- _footer: "Composition: compact · list-tabular compact" -->

## The tabular list rules rows into a register.

1. Rows
   - Label, clause, optional meta line.
   - _Twelve soft · sixteen hard_
2. Looks
   - Eight named looks reskin the rows.
   - _def · spec · register_
3. Escalation
   - Long content leaves for a table.
   - _split past eight rows_


---

<!-- _class: list-tabular accent -->
<!-- _footer: "Composition: accent · list-tabular accent" -->

## The tabular list rules rows into a register.

1. Rows
   - Label, clause, optional meta line.
   - _Twelve soft · sixteen hard_
2. Looks
   - Eight named looks reskin the rows.
   - _def · spec · register_
3. Escalation
   - Long content leaves for a table.
   - _split past eight rows_


---

<!-- _class: cards-stack compact -->
<!-- _footer: "Anti-patterns · list-tabular" -->

## When NOT to reach for list-tabular.

- Three or fewer rows
  - The ledger needs density to justify its shape. For two to four items, reach for cards-stack — the rows get the room to breathe.
- Long per-row prose
  - Each row is a name plus a sentence. If the description runs two or three sentences, move to cards-stack or split across slides.
- Stacking two primary variants
  - `def`, `metric`, `spec`, and `register` are mutually exclusive. Pair each only with its secondary modifier (def+rule, metric+solid, spec+stacked, register+outline).

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `glossary` — term/definition pairs with auto-derived range pill
- `cards-stack` — two or three richer items, not a ledger
- `actors` — the left column is a named person, not a key
- `list` — rows are bullets without a label-plus-description shape
