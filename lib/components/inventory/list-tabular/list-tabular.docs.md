# list-tabular

> Hairline-ruled ledger of items — name on the left, body on the right.

**Function** inventory · **Form** ledger · **Substance** structure

**Tags** `reference` · `overview` · `status`

**Density** aim ~12 words per item; past ~16 it reads as a wall of text — a short row label plus a clause.

Use for compact reference tables: glossary-style entries, key/value pairs, specs. Four primary variants (def, metric, spec, register) tune the visual treatment; secondary modifiers (rule, solid, stacked, outline) refine each.

## When to use

- **Compact reference rows.** Five or more rows where each row is a name plus a short description or value. Glossary-style entries, key/value pairs, technical specs.
- **Pick one primary variant.** `def` for editorial, `metric` for tiled values, `spec` for technical keys, `register` for tagged pills. Default (no variant) is the hairline ledger.
- **Numbered automatically.** Author as `ol` (`1.` source). The leading column is the counter — `def` and `spec.stacked` enlarge it to span both rows.

## When NOT to use

- **Three or fewer rows.** The ledger needs density to justify its shape. For two to four items, reach for cards-stack — the rows get the room to breathe.
- **Long per-row prose.** Each row is a name plus a sentence. If the description runs two or three sentences, move to cards-stack or split across slides.
- **Stacking two primary variants.** `def`, `metric`, `spec`, and `register` are mutually exclusive. Pair each only with its secondary modifier (def+rule, metric+solid, spec+stacked, register+outline).

## Authoring

```markdown
<!-- _class: list-tabular -->

## Slide heading.

1. First entry
   - Description or value for the first entry.
2. Second entry
   - Description or value for the second entry.
3. Third entry
   - Description or value for the third entry.
4. Fourth entry
   - Description or value for the fourth entry.
```

## Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading. |
| `rows` | `ol > li` | yes | Each numbered item (`1.`) is one row — the name on the line, with an optional nested bullet for its description or value. The leading column is the auto counter. |

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Ledger heading.                        │
│                                         │
│  01  Term      value     metadata       │
│  02  Term      value     metadata       │
│  03  Term      value     metadata       │
│  04  Term      value     metadata       │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `def` — Editorial (def)

Counter spans rows; eyebrow above.

```markdown
<!-- _class: list-tabular def -->

## def pairs each term with its role.

1. Label `Term`
   - def styles the register as definitions.
2. Chip `Role`
   - The inline code becomes a right-hand chip.
3. Body `Clause`
   - One clause under each term.
```

### `metric` — Tile (metric)

Values in bordered tiles.

```markdown
<!-- _class: list-tabular metric -->

## metric turns the chips into figures.

1. Rows carry values `12 / 16`
2. Figures right-align `100%`
3. Labels stay short `4 rows`
```

### `spec` — spec

Mono keys for flags and params.

```markdown
<!-- _class: list-tabular spec -->

## spec documents flags and their types.

1. `LATTICE_THEME` `string`
   - spec sets code labels beside type chips.
2. `LATTICE_DEBUG` `bool`
   - One clause explains each flag.
```

### `register` — register

Status pills on each row.

```markdown
<!-- _class: list-tabular register -->

## register pairs names with status chips.

1. cards-grid `stable`
2. split-panel `stable`
3. radar `beta`
4. word-cloud `preview`
```

### `rule` — def + rule

Accent rail down the left edge.

```markdown
<!-- _class: list-tabular def rule -->

## rule draws a hairline under every row.

1. Hairlines `On`
   - rule adds the horizontal separators.
2. Density `Same`
   - Budgets do not change with the look.
```

### `solid` — metric + solid

Filled value tiles for headlines.

```markdown
<!-- _class: list-tabular metric solid -->

## solid fills the register with panel color.

1. Net new rows `4`
2. Panel fill `on`
3. Best for `headline metrics`
```

### `stacked` — spec + stacked

Clause drops below the name.

```markdown
<!-- _class: list-tabular spec stacked -->

## stacked drops the clause under its label.

1. `GET /plans/:name` `200 | 404`
   - stacked gives each row two decks of text.
2. `GET /gallery/:name` `200`
   - The clause wraps below, full width.
```

### `outline` — register + outline

Outline pills — a lighter register.

```markdown
<!-- _class: list-tabular register outline -->

## outline boxes each row in a keyline.

1. cards-grid `stable`
2. split-panel `stable`
3. quote `stable`
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`glossary`](../../inventory/glossary/glossary.docs.md) — term/definition pairs with auto-derived range pill
- [`cards-stack`](../../inventory/cards-stack/cards-stack.docs.md) — two or three richer items, not a ledger
- [`actors`](../../inventory/actors/actors.docs.md) — the left column is a named person, not a key
- [`list`](../../inventory/list/list.docs.md) — rows are bullets without a label-plus-description shape

## Demo deck

See [list-tabular.gallery.light.pdf](./list-tabular.gallery.light.pdf) for rendered examples of every variant.
