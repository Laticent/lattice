---
marp: true
theme: indaco
color-mode: dark
logo: ../lib/base/_logo/acme-logo.svg
logo-on: title
logo-x: 50
logo-y: 82
logo-scale: 1.0
meta: Export fidelity · Marp bundle
finish: atrium
---

<!-- _class: title finish-none -->

# What survives the export

`Export to Marp`

The deck-wide registers and every structural transform make it. Six constructs degrade, and the bundle says which.

---

<!-- _class: content -->

## The deck-wide registers travel in the document, not over the network

- Baked, not fetched
  - Front matter is carried into the rendered HTML as an inert data block, so the color mode, logo, and masthead meta land even from a double-clicked file.
- Why it had to change
  - The runtime used to fetch the source markdown beside the document. `fetch` cannot read a `file://` URL, which is how both a recipient and marp-cli open the deck.

---

<!-- _class: matrix-grid -->

## Bracket-marker cells render as swatches on both paths

| Role | Draft | Review | Approve |
|---|---|---|---|
| Author | [x] Owner | [-] | [ ] |
| Legal | [ ] | [x] Reviewer | [-] |
| Finance | [ ] | [-] | [x] Signatory |

---

<!-- _class: glossary -->

## Glossary

- ARR
  - Revenue a business can reliably expect to recur every year.
- NDR
  - The share of last year's revenue kept and expanded.

| Source | Note |
|---|---|
| Finance | Q3 close — an unrelated table, which must not feed the range pill |

---

<!-- _class: math -->

## Math renders, with a different typesetter

$$ \int_0^1 x^2 \, dx = \frac{1}{3} $$

---

<!-- _class: content -->

## A function-plot fence degrades to its config

```functionplot
{ "fn": "x^2", "domain": [-3, 3] }
```

---

<!-- _class: content with-period -->

## A with-period heading keeps its period only on the engine

- What differs
  - The trailing period is added while the deck is parsed, which is earlier than any Marp tool lets a plugin in.
- What does not
  - Every component layout, the palette, the typography, and Mermaid all render the same.
