# split-panel

> Featured left panel + supporting right zone — one prominent claim beside the points that substantiate it.

**Function** statement · **Form** panel · **Substance** structure

**Tags** `summary` · `board-deck` · `hero-number` · `pull-quote` · `takeaway`

Use when one prominent element (a heading, a hero number, a pull-quote, a phase) deserves a dedicated panel and the right side carries the supporting points. The default anchors a heading; variants reshape what the panel features: `metric` (hero number, light-left), `pullquote` (pull-quote), `steps` (numbered step-timeline), `watermark` (accent panel + letterform + meta footer), `proof` (a scenario signal + two paired proof cards, for a claim that must be demonstrated, not just supported). Add `capstone` on top of `proof` for that sequence's climactic entry: the signal becomes a quoted card, the checkpoints become plain top-rule pillars. For a binary decision with a verdict, reach for `split-compare`. A run of `proof` slides is a SEQUENCE, so the engine tints each one from the theme's categorical palette by its position in the deck — authors write `split-panel proof` and nothing else. `capstone` implies `proof`, so the sequence's final slide is just `split-panel capstone`. An explicit `cat-1`…`cat-8` overrides the assignment for one slide.

## Agent contract

**Density** aim ~16 words per item; past ~24 it reads as a wall of text — one finding per row, a sentence.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `eyebrow` | `p:first-of-type > code` | no | Optional inline-code label above the feature (the phase number under `steps`, the unit under `metric`). |
| `heading` | `h2` | yes | The featured element in the left panel — a heading by default; a hero number under `metric`; the phase name under `steps`. (Under `pullquote`, use a blockquote instead — see the variant.) |
| `lede` | `p` | no | One-sentence framing paragraph under the feature. |
| `points` | `ul > li` | yes | Right-side supporting points. Each li's lead is the point title — it renders bold automatically (no `**…**`); follow it with a nested `- body` line. Under `proof` there are exactly THREE items and the FIRST is the scenario signal (its lead is the label, e.g. "You know you're here when"); the other two render as the paired proof cards. |

### Variant decision rule

- **default (no modifier).** A thesis heading deserves the panel and the right column substantiates it with prose points — the plain briefing look.
- **`metric`.** A hero number is the featured element — the panel flips light and the number becomes the display type.
- **`pullquote`.** The featured element is a verbatim quotation — author a blockquote in the left panel instead of a heading.
- **`steps`.** The panel anchors a numbered phase rather than a heading, and the right column is a numbered sequence rather than loose points.
- **`watermark`.** You want a decorative accent panel — an oversized letterform behind the heading — plus an optional two-line Audience/Intent metadata footer after the points.
- **`mirror`.** Same anatomy, but the deck's reading rhythm wants the featured panel to land on the right instead of the left.
- **`qr`.** A URL to scan supplements the panel — a bullet tagged `qr` (or a bare URL) auto-resolves into a QR figure appended to the RIGHT (supporting) column; the left panel keeps its normal required heading/lede, it doesn't become the QR.
- **`cat-1`.** Rarely — the tint is ASSIGNED automatically from the slide's position in the run of `proof` slides, so you normally write nothing. Reach for an explicit `cat-N` only to pin one slide to a specific hue (or to repeat a hue deliberately). A pinned slide still counts in the sequence, so it does not shift the slides after it.
- **`capstone`.** This is the SEQUENCE's last, most-earned entry — the claim is proven, not just illustrated. Write `split-panel capstone`: it implies `proof` (same three-item shape) and joins the same automatic tint sequence. Swaps the signal callout for a quoted card and the checkpoint cards for top-rule pillars.

### Common mistakes

- **Using a `## heading` in the left panel under `pullquote` instead of a `>` blockquote.** Under `pullquote` the transform builds the left panel from ONLY the blockquote and its citation — an `h2` never lands in the left panel at all; it gets swept into the right column above the supporting points instead, leaving the featured panel blank.
- **Adding a third line to `watermark`'s trailing metadata footer, expecting a third labeled row.** The footer's "Audience ·" / "Intent ·" prefixes are hard-coded to the first two list items only — a third item renders with no label prefix at all.
- **Under `proof`, omitting the lede paragraph between the heading and the `### signal` label.** Always write a lede under `proof` — omitting it lets the extractor mistake the signal paragraph for the lede, hoisting it into the left panel and leaving the right zone's label empty.
- **Under `proof`, authoring more or fewer than exactly two checkpoint items.** The two-column card grid assumes a pair. One item leaves an empty column; three crowds a third card half-width.
- **Applying the same `cat-N` to every slide in a sequence, or picking numbers out of order (`cat-1`, `cat-4`, `cat-2`).** The point of `cat-1`…`cat-8` is that each slide in the SET reads as its own step — assign them in order, one number per slide, not the same number repeated or shuffled.

## When to use

- **One feature, supporting points.** When a single prominent element — a thesis heading, a hero number, a quote — deserves its own panel and the right side substantiates it. The panel is the anchor; the right is the evidence.
- **Pick the variant by what the panel features.** Heading (default), hero number (`metric`), pull-quote (`pullquote`), phase + numbered steps (`steps`), an accent panel with a letterform watermark and a metadata footer (`watermark`), or a scenario + two proof cards (`proof`).
- **A claim that must be demonstrated, not just supported.** `proof` pairs the panel's claim with one scenario paragraph ("you know you're here when…") and two named proof cards. Use it when the audience needs evidence the claim actually holds, not just a list of reasons to believe it.
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

### `proof` — proof

Scenario signal + two paired proof cards, filling the column top to bottom. Narrows the claim panel to 31% and steps the claim heading to the h2 tier — the evidence side carries three stacked regions where the base carries one list.

```markdown
<!-- _class: split-panel proof -->

`Level 1 · Remembering`

## Execute with accuracy.

*How is this done?* You recall syntax, patterns, and standards — the path is known, and the job is to follow it without error.

- You know you're here when
  - You ship on an existing API and rework is rare.
- Follows examples well
  - Compiles, runs, and tests locally with confidence.
- Works from brief tickets
  - Consistent quality without hand-holding.
```

### `capstone` — capstone

Composes with `proof`: the signal reads as a quoted card, the two proof points read as plain top-rule pillars — the sequence's climactic, most-earned entry.

```markdown
<!-- _class: split-panel capstone -->

`Level 6 · Creating`

## Build what didn't exist before.

*What should exist?* You synthesize new frameworks, platforms and operating models — what you produce becomes the standard.

- The signal
  - Teams across the enterprise adopt your framework as their foundation.
- Reference architecture
  - The implementation exists and is validated.
- Organization-wide adoption
  - Measurable outcomes follow.
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

### `cat-1` — cat-1

Override: pins this slide to the theme's categorical fill #1. Normally unnecessary — `proof` slides are tinted automatically by deck order.

```markdown
<!-- _class: split-panel cat-1 -->

`Stage 1 of 8`

## Discover the real problem.

- Talk to the people living with it
  - Five conversations beat one survey.
- Write down what surprised you
  - The surprise is usually the actual problem.
```

### `cat-2` — cat-2

Override: pins this slide to the theme's categorical fill #2. Normally unnecessary — `proof` slides are tinted automatically by deck order.

```markdown
<!-- _class: split-panel cat-2 -->

`Stage 2 of 8`

## Define what "done" means.

- One sentence, not a document
  - If it needs a meeting to explain, it isn't defined yet.
- Name what's explicitly out of scope
  - The edges matter more than the center.
```

### `cat-3` — cat-3

Override: pins this slide to the theme's categorical fill #3. Normally unnecessary — `proof` slides are tinted automatically by deck order.

```markdown
<!-- _class: split-panel cat-3 -->

`Stage 3 of 8`

## Design the smallest real version.

- Cut until it's uncomfortable
  - Comfortable scope is usually still too big.
- Sketch before you spec
  - A rough picture surfaces disagreement a document hides.
```

### `cat-4` — cat-4

Override: pins this slide to the theme's categorical fill #4. Normally unnecessary — `proof` slides are tinted automatically by deck order.

```markdown
<!-- _class: split-panel cat-4 -->

`Stage 4 of 8`

## Build the thing you designed.

- Ship the ugly path first
  - It finds the real risk; the happy path is easy.
- Keep a running list of shortcuts taken
  - Nothing is forgotten faster than a deliberate shortcut.
```

### `cat-5` — cat-5

Override: pins this slide to the theme's categorical fill #5. Normally unnecessary — `proof` slides are tinted automatically by deck order.

```markdown
<!-- _class: split-panel cat-5 -->

`Stage 5 of 8`

## Validate with the people it's for.

- Watch, don't narrate
  - What they do matters more than what they say they'd do.
- One real user beats five imagined ones
  - A single honest session outweighs a week of speculation.
```

### `cat-6` — cat-6

Override: pins this slide to the theme's categorical fill #6. Normally unnecessary — `proof` slides are tinted automatically by deck order.

```markdown
<!-- _class: split-panel cat-6 -->

`Stage 6 of 8`

## Launch to a small, real audience.

- Small enough to fix fast
  - A limited launch turns mistakes into hours, not weeks.
- Tell people it's early
  - Set the expectation and the feedback gets more honest.
```

### `cat-7` — cat-7

Override: pins this slide to the theme's categorical fill #7. Normally unnecessary — `proof` slides are tinted automatically by deck order.

```markdown
<!-- _class: split-panel cat-7 -->

`Stage 7 of 8`

## Scale what actually worked.

- Scale the mechanism, not the guess
  - Confirm why it worked before you multiply it.
- Expect the edges to break first
  - Scale finds every assumption that only held at small size.
```

### `cat-8` — cat-8

Override: pins this slide to the theme's categorical fill #8. Normally unnecessary — `proof` slides are tinted automatically by deck order.

```markdown
<!-- _class: split-panel cat-8 -->

`Stage 8 of 8`

## Sustain it without you in the loop.

- Write down what only you know
  - If it lives in your head, it isn't sustained yet.
- Hand off the decision, not just the task
  - Ownership transfers when someone else can say no.
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
