---
origin: 2457
priority: P4
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2457
---

# split-compare: a list nested in a raw block before the options is taken as the options

Found by the checker on the split-compare stray-block fix. Pre-existing HARD RULE #1 gap.
`applyCompare` finds the option list with `extractFirstList`, which is not limited to top-level
elements, so a list inside a raw `<div>` or a table cell above the real options becomes the option
cards on the string path; the DOM path reads `:scope > ul, :scope > ol`. Since the stray-block fix
the real list then shows in the options zone instead of vanishing, so the slide is no worse than
before, but the two paths still disagree.

A second shape, found on the same review and also pre-existing: `extractFirstP`'s non-greedy mask
(`<(ul|…)\b…>[\s\S]*?<\/\1>`) stops at the first inner `</ul>`, so on a loose options list with a
nested list and a trailing `<p>` in an item, and no context paragraph, the string path takes that
item's `<p>` as the context paragraph while the DOM path does not. A depth-aware mask (the
`maskBlockquotes` shape in `split-panels.js`) fixes both.

```text
  P4 · split-compare string path takes a nested list for the options
       why now   — render-path parity; rare in real decks (needs raw HTML above the options).
       where     — lib/core/split-panels.js applyCompare / lib/core/html-lists.js extractFirstList.
       done when — both paths pick the first TOP-LEVEL list and paragraph; the parity test covers both shapes.
       evidence  — the new parity arm failing on main and passing after.
       verify    — tier 1.
```
