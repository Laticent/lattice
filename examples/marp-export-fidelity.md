---
marp: true
theme: indaco
color-mode: dark
logo: sample:logo-acme-mark.svg
logo-finish: bottom-center title
meta: Export fidelity · Marp bundle
finish: atrium
---

<!-- @meta{layout=title, class=no-finish} -->

# What survives the export

`Export to Marp`

The deck-wide registers and every structural transform make it. Six constructs degrade, and the bundle says which.

---

<!-- @meta{layout=content} -->

## The deck-wide registers travel in the document, not over the network

- Baked, not fetched
  - Front matter is carried into the rendered HTML as an inert data block, so the color mode, logo, and masthead meta land even from a double-clicked file.
- Why it had to change
  - The runtime used to fetch the source markdown beside the document. `fetch` cannot read a `file://` URL, which is how both a recipient and marp-cli open the deck.

---

<!-- @meta{layout=matrix-grid} -->

## Bracket-marker cells render as swatches on both paths

| Role | Draft | Review | Approve |
|---|---|---|---|
| Author | [x] Owner | [-] | [ ] |
| Legal | [ ] | [x] Reviewer | [-] |
| Finance | [ ] | [-] | [x] Signatory |

---

<!-- @meta{layout=glossary} -->

## Glossary

- ARR
  - Revenue a business can reliably expect to recur every year.
- NDR
  - The share of last year's revenue kept and expanded.

| Source | Note |
|---|---|
| Finance | Q3 close — an unrelated table, which must not feed the range pill |

---

<!-- @meta{layout=image} -->

`Offsite · Day One`

## The image bucket needs both halves of the fix.

The `![bg]` lift is baked into the exported deck; the text panel is folded by the runtime. Either one alone renders wrong.

![A figure by a lake under a low sun](sample:photo-wide.svg)

---

<!-- @meta{layout=math} -->

## Math renders, with a different typesetter

$$ \int_0^1 x^2 \, dx = \frac{1}{3} $$

---

<!-- @meta{layout=content} -->

## A function-plot fence degrades to its config

```functionplot
{
  "data": [{ "fn": "x^2" }],
  "xAxis": { "domain": [-3, 3], "label": "x" },
  "yAxis": { "domain": [0, 9], "label": "x²" },
  "grid": true
}
```

---

<!-- @meta{layout=content, class=with-period} -->

## A with-period heading keeps its period only on the engine

- What differs
  - The trailing period is added while the deck is parsed, which is earlier than any Marp tool lets a plugin in.
- What does not
  - Every component layout, the palette, the typography, and Mermaid all render the same.
