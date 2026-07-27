# redline

> Clause-by-clause comparison — verbatim language with inline <ins>/<del> tracking the amendment.

**Function** comparison · **Form** canvas · **Substance** prose

**Tags** `contract` · `contrast` · `compliance` · `transformation`

Use when an amendment's diff is the slide. The blockquote carries the redlined text with ins/del markers; the trailing list explains why the diff matters operationally.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | Slide heading naming the amendment or change. |
| `citation` | `p:first-of-type > code` | yes | Inline-code citation of the amended provision (e.g. 'Cal. Civ. Code §1798.135 · SB-362 (2024)'). |
| `redline` | `blockquote` | yes | The amended language. Use <del>old text</del> and <ins>new text</ins> inline. |
| `implications` | `ul > li` | no | Optional explanation. Use **Why this matters** for the operational read. |

### Variant decision rule

- **default (no modifier).** One clause, ins/del inline in a single blockquote — the simplest, most common redline.
- **`annotated`.** Each individual edit needs its own explanation, not just one trailing 'why this matters' line — numbers each marked edit against a footnoted rationale.
- **`three-col`.** The audience should read old, new, and rationale as three distinct, separately labeled blocks rather than one inline-marked passage.
- **`split`.** Before and after read better as two full parallel blockquotes than as one passage with inline markup.
- **`stacked`.** The passage is long enough that side-by-side columns would be too narrow — stacks the prior text (struck) above the current instead.

### Common mistakes

- **Not being deliberate about where the citation paragraph goes relative to the heading and blockquote — each position gets different styling.** The citation paragraph always renders — position just changes which mechanism claims it: before the `## heading` it's captured as the masthead eyebrow (mono-caps kicker); immediately after the heading it's captured as the masthead subtitle (italic, generic); left after the blockquote it stays in the body and gets redline's own accent-mono citation styling. Pick the placement for the look you want.
- **Assuming Markdown strikethrough (`~~text~~`) doesn't render as a tracked deletion the way literal `<del>` does.** `~~text~~` DOES render as a tracked deletion — Markdown strikethrough produces `<s>`, and redline's CSS styles `del`/`s` identically (line-through, fail-red color and background). Either syntax works for a deletion; `<ins>new</ins>` still needs literal HTML since Markdown has no native insertion syntax.

## When to use

- **Verbatim text matters.** When the amendment is the language — legal clauses, regulatory paragraphs, contract terms. Paraphrasing would lose the exact words the parties are bound by.
- **Diff is the slide.** The inline `<ins>` and `<del>` markers are the editorial argument. The audience reads what changed by scanning the green and red inline marks, not by toggling between two blocks.
- **Why-this-matters trailer.** End with a single operational sentence explaining what the diff means for the team's work. The clause is the evidence; the trailer is the implication.

## When NOT to use

- **Code diffs.** For two code snippets side-by-side, use `compare-code`. redline is for natural language — legal, regulatory, contractual — not source code.
- **Paraphrased clauses.** If the quoted text isn't verbatim, the diff is meaningless. Either render the actual clause with its diff, or move to `compare-prose` for narrative comparison.
- **Long passage with one tiny diff.** If one word changed in a paragraph, quote only the affected sentence or two. A wall of unchanged text with one inline mark buries the change.

## Authoring

```markdown
<!-- _class: redline -->

## Headline naming the amendment.

`Citation reference · amendment name (year)`

> Verbatim language with <del>old wording</del> <ins>new wording</ins> inline so the diff reads cleanly.

- **Why this matters.** What the amendment changes in operational terms, in one sentence.
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Clause diff heading.                   │
│                                         │
│  The original clause text with          │
│  ~~struck-through removals~~ and        │
│  __underlined insertions__ shown        │
│  inline in the prose stream.            │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `annotated` — annotated

Adds the why beside each edit.

```markdown
<!-- _class: redline annotated -->

## annotated adds the why beside each edit.

`Cal. Civ. Code §1798.135 · amendment SB-362 (2024)`

> A business that <del>collects</del> <ins>collects, sells, or shares</ins><sup>1</sup> consumers' personal information shall provide <del>two or more</del> <ins>at least one</ins><sup>2</sup> designated method for submitting requests to opt-out, <ins>including, at minimum, a clear and conspicuous link on the homepage titled "Your Privacy Choices,"</ins><sup>3</sup> for use by consumers.

- **Scope expansion.** Collapses sale and sharing into one duty.
- **Method floor.** One method is now sufficient; previously two were required.
- **Link mandate.** Pins a uniform link title across all businesses.
```

### `three-col` — three-col

Old, new, and why side by side.

```markdown
<!-- _class: redline three-col -->

## three-col sets old, new, and why side by side.

`Cal. Civ. Code §1798.135 · amendment SB-362 (2024)`

> A business that collects consumers' personal information shall provide two or more designated methods for submitting requests to opt out of the sale of their personal information.

> A business that collects, sells, or shares consumers' personal information shall provide at least one designated method for submitting requests to opt-out, including a clear and conspicuous homepage link titled "Your Privacy Choices."

- **Scope.** Sale and sharing fold into one duty.
- **Method floor.** One method now suffices.
- **Link title.** Homepage label is mandatory and standardized.
```

### `split` — split

Before and after in parallel.

```markdown
<!-- _class: redline split -->

## split shows before and after in parallel.

`Cal. Civ. Code §1798.135 · amendment SB-362 (2024)`

> A business that collects consumers' personal information shall provide two or more designated methods for submitting requests to opt out of the sale of their personal information.

> A business that collects, sells, or shares consumers' personal information shall provide at least one designated method for submitting requests to opt-out, including a clear and conspicuous homepage link titled "Your Privacy Choices."

- **Why this matters.** The left column is the prior text; the right is the amendment. Reading across makes the scope expansion obvious.
```

### `stacked` — stacked

Prior text struck above the current.

```markdown
<!-- _class: redline stacked -->

## stacked strikes the prior text above the current.

`Cal. Civ. Code §1798.135 · amendment SB-362 (2024)`

> A business that collects consumers' personal information shall provide two or more designated methods for submitting requests to opt out of the sale of their personal information.

> A business that collects, sells, or shares consumers' personal information shall provide at least one designated method for submitting requests to opt-out, including a clear and conspicuous homepage link titled "Your Privacy Choices."

- **Why this matters.** Stacking keeps the reading order vertical when each passage is a full sentence or more.
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`compare-code`](../../code/compare-code/compare-code.docs.md) — the diff is source code, not natural language
- [`compare-prose`](../../comparison/compare-prose/compare-prose.docs.md) — two narrative alternatives, not verbatim amendments
- [`state-chart`](../../chart/state-chart/state-chart.docs.md) — the change is structural state, not text
- [`obligation-matrix`](../../legal/obligation-matrix/obligation-matrix.docs.md) — comparing many regimes against shared obligations

## Demo deck

See [redline.gallery.light.pdf](./redline.gallery.light.pdf) for rendered examples of every variant.
