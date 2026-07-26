# q-and-a

> Anticipated questions paired with prepared answers — the end-of-pitch 'what we expect to be asked' slide.

**Function** inventory · **Form** stack · **Substance** structure

**Tags** `pitch` · `board-deck` · `recommendation`

## Agent contract

**Capacity** ~4 items (crowds past 5, overflows past 6) — past that, split across slides (auto with autosplit: on).

**Density** aim ~12 words per item; past ~16 it reads as a wall of text — a one-line question and a short answer.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `eyebrow` | `p > code:only-child` | no | Optional kicker above the headline — wrap a short label in backticks, e.g. `Anticipated questions`. |
| `title` | `h2` | no | Optional headline framing the set — name the pressure ('What the board will press on'), not a bare label ('Q&A'). |
| `question` | `ul > li, ol > li` | yes | One top-level list item per question, in the order you want to take them (lead with the toughest). Author it as plain interrogative text — no bold. Questions are indexed automatically (01, 02, …), so a `ul` and an `ol` render the same. |
| `answer` | `ul > li > ul > li, ol > li > ol > li` | yes | The prepared answer, nested one level under its question. Two or three sentences that actually close the question down — a reasoned response, not a restatement. Every question needs one. |

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

### `spine` — spine

Pairs threaded down an accent spine.

```markdown
<!-- _class: q-and-a spine -->

## spine threads the pairs down an accent spine.

- How long may a question run?
  - One line.
- And the answer?
  - Four words or so.
- How many pairs fit?
  - Five; six is the ceiling.
```

### `rail` — rail

Numbered exhibit rows in columns.

```markdown
<!-- _class: q-and-a rail -->

## rail hangs the questions on a left rail.

- How long may a question run?
  - One line.
- And the answer?
  - Four words or so.
- How many pairs fit?
  - Five; six is the ceiling.
```

### `tab` — tab

Underlined prompts; answers hang below.

```markdown
<!-- _class: q-and-a tab -->

## tab folds each answer under a question tab.

- How long may a question run?
  - One line.
- And the answer?
  - Four words or so.
- How many pairs fit?
  - Five; six is the ceiling.
```

### `grid` — grid

Four pairs in a two-by-two.

```markdown
<!-- _class: q-and-a grid -->

## grid deals the pairs into two columns.

- How long may a question run?
  - One line.
- And the answer?
  - Four words or so.
- How many pairs fit?
  - Five; six is the ceiling.
- Why four pairs here?
  - Grids want even counts.
```

### `solo` — solo

One pair, the whole slide.

```markdown
<!-- _class: q-and-a solo -->

## solo gives one question the whole slide.

- What does solo change?
  - One pair, full canvas.
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
