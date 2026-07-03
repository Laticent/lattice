# code

> Single fenced code block as the slide's centerpiece.

**Function** evidence · **Form** canvas · **Substance** prose

**Tags** `snippet` · `walkthrough` · `reference`

Use when the code IS the slide — an API snippet, a config example, a migration. For comparing two versions, use compare-code.

## When to use

- **The code is the argument.** When a single snippet answers the question on the slide — the shape of an API call, the surface of a config, the body of a migration. Authoring follows the snippet, not the other way around.
- **Language hint earns the highlight.** Always include the language tag on the fence (```js, ```python, ```sql). The highlighter only triggers when the language is named; without it the slide reads as undifferentiated mono.
- **Twenty lines or fewer.** Past about twenty lines the type shrinks below boardroom legibility. Trim ruthlessly — keep imports out, elide bodies with `// ...`, and let the rest of the deck carry the surrounding context.

## When NOT to use

- **Comparing two versions.** If you need before/after, use compare-code — it gives both snippets parallel framing. code is for a single snippet doing one job.
- **Code-as-decoration.** A screenshot of an IDE or a snippet the audience cannot read defeats the layout. If the code is too long to legibly fit, the slide isn't a code slide — it's a content slide that talks about code.
- **No language hint.** A bare fence renders as undifferentiated mono. Always tag the language so the highlighter and the reviewer both know what they are looking at.

## Authoring

```markdown
<!-- _class: code -->

## What the new endpoint looks like.

```js
app.post('/api/v2/auth', async (req, res) => {
  const session = await issueSession(req.body);
  res.json({ session });
});
```
```

## Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing what the code shows. |
| `code` | `pre > code` | yes | Fenced code block — language tag drives syntax highlighting. |

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Code block heading.                    │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ function example() {              │  │
│  │   return 'syntax highlighted';    │  │
│  │ }                                 │  │
│  └───────────────────────────────────┘  │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`compare-code`](../../code/compare-code/compare-code.docs.md) — before/after snippet comparison
- [`diagram`](../../diagram/diagram/diagram.docs.md) — the architecture matters more than the code
- [`math`](../../math/math/math.docs.md) — the equation is the argument, not the implementation
- [`content`](../../statement/content/content.docs.md) — code is one piece of a longer prose explanation

## Demo deck

See [code.gallery.light.pdf](./code.gallery.light.pdf) for rendered examples of every variant.
