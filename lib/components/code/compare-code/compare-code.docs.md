# compare-code

> Two fenced code blocks side-by-side, each with a label.

**Function** comparison · **Form** split · **Substance** structure

**Tags** `snippet` · `contrast` · `tradeoff`

Use to contrast a before/after refactor, two API styles, or two configurations. Each side gets an h3 label and one fenced block.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing the comparison. |
| `left` | `p:has(> code:only-child):first-of-type + pre` | yes | Left label (an inline-code-only paragraph, e.g. `` `Before` ``) and the code block right after it. |
| `right` | `p:has(> code:only-child):nth-of-type(2) + pre` | yes | Right label (an inline-code-only paragraph, e.g. `` `After` ``) and the code block right after it. |

### Common mistakes

- **Using a markdown heading (`### Before`) for a column label instead of an inline-code paragraph.** The transform splits columns on `<p><code>` boundaries only — a heading isn't recognized at all, so both fenced blocks collapse into one lopsided column instead of two. Label each side with a backtick-wrapped paragraph (`` `Before` ``), matching the sample.
- **Omitting the second column's label.** The split happens at each label boundary — a missing second label leaves the second fenced block trailing inside the first column instead of starting a new one. Every side needs its own inline-code label.

## When to use

- **Concrete code on both sides.** Both sides hold short, readable snippets — refactor before/after, two API styles, two configurations. The diff is the point of the slide.
- **Equal-length snippets.** Snippets render side-by-side. Wildly different lengths break the visual balance — trim aggressively or split into two slides.
- **Names the change.** The inline-code label on each side names what the reader is looking at (`` `Before` ``, `` `After` ``, `` `v1` ``, `` `v2` ``). Without labels the audience has to infer.

## When NOT to use

- **One side is prose.** If one column is code and the other is description, use a single fenced block with surrounding prose. compare-code is for code-versus-code.
- **Snippets longer than 14 lines.** The text shrinks below readability past 14 lines per side. Split into two slides or extract the key delta into a smaller diff.
- **Three-way comparison.** compare-code is binary. For three configurations or three implementations, use prose with successive fenced blocks or a `compare-table`.

## Authoring

```markdown
<!-- _class: compare-code -->

## Heading framing the comparison.

`Before`

```js
function before() {
  return 'old';
}
```

`After`

```js
function after() {
  return 'new';
}
```
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Code comparison heading.               │
│                                         │
│  ┌──────────────┐     ┌──────────────┐  │
│  │ // before    │     │ // after     │  │
│  │ foo();       │     │ bar();       │  │
│  │ baz();       │     │ qux();       │  │
│  └──────────────┘     └──────────────┘  │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`compare-prose`](../../comparison/compare-prose/compare-prose.docs.md) — the change is state, not code
- [`redline`](../../comparison/redline/redline.docs.md) — the comparison is prose-versus-prose
- [`redline`](../../comparison/redline/redline.docs.md) — the change is in verbatim text or legal language
- [`compare-table`](../../comparison/compare-table/compare-table.docs.md) — three or more variants on shared dimensions

## Demo deck

See [compare-code.gallery.light.pdf](./compare-code.gallery.light.pdf) for rendered examples of every variant.
