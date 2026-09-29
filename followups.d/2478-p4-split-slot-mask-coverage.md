---
origin: 2478
priority: P4
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2478
---

# split-* string path: the top-level mask misses some containers and raw-text elements

Found by the checker on the top-level blockquote fix. Pre-existing on `main`, not worsened by it.
`lib/core/split-panels.js` masks `NESTING_BLOCKS` (+ `ul`/`ol`) to find a TOP-LEVEL slot, but a
browser also nests a slot inside `<span>`, `<main>`, `<dd>`, a stray `<li>`, `<template>`,
`<svg><foreignObject>`, and treats the body of `<script>`/`<style>`/`<textarea>`/`<pre>` and attribute
values as text. So a `<blockquote>` (or a list, or a `<p>`) in any of those is read as the slot on the
string path while the DOM path (`:scope > …`) leaves it alone; with `<textarea>`/`<script>` the output
is mangled. An unclosed block AFTER the slot (the browser nests the running footer inside it) and an
unclosed `<table>` inside the quote also differ. Every case needs raw HTML in a deck; no committed deck
has one. The durable fix is a real tokenizer (parse5-level) for the slot reads, not a longer tag list.

```text
  P4 · split-* string path: top-level mask misses inline/raw-text containers
       why now   — render-path parity (HARD RULE #1); rare, raw HTML only.
       where     — lib/core/split-panels.js maskTopLevel / NESTING_BLOCKS (all slot reads).
       done when — a slot inside any browser container or raw-text element is not the slot, on both paths.
       evidence  — parity arms per container; an engine-HTML census of every deck.
       verify    — tier 1.
```
