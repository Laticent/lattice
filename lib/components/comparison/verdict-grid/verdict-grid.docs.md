# verdict-grid

> Options scored against criteria as a verdict matrix.

**Function** comparison · **Form** grid · **Substance** structure

**Tags** `scorecard` · `ranking` · `prioritize` · `assessment`

**Capacity** ~3 items (crowds past 4, overflows past 5) — past that, compare-table / split across slides.

**Density** aim ~12 words per item; past ~18 it reads as a wall of text — a verdict card is a label plus its criteria, not prose.

Use to evaluate 2–4 options against the same set of criteria, with pass/partial/fail badges. Each card represents one option; badges per criterion.

## When to use

- **Two to four options.** Each card is one option; the grid keeps two cards per row. Past four options the cards crowd and the criteria badges lose legibility.
- **Shared criteria across cards.** Every option is scored on the same set of criteria, in the same order. Drifting criteria between cards defeats the at-a-glance scan the layout exists for.
- **Two-word badges.** Each criterion is a state marker (`[x]` / `[-]` / `[ ]` / `[/]`, shared with `checklist` and `obligation-matrix`) plus a badge label of at most two words — `Residency`, `Self-serve`, `SOC 2`. The badge is chrome that must scan in a glance.
- **A rationale line is required.** Every option ends with one final inner bullet that carries NO marker — a short prose verdict for that option. It is the body that fills the card, and the last option renders as the focal, recommended verdict.

## When NOT to use

- **Exactly two options.** Two options with shared criteria belong in `compare-prose` or `split-compare`. verdict-grid earns its layout at 3+ options.
- **Missing the rationale line.** Every option must end with a marker-less prose line — the verdict for that card. Omit it and the card renders empty below the badges, and the focal last card has nothing to recommend. The rationale is required, not optional.
- **Badge longer than two words.** The text after the marker is a badge, not a sentence — two words at most (`Residency`, `Self-serve`). A sentence on a badge line breaks the row scan; prose belongs only on the final rationale line.
- **Cards with different criteria.** When each option needs its own criteria list, the comparison fails — use `cards-stack` so each card has full prose breathing room instead.

## Authoring

```markdown
<!-- _class: verdict-grid -->

## Which option meets the criteria.

- **First option.**
  - [x] First badge
  - [-] Second badge
  - [ ] Third badge
  - One-line rationale giving the verdict for this option.
- **Second option.**
  - [x] First badge
  - [x] Second badge
  - [-] Third badge
  - One-line rationale giving the verdict for this option.
- **Third option.**
  - [x] First badge
  - [x] Second badge
  - [x] Third badge
  - One-line rationale; the last option is the focal verdict. Recommended.
```

## Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading naming the choice. |
| `options` | `ul > li` | yes | One outer li per option, lead with **Option name.**. Then one inner li per criterion, each led by a state marker ([x]/[-]/[ ]/[/]) followed by a badge label of AT MOST TWO WORDS. Criteria are shared across every option, in the same order. The last option renders as the focal verdict. |
| `rationale` | `ul > li > ul > li:last-child` | yes | REQUIRED. The final inner li of every option carries NO state marker — one short prose line giving the verdict for that option. This content line is what fills the card; omit it and the card renders empty below the badges. |

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Verdict grid heading.                  │
│                                         │
│  ┌──────────────┐     ┌──────────────┐  │
│  │ Option A [x] │     │ Option B [-] │  │
│  │ rationale    │     │ rationale    │  │
│  └──────────────┘     └──────────────┘  │
│  ┌──────────────┐     ┌──────────────┐  │
│  │ Option C [ ] │     │ Option D [x] │  │
│  └──────────────┘     └──────────────┘  │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`compare-prose`](../../comparison/compare-prose/compare-prose.docs.md) — exactly two options with prose bodies
- [`split-compare`](../../comparison/split-compare/split-compare.docs.md) — two options with a bottom verdict bar
- [`obligation-matrix`](../../legal/obligation-matrix/obligation-matrix.docs.md) — many regimes scored on shared obligations in a table
- [`compare-table`](../../comparison/compare-table/compare-table.docs.md) — cells are textual values, not state markers
- [`checklist`](../../inventory/checklist/checklist.docs.md) — one set of criteria, not many options against them

## Demo deck

See [verdict-grid.gallery.light.pdf](./verdict-grid.gallery.light.pdf) for rendered examples of every variant.
