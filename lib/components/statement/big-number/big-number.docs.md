# big-number

> Single oversized number as the focal claim.

**Function** statement · **Form** canvas · **Substance** prose

**Tags** `hero-number` · `metric` · `pitch`

Use to make one metric land. The number should be the headline — supporting text is one short caption. The whole slide is the chart.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `eyebrow` | `p > code` | no | Optional label above the number. |
| `number` | `ul > li:first-child` | yes | First list item: the giant number. |
| `caption` | `ul > li:first-child > ul > li` | no | One-line caption below the number (nested bullet). |

### Common mistakes

- **Caption authored as a second top-level bullet instead of nested under the number's list item.** Indent the caption as a sub-bullet of the number, not a sibling `- caption` line — a sibling bullet doesn't just miss the caption styling, it matches the SAME top-level rule as the number itself and renders as a second giant hero-sized line.
- **The unit or label baked into the number line itself, e.g. `- 1,248,500,000 users`.** Keep the number list item to the numeral plus its own unit symbol (`%`, `$`, `×`). Put what's being counted in the nested caption (the layout's demonstrated pattern — see the skeleton/sample) or, for a short category name, the eyebrow — not appended prose after the number itself.
- **Eyebrow restates the number's value instead of naming its category, e.g. eyebrow `92%` above a number `92%`.** The eyebrow names the metric class ("Audience recall", "Q3 revenue"); the number carries the value. Restating the value in both places wastes the eyebrow's one job.

## When to use

- **One metric carries the slide.** When the audience needs to remember exactly one number from this part of the deck. The whole slide is the chart — no surrounding context, no comparisons, no axes.
- **Headline that earns the canvas.** Reach for big-number when the metric is the argument: cost reduced by 4×, audience reach grew 92%, time-to-decision dropped from 14 days to 4. One claim, one canvas.
- **Eyebrow names the metric class.** The inline-code eyebrow contextualizes the number ("Audience recall", "Q3 revenue", "Latency p99"). The number is the value; the eyebrow is the label.

## When NOT to use

- **Multiple metrics on one slide.** Two big numbers on one canvas dilute both. Use `stats` for a row of three metrics or `kpi` for a grid of four; reserve big-number for genuinely solo claims.
- **Caption longer than one line.** If the caption needs a sentence to explain, the number isn't carrying the slide. Either trim the number's claim or move to `content` where prose has room.
- **Decorative numbers without an argument.** "99.99% uptime" by itself is a boast, not a claim. Big-number works when the number is the answer to a question the audience came in with.

## Authoring

```markdown
<!-- _class: big-number -->

`Optional eyebrow`

- 92%
  - of the audience remembers a single number from a deck.
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  EYEBROW                                │
│                                         │
│                 ┌─────┐                 │
│                 │ 42× │                 │
│                 └─────┘                 │
│                                         │
│      Caption explains the number.       │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`stats`](../../evidence/stats/stats.docs.md) — row of 2-3 metrics, comparable visual weight
- [`kpi`](../../evidence/kpi/kpi.docs.md) — grid of 4-6 metrics with status indicators
- [`split-panel`](../../statement/split-panel/split-panel.docs.md) — the metric needs a paragraph of context alongside it
- [`content`](../../statement/content/content.docs.md) — the argument is mostly prose with a number embedded

## Demo deck

See [big-number.gallery.light.pdf](./big-number.gallery.light.pdf) for rendered examples of every variant.
