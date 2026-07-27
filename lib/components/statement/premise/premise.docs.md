# premise

> A framing claim beside a vertically centered ledger of parallel rows — a number, a term, a description, and a right-aligned note, each row colored by its own categorical hue.

**Function** statement · **Form** split · **Substance** series

**Tags** `onboarding` · `ranking` · `definition` · `overview`

Use when a deck needs to introduce an ORDERED vocabulary — a maturity ladder, a set of named stages, a ranked taxonomy — and wants one framing claim to sit beside the whole list at a glance, not one slide per term. The claim doesn't summarize the rows; it states why the ordering matters. Each row is a fixed four-part record: an index, the term, one description clause, and a short framing question or note, right-aligned. Both zones share the page's own background — unlike `split-panel`, there's no colored panel divide.

## Agent contract

**Density** aim ~14 words per item; past ~18 it reads as a wall of text — the description clause plus the trailing question, combined — not a sentence each.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | The claim — why the ordering in the ledger matters, not a summary of it. |
| `lede` | `h2 + p` | yes | One-to-two sentence framing paragraph under the claim, naming the two axes or dimensions the ledger's rows walk. |
| `rows` | `ul > li` | yes | Each row is ONE line with four inline segments in order: `` `NN` `` (index, inline code), `**Term**` (bold), a bare description clause, and `*a short question or note*` (italic, right-aligned). 3-8 rows; each is colored by its own slot in the theme's categorical palette. |

### Common mistakes

- **Writing the row as a nested `- Title` / `  - body` pair instead of one inline line.** `premise` rows are ONE line with four inline segments (code, bold, plain text, italic) — the nested title+body pattern other card-style layouts use doesn't apply here; the row parser looks for a `<strong>…</strong>` immediately followed by descriptive text and a trailing `<em>`.
- **Omitting the trailing italic note, expecting the row to still align.** The note's column is reserved whether or not it's authored — an empty note leaves a blank cell rather than collapsing the row, so pad it or the row reads unfinished.

### Data shape

- Rows should be authored in the ranking's natural order (lowest to highest, or first to last) — the row order IS the categorical color order.
- Up to eight rows are colored from the categorical palette before hues repeat; past eight, split into two slides.

## When to use

- **An ordered vocabulary needs one overview slide.** A maturity ladder, a named set of stages, a ranked taxonomy — anything with 3-8 ordered terms that deserves a single at-a-glance slide before the deck dives into each one individually.
- **The claim explains the ORDER, not the list.** The heading + lede earn their place by saying why the ranking matters ("growth is a change in thinking, not title") — if there's nothing to claim about the ordering, a plain `list` serves better.
- **Every row shares the exact same four-part shape.** Index, term, one clause, one right-aligned note. A row that needs more than that (a nested sub-list, a multi-sentence description) has outgrown `premise` — reach for `cards-stack` or a per-term `split-panel proof` slide instead.

## When NOT to use

- **Rows with unequal structure.** Every row must carry all four segments in the same order. A row missing its trailing note, or with a two-clause description, breaks the ledger's scan rhythm — trim or pad it to match its siblings.
- **More than eight rows.** The categorical palette cycles at eight; past that, split into two premise slides by group rather than repeating hues.
- **The heading summarizes the rows instead of claiming something.** "Six cognitive verbs" restates the list; "growth is a change in thinking, not title" claims why the list matters. If the heading can't be argued with, it's a caption, not a premise.

## Authoring

```markdown
<!-- _class: premise -->

## The claim the ledger exists to support.

One or two sentences naming the axes the rows below walk.

- `01` **First term** A short clause describing it. *A question it answers?*
- `02` **Second term** A short clause describing it. *A question it answers?*
- `03` **Third term** A short clause describing it. *A question it answers?*
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  The claim,      01 Term  clause  note  │
│  why the         02 Term  clause  note  │
│  order matters.  03 Term  clause  note  │
│                  04 Term  clause  note  │
│                  05 Term  clause  note  │
│                  06 Term  clause  note  │
└─────────────────────────────────────────┘
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`split-panel`](../../statement/split-panel/split-panel.docs.md) — the featured element deserves its own colored panel, not a shared background
- [`list-tabular`](../../inventory/list-tabular/list-tabular.docs.md) — the rows need MORE than four fields, or a header row naming the columns
- [`cards-stack`](../../inventory/cards-stack/cards-stack.docs.md) — each term needs its own multi-sentence body, not a one-clause row
- [`glossary`](../../inventory/glossary/glossary.docs.md) — the terms are unordered and there's no claim to make about their sequence

## Demo deck

See [premise.gallery.light.pdf](./premise.gallery.light.pdf) for rendered examples of every variant.
