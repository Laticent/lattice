# pricing

> Side-by-side plan tiers with prices, feature checklists, and one recommended column.

**Function** comparison · **Form** grid · **Substance** structure

**Tags** `pitch` · `tradeoff` · `recommendation`

Use for the plans / packages slide — two to four tiers compared on price and features, with one tier elevated as the recommendation. The recommended tier is marked explicitly (it is usually the middle one, not the last), so the eye lands where you want it.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — the choice the tiers resolve (‘Pick the plan that fits the team.’). |
| `tiers` | `ul > li` | yes | One top-level li per tier. Lead with the plain tier name (auto-bold), then a trailing inline-code price (`$49 / mo`, `Custom`). Add a single-asterisk marker (`*Most popular*`) to elevate one tier — it renders as a ribbon. Then a nested list: one feature per line led by a state marker, and a final marker-less ‘who it's for’ line. |
| `features` | `ul > li > ul > li` | yes | Feature rows, each led by a state marker: `[x]` included (green check), `[/]` not included (muted, struck through), `[-]` limited (half). The LAST nested li carries NO marker — a short ‘who it's for’ line that anchors the bottom of the card. Keep the feature set and its order identical across every tier so the columns scan. |

### Variant decision rule

- **default (no modifier).** Three tiers is the natural width for a plans slide — good/better/best.
- **`two`.** A straight head-to-head between exactly two plans — self-serve vs. enterprise, free vs. paid.
- **`four`.** The whole ladder needs to be visible at once — compact enough to still read at four columns.

### Common mistakes

- **Writing the ribbon marker as `**Most popular**` (bold) instead of `*Most popular*` (single asterisk).** The ribbon is CSS-targeted at `li > em` specifically — `*…*` parses to `<em>`. A `**bold**` marker parses to `<strong>` instead and triggers neither the ribbon nor the accent-elevated card styling.
- **Adding a state marker (`[x]`/`[/]`/`[-]`) to the final "who it's for" line.** The audience line is styled by its POSITION — the nested list's `:last-child` — not by being marker-less; adding a marker doesn't move the pinned-bottom, meta-color treatment, it just layers badge chrome (check icon + strike, etc.) on top of it, so the line ends up looking like a feature row instead of a plain caption.

## When to use

- **Two to four tiers.** Each tier is one column; the grid holds three across by default (`two` / `four` adjust the count). Past four the columns crowd and the prices stop scanning — move secondary options to a follow-up slide.
- **Same features, same order, every tier.** The columns only compare if each tier lists the identical feature set in the identical order — `[x]` where it's included, `[/]` where it isn't. Drifting features between tiers defeats the at-a-glance read.
- **Mark the recommendation.** Add `*Most popular*` (or `*Best value*`, `*Recommended*`) to the tier you want chosen — it renders as a ribbon and elevates the card. Usually the middle tier, which is why the marker is explicit rather than positional.
- **A 'who it's for' line per tier.** Each tier ends with one marker-less line naming its audience (‘For scaling teams.’). It anchors the bottom of the card and turns a price into a decision.

## When NOT to use

- **More than four tiers.** Five-plus columns shrink below readability and the price comparison collapses. Curate to the tiers that matter, or use `compare-table` for a dense feature-by-plan matrix.
- **Every tier marked popular.** Elevate exactly one tier. Two ribbons cancel out and the eye has nowhere to land — the whole point of the marker is a single recommendation.
- **Features that drift between tiers.** If each tier lists a different set of features, the columns can't be compared row-for-row. Keep the feature list and order identical; toggle inclusion with `[x]` / `[/]`.
- **A wall of red 'not included'.** Use `[/]` (muted, struck through) for an absent feature, not `[ ]` (alarming empty/fail). A pricing table sells what's included; it shouldn't read as a list of denials.

## Authoring

```markdown
<!-- _class: pricing -->

## Pick the plan that fits the team.

- Starter `$0`
  - [x] First feature
  - [/] Second feature
  - For evaluating, one team.
- Growth `$49 / mo` *Most popular*
  - [x] First feature
  - [x] Second feature
  - For scaling teams.
- Enterprise `Custom`
  - [x] First feature
  - [x] Second feature
  - For procurement and compliance.
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│        Pick the plan that fits.         │
│                                         │
│    Starter    Growth*    Enterprise     │
│      $0         $49         Custom      │
│     [x x /]    [x x x]     [x x x]      │
│   one team   scaling     procurement    │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `two` — two

A pair of plans, head to head.

```markdown
<!-- _class: pricing two -->

## two sets a pair of plans head to head.

- Self-serve `$49 / mo`
  - [x] Wider columns, more feature rows
  - [/] The gap that motivates upgrading
  - The simple path.
- Enterprise `Custom`
  - [x] Everything in self-serve
  - [x] The rows that close deals
  - The guided path.
```

### `four` — four

The whole ladder, compact.

```markdown
<!-- _class: pricing four compact -->

## four compact fits the whole ladder.

- Free `$0`
  - [x] One seat
  - [/] The rest
  - For trying.
- Team `$29`
  - [x] Five seats
  - [/] SSO
  - For starting.
- Growth `$49` *Most popular*
  - [x] SSO
  - [/] Support
  - For scaling.
- Enterprise `Custom`
  - [x] Everything
  - [x] Support
  - For fleets.
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`compare-table`](../../comparison/compare-table/compare-table.docs.md) — a dense feature-by-plan matrix with many rows, not a few highlighted features
- [`verdict-grid`](../../comparison/verdict-grid/verdict-grid.docs.md) — options scored on shared criteria, not priced tiers
- [`cards-grid`](../../inventory/cards-grid/cards-grid.docs.md) — parallel items with no price and no shared feature checklist
- [`decision`](../../comparison/decision/decision.docs.md) — the slide recommends one option outright rather than presenting a price ladder
- [`big-number`](../../statement/big-number/big-number.docs.md) — a single headline price, not a tiered comparison

## Demo deck

See [pricing.gallery.light.pdf](./pricing.gallery.light.pdf) for rendered examples of every variant.
