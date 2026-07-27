# split-compare

> Two options + verdict — dark frame on the left, 2-column option grid + a recommendation card on the right.

**Function** comparison · **Form** split · **Substance** structure

**Tags** `tradeoff` · `recommendation` · `contrast`

Use when a decision frames a binary choice and the recommendation must be unambiguous. Second top-level list item is always the preferred option (gets the accent badge). The verdict blockquote becomes a recommendation card with a corner tag, pinned across the bottom.

## Agent contract

**Density** aim ~14 words per item; past ~22 it reads as a wall of text — a terse point per line.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `frame` | `p:first-of-type > code` | no | Optional inline-code frame label above the heading (e.g. 'Decision Required'). |
| `heading` | `h2` | yes | Decision framing in the dark left panel. |
| `context` | `p` | yes | One-sentence context paragraph under the heading. |
| `options` | `ul > li` | yes | Exactly two top-level items. First is the alternative; second is the preferred option. |
| `verdict` | `blockquote` | yes | The recommendation — one short sentence in a blockquote. The card tag defaults to RECOMMENDATION; an insight-* modifier on the slide _class (e.g. insight-verdict) renames it via the shared --insight-label seam. See lib/base/base.docs.md § Renaming the eyebrow. |

### Common mistakes

- **Trying to rename the "RECOMMENDATION" tag by editing the blockquote text.** The tag text comes from the `--insight-label` CSS variable, set by an `insight-*` modifier class on the slide (e.g. `insight-verdict`) — not from anything inside the blockquote; editing the blockquote only changes the recommendation sentence, not its tag.
- **Leaving the frame label unwrapped in backticks.** The frame label is reassembled to the top of the dark panel regardless of its source position — placement doesn't matter. It must be backtick-wrapped, though: unwrapped plain text is instead captured as the intro paragraph, not the frame label.

## When to use

- **Binary decision with a recommendation.** The slide must close the question with one chosen path. Use when the audience needs both the trade-off and the verdict on one slide, not on two.
- **Comparable facts per option.** Each side carries 2–4 short bullets — the same kind of fact across both. Lopsided facts break the visual symmetry.
- **Verdict in one sentence.** The trailing blockquote is the recommendation distilled to a single line. Anything longer belongs in spoken commentary, not the recommendation card.

## When NOT to use

- **Three or more options.** split-compare is strictly two — first card is the alternative, second card is the preferred. For three options, use `verdict-grid` or successive `decision` slides.
- **No verdict.** The blockquote is mandatory. Without it the slide collapses to a comparison without a call — use `compare-prose` for that case.
- **Preferred on the left.** Layout convention pins the preferred option to the second (right) card. Putting the recommendation first breaks the reading flow and the accent badge lands on the wrong card.

## Authoring

```markdown
<!-- _class: split-compare -->

`Decision Required`

## Headline that frames the choice.

One-sentence context paragraph explaining the stakes.

- Alternative option
  - First fact about the alternative
  - Second fact about the alternative
- Preferred option
  - First fact about the preferred path
  - Second fact about the preferred path

> The recommendation in one decisive sentence.
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  ┌────────────┐  ┌──────────────────┐   │
│  │ OPTION     │  │ Choice A         │   │
│  │ A vs B     │  └──────────────────┘   │
│  │            │  ┌──────────────────┐   │
│  │ verdict    │  │ Choice B         │   │
│  └────────────┘  └──────────────────┘   │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`compare-prose`](../../comparison/compare-prose/compare-prose.docs.md) — the comparison is undecided — no verdict bar yet
- [`decision`](../../comparison/decision/decision.docs.md) — the verdict slide that follows a separate comparison
- [`split-panel`](../../statement/split-panel/split-panel.docs.md) — the right side is findings, not paired options
- [`verdict-grid`](../../comparison/verdict-grid/verdict-grid.docs.md) — three or more options scored against shared criteria

## Demo deck

See [split-compare.gallery.light.pdf](./split-compare.gallery.light.pdf) for rendered examples of every variant.
