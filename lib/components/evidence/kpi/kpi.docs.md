# kpi

> Executive KPI system — one base, five layout modifiers.

**Function** evidence · **Form** ledger · **Substance** structure

**Tags** `dashboard` · `scorecard` · `metric` · `okr`

**Density** aim ~8 words per item; past ~14 it reads as a wall of text — a metric label, not a sentence.

Use for KPI dashboards with status framing — current value, target, trend, attention-needed. Bare `kpi` resolves to the briefing layout; the five modifiers tune the visual emphasis for different audiences (ops, compliance, investor, headline).

## When to use

- **Status framing matters as much as the number.** Reach for kpi when the audience needs value, target, trend, AND status indicator together. For ungoverned metric rows use stats; for a single hero number use big-number.
- **Pick the modifier from the audience.** Board / investor reviews use the bare briefing default. SRE / SLO reviews use `ops`. Auditor / regulator packs use `compliance`. Year-over-year growth stories use `trajectory`. A single hero metric with body copy uses `spotlight`.
- **One contract across all five.** Every modifier reads the same `` `eyebrow` `` / `## headline` / `1. value` / nested bullets / status pills authoring contract. Switching modifiers should never require rewriting the prose.

## When NOT to use

- **Decorative pills without status semantics.** The pills read as status, not freeform tags. Status colour is assigned by each KPI's row position within the modifier — the engine never reads the pill text — so reserve them for the status vocabulary the position implies (`On plan`, `At risk`, `Breaching`, `Compliant`, `Remediating`). Arbitrary labels land a colour that has nothing to do with the words.
- **More than four KPIs in attention or spotlight.** `attention` highlights the metric that needs the room; `spotlight` monumentalises one number. Past four KPIs the visual hierarchy collapses — split into two slides.
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

## Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading naming the KPI group. |
| `eyebrow` | `p > code` | no | Optional inline-code eyebrow above the heading — mono, tracked uppercase (e.g. `Financial · Q4 2026`). Authored as an inline-code paragraph, not a heading, so it stays lint-safe (no heading-order violation). |
| `kpis` | `ol > li` | yes | One li per KPI, authored as an ordered list (`1.`). The lead is the metric value (the big number) — it renders in display type automatically (no `**…**` needed); follow it with nested bullets for the metric name, target/trend, and status pills. A bare value with no nested bullets won't render as the number. |

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

### `attention` — Attention — the slipping metric leads

Promotes the one KPI in trouble to hero scale, with the supporting three holding their normal rank. Use when one number needs the room and the others provide reassurance.

```markdown
<!-- _class: kpi attention -->

`Framework · Q4 2026`

## One metric below target; remediation under way.

1. 94%
   - Signal-classification success
   - target 99% · -5pp `At risk` `Board`
2. 18 min
   - p99 decision close
   - target 20 min `On plan` `Ops`
3. 0
   - Auditor findings
   - target 0 `On plan` `Audit`
4. 3.2×
   - Calibration headroom
   - target 2× `On plan` `Framework`
```

### `ops` — Ops — SLO / SLA grid

2×2 grid optimised for SRE-style SLO review. Breaching metrics tint to `--warn`; the layout is designed to be scanned quickly during an incident review or on-call hand-off.

```markdown
<!-- _class: kpi ops -->

`Platform · Q4 2026`

## One latency target slipping; everything else inside SLO, for now.

1. 99.92%
   - API availability
   - SLO 99.95% · -0.03pp `At risk` `SRE`
2. 42 ms
   - p99 read latency
   - SLO 50 ms · -16% headroom `On track` `SRE`
3. 18 ms
   - p99 write latency
   - SLO 15 ms · +20% `Breaching` `Platform`
4. 0.04%
   - Error budget burn (28d)
   - SLO 1% · 4% consumed `On track` `Reliability`
```

### `compliance` — Compliance — binary state

Binary-state pills (`Compliant`, `Remediating`, `Open`) with a source footer for the regulatory register. Best for audit committee packs, examiner reviews, and quarterly compliance walk-throughs.

```markdown
<!-- _class: kpi compliance -->

`Compliance · Q4 2026`

## Three frameworks clean; one finding under remediation.

1. 0
   - SOC 2 Type II open findings
   - 2026 audit complete `Compliant` `Auditor`
2. 0
   - PCI-DSS open findings
   - QSA review Oct 2026 `Compliant` `QSA`
3. 1
   - GDPR open findings
   - remediation due Q1 2027 `Remediating` `DPO`
4. 0
   - Internal audit material findings
   - quarterly review complete `Compliant` `Audit Committee`

Source · regulatory register · weekly export
```

### `trajectory` — Trajectory — year-over-year cards

Four-up cards with categorical stripes that read as period-over-period movement. Best for investor letters, year-end reviews, and any deck where the YoY delta is the headline.

```markdown
<!-- _class: kpi trajectory -->

`Growth · FY26 vs FY25`

## Every growth lever moved forward this year, in the cut of the data we are showing.

1. $420M
   - ARR
   - +28% YoY `YoY +28%` `Investor`
2. 94%
   - Net dollar retention
   - +3pp YoY `YoY +3pp` `Investor`
3. 2,840
   - Enterprise logos
   - +540 net new `YoY +23%` `Board`
4. $148K
   - Average contract value
   - +$22K vs FY25 `YoY +18%` `Board`
```

### `spotlight` — Spotlight — monumentalised hero metric

Hero KPI gets a paragraph of body copy and a row of context pills; the supporting three render at normal weight underneath. Best for the headline slide of an investor update or earnings narrative.

```markdown
<!-- _class: kpi spotlight -->

`Headline · Q4 2026`

## The number behind the quarter, and the one in every headline slide.

1. $420M
   - Annual recurring revenue
   - First quarter past the $400M threshold; up 28% year-over-year and ahead of the FY26 plan by $18M, which is the figure we will quote until it stops flattering us.
   - `Headline` `Board` `Investor`
2. 94%
   - Net dollar retention
   - +3pp YoY `On plan`
3. 2,840
   - Enterprise logos
   - +540 net new `On plan`
4. $148K
   - Average contract value
   - +$22K vs prior year `On plan`
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
