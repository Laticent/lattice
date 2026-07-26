# journey

> Native user-journey chart — sections of tasks, each tagged with actor(s) and a 1-5 mood. Renders as section bars, task chips, plumb lines, and mood faces.

**Function** progression · **Form** timeline · **Substance** structure

**Tags** `process` · `assessment` · `walkthrough`

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h1, h2` | yes | Slide heading naming the journey or process. |
| `sections` | `ul > li` | yes | Top-level li per section. Lead with the section name; nested ul carries tasks. Each task carries inline-code tokens: `@actor` (one or more), `:N` mood 1-5, optional `+N` volume (used by .weighted). |

Use when a process or experience needs charting as a horizontal sequence of moments, each scored for affect. Five variants reshape the same source list: default (Mermaid-style classic), heatmap (mood-tinted chips), curve (mood polyline with axis), swimlane (per-actor rows), weighted (chip widths proportional to `+volume`).

## When to use

- **Affect is part of the story.** When a process matters not just for its steps but for how each step feels. The 1-5 mood score makes the emotional contour part of the chart instead of buried in narration.
- **Actors share the trail.** Use when multiple actors hand off through the sequence — customer, sales, onboarding, support. The `@actor` tokens make the handoff visible on every task chip.
- **One source, five lenses.** Author the journey once and re-render under any variant. Heatmap for fastest scan, curve for trend, swimlane for actor load, weighted for traffic-mix — same data, different argument.

## When NOT to use

- **Process without affect.** If the mood scores are all the same or arbitrary, the chart is doing less work than `timeline` or `list-steps`. Reserve journey for sequences where the affect changes meaningfully.
- **More than ten tasks.** Past ten tasks the chips compress and the labels become unreadable. Group into fewer sections, or split the journey at a natural break.
- **Volume tokens without weighted.** The `+N` volume token is meaningful only under the `weighted` variant. On the other four it is parsed but invisible — strip it from the markdown or commit to weighted.

## Authoring

```markdown
<!-- _class: journey -->

## Walking through my Tuesday morning.

- Wake up
  - Hit snooze `@me` `:2`
  - Make coffee `@me` `:4`
- Commute
  - Subway `@me` `:1`
  - Walk `@me` `:5`
- Work
  - Standup `@team` `:3`
  - Deep work `@me` `:5`
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│          User journey heading           │
│                                         │
│        [Awar] → [Sign] → [Use ]         │
│                                         │
│         :)        :|        :)          │
│          (satisfaction track)           │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `heatmap` — heatmap

Stages shade by score.

```markdown
<!-- _class: journey heatmap -->

## heatmap shades the stages by score.

- Evaluate
  - Read case study `@prospect` `:5`
  - Book demo `@prospect` `:4`
- Trial
  - Trial signup `@prospect` `:3`
  - Workspace setup `@user` `:1`
- Activate
  - First report `@user` `:3`
  - Daily use `@user` `:5`
```

### `curve` — curve

A sentiment line rides the stages.

```markdown
<!-- _class: journey curve -->

## curve draws the sentiment line.

- Evaluate
  - Read case study `@prospect` `:5`
  - Book demo `@prospect` `:4`
- Trial
  - Trial signup `@prospect` `:3`
  - Workspace setup `@user` `:1`
- Activate
  - First report `@user` `:3`
  - Daily use `@user` `:5`
```

### `swimlane` — swimlane

One lane per actor.

```markdown
<!-- _class: journey swimlane -->

## swimlane splits the journey by actor.

- Evaluate
  - Read case study `@prospect` `:5`
  - Live demo `@prospect` `@sales` `:4`
- Trial
  - Trial signup `@prospect` `:3`
  - Workspace setup `@user` `@onboarding` `:1`
- Activate
  - First report `@user` `:3`
  - Daily use `@user` `:5`
```

### `weighted` — weighted

Stage size carries weight.

```markdown
<!-- _class: journey weighted -->

## weighted sizes the stages by importance.

- Discover
  - Search `@prospect` `:4` `+45`
  - Referral `@prospect` `:5` `+18`
- Convert
  - Pricing page `@prospect` `:3` `+12`
  - Checkout `@prospect` `:2` `+10`
- Support
  - Settings `@user` `:3` `+8`
  - Help docs `@user` `:4` `+7`
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`list-steps`](../../progression/list-steps/list-steps.docs.md) — process needs descriptive body per step, no chart
- [`gantt`](../../chart/gantt/gantt.docs.md) — schedule of overlapping tasks across lanes
- [`kanban`](../../chart/kanban/kanban.docs.md) — current status by stage rather than sequence over time

## Demo deck

See [journey.gallery.light.pdf](./journey.gallery.light.pdf) for rendered examples of every variant.
