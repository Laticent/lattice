---
status: shipped
summary: A speed bake-off of Lattice's parser, markdown-it, against remark (unified / micromark / mdast) on the engine bench's jargon and stress decks. The harness is test/benchmark/markdown-it-vs-remark-bench.mjs. Re-measured on 2026-11-21 with markdown-it 14.3.3 against remark-parse 11 and unified 11. markdown-it turns markdown into HTML 28 to 36 times faster, parses 29 to 52 times faster, imports 2.5 times faster cold and holds about 6 times less heap. Verdict: markdown-it stays. Lattice's own plugins and transformers cost 20 to 30 times the bare parse, so render time sits in the kernel, not the parser.
---

# markdown-it vs remark: a speed bake-off

**Date:** 2026-11-21. First measured on 2026-06-26 in #520; that PR never merged,
so this note carries it onto `main` with every number re-measured.
**Status:** Investigation note. No engine change. markdown-it stays.
**Harness:** `test/benchmark/markdown-it-vs-remark-bench.mjs`. remark is not a
Lattice dependency, so install it without saving it, then run the bench:

```sh
npm i --no-save unified remark-parse remark-gfm remark-rehype rehype-stringify
node --expose-gc test/benchmark/markdown-it-vs-remark-bench.mjs
```

Without the packages, the harness exits with code 2 and prints that install line.

## The question

Lattice's engine (`lib/engine/index.js`) parses markdown with **markdown-it**,
which produces a flat **token stream** (a list of open, close and text tokens).
**remark** parses into **mdast**, a markdown syntax tree. It is the obvious
"what if we had used a tree" alternative. Would remark be faster for the work
Lattice actually does: parse a deck into HTML, once per render, often from a cold
CLI start?

## Three tiers, because the two are not drop-in equivalents

- **Tier 1, parse to HTML.** Plain `markdown-it` (CommonMark plus GFM tables and
  strikethrough) against `remark-parse` + `remark-gfm` + `remark-rehype` +
  `rehype-stringify`. Both get the same input and the same GFM surface, and
  neither gets a Lattice plugin.
- **Tier 2, parse only.** `md.parse()` (tokens) against `unified.parse()` (mdast).
  This isolates the cost of building the structure each plugin model walks.
- **Tier 3, the real Lattice path.** `api.render` from `lib/playground/index.js`:
  markdown-it, the Lattice plugins, the HTML transformers, highlight.js and KaTeX.
  remark has no equivalent, so this tier sizes the gap a migration would have to
  clear. It is not a race.

The harness also measures cold import time (a fresh child process per engine,
five runs, the minimum kept) and the heap one stress render retains.

## Results

Node 22.23.5, a 4-core cloud sandbox, markdown-it 14.3.3 against unified 11.0.5,
remark-parse 11.0.0, remark-gfm 4.0.1, remark-rehype 11.1.2 and
rehype-stringify 10.0.1. The times are tinybench medians.

| Workload | markdown-it | remark | markdown-it is faster by |
|---|---|---|---|
| Parse to HTML, normal (jargon, 30.9 KB) | 1.47 ms | 41.7 ms | **28.4×** |
| Parse to HTML, stress (jargon ×6, 185 KB) | 13.7 ms | 491 ms | **35.8×** |
| Parse only, normal | 1.19 ms | 34.6 ms | **29.1×** |
| Parse only, stress | 8.04 ms | 418 ms | **52.0×** |

The "faster by" column is the ratio of the two medians beside it. (The harness's own VERDICT line divides means instead,
which reads 24.6×, 38.5×, 23.9× and 51.6×.)

- **The Lattice path (tier 3):** 44.8 ms for the normal deck and 273 ms for the
  stress deck. That is about 30 times and 20 times the bare markdown-it render,
  so Lattice's own plugins and transformers take most of the render time. The
  parser takes little of it.
- **Cold import:** markdown-it 28.1 ms, remark 69.3 ms (2.5×), the whole Lattice
  engine 231 ms.
- **Heap retained by one stress render:** markdown-it 9.6 MB, remark 56.4 MB
  (5.9×).
- **Install size:** markdown-it brings 6 dependencies (1.9 MB for markdown-it
  itself). Installing the five remark packages added 84 packages to
  `node_modules`.

The parse-only gap matches the parse-to-HTML gap, so the difference lies in the
parser (micromark against markdown-it's tokenizer), not in HTML output. micromark
trades raw speed for spec precision and a tree that plugins can compose over.

## Verdict

**markdown-it stays.** On Lattice's decks it parses 28 to 52 times faster, imports
2.5 times faster and holds about 6 times less heap. remark's draw is the mdast tree
and its plugin ecosystem. Lattice already has a working token-stream kernel shared
by every render path (HARD RULE #1), so moving to remark would buy a nicer tree at
a large, permanent speed cost, plus a rewrite of the whole kernel.

The finding worth acting on is not about remark. If render time ever needs work,
the lever is Lattice's own plugin and transformer kernel, which costs 20 to 30
times the parse. (The 2026-06-26 run also named the per-render `buildMd` rebuild.
`lib/engine/index.js` now caches `buildMd`, so that lever has been pulled.)

## Caveats

- One machine, inside a sandbox. The ratios carry across machines; the absolute
  milliseconds do not. The 2026-06-26 run measured 33 to 40 times on another
  machine, the same verdict.
- Tier 3 runs markdown-it only, by design. A real remark-based Lattice would need
  the whole kernel rebuilt on mdast before it could race.
- remark runs with GFM on and raw HTML passed through, to match markdown-it.
  Turning on its sanitizer or more plugins would only widen the gap.
