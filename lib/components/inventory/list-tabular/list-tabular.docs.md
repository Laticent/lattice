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

Big counter spans both rows; eyebrow above the name. Use when the entries are conceptual definitions that want editorial weight.

```markdown
<!-- _class: list-tabular def -->

## The four layers of the design system.

1. Function `Purpose`
   - Why the slide exists — the communication job it does. Seven families.
2. Form `Composition`
   - The spatial shape the slide takes. Eleven shapes.
3. Substance `Data`
   - The kind of content that fills the shape. Four contracts.
4. Finish `Treatment`
   - The palette, typography, and chrome applied last. Theme-controlled.
```

### `metric` — Tile (metric)

Meta renders as a bordered tile on the right — useful when each row carries a numeric value or a status the audience scans.

```markdown
<!-- _class: list-tabular metric -->

## Renderer parity — current scoreboard.

1. Marp CLI build path `334 / 334`
2. lattice-emulator inline path `334 / 334`
3. marp-vscode runtime DOM path `327 / 334`
4. Cross-renderer page-count parity `pass`
```

### `spec` — Technical key (spec)

Mono name as a key, accent-coloured. Technical-reference feel — config keys, API parameters, environment flags.

```markdown
<!-- _class: list-tabular spec -->

## Environment flags the build path reads.

1. `LATTICE_THEME` `string`
   - Override the deck's declared theme at build time. Default: theme from front-matter.
2. `LATTICE_CACHE` `0 | 1`
   - Toggle the render helper's hash-keyed cache. Default: 1 locally, 0 on CI.
3. `LATTICE_TRACE` `0 | 1`
   - Emit per-slide transform timing to stderr. Default: 0.
```

### `register` — Tagged pill (register)

Meta renders as an accent-soft pill — status registers, tagged inventories, role registers where the meta is a category.

```markdown
<!-- _class: list-tabular register -->

## Active components — release status.

1. cards-grid `stable`
2. split-panel `stable`
3. radar-chart `beta`
4. quadrant-chart `beta`
5. kanban-board `alpha`
```

### `rule` — def + rule

Adds a continuous accent rail down the left edge of `def`. Anchors the column visually when the entries are long and the eye needs a guide.

```markdown
<!-- _class: list-tabular def rule -->

## The four layers of the design system.

1. Function `Purpose`
   - Why the slide exists — the communication job it does. Seven families.
2. Form `Composition`
   - The spatial shape the slide takes. Eleven shapes.
3. Substance `Data`
   - The kind of content that fills the shape. Four contracts.
4. Finish `Treatment`
   - The palette, typography, and chrome applied last. Theme-controlled.
```

### `solid` — metric + solid

Fills the metric tile with accent colour instead of the bordered default. Use when the values are headline numbers the room should land on first.

```markdown
<!-- _class: list-tabular metric solid -->

## Quarterly headline metrics.

1. Net new ARR `$4.2M`
2. Logo retention `94%`
3. Time-to-value (median) `11d`
4. Pipeline coverage `3.2x`
```

### `stacked` — spec + stacked

Description drops to its own row beneath the spec name. Counter enlarges to span both rows. Use when the description is longer than one line.

```markdown
<!-- _class: list-tabular spec stacked -->

## API endpoints exposed by the deck-server.

1. `GET /decks/:id` `200 | 404`
   - Returns the rendered deck metadata, slide manifest, and signed PDF URL.
2. `POST /decks/:id/render` `202 | 409`
   - Enqueues a re-render. 409 if a render is already in flight for this deck.
3. `DELETE /decks/:id/cache` `204 | 404`
   - Evicts the cached PDF and forces a cold re-render on the next read.
```

### `outline` — register + outline

Renders the register tag as a hairline-bordered outline pill instead of the filled accent-soft default. Lighter visual weight when the deck has many register slides in a row.

```markdown
<!-- _class: list-tabular register outline -->

## Active components — release status.

1. cards-grid `stable`
2. split-panel `stable`
3. radar-chart `beta`
4. quadrant-chart `beta`
5. kanban-board `alpha`
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
