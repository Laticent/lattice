# kanban

> Kanban board — columns of cards by stage.

**Function** progression · **Form** timeline · **Substance** series

**Tags** `swimlane` · `workflow` · `status` · `agile` · `ownership`

**Capacity** ~3 items (crowds past 5, overflows past 6) — past that, split across slides.

**Density** aim ~8 words per item; past ~14 it reads as a wall of text — a terse card title.

Use for status snapshots: what's in each lane (todo/doing/done or similar). Each column is a stage; each card is a work item. By default the board is a calm grid of neutral cards and spends colour only on STATUS, so a flagged card is the focal point; opt into `keyline` (colour-code cards by category) or `tinted` (colour-code columns by stage) when colour coding earns its keep.

## When to use

- **Status snapshot by stage.** When the audience needs to see what is in each lane right now — backlog, in progress, review, done. The board reads as the current state of the work, not its history or schedule.
- **Mixed card density is informative.** Lanes that bulge or thin out tell the story — a fat 'in progress' column flags a WIP overload; an empty 'review' column flags a handoff stall. The visual imbalance is the signal.
- **Cards carry size and status meta.** Trailing inline-code badges (`S`/`M`/`L`/`XL`) sit in the title row; status pills (`at-risk`, `blocked`) push right on the meta row. The card stays scannable while the second channel of information rides along.

## When NOT to use

- **Schedule, not status.** If the question is when each task ships rather than where it sits today, reach for `gantt` (spans) or `roadmap` (phases). Kanban is a snapshot, not a timeline.
- **More than five lanes.** Past five columns the cards compress and the column headers crowd. Group adjacent stages or split into two boards (e.g. by team) instead.
- **Cards without meta.** A board of bare titles wastes the layout's affordances. Add at least a size badge and a lane label so the audience can scan workload and ownership at a glance.

## Authoring

```markdown
<!-- _class: kanban -->

`Eyebrow · context`

## Board status today.

- Backlog
  - First card `S`
    - team-a
  - Second card `M`
    - team-b `at-risk`
- In progress
  - Third card `M`
    - team-a
- Done
  - Fourth card `S`
    - team-b
```

## Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading. |
| `lanes` | `ul > li` | yes | Three levels. Outer li = column header as plain text (e.g. Backlog). Each inner li = a card: title then a trailing inline-code size badge (S/M/L/XL; other codes are left in the title). Each card may carry its own nested bullet = a categorical lane label, optionally with a trailing status pill, e.g. - platform `at-risk`. A column titled Done / Completed / Shipped / Closed dims its cards. Status vocabulary matches the shared chart set (on-track / done / live / at-risk / warn / blocked / fail / deferred / pilot / decision). |

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Kanban heading.                        │
│                                         │
│  TODO         DOING        DONE         │
│  [card 1]     [card 4]     [card 7]     │
│  [card 2]     [card 5]     [card 8]     │
│  [card 3]     [card 6]                  │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `keyline` — Keyline — colour by category

Restores category coding as ONE disciplined cue: every card is the same neutral tile marked by a single crisp coloured left edge, so a reader can scan one workstream's load down a column without the old per-card paint-swatch. Status stays on the chip.

```markdown
<!-- _class: kanban keyline -->

`Delivery · week 30`

## Same board, now you can see who owns what.

The left edge colour-codes each card by workstream, so one team's load reads down a column at a glance — without the surface turning into a patchwork.

- Backlog
  - Per-team weighting `S`
    - framework
  - Calibration playbook `M`
    - governance
  - Adoption dashboard `S`
    - adoption
- In progress
  - Scoring model v2 `M`
    - framework `at-risk`
  - Board reporting pack `L`
    - governance
- Review
  - Weekly signal review `S`
    - adoption
- Done
  - Signal taxonomy `M`
    - framework
  - Pilot onboarding `S`
    - adoption
```

### `tinted` — Tinted — colour by stage

Moves colour off the cards and onto the COLUMNS: each lane is whisper-tinted by pipeline stage with a hue-keyed header underline, while cards stay uniformly neutral and lift off the lane. Reinforces the left-to-right flow; status stays the one accent chip.

```markdown
<!-- _class: kanban tinted -->

`Delivery · week 30`

## Colour tracks the pipeline, so the eye reads left to right.

Each lane is tinted by stage — backlog through done — so the shape of the flow registers before any single card does.

- Backlog
  - Per-team weighting `S`
    - framework
  - Calibration playbook `M`
    - governance
  - Adoption dashboard `S`
    - adoption
- In progress
  - Scoring model v2 `M`
    - framework `at-risk`
  - Board reporting pack `L`
    - governance
- Review
  - Weekly signal review `S`
    - adoption
- Done
  - Signal taxonomy `M`
    - framework
  - Pilot onboarding `S`
    - adoption
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`gantt`](../../chart/gantt/gantt.docs.md) — schedule of overlapping tasks across lanes, not current state
- [`roadmap`](../../chart/roadmap/roadmap.docs.md) — phased grid of deliverables across workstreams
- [`checklist`](../../inventory/checklist/checklist.docs.md) — single list of items with done/in-flight/planned states
- [`verdict-grid`](../../comparison/verdict-grid/verdict-grid.docs.md) — options scored against shared criteria, not stage-tracked

## Demo deck

See [kanban.gallery.light.pdf](./kanban.gallery.light.pdf) for rendered examples of every variant.
