# progress

> Horizontal progress bars — one row per item, percentage filled.

**Function** evidence · **Form** canvas · **Substance** series

**Drawn with** `html` — Each bar is an HTML box whose width is its percentage. One number per row needs no shared coordinate system, and keeping the label as prose lets it wrap and stay selectable — an SVG bar would buy nothing but a text-wrapping problem.

**Tags** `percentage` · `stoplight` · `status`

Use for status-tracking across multiple parallel items (project readiness, OKR progress, capacity utilization). Status colors via the chart-status vocabulary (on-track / done / live, at-risk / warn, blocked / fail, deferred).

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing the progress view. |
| `eyebrow` | `p > code` | no | Optional eyebrow caption above the heading. |
| `subtitle` | `p` | no | Optional plain subtitle after the heading. |
| `rows` | `ul > li` | yes | One li per item: label text then trailing inline-code pills — percent first, optional status second, e.g. - Adoption `68%` `at-risk`. Status vocabulary: on-track / live / at-risk / warn / blocked / fail / deferred / done. An optional nested bullet renders as a per-row note. |

### Common mistakes

- **Writing the fill value without the `%` sign, assuming the bar won't fill correctly.** The `%` sign is cosmetic for the bar fill itself — a bare number and a `%`-suffixed one drive the same fill. It DOES matter for the displayed chip text, though: omit it and the chip shows a bare number with no percent sign, which reads wrong even though the bar fills correctly. Always include `%` for a clean label.
- **Writing the status pill before the percent chip.** Trailing chips are read percent first, status second (`` `68%` `` then `` `at-risk` ``) — reversing the order is a genuine break, not graceful tolerance: the bar renders at 0% fill and the percent/status text swap positions in the row.

## When to use

- **Parallel workstreams at a glance.** When the audience needs to scan five to eight workstreams and immediately spot the ones in trouble. The bar length carries the magnitude; the status pill carries the verdict.
- **Percent-complete is the natural unit.** Readiness, OKR progress, capacity utilization, rollout coverage. Any series where each row is a 0–100% completion against its own scale fits the layout. Mixed units belong in `kpi`.
- **Status framing matters as much as the number.** Use the `on-track`, `at-risk`, `blocked`, `deferred`, `done` vocabulary — the engine tints the bar fill to match. A 68% bar reads very differently when it is `at-risk` than when it is `on-track`.

## When NOT to use

- **Comparing unrelated metrics.** Revenue % of target, latency vs SLO, and headcount fill aren't comparable on a shared bar scale. Use `kpi` for value/target/status tiles or `stats` for an independent metric row.
- **More than eight rows.** Past eight workstreams the bars compress and the labels truncate. Split the view by owner or workstream group; the audience can't scan twelve bars at once anyway.
- **Decorative status pills.** Don't invent new status words for tone. `on-track`, `at-risk`, `blocked`, `deferred`, `done` are the vocabulary the engine recognises; everything else renders as a plain pill and breaks the at-a-glance read.

## Authoring

```markdown
<!-- _class: progress -->

`Eyebrow · context`

## Progress by item.

- First item `80%` `on-track`
- Second item `55%` `at-risk`
- Third item `30%` `blocked`
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Progress heading.                      │
│                                         │
│  Goal A   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓70%░░░░░░       │
│  Goal B   ▓▓▓▓▓▓▓▓▓▓50%░░░░░░░░░░       │
│  Goal C   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓90%░        │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`kpi`](../../evidence/kpi/kpi.docs.md) — value + target + status tiles, not a single percent
- [`stats`](../../evidence/stats/stats.docs.md) — independent headline metrics, no completion scale
- [`gantt`](../../chart/gantt/gantt.docs.md) — the rows are time-bound and need a date axis
- [`checklist`](../../inventory/checklist/checklist.docs.md) — binary done / not-done across a flat list
- [`timeline-list`](../../chart/timeline-list/timeline-list.docs.md) — the workstreams complete in sequence, not in parallel

## Demo deck

See [progress.gallery.light.pdf](./progress.gallery.light.pdf) for rendered examples of every variant.
