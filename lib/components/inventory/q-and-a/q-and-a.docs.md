# q-and-a

> Anticipated questions paired with prepared answers — the end-of-pitch 'what we expect to be asked' slide.

**Function** inventory · **Form** stack · **Substance** structure

**Tags** `pitch` · `board-deck` · `recommendation`

**Capacity** ~4 items (crowds past 5, overflows past 6) — past that, split across slides (auto with autosplit: on).

**Density** aim ~12 words per item; past ~16 it reads as a wall of text — a one-line question and a short answer.

Use to pre-empt the room: line up the three or four hardest questions the audience will raise and answer each one before it is asked. The question reads as a prompt; the prepared answer carries the substance. Distinct from a reference FAQ (many terse look-up pairs) — this is a few weighty defenses of a recommendation.

## When to use

- **The questions are the point.** The slide that ends a pitch by naming the hard questions and answering them first. Anticipating the objection and closing it on your terms is more persuasive than waiting to be asked — it signals you have already done the thinking.
- **Three or four weighty pairs.** A few substantive questions, each with a reasoned two-to-three-sentence answer. Past five the answers compress below persuasion; for a long reference list of one-line look-ups use `faq` or `glossary` instead.
- **Question as prompt, answer as substance.** The layout deliberately weights the two unequally — the question is the lighter prompt, the answer is the payoff. Lead each pair with the interrogative line and nest the prepared answer one level under it.

## When NOT to use

- **A flat FAQ of one-liners.** Six or more terse question/answer pairs you flip back to as a reference belong in `faq` or `glossary`, which are built to stack many short look-ups. q-and-a is for a few defended answers, not a help page.
- **Rhetorical questions with no answer.** Every question needs a nested answer that genuinely closes it. A bare question used as a section header or a hook is a `divider` or a `statement`, not a Q&A pair.
- **Evaluation criteria in disguise.** If the top-level item is a requirement you are scoring against (with a rationale below), that is `list-criteria`, not a question you expect to be asked. q-and-a defends; list-criteria evaluates.

## Authoring

```markdown
<!-- _class: q-and-a -->

## What we expect to be asked.

- First question the audience will raise?
  - The prepared answer — two or three sentences that close it down.
- Second question?
  - The prepared answer.
- Third question?
  - The prepared answer.
```

## Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `eyebrow` | `p > code:only-child` | no | Optional kicker above the headline — wrap a short label in backticks, e.g. `Anticipated questions`. |
| `title` | `h2` | no | Optional headline framing the set — name the pressure ('What the board will press on'), not a bare label ('Q&A'). |
| `question` | `ul > li, ol > li` | yes | One top-level list item per question, in the order you want to take them (lead with the toughest). Author it as plain interrogative text — no bold. Questions are indexed automatically (01, 02, …), so a `ul` and an `ol` render the same. |
| `answer` | `ul > li > ul > li, ol > li > ol > li` | yes | The prepared answer, nested one level under its question. Two or three sentences that actually close the question down — a reasoned response, not a restatement. Every question needs one. |

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│       What we expect to be asked.       │
│                                         │
│  Q  Why not wait two quarters?          │
│  A  The window closes in Q3.            │
│                                         │
│  Q  What if pricing shifts?             │
│  A  Contracts lock 2026 rates.          │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `spine` — Spine — sequential walkthrough

Threads the questions down a vertical spine with accent nodes, for when you want to walk the room through the objections in order. Drops the index for a narrative, one-after-another read.

```markdown
<!-- _class: q-and-a spine -->

## What the board will press on.

- Why not extend the current vendor one more year?
  - The renewal lands in Q3 and locks us in through 2028. Switching now costs a single quarter of migration; switching after renewal costs three.
- What happens to the team mid-migration?
  - No headcount change. The same four engineers run both stacks through the eight-week overlap, then the legacy stack is decommissioned.
- How confident are we in the savings?
  - The $1.2M is contracted, not projected — the signed rate differential, before any usage growth.
```

### `rail` — Rail — question / answer columns

Sets each pair as a numbered exhibit row — question and answer in parallel columns, separated by a hairline. Scannable when the answers are short and you want them lined up for comparison.

```markdown
<!-- _class: q-and-a rail -->

## What the board will press on.

- Why not extend the current vendor one more year?
  - The renewal lands in Q3 and locks us in through 2028. Switching now costs a single quarter of migration; switching after renewal costs three.
- What happens to the team mid-migration?
  - No headcount change. The same four engineers run both stacks through the eight-week overlap, then the legacy stack is decommissioned.
- How confident are we in the savings?
  - The $1.2M is contracted, not projected — the signed rate differential, before any usage growth.
```

### `tab` — Tab — underlined prompts

The most editorial, minimal look: a short accent underline sits tight beneath each question, then the answer drops below it. Generous whitespace, no enumeration — best for three or four pairs.

```markdown
<!-- _class: q-and-a tab -->

## What the board will press on.

- Why not extend the current vendor one more year?
  - The renewal lands in Q3 and locks us in through 2028. Switching now costs a single quarter of migration; switching after renewal costs three.
- What happens to the team mid-migration?
  - No headcount change. The same four engineers run both stacks through the eight-week overlap, then the legacy stack is decommissioned.
- How confident are we in the savings?
  - The $1.2M is contracted, not projected — the signed rate differential, before any usage growth.
```

### `grid` — Grid — two-up density

Packs four pairs into a 2×2 grid split by a gradient hairline cross — the density treatment for when you have more pairs than the stack holds comfortably. Each header reserves two lines so questions and answers align across a row.

```markdown
<!-- _class: q-and-a grid -->

## What the board will press on.

- Why not extend the current vendor one more year?
  - The renewal lands in Q3 and locks us in through 2028; after renewal it costs three quarters.
- What happens to the team mid-migration?
  - No headcount change. Four engineers run both stacks through the eight-week overlap.
- How confident are we in the savings?
  - The $1.2M is contracted, not projected — the signed rate differential.
- What is the rollback plan?
  - A one-command revert to the pinned release, rehearsed weekly in staging.
```

### `solo` — Solo — one question, one answer

Gives a single question and its answer the whole slide, at display weight — for the one objection you know is coming and want to meet head-on. The question runs large as a prompt; the prepared answer sits below it in message type.

```markdown
<!-- _class: q-and-a solo -->

## The one question we know is coming.

- If the pilot fails, what have we actually lost?
  - One quarter and $180K, fully recoverable. The contract caps exposure at the pilot scope, with no auto-renewal and a thirty-day exit. The downside is bounded; the upside is the whole thesis.
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`faq`](../faq/faq.docs.md) — many terse reference questions to flip back to, not a few weighty defenses
- [`glossary`](../../inventory/glossary/glossary.docs.md) — term/definition reference pairs rather than question/answer pairs
- [`list-criteria`](../../progression/list-criteria/list-criteria.docs.md) — numbered criteria with rationale — evaluation, not anticipated objections
- [`cards-stack`](../../inventory/cards-stack/cards-stack.docs.md) — parallel co-equal cards with no question/answer role split
- [`decision`](../../comparison/decision/decision.docs.md) — a single verdict to state rather than a set of questions to defend

## Demo deck

See [q-and-a.gallery.light.pdf](./q-and-a.gallery.light.pdf) for rendered examples of every variant.
