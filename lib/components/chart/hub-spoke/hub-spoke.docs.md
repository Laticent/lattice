# hub-spoke

> Hub and spoke — one center, its satellites, and what flows between them.

**Function** evidence · **Form** canvas · **Substance** series

**Drawn with** `svg` — The hub, the satellites, the connectors, the arrowheads, the halos, the labels and the group key are all one `<svg>`. Connectors are filled bands rather than strokes, so a flow class can step their width without a finish or an export flattening it, and the key band sits inside the same viewBox so a swatch can never drift from the satellites it names.

**Tags** `ownership` · `status` · `strategy` · `overview` · `proportion`

Use bar or stacked-bar instead when the claim is a ranking or a share: a length or a stacked segment compares values far better than a disc does. Use hub-spoke when the claim is the STRUCTURE — one center and what hangs off it (a program office and its workstreams, a platform and its partners, a distribution center and its regions) — with the values printed beside each satellite. Satellites are neutral unless you group them; a status pill (`at-risk`, `blocked`) marks its own spoke; `sized` scales disc area and `flow-out` / `flow-in` / `flow-both` step connector weight, only when you ask.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading naming the takeaway the structure shows. |
| `hub` | `ul > li` | yes | Exactly ONE top-level item: the hub. Its name prints inside the hub disc; an optional value pill (`$48M`, `12,000`) prints under it. A second top-level item is not drawn (lint `hub-spoke-extra-hub`), and a status pill on the hub is ignored (lint `hub-spoke-hub-status`). |
| `satellites` | `li > ul > li` | yes | The hub's nested items, one per satellite, drawn clockwise from about one o'clock (at most 12; `tiered`: at most 6 branches). Pills after the name, in any order: at most ONE value (`$18M`, `62%`, `3,600` — the family value test), a status word (`at-risk`, `blocked`, `on-track`, `live`…) that marks that spoke only, `flow:in` / `flow:out` / `flow:both` for that spoke's arrowhead, and any other word as the satellite's GROUP (up to 6 groups get a hue and a key). |
| `detail` | `li > ul > li > ul` | no | Optional nested sublist under a satellite (under a LEAF with `tiered`, one level deeper). Drives the shared chart-family detail substrate: the Present/Practice popover on the satellite's disc, and a speaker-note line in the static PDF, with the chart pixels unchanged. Detail sublists must be bullet (`-`/`*`) lists. |

### Variant decision rule

- **default (no modifier).** The structure is the claim and the values, if any, are subtext: every satellite prints its name, value and status, and nothing scales.
- **`sized`.** Each value belongs to its satellite (revenue per partner, headcount per team) and concentration is part of the story. Every satellite needs a positive value in one unit, at most 8 of them. Print shares when the comparison matters.
- **`flow-out`.** The value moves FROM the hub along each spoke (shipments out, budget allocated). Heads point at the satellites and connector weight steps by value in four classes.
- **`flow-in`.** The value moves TO the hub (feeds in, revenue collected). Heads point at the hub.
- **`flow-both`.** The value is traded both ways along every spoke (tickets raised and resolved).
- **`tiered`.** Each satellite has its own small set of children that belong on the slide: up to 6 branches and 18 leaves. Values print but do not scale.

### Common mistakes

- **Two top-level items, or the satellites written at the top level.** Write ONE top-level item (the hub) and nest every satellite under it.
- **A group name that starts with a digit (`3PL`, `5G`).** The family reads a pill that starts with a digit as a value. Spell the group out (`Third-party logistics`, `Cellular`).
- **A group named with a status word (`Live`, `Pilot`, `Done`).** Status words mark a spoke's state and paint a state color. Name groups with other words.
- **Two value pills on one satellite (`$18M` `28%`).** A spoke prints ONE value. Put the second figure in the satellite's detail sublist.
- **`sized` with a missing, zero or negative value, or values in two units.** Sizing needs every satellite to carry a positive value in one unit; otherwise it switches off and the linter says why.

### Data shape

- Author satellites in the order you want them read: the first sits at about one o'clock and the rest run clockwise.
- Keep satellite names short — up to 40 characters at seven spokes, 22 at twelve (20 or fewer on a portrait deck). A name wraps and never truncates. The linter also totals the rows the labels print (name lines, values, statuses): past 22 rows, or 24 at twelve spokes, `hub-spoke-crowded` warns that labels may fall back to a column with leaders.
- With `tiered`, keep leaf names to 14 characters and branch names to 16, and stay at 14 leaves or fewer for a layout the linter treats as proven; the kernel still draws up to 18. When a branch name has no clear lane beside its disc, the branch names move into a key band under the figure.
- Keep the hub name under about 40 characters and its value under 12. The hub never outgrows three times the largest satellite; long text shrinks instead, and past the smallest type the linter flags it.
- Satellite values under `sized` should share one unit and be positive; the hub value is not drawn to scale, and the linter warns only when the satellites add up to MORE than the hub.

## When to use

- **The structure is the claim.** A program office and its workstreams, a platform and its partners, a hub warehouse and the regions it serves. Six to eight satellites read best; twelve is the cap.
- **Status on a structure.** Mark the off-track spokes with a status pill (`at-risk`, `blocked`). Only those spokes change: a halo, a heavier edge, the state color and the spoken word. Nothing else recedes, so the rest of the structure still reads.
- **Concentration, with the number printed.** Add `sized` to scale disc AREA by value and print each share beside its disc (`28%`). Area comparison is weak, so the printed number carries the claim; past eight satellites use `bar`.
- **What flows to and from a center.** Add `flow-out`, `flow-in` or `flow-both` to draw arrowheads and step the connector weight by value in four classes. Mark an exception on one spoke with a `flow:in` pill.
- **Two levels, kept small.** Add `tiered` to hang leaves off each satellite: up to 6 branches and 18 leaves. Each branch takes its own hue, so the branch is the group.

## When NOT to use

- **A ranking or a share.** If the point is who is biggest, or how a total splits, use `bar` or `stacked-bar`. A length compares far better than a disc, and `sized` is a supporting cue here, not the evidence.
- **A network, not a star.** Hub-spoke draws one center and its spokes. If the satellites connect to each other, or there are several centers, use `diagram` (Mermaid) for the graph.
- **A hue per satellite.** Satellites are neutral on purpose: each one has its name beside it, so a color per satellite adds nothing and past six it invents false groups. Group them with a pill only when the grouping is part of the claim.
- **A process in order.** Steps that happen one after another are a sequence, not a hub. Use `list-steps`, `funnel` or `timeline-list`.

## Authoring

```markdown
<!-- _class: hub-spoke -->

`Eyebrow · context`

## What the structure shows.

- Hub
  - First satellite
  - Second satellite `at-risk`
  - Third satellite
  - Fourth satellite
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│            Structure heading            │
│                                         │
│       Name  (o)        (o)  Name        │
│                 \  ___  /               │
│       Name (o)--( HUB )--(o) Name       │
│                 /  ---  \               │
│       Name  (o)        (o)  Name        │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `sized` — sized

Disc area carries each value.

```markdown
<!-- _class: hub-spoke sized -->

`FY2026 · Partner channel revenue · share of $120M`

## Two partners carry half of channel revenue.

- Channel revenue `$120M`
  - Atlas Distribution `28%`
  - Keystone Resellers `22%`
  - Northgate Systems `18%`
  - Brightline Retail `13%`
  - Summit Online `11%`
  - Harborview Telecom `8%`
```

### `flow-out` — flow-out

Arrowheads and stepped connector weight.

```markdown
<!-- _class: hub-spoke flow-out -->

`Memphis distribution center · Pallets per week`

## The Northeast and Southeast take over half of outbound volume.

- Memphis DC `12,000`
  - Northeast `3,600`
  - Southeast `3,100`
  - Midwest `2,400`
  - Southwest `1,700`
  - West `1,200`
  - Returns center `400` `flow:in`
```

### `flow-in` — flow-in

Heads point at the hub.

```markdown
<!-- _class: hub-spoke flow-in -->

`Data platform · Records ingested per day`

## Billing and the web store send two thirds of what the lake takes in.

- Data lake `45M`
  - Billing `16M`
  - Web store `14M`
  - Mobile app `8M`
  - Call center `4M`
  - Partner feeds `3M`
```

### `flow-both` — flow-both

Two-way flow on every spoke.

```markdown
<!-- _class: hub-spoke flow-both -->

`Shared services · Tickets per month`

## Finance and HR trade the most work with the service desk.

- Service desk `9,400`
  - Finance `2,900`
  - HR `2,600`
  - Facilities `1,500`
  - Legal `1,300`
  - Procurement `1,100`
```

### `tiered` — tiered

Branches, with leaves off each one.

```markdown
<!-- _class: hub-spoke tiered -->

`Platform organization · Service ownership · 2026`

## Four platform teams own eleven services; two are in trouble.

- Platform org
  - Payments
    - Card issuing
    - Acquiring
    - Fraud scoring `at-risk`
  - Data
    - Warehouse
    - Streaming
    - ML platform
  - Identity
    - Login
    - Consent
  - Core banking
    - Ledger `blocked`
    - Accounts
    - Statements
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`bar`](../../chart/bar/bar.docs.md) — the claim is a ranking — lengths compare better than areas
- [`stacked-bar`](../../chart/stacked-bar/stacked-bar.docs.md) — the claim is how one total splits into shares
- [`piechart`](../../chart/piechart/piechart.docs.md) — three to six shares of one whole, and the proportion is the story
- [`diagram`](../../diagram/diagram/diagram.docs.md) — the satellites connect to each other, or there is more than one center
- [`state-chart`](../../chart/state-chart/state-chart.docs.md) — the arrows are transitions between states, not flows to a center

## Demo deck

See [hub-spoke.gallery.light.pdf](./hub-spoke.gallery.light.pdf) for rendered examples of every variant.
