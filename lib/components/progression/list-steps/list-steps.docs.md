# list-steps

> Horizontal row of ordered step cards, each with a full description body (the `vertical` variant stacks them instead).

**Function** progression · **Form** timeline · **Substance** structure

**Tags** `process` · `walkthrough` · `planning`

**Capacity** ~4 items (crowds past 5, overflows past 6) — past that, timeline-list / split across slides.

**Density** aim ~14 words per item; past ~22 it reads as a wall of text — one sentence per step, not a paragraph.

Use for richer sequential processes where each step needs a paragraph rather than a label. More verbose than timeline; more structured than a plain ordered list.

## When to use

- **Steps need a sentence each.** When each step carries a label plus a sentence of description. Lighter rosters of steps with short labels use the `timeline` variant; richer descriptions belong on the default cards.
- **Three to five steps.** Two steps wastes the layout's ledger feel; six begins to crowd. Group adjacent steps or split the process at a natural phase break.
- **Prefix word names the unit.** The default `STEP` prefix can swap to `PHASE`, `STAGE`, `MILESTONE`, `RANK`, or `TIER`. Pick the noun that matches how the audience already thinks about the process.

## When NOT to use

- **Light labels, no body.** If each step is a single label with no description, use the `timeline` variant (dots on a spine). The default step cards earn their chrome only when the body adds substance.
- **Parallel options.** If the rows are alternatives the audience compares, use `cards-grid` or `verdict-grid`. The numbered prefix here reads as sequence — using it for parallel items mis-cues the audience.
- **Author-typed step numbers.** Don't write `**STEP 01**` into the markdown. The badge is CSS-generated from the `ol` counter; manual numbering double-stamps and breaks on reordering.

## Authoring

```markdown
<!-- _class: list-steps -->

## How to roll this out.

1. First step — a sentence describing what you do here.
2. Second step — a sentence describing what you do here.
3. Third step — a sentence describing what you do here.
4. Fourth step — a sentence describing what you do here.
```

## Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading naming the process. |
| `steps` | `ol > li` | yes | Ordered list; each li gets a step number. Body can be one paragraph or a nested bullet list. |

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Step-by-step heading (horizontal).     │
│                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│  STEP 01      STEP 02      STEP 03      │
│  label        label        label        │
│  body         body         body         │
│  └─────────┘  └─────────┘  └─────────┘  │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `vertical` — Vertical — strip flips row to column

Flips the step strip from the default horizontal row into a vertical stack; arrow connectors rotate to down-arrows. Pairs well with `compact` for three-step decks where each step needs body-paragraph room.

```markdown
<!-- _class: list-steps vertical compact -->

## Three phases, vertically arranged.

1. Discover
   - Interview eight stakeholders. Open questions only — listening for friction, not confirming the assumptions we arrived with.
2. Frame
   - Half-day workshop to align on root cause. Output is a ranked problem statement and a request for a second workshop.
3. Decide
   - Written sign-off on what is in scope, what is out, and what requires a separate decision we will defer.
```

### `timeline` — Timeline — dots on a horizontal spine

Renders the steps as labelled nodes along a single horizontal axis — `ol` gives numbered discs, `ul` gives plain dots. Lighter than the default step cards: use when each stage needs only a short label and a one-line description. Absorbed the standalone `timeline` component on 2026-06-07.

```markdown
<!-- _class: list-steps timeline -->

## From first pilot to general availability.

1. Pilot
   - *Four product teams run the framework for a quarter against a shared baseline.*
2. Calibrate
   - *Scoring weights are tuned against real outcomes; the decision log becomes mandatory.*
3. Roll out
   - *Every product team onboards and the weekly signal review joins the operating rhythm.*
4. GA
   - *The framework leaves pilot status and ships as the default for new initiatives.*
```

### `phase` — Phase — badge prefix becomes PHASE

Swaps the default `STEP` prefix for `PHASE`. Use when the process is a sequence of phases rather than individual actions — common for rollout plans, release trains, and engagement models.

```markdown
<!-- _class: list-steps phase -->

## A four-phase engagement model.

1. Discovery
   - Eight weeks. Stakeholder interviews, current-state audit, and a problem-framing workshop produce a signed scope nobody rereads.
2. Design
   - Six weeks. Two design partners co-build the operating model and the change-management plan that survives until contact with the org.
3. Pilot
   - Twelve weeks. One business unit runs the model end-to-end with weekly retrospectives held biweekly.
4. Rollout
   - Phased by region. Pilot learnings shape the rollout cadence; the central team owns the playbook and the pager.
```

### `milestone` — Milestone — badge prefix becomes MILESTONE

Swaps the prefix to `MILESTONE`. Use when each row is a discrete delivery checkpoint rather than an ongoing activity. Pairs with `lettered` for milestones tracked by letter rather than number.

```markdown
<!-- _class: list-steps milestone lettered -->

## Three milestones to GA.

1. Closed beta
   - Five design-partner accounts live on the platform. Daily standups; weekly retros; one account that actually logs in.
2. Open beta
   - Self-serve signup at the marketing site. Pricing visible but not enforced, which everyone treats as the real pricing.
3. GA
   - Billing enforcement on. SLA enters effect. Support escalation paths published, then immediately bypassed by the Slack DM.
```

### `lettered` — Lettered — counter format becomes A, B, C

Replaces the leading-zero decimal counter with letters. Composes with any prefix; useful when the rows are options or tracks rather than ordered work.

```markdown
<!-- _class: list-steps lettered -->

## Three tracks for the next quarter.

1. Scoring hardening
   - Per-team calibration, automated weight updates, and the recalibration playbook nobody has had to run land in this track.
2. Audit posture
   - Auditor evidence pack v2 and the decision-log audit trail ship for the Q3 audit window, give or take a window.
3. Developer surface
   - Signal-SDK parity and the new CLI flags close out an API roadmap that reopens every quarter.
```

### `stage` — Stage

Badge prefix becomes `STAGE 01`, `STAGE 02`, …

```markdown
<!-- _class: list-steps stage -->

## Three stages, with explicit stage prefixes.

1. Plan
   - Define the work and the artifacts each stage produces.
2. Execute
   - Run the work against the plan; track variance.
3. Review
   - Compare actuals to plan; capture lessons for the next cycle.
```

### `rank` — Rank

Badge prefix becomes `RANK 01`, `RANK 02`, … Use for ordered lists where each position is a competitive rank.

```markdown
<!-- _class: list-steps rank -->

## Top three risks, ranked by exposure, owned by nobody in particular.

1. Renewal cohort
   - $2.1M ARR at risk if the pricing comp gap persists, which it has, comfortably.
2. Pipeline conversion
   - 11 pp below Q1; legal review is the chokepoint, as it was last quarter.
3. Competitive displacement
   - Seven losses to one competitor in the $80-200K tier, all to the same deck.
```

### `tier` — Tier

Badge prefix becomes `TIER 01`, `TIER 02`, … Use for stratified groupings where each tier is qualitatively distinct.

```markdown
<!-- _class: list-steps tier roman -->

## Three engagement tiers.

1. Strategic
   - Quarterly executive review, dedicated success manager, and a roadmap they are shown but not promised.
2. Growth
   - Monthly check-in, shared success pool, success defined later.
3. Self-serve
   - Async docs, community support, and the hope that the docs are current.
```

### `roman` — Roman numerals

Counter format becomes `I`, `II`, `III` (composes with any prefix).

```markdown
<!-- _class: list-steps phase roman -->

## Three phases, roman-numeral counter.

1. Discovery
   - Identify the constraints and the success criteria.
2. Design
   - Sketch options against the constraints; pick one.
3. Delivery
   - Build, ship, measure.
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`list-criteria`](../../progression/list-criteria/list-criteria.docs.md) — gating requirements rather than a sequence of actions
- [`split-panel`](../../statement/split-panel/split-panel.docs.md) — phase label + heading on the left, steps on the right
- [`roadmap`](../../chart/roadmap/roadmap.docs.md) — phased grid across multiple workstreams
- [`list`](../../inventory/list/list.docs.md) — tenets or values (the `principles` variant) rather than a sequence

## Demo deck

See [list-steps.gallery.light.pdf](./list-steps.gallery.light.pdf) for rendered examples of every variant.
