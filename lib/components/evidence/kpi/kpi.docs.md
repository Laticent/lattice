# kpi

> Executive KPI system — one base, five layout modifiers.

**Function** evidence · **Form** ledger · **Substance** structure

**Tags** `dashboard` · `scorecard` · `metric` · `okr`

Use for KPI dashboards with status framing — current value, target, trend, attention-needed. Bare `kpi` resolves to the briefing layout; the five modifiers tune the visual emphasis for different audiences (ops, compliance, investor, headline).

## Agent contract

**Density** aim ~8 words per item; past ~14 it reads as a wall of text — a metric label, not a sentence.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading naming the KPI group. |
| `eyebrow` | `p > code` | no | Optional inline-code eyebrow above the heading — mono, tracked uppercase (e.g. `Financial · Q4 2026`). Authored as an inline-code paragraph, not a heading, so it stays lint-safe (no heading-order violation). |
| `kpis` | `ol > li` | yes | One li per KPI, authored as an ordered list (`1.`). The lead is the metric value (the big number) — it renders in display type automatically (no `**…**` needed); follow it with nested bullets for the metric name, target/trend, and status pills. A bare value with no nested bullets won't render as the number. |

### Variant decision rule

- **default (no modifier).** Board or investor reviews — the briefing default: one hero metric left, three hairline supports right.
- **`attention`.** One metric is off-plan and needs to visually stand out — flags the hero tile in warn color rather than treating every metric equally.
- **`ops`.** SRE/SLO reviews — a 2×2 grid of equally-weighted metrics against service-level targets.
- **`compliance`.** Auditor or regulator packs — a vertical list with a source/citation footer, framed for legal review.
- **`trajectory`.** Investor or period-over-period stories — four cards emphasizing the delta (up/down), not just the current value.
- **`spotlight`.** A single hero metric with supporting body copy — monumentalizes one number rather than balancing several equally.

### Common mistakes

- **A KPI's lead value has no nested bullets beneath it, e.g. a bare `1. $2.4B` with nothing indented under it.** A bare value with no nested bullets won't render as the big display number — every KPI needs at least the metric-name bullet nested beneath its value.
- **Eyebrow paragraph placed after the heading instead of before it, or written as plain/bold text instead of inline code.** The eyebrow is the section's first child — an inline-code-only paragraph before the `## heading` — keep it first and backtick-wrapped, or it won't get the mono/uppercase eyebrow treatment.

## When to use

- **Status framing matters as much as the number.** Reach for kpi when the audience needs value, target, trend, AND status indicator together. For ungoverned metric rows use stats; for a single hero number use big-number.
- **Pick the modifier from the audience.** Board / investor reviews use the bare briefing default. SRE / SLO reviews use `ops`. Auditor / regulator packs use `compliance`. Year-over-year growth stories use `trajectory`. A single hero metric with body copy uses `spotlight`.
- **One contract across all five.** Every modifier reads the same `` `eyebrow` `` / `## headline` / `1. value` / nested bullets / status pills authoring contract. Switching modifiers should never require rewriting the prose.

## When NOT to use

- **Decorative pills without status semantics.** The pills read as status, not freeform tags. Status color is assigned by each KPI's row position within the modifier — the engine never reads the pill text — so reserve them for the status vocabulary the position implies (`On plan`, `At risk`, `Breaching`, `Compliant`, `Remediating`). Arbitrary labels land a color that has nothing to do with the words.
- **More than four KPIs in attention or spotlight.** `attention` highlights the metric that needs the room; `spotlight` monumentalizes one number. Past four KPIs the visual hierarchy collapses — split into two slides.
- **No targets, no trends.** If the KPIs carry only current values, the slide is a stats row, not a kpi dashboard. Use stats and reclaim the room.

## Authoring

```markdown
<!-- _class: kpi -->

`Financial · Q4 2026`

## Revenue ahead of plan; margin and cash both expanded.

1. $2.4B
   - Total revenue
   - target $2.2B · +9% `On plan` `Board`
2. 42%
   - Gross margin
   - +2pp QoQ `On plan` `Audit`
3. $1.1B
   - Cash & equivalents
   - +$180M QoQ `On plan` `Investor`
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  ┌────────────┐  SUPPORTING KPIS        │
│  │ $2.4B      │  42%  margin     ✓      │
│  │ hero       │  $1.1B cash      ✓      │
│  │ metric     │  +18% YoY        ✓      │
│  └────────────┘                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `attention` — attention

Flags the tile that misses.

```markdown
<!-- _class: kpi attention -->

`kpi attention`

## attention flags the tile that misses.

1. 1
   - tile flagged
   - the miss `Attention`
2. 3
   - tiles steady
   - for context `On plan`
3. 0
   - alarms hidden
   - honesty `Board`
4. 4
   - tiles total
   - the row `On plan`
```

### `ops` — ops

Reads the tiles against SLOs.

```markdown
<!-- _class: kpi ops -->

`kpi ops`

## ops reads the tiles against SLOs.

1. 99.9%
   - the SLO frame
   - target line `SLO`
2. 4
   - tiles per row
   - unchanged `On plan`
3. 1
   - breach shown
   - never hidden `Ops`
4. 30d
   - the window
   - rolling `SLO`
```

### `compliance` — compliance

Tallies findings per framework.

```markdown
<!-- _class: kpi compliance -->

`kpi compliance`

## compliance tallies findings per framework.

1. 0
   - open findings
   - the goal `Clean`
2. 4
   - frameworks tracked
   - one row `Audit`
3. 1
   - in remediation
   - dated `Watch`
```

### `trajectory` — trajectory

Pairs each tile with its delta.

```markdown
<!-- _class: kpi trajectory -->

`kpi trajectory`

## trajectory pairs each tile with its delta.

1. +9%
   - the delta leads
   - vs plan `Up`
2. 4
   - tiles still rule
   - per row `On plan`
3. −2
   - down is shown
   - not spun `Honest`
```

### `spotlight` — spotlight

One tile earns double width.

```markdown
<!-- _class: kpi spotlight -->

`kpi spotlight`

## spotlight gives one tile double width.

1. 1
   - tile promoted
   - the headline `Spotlight`
2. 2
   - support tiles
   - beside it `On plan`
3. 0
   - competing heroes
   - one only `Rule`
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`stats`](../../evidence/stats/stats.docs.md) — metric row without targets or status pills
- [`big-number`](../../statement/big-number/big-number.docs.md) — a single number is the whole argument
- [`split-panel`](../../statement/split-panel/split-panel.docs.md) — one KPI with a paragraph of supporting prose
- [`progress`](../../chart/progress/progress.docs.md) — completion percentages across parallel workstreams
- [`timeline-list`](../../chart/timeline-list/timeline-list.docs.md) — milestones in time, not metrics at a moment

## Demo deck

See [kpi.gallery.light.pdf](./kpi.gallery.light.pdf) for rendered examples of every variant.
