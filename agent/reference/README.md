# Reference — machine records

For building a tool over Lattice, not for authoring a deck. If you are writing slides,
you want [`../authoring/`](../authoring/) and [`../components/`](../components/) instead —
everything here is either bulk or internals.

| File | What it is | ~tokens |
|---|---|---|
| `components.json` | The full machine record for every component: slots, skeletons, variants, capacity, density, when-to-use and anti-patterns. | ~100k |
| `grammar.json` | Which class tokens, variants and modifiers are legal where. What a linter or validator keys off. | ~42k |
| `forms.json` | The Form vocabulary — how a slide is composed (cells, mastheads, stage regions), one level above components. | ~4.3k |
| `concepts.json` | The ontology joining the two levels: what a component, modifier, token and Form each are, and how they relate. | ~1.3k |
| `components.md` | The prose catalog, whole. Almost never what you want — one component file is the same content for one component. | ~106k |
| `studio-prompts.md` | The prompts Lattice's product sends its own model when generating a theme or component. | ~6.1k |

~token figures are bytes ÷ 4, a rough cross-model approximation. Your tokenizer will differ;
the ratios are what matter.
