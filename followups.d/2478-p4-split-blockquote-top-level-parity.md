---
origin: 2478
priority: P4
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2478
---

# split-compare / split-panel: the string path reads the verdict and the pull quote at any depth

Found while fixing the option-list and context-paragraph parity on #2478. Pre-existing HARD RULE
#1 gap. `lib/core/split-panels.js` `extractFirstBlockquote` takes the first `<blockquote>` anywhere,
with a non-greedy close. The DOM path (`lib/transformers/split-panels.js`) reads
`:scope > blockquote` on both layouts. So a blockquote inside raw HTML above the verdict (a
`<div>`) becomes the verdict or the pull quote on the string path only, and a blockquote nested
in the verdict cuts it at the inner `</blockquote>`. Left out of #2478 because the fix changes
`pullquote`'s output, and so needs its own census.

```text
  P4 · split-* string path reads the verdict / pull quote at any depth
       why now   — render-path parity; rare (needs a raw block or a nested quote).
       where     — lib/core/split-panels.js extractFirstBlockquote; reuse maskTopLevel(NESTING_BLOCKS).
       done when — both layouts take the first TOP-LEVEL blockquote, depth-aware; parity arms cover both.
       evidence  — the arms failing on main and passing after; an engine-HTML census of every deck.
       verify    — tier 1.
```
