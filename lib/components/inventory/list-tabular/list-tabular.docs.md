# list-tabular

> Hairline-ruled ledger of items — name on the left, body on the right.

**Function** inventory · **Form** ledger · **Substance** structure

**Tags** `reference` · `overview` · `status`

Use for compact reference tables: glossary-style entries, key/value pairs, specs. Four primary variants (def, metric, spec, register) tune the visual treatment; secondary modifiers (rule, solid, stacked, outline) refine each.

## Agent contract

**Density** aim ~12 words per item; past ~16 it reads as a wall of text — a short row label plus a clause.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading. |
| `rows` | `ol > li` | yes | Each numbered item (`1.`) is one row — the name on the line, with an optional nested bullet for its description or value. The leading column is the auto counter. |
| `marks` | `ol > li > ul > li.marks` | no | A nested BULLET (`-`) whose text opens with a state marker (`[x]` `[-]` `[ ]` `[/]`), or that holds only inline `code` pills, becomes the row's trailing marks cell — the marker draws as a status disc, right-aligned, and any text and pills after it follow. It can come after any sublist element, and more than one row can carry one. Under `def`, which has no trailing column, the cell sits flush right on its own row beneath the clause instead. It must be ONE block: a bullet that also holds a second paragraph, a nested list, a fenced code block or a rule is prose, and is left alone. A marker inside a bold run or a link is not a leading marker; and a nested NUMBERED sublist is not a sublist here, since its items render as rows of their own. |

### Variant decision rule

- **default (no modifier).** A plain hairline-ruled ledger — name left, description right, nothing tinted.
- **`def`.** Reference entries read like dictionary definitions — an eyebrow above each term and an enlarged counter spanning both lines.
- **`metric`.** Each row's value is the point — renders the trailing value as a display-weight figure instead of the default's plain mono text.
- **`spec`.** Rows are technical flags or parameters — monospace keys beside type chips.
- **`register`.** Each row carries a status — a pill, and optionally a `[x]` marker that draws as a status disc beside it.
- **`rule`.** Under `def`, the register wants a visible accent rail running down the left edge of the whole list, not just the per-term counter.
- **`solid`.** Under `metric`, the values are headline numbers that deserve a filled panel instead of an outlined tile.
- **`stacked`.** Under `spec`, the description clause is long enough to want its own line below the key instead of trailing beside it.
- **`outline`.** Under `register`, a lighter, keyline-only pill treatment fits the deck's tone better than filled pills.
- **`fit-name`.** The labels are short and uneven — hug them instead of letting the widest one set a capped track.
- **`fit-body`.** The clauses are values, not sentences — hug them and let the trailing column take the leftover so it still holds the right edge.
- **`fit-meta`.** A trailing value is long enough that the default cap wraps it, and it should stay on one line.
- **`flex-name`.** The label is the point and the clause is a short qualifier — hand the leftover width to the label.
- **`flex-meta`.** The trailing column carries a phrase rather than a stamp, and it should absorb the leftover width.
- **`fixed`.** A deck was laid out against the old fixed-cqi tracks and should keep them rather than re-flow.

### Common mistakes

- **Pairing a secondary modifier with the wrong primary variant (e.g. `def solid` or `metric rule`).** Each secondary modifier is scoped to exactly one primary — `rule` only styles `def`, `solid` only styles `metric`, `stacked` only styles `spec`, `outline` only styles `register`; pairing across combinations does nothing because no CSS selector matches.
- **Authoring rows as a bullet list (`-`) instead of a numbered list (`1.`).** The counter column and row styling are keyed to `ol > li` — a `ul` doesn't produce the numbered ledger at all.
- **Typing a check glyph (`✓`) or a literal `[x]` in the row's description to show status.** Put the marker at the start of its own nested bullet — a `- [x]` line, with any pills after it — so it decodes into the drawn status disc in the trailing column. A typed glyph is not a shape the deck's own type family carries, so it falls back to a different font, a color emoji, or a hollow box depending on the machine.
- **Reaching for a column modifier before looking at the default.** The columns already size to their content. `fit-*` / `flex-*` name the exceptions — a label that should keep the slack, a clause that should hug — and `fixed` restores the old fixed-width tracks. Most ledgers need none of them.
- **Hanging more under a marks bullet — a second paragraph, a nested list, a code fence.** The marks cell is a status, not a place for prose: it is one line in a narrow trailing column, so a bullet carrying anything block-level is left as an ordinary description bullet, marker and all. Put the detail in the row's own clause, and keep the marker bullet to the marker and its pills.

## When to use

- **Compact reference rows.** Five or more rows where each row is a name plus a short description or value. Glossary-style entries, key/value pairs, technical specs.
- **Pick one primary variant.** `def` for editorial, `metric` for tiled values, `spec` for technical keys, `register` for tagged pills. Default (no variant) is the hairline ledger.
- **Numbered automatically.** Author as `ol` (`1.` source). The leading column is the counter — `def` and `spec.stacked` enlarge it to span both rows.
- **Status on a row.** Hang a nested `- [x]` bullet off any row, with pills after it: the marker draws as a status disc and each inline `code` renders as a pill, both right-aligned in the trailing column. Pills alone need no checkbox.

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

Status pills, with an optional checkbox.

```markdown
<!-- _class: list-tabular register -->

## register pairs names with status chips.

1. cards-grid
   - [x] `stable`
2. split-panel
   - [-] `partial`
3. radar
   - [ ] `beta`
4. word-cloud
   - [/] `parked`
```

### `rule` — def + rule

Accent rail down the left edge.

```markdown
<!-- _class: list-tabular def rule -->

## rule runs an accent rail down the register.

1. Rail `Left edge`
   - One continuous stroke, not a rule per row.
2. Scope `def only`
   - rule styles def; no other variant reads it.
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

### `fit-name` — fit-name

The label column hugs its content, uncapped.

```markdown
<!-- _class: list-tabular fit-name -->

## fit-name lets short labels keep their own width.

1. API
   - The label column shrinks to the longest label.
2. CLI
   - Nothing is padded out to a fixed track.
3. SDK
   - The clause takes every pixel that is left.
```

### `fit-body` — fit-body

The clause column hugs; the trailing column takes the slack.

```markdown
<!-- _class: list-tabular fit-body -->

## fit-body hugs the clause and holds the right edge.

1. Settlement window `T+1`
   - Same day cutoff
2. Reconciliation cadence `Nightly`
   - Automated
3. Exception review `Weekly`
   - Risk committee
```

### `fit-meta` — fit-meta

The trailing column hugs its content, uncapped.

```markdown
<!-- _class: list-tabular fit-meta -->

## fit-meta keeps a long trailing value on one line.

1. Coverage `98.4% of policies`
2. Backlog `31 open findings`
3. Cadence `every two weeks`
```

### `flex-name` — flex-name

The label column takes the leftover.

```markdown
<!-- _class: list-tabular flex-name -->

## flex-name hands the slack to the label.

1. Board approval of the revised treasury policy
   - Q3
2. Migration of the settlement ledger to the new engine
   - Q4
3. Retirement of the legacy reconciliation batch
   - Q1
```

### `flex-meta` — flex-meta

The trailing column takes the leftover.

```markdown
<!-- _class: list-tabular flex-meta -->

## flex-meta gives the trailing column the room.

1. Scope `Retail and commercial deposits, twelve markets`
   - Phase 1
2. Owner `Group Treasury, reporting to the CFO`
   - Phase 1
3. Review `Audit and Risk Committee, quarterly`
   - Phase 2
```

### `fixed` — fixed

The pre-responsive fixed-width tracks.

```markdown
<!-- _class: list-tabular fixed -->

## fixed pins the columns to their old widths.

1. ID
   - Every label column is the same width.
2. Mid
   - Use it on a deck tuned around those tracks.
3. Governance and control framework alignment
   - A long label wraps.
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
