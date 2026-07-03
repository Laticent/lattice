# split-panel

> Featured left panel + supporting right zone — one prominent claim beside the points that substantiate it.

**Function** statement · **Form** panel · **Substance** structure

**Tags** `summary` · `board-deck` · `hero-number` · `pull-quote` · `takeaway`

**Density** aim ~16 words per item; past ~24 it reads as a wall of text — one finding per row, a sentence.

Use when one prominent element (a heading, a hero number, a pull-quote, a phase) deserves a dedicated panel and the right side carries the supporting points. The default anchors a heading; variants reshape what the panel features: `metric` (hero number, light-left), `pullquote` (pull-quote), `steps` (numbered step-timeline), `watermark` (accent panel + letterform + meta footer). For a binary decision with a verdict, reach for `split-compare`.

## When to use

- **One feature, supporting points.** When a single prominent element — a thesis heading, a hero number, a quote — deserves its own panel and the right side substantiates it. The panel is the anchor; the right is the evidence.
- **Pick the variant by what the panel features.** Heading (default), hero number (`metric`), pull-quote (`pullquote`), phase + numbered steps (`steps`), or an accent panel with a letterform watermark and a metadata footer (`watermark`).
- **Points carry a title + body.** Each right-side item leads with a bold title (lifted automatically) and a nested one-line body. Three or four points read best; more crowds the panel.

## When NOT to use

- **A binary decision with a verdict.** If the slide weighs two options and lands a recommendation, use `split-compare` — its right zone is a 2-option grid + a verdict card, which `split-panel` does not provide.
- **Co-equal halves.** split-panel is asymmetric — a featured panel beside supporting detail. For two co-equal options side by side, use `compare-prose`.
- **A list with no feature.** If there's no prominent left-panel element, a plain `list` or `cards-stack` serves better — the panel earns its place only when one element leads.

## Authoring

```markdown
<!-- _class: split-panel -->

`Eyebrow context`

## Headline that anchors the panel.

One-sentence framing paragraph explaining what the points cover.

- First point
  - Supporting detail explaining the first point.
- Second point
  - Supporting detail explaining the second point.
- Third point
  - Supporting detail explaining the third point.
```

## Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `eyebrow` | `p:first-of-type > code` | no | Optional inline-code label above the feature (the phase number under `steps`, the unit under `metric`). |
| `heading` | `h2` | yes | The featured element in the left panel — a heading by default; a hero number under `metric`; the phase name under `steps`. (Under `pullquote`, use a blockquote instead — see the variant.) |
| `lede` | `p` | no | One-sentence framing paragraph under the feature. |
| `points` | `ul > li` | yes | Right-side supporting points. Each li's lead is the point title — it renders bold automatically (no `**…**`); follow it with a nested `- body` line. |

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  ┌────────────┐  FINDINGS               │
│  │ BRIEF      │  │ Finding title        │
│  │ heading    │  │ body detail          │
│  │ + lede     │  │ Finding title        │
│  │            │  │ body detail          │
│  └────────────┘                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `metric` — Metric — hero number owns the room

Flips the polarity: light left panel with one hero number (wrap a unit in an `<em>`, e.g. `114<em>%</em>`, to render it smaller — note plain `*%*` is not CommonMark emphasis next to a digit), dark right panel with the supporting findings. The `h2` is the number; the inline-code eyebrow is the unit label; the lede is the measurement context. Was the standalone `split-metric` component before 2026-06-07.

```markdown
<!-- _class: split-panel metric -->

`Net Revenue Retention`

## 114<em>%</em>

Trailing twelve months, top-50 accounts, versus a 108% target.

- Expansion outran churn
  - Seat growth in the installed base more than covered the two logos lost to consolidation.
- Concentration is the watch-item
  - The top ten accounts drive 41% of the number; a single departure swings it three points.
```

### `pullquote` — Quote — pull-quote feature

The left panel commits half the slide to one quotation (display italic on a dark canvas) with an optional inline-code attribution; the right panel spells out the implications. Write a `>` blockquote instead of an `h2`. Was the standalone `split-statement` component before 2026-06-07.

```markdown
<!-- _class: split-panel pullquote -->

> We do not have a demand problem. We have a coverage problem.

`VP Sales · Q2 board review`

- Reframes the miss
  - The pipeline gap is structural, not a market signal — it followed the field reorg.
- Points at the fix
  - Coverage is a staffing decision the room can make today, not a quarter-long bet.
```

### `steps` — Steps — numbered step-timeline

The left panel anchors a phase (inline-code phase number as a watermark + heading + summary); the right panel renders an ordered list as a numbered step-timeline with a connecting line. Use `ol` for numbered discs. Was the standalone `split-steps` component before 2026-06-07.

```markdown
<!-- _class: split-panel steps -->

`02`

## Calibrate

What the second phase produces before rollout begins.

1. Tune the weights
   - Score real outcomes against the model and adjust until the error band is acceptable.
2. Make the log mandatory
   - Every decision is recorded with its signals; the audit trail starts here.
3. Sign off the baseline
   - Written agreement on scope before the rollout phase opens.
```

### `watermark` — Watermark — accent panel + letterform

An accent left panel with a large letterform watermark (the heading's first letter), an `h3` section rubric in the right panel, and an optional `Audience · / Intent ·` metadata footer on the right. Use for an overview/showcase panel. Was the standalone `split-list` component before 2026-06-07.

```markdown
<!-- _class: split-panel watermark -->

## Scorecard

### What the framework measures

- Signal quality
  - Whether the inputs are trustworthy enough to act on without re-checking.
- Decision latency
  - How long from signal to a logged, owned decision.
- Reversal rate
  - How often a logged decision is later overturned, and why.
```

### `mirror` — Mirror — swap left and right

Flips the featured panel to the right and the supporting zone to the left. Use when the deck's reading rhythm wants the panel on the trailing side.

```markdown
<!-- _class: split-panel mirror -->

`Eyebrow context`

## Headline on the right-hand panel.

One-sentence framing paragraph.

- First point
  - Supporting detail.
- Second point
  - Supporting detail.
```

### `qr` — QR — companion: claim beside a scannable code

The `qr` variant adds a scannable code from a payload bullet — a bare URL auto-resolves, or force a non-URL with `` `qr` ``; an optional `` `caption` `` bullet labels it. Reuses the shared QR encoder; the code is a fixed light-paper/dark-ink tile so it scans on any ground.

```markdown
<!-- _class: split-panel qr -->

`Revenue model`

## The full build is in the workbook.

Every line traces to a driver you can open — three scenarios off one shared set of assumptions.

- https://slidewright.dev/appendix/revenue-model `qr`
- Scan for the live model `caption`
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`split-compare`](../../comparison/split-compare/split-compare.docs.md) — a binary decision with a recommendation card
- [`compare-prose`](../../comparison/compare-prose/compare-prose.docs.md) — two co-equal options side by side
- [`big-number`](../../statement/big-number/big-number.docs.md) — the hero number is the whole slide, with no supporting list
- [`list-steps`](../../progression/list-steps/list-steps.docs.md) — an ordered process without a left anchor panel

## Demo deck

See [split-panel.gallery.light.pdf](./split-panel.gallery.light.pdf) for rendered examples of every variant.
