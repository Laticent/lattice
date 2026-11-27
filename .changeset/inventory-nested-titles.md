---
"@laticent/lattice": minor
---

`inventory` entries now take the nested form every titled list uses: the name on the bullet, its description nested under it.

```markdown
- One part per row
  - A name and one clause of body.
```

The engine sets the name as the entry's title, so it needs no `**`. The one-line `- **Lead.** body` form is now the `card-style-inline-title` lint error on `inventory`, and `lint:deck --fix` rewrites it. A deck in the old form still renders as it did. A bold word inside a description now stays inline; before, it broke onto a line of its own. `matrix-2x2`'s docs and samples drop the `**` around quadrant labels, which the layout already set bold.

`citation-card` no longer needs `**` around an action card's label: `- What we must do` with a body nested under it is the action card. Before, only a typed `- **What we must do.**` made one.
