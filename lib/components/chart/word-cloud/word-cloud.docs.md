# word-cloud

> Spiral-packed word cloud — items sized by weight.

**Function** evidence · **Form** canvas · **Substance** series

**Tags** `tag-cloud` · `themes` · `proportion`

Use for qualitative summaries — retrospective themes, survey verbatims. Word size encodes frequency or weight; not a precise data viz.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing the cloud. |
| `words` | `ul > li` | yes | One li per word. Format: `word `weight`` where weight is any positive number — a frequency count, a 1–5 rating, a percentage. Words are sized and colored RELATIVE to each other: the lightest maps to small/muted, the heaviest to the hero size/accent. |

## When to use

- **Qualitative themes at a glance.** Retrospective summaries, survey verbatims, theme extraction, sentiment scans. The cloud lands what the corpus is about; the silhouette and the biggest words are the read.
- **Weight is approximate, not exact.** Word size encodes relative frequency or weight, but the eye reads 'biggest' and 'second biggest' before any precise ratio. Reach for word-cloud when the rank matters more than the count. A 'size = frequency' key sits in the right rail to make the encoding explicit.
- **Eight to twenty items.** Below eight the spiral looks bare and the layout wastes the canvas. Past about twenty the smallest words become unreadable. Trim the long tail or cap the cloud at a 'top 15' before authoring.

## When NOT to use

- **Precise comparisons.** If the audience needs to know that 'manifest' is 1.6× 'function', the spiral packing actively misleads. Use `progress` or a bar chart where the eye can compare lengths directly.
- **Two or three words.** A three-word cloud is a list with extra steps. Use `stats` for a metric row or `big-number` for a single weighted headline.
- **Multi-word phrases.** Each li should be a single token. Multi-word phrases blow out the layout and crowd the spiral; if your data is phrases, normalise to keywords first or use `quote` for verbatim text.

## Authoring

```markdown
<!-- _class: word-cloud -->

## What the team called out this quarter.

- velocity `12`
- ownership `9`
- handoffs `7`
- review `5`
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│         Weighted words heading          │
│                                         │
│         alpha   BIG_TERM   beta         │
│          emergent   HUGE                │
│            minor   medium               │
│         tiny      LARGE   keyword       │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `constellation` — constellation

Words scattered like stars.

```markdown
<!-- _class: word-cloud constellation -->

## constellation scatters the words like stars.

- component `5`
- manifest `4`
- function `3`
- form `3`
- substance `2`
- gallery `1`
```

### `dense` — dense

The cloud packed tight.

```markdown
<!-- _class: word-cloud dense -->

## dense packs the cloud tight.

- component `5`
- manifest `5`
- function `4`
- form `4`
- substance `4`
- gallery `3`
- folder `3`
- variant `3`
- universal `2`
- cascade `2`
- scaffolder `2`
- bundler `1`
- transform `1`
- selector `1`
- palette `1`
```

### `spectrum` — spectrum

Words colored along a scale.

```markdown
<!-- _class: word-cloud spectrum -->

## spectrum colors the words along a scale.

- component `5`
- manifest `4`
- function `4`
- form `3`
- substance `3`
- gallery `2`
- variant `2`
- universal `1`
```

### `focal` — focal

One word crowned the center.

```markdown
<!-- _class: word-cloud focal -->

## focal crowns one word the center.

- variants `5`
- gallery `2`
- manifest `2`
- docs `1`
- declared `1`
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`progress`](../../chart/progress/progress.docs.md) — the weights need precise visual comparison
- [`stats`](../../evidence/stats/stats.docs.md) — the headline metrics are independent numbers, not a corpus
- [`piechart`](../../chart/piechart/piechart.docs.md) — the items are parts of a whole, not free-form themes
- [`quote`](../../statement/quote/quote.docs.md) — the verbatim language matters more than the frequency
- [`list`](../../inventory/list/list.docs.md) — single-line takeaways — the `takeaway` variant

## Demo deck

See [word-cloud.gallery.light.pdf](./word-cloud.gallery.light.pdf) for rendered examples of every variant.
