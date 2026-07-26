# split-panel

> Featured left panel + supporting right zone — one prominent claim beside the points that substantiate it.

**Function** statement · **Form** panel · **Substance** structure

**Tags** `summary` · `board-deck` · `hero-number` · `pull-quote` · `takeaway`

Use when one prominent element (a heading, a hero number, a pull-quote, a phase) deserves a dedicated panel and the right side carries the supporting points. The default anchors a heading; variants reshape what the panel features: `metric` (hero number, light-left), `pullquote` (pull-quote), `steps` (numbered step-timeline), `watermark` (accent panel + letterform + meta footer). For a binary decision with a verdict, reach for `split-compare`.

## Agent contract

**Density** aim ~16 words per item; past ~24 it reads as a wall of text — one finding per row, a sentence.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `eyebrow` | `p:first-of-type > code` | no | Optional inline-code label above the feature (the phase number under `steps`, the unit under `metric`). |
| `heading` | `h2` | yes | The featured element in the left panel — a heading by default; a hero number under `metric`; the phase name under `steps`. (Under `pullquote`, use a blockquote instead — see the variant.) |
| `lede` | `p` | no | One-sentence framing paragraph under the feature. |
| `points` | `ul > li` | yes | Right-side supporting points. Each li's lead is the point title — it renders bold automatically (no `**…**`); follow it with a nested `- body` line. |

### Variant decision rule

- **default (no modifier).** A thesis heading deserves the panel and the right column substantiates it with prose points — the plain briefing look.
- **`metric`.** A hero number is the featured element — the panel flips light and the number becomes the display type.
- **`pullquote`.** The featured element is a verbatim quotation — author a blockquote in the left panel instead of a heading.
- **`steps`.** The panel anchors a numbered phase rather than a heading, and the right column is a numbered sequence rather than loose points.
- **`watermark`.** You want a decorative accent panel — an oversized letterform behind the heading — plus an optional two-line Audience/Intent metadata footer after the points.
- **`mirror`.** Same anatomy, but the deck's reading rhythm wants the featured panel to land on the right instead of the left.
- **`qr`.** The featured payload is a URL to scan, not a heading or number — a bare URL bullet auto-resolves into a QR on the panel.

### Common mistakes

- **Using a `## heading` in the left panel under `pullquote` instead of a `>` blockquote.** Under `pullquote` the transform builds the left panel from ONLY the blockquote and its citation — an `h2` never lands in the left panel at all; it gets swept into the right column above the supporting points instead, leaving the featured panel blank.
- **Adding a third line to `watermark`'s trailing metadata footer, expecting a third labeled row.** The footer's "Audience ·" / "Intent ·" prefixes are hard-coded to the first two list items only — a third item renders with no label prefix at all.

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

### `metric` — metric

Light panel behind one hero number.

```markdown
<!-- _class: split-panel metric -->

`split-panel metric`

## 16<em>wpi</em>

Words per item — the budget this layout holds its supporting column to.

- The panel flips light
  - metric flips the panel light behind one hero number.
- The number claims
  - Keep support brief — two items beside a figure.
```

### `pullquote` — pullquote

Half the slide to one quotation.

```markdown
<!-- _class: split-panel pullquote -->

> pullquote gives half the slide to one voice, and the other half to what it means.

`split-panel pullquote · the layout, quoted`

- The quote claims
  - Display italic on the dark panel; keep it under twenty-five words.
- The column interprets
  - Two items that say why the words matter, not who said them again.
```

### `steps` — steps

The panel anchors a numbered phase.

```markdown
<!-- _class: split-panel steps -->

`02`

## steps

The left panel anchors a phase; the column numbers its moves.

1. Watermark the phase
   - The inline-code number becomes the panel's backdrop.
2. Number the column
   - An ordered list reads as sequence — three steps fit.
3. Keep steps parallel
   - Verb-first titles, one supporting line each.
```

### `watermark` — watermark

Accent panel, letterform, h3 rubric.

```markdown
<!-- _class: split-panel watermark -->

## Watermark

### The heading's first letter becomes the panel

- The accent panel decorates
  - A large letterform behind the heading — presence without a photo.
- The h3 subtitles
  - One line naming what the slide surveys.
- The column carries the content
  - Same three-item budget as the default split.
```

### `mirror` — mirror

Featured panel moves right.

```markdown
<!-- _class: split-panel mirror -->

`split-panel mirror`

## mirror puts the featured panel on the right.

Same anatomy, flipped — for when the deck's rhythm wants the claim to land late.

- Reading order still works
  - The eye crosses support first, then lands on the panel's claim.
- Use it sparingly
  - One mirror per section keeps the flip meaningful.
```

### `qr` — qr

Payload bullet becomes a code.

```markdown
<!-- _class: split-panel qr -->

`split-panel qr`

## The payload bullet becomes a code on the panel.

A bare URL auto-resolves; the caption line labels the scan.

- https://slidewright.dev/components/split-panel `qr`
- Scan for this layout's docs `caption`
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
