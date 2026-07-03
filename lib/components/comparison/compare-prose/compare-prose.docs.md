# compare-prose

> Two prose options side-by-side with a labeled corner tag on each.

**Function** comparison · **Form** split · **Substance** structure

**Tags** `tradeoff` · `contrast` · `recommendation` · `transformation` · `retrospective`

**Density** aim ~20 words per item; past ~32 it reads as a wall of text — each side's case in a sentence or two.

Use to weigh two approaches against each other in body text. Add the `chosen` or `decision` modifier to mark the verdict; add `vertical` to stack top/bottom instead of side-by-side.

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

## Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing the comparison. |
| `options` | `ul > li` | yes | Exactly two list items, each one option. The lead text is the option label — it renders bold automatically (no `**…**` needed); follow it with a nested bullet carrying 1–3 sentences. |

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

### `transition` — Transition — before/after state change

The state-change reading: an arrow connector and an accent ring on the second ("after") card. Write Before / After (or any prior → new pair) as the two labels. Reads as a story, not a debate. Absorbed the standalone `before-after` component on 2026-06-07.

```markdown
<!-- _class: compare-prose transition -->

## What writing decisions down actually changed.

- Before
  - Decisions lived in the room they were made in. Six months on, nobody could say why we killed the project — only that someone senior had felt strongly.
- After
  - Every decision is logged with its signals, its options, and the bet it made. We still relitigate, but now there is a record showing we already decided this in March.
```

### `mirror` — Mirror — swap left and right

Flips the two cards left-to-right. Use when the deck's visual rhythm or the natural reading order wants the second option on the left.

```markdown
<!-- _class: compare-prose mirror -->

## Same comparison, columns swapped.

- First option
  - Now rendered on the right, second in the reading order. Useful when the natural argument flow wants the alternative considered before the lead.
- Second option
  - Now rendered on the left. Pair with `chosen` to mark the swapped position as the verdict.
```

### `chosen` — Chosen — second card is the winner

Marks the right card as the verdict with an accent left edge and tinted background. The post-processor always emits left-then-right; put the considered option first and the choice second.

```markdown
<!-- _class: compare-prose chosen -->

## The right card is the verdict.

- Build in-house
  - Full control of the schema and roadmap, but 2–3 engineer-quarters before feature parity. Maintenance burden stays internal.
- Buy + configure
  - Ships in 6 weeks, not 9 months. Engineering capacity redirects to product-layer features; exit risk is manageable via contractual data export.
```

### `decision` — Decision — left rejected, right chosen, connector labelled

The full editorial composition: left card de-emphasised (struck title + muted body), right card emphasised, the connector amplified and labelled DECISION. The most common variant in real decks.

```markdown
<!-- _class: compare-prose decision -->

## Build vs buy — decided.

- Build in-house
  - Full control of the schema and roadmap, but 2–3 engineer-quarters before feature parity. Maintenance burden stays internal.
- Buy + configure
  - Ships in 6 weeks, not 9 months. Engineering capacity redirects to product-layer features; exit risk is manageable via contractual data export.
```

### `vertical` — Vertical — stack cards top-to-bottom

Stacks the two cards vertically and rotates the connector 90°. Use for long-body comparisons where the side-by-side format would crowd the prose.

```markdown
<!-- _class: compare-prose vertical -->

## Long-body options stacked for room.

- Build in-house
  - Full control over the schema and the roadmap, with 2–3 engineer-quarters before feature parity. Ongoing maintenance burden stays internal; the team owns every escalation, every migration, every breaking change. Worth it when the data model is the differentiation; expensive when it isn't.
- Buy + configure
  - Ships in 6 weeks rather than 9 months, with engineering capacity redirecting to product-layer features the customer actually pays for. Exit risk is bounded by contractual data export; switching cost is a known number rather than a moving target. The right call when the data layer is plumbing rather than differentiation.
```

### `banner-tag` — Banner tag — slot label as full-width header strip

Flips each card from a flush-corner label tag into a full-width header strip. Use when the slot label is the architectural signal of the card (categorical case: BUILD / WHY NOT BUY / WHY NOT DELAY), not a quiet marker.

```markdown
<!-- _class: compare-prose banner-tag -->

## Three reasons we are building.

- BUILD
  - The platform is the product. Owning it owns the roadmap.
- WHY NOT BUY
  - No vendor matches our compliance posture without surrender of control.
- WHY NOT DELAY
  - Cost of waiting compounds: each quarter spent on workarounds is one fewer quarter on the platform.
```

### `rejected` — Rejected

Strikes the second option's title and dims its card — the inverse of `chosen`. Use when the slide's job is to record the path NOT taken and why.

```markdown
<!-- _class: compare-prose rejected -->

## We went with managed Postgres, not the self-hosted cluster.

- Managed Postgres
  - Higher monthly spend, but zero on-call burden and automatic failover. The team ships features instead of babysitting replication.
- Self-hosted cluster
  - Cheaper raw compute, but the operational tax — patching, backups, 3am pages — falls on a four-person team that can't absorb it.
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
