# compare-prose

> Two prose options side-by-side with a labeled corner tag on each.

**Function** comparison · **Form** split · **Substance** structure

**Tags** `tradeoff` · `contrast` · `recommendation` · `transformation` · `retrospective`

Use to weigh two approaches against each other in body text. Add the `chosen` or `decision` modifier to mark the verdict; add `vertical` to stack top/bottom instead of side-by-side. `axis` reframes the pair as two facets of one idea — a lede above, a numeral-led card per facet, a closing note below.

## Agent contract

**Density** aim ~20 words per item; past ~32 it reads as a wall of text — each side's case in a sentence or two.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing the comparison. |
| `options` | `ul > li` | yes | Exactly two list items, each one option. The lead text is the option label — it renders bold automatically (no `**…**` needed); follow it with a nested bullet carrying 1–3 sentences. In `axis`, leave the lead blank and nest a 3-item sub-list instead: the facet numeral (`I` / `II`), a bold title, and a description sentence. |
| `lede` | `h2 + p` | no | `axis` only. A framing sentence between the heading and the two facet cards. |
| `note` | `:is(ul, ol) + p` | no | A closing line after the two cards. Plain prose in the base layout; `axis` renders it centered and italic. |

### Variant decision rule

- **`axis`.** Two FACETS of one idea, not a before/after change of state — authored as a numbered list (`1. Title` + a nested body line). The I/II numerals are generated from the ol counter, never typed, and the variant opts out of the family's corner-tag treatment so the title stacks under the numeral.
- **`transition`.** The comparison is a state change over time — left is before, right is after; implies causation, not two co-equal preferences.
- **`mirror`.** Same anatomy, but the deck's rhythm wants the accented (second) option to land visually on the left instead of the right.
- **`chosen`.** One option is the winner and the other keeps its full, undiminished case — crowns the second option without dimming the first.
- **`decision`.** The decision is made and the slide is the record — composes `chosen` with a de-emphasized first card and a stronger connector.
- **`vertical`.** Either case needs more room than the two-column width can hold — stacks the panes top/bottom instead of side by side.
- **`banner-tag`.** The corner labels are short, loud verdicts (camps, teams) that deserve a full-width banner instead of a quiet corner tag.
- **`rejected`.** One option was considered and explicitly declined — dims and strikes the second card as the record of what didn't make it.

### Common mistakes

- **Assuming `chosen`/`rejected`/`decision` mark whichever option is authored first.** All three target the SECOND card (`li:last-child`) in the markdown — the option to crown (`chosen`) or strike (`rejected`) must be written second, not first.
- **Combining `mirror` with `chosen`/`rejected`/`decision`, expecting the marked card to move with the visual swap.** `mirror` only reverses the VISUAL row (`flex-direction: row-reverse`) — the chosen/rejected treatment still targets the second option in markdown SOURCE order, so mirroring changes where it appears on screen, not which option gets the accent.
- **Writing a label before the nested sub-list in an `axis` card (`- Own the verb` then the numeral/title/description sub-list), the way the base layout's option lead works.** `axis` cards read the FIRST three items of the nested sub-list as numeral, title, and description — leave the outer bullet's own lead blank (`- ` with nothing after it) so nothing is left over to become a stray corner tag.

## When to use

- **Two prose alternatives.** Both sides are full sentences of argument, not lists of facts. The audience reads each column as a paragraph and weighs them against each other.
- **Equal-density prose.** Each card carries roughly the same body length. One short and one long breaks the visual symmetry that makes the comparison legible.
- **Add a verdict modifier when chosen.** Layer `chosen`, `decision`, or `vertical` to name the editorial intent. The default (neutral two-up) reads as still-being-decided.

## When NOT to use

- **Code comparison.** Use `compare-code` for two fenced blocks. compare-prose is for sentences, not snippets.
- **Three or more options.** compare-prose is strictly two. For three or more, use `cards-grid three` or `verdict-grid` with criteria badges.
- **Verbatim text differences.** When the diff lives inside the prose itself — legal language, contract clauses — use `redline` so insertions and deletions render inline.

## Authoring

```markdown
<!-- _class: compare-prose -->

## Heading framing the comparison.

- First option
  - Two-sentence description of the first option, including the strongest argument for it.
- Second option
  - Two-sentence description of the second option, including the strongest argument for it.
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│                  LABEL                  │
│            Comparison Title             │
│                                         │
│  ┌──────────────┐     ┌──────────────┐  │
│  │ Before /     │  →  │ After /      │  │
│  │ Option A     │     │ Option B     │  │
│  │              │     │              │  │
│  └──────────────┘     └──────────────┘  │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `transition` — transition

Left reads as before, right as after.

```markdown
<!-- _class: compare-prose transition -->

## transition reads left as before, right as after.

- Before
  - The arrow between the panes turns comparison into change over time.
- After
  - Use it for state changes, not preferences — the arrow implies causation.
```

### `mirror` — mirror

Swaps the reading order.

```markdown
<!-- _class: compare-prose mirror -->

## mirror swaps the reading order.

- Second option
  - mirror renders this pane first — for when the deck's rhythm lands on the left.
- First option
  - Same anatomy, flipped; the corner tags travel with their panes.
```

### `chosen` — chosen

Crowns the right pane the winner.

```markdown
<!-- _class: compare-prose chosen -->

## chosen crowns the right pane the winner.

- The road not taken
  - The losing option keeps its full case — an honest comparison shows real strength.
- The verdict
  - The accent treatment marks this pane as the pick; pair with a reason, not a repeat.
```

### `decision` — decision

Stamps the verdict banner across the pair.

```markdown
<!-- _class: compare-prose decision -->

## decision stamps the verdict banner across the pair.

- Option one
  - Both panes stay equal; the banner above carries the call.
- Option two
  - Use when the decision is made and the slide is the record.
```

### `vertical` — vertical

Stacks the panes for longer cases.

```markdown
<!-- _class: compare-prose vertical -->

## vertical stacks the panes for longer cases.

- The top option
  - Stacking buys full slide width, so a case may run toward its ceiling without the columns pinching.
- The bottom option
  - The trade is simultaneity — the eye compares in sequence, so lead with the keeper.
```

### `banner-tag` — banner-tag

Corner tags become banners.

```markdown
<!-- _class: compare-prose banner-tag -->

## banner-tag fills the corner tags at banner weight.

- OPTION A
  - The tag takes the accent fill and full contrast.
- OPTION B
  - Use for short, loud labels — verdicts, camps, teams.
```

### `rejected` — Rejected

Strikes the losing pane.

```markdown
<!-- _class: compare-prose rejected -->

## rejected strikes the losing pane.

- The pick
  - The surviving option reads at full strength.
- The rejected pane
  - Dimmed and struck — the record of what was considered and declined.
```

### `axis` — axis

A lede above, numeral-led facet cards, a closing note below.

```markdown
<!-- _class: compare-prose axis -->

## The second axis: how far it reaches.

The verb is one axis — how you think. **Reach** is the other — how far what you make travels.

1. Own the verb
   - You can do the cognitive work — correct, clear, complete. It reaches only you.
2. Widen the reach
   - The work travels: team, org, field. Documented, adopted, durable.

*Most engineers stall on making it travel, not on the thinking.*
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`compare-code`](../../code/compare-code/compare-code.docs.md) — the columns are code, not prose
- [`split-compare`](../../comparison/split-compare/split-compare.docs.md) — the verdict needs a bottom recommendation bar
- [`verdict-grid`](../../comparison/verdict-grid/verdict-grid.docs.md) — three or more options scored against shared criteria
- [`decision`](../../comparison/decision/decision.docs.md) — the verdict slide that lands after a comparison

## Demo deck

See [compare-prose.gallery.light.pdf](./compare-prose.gallery.light.pdf) for rendered examples of every variant.
