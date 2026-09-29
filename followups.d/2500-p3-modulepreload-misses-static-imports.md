---
origin: 2500
priority: P3
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2500
---

# The Studio and Playground preload hints miss part of their static-import closure

```text
  P3 · [no ticket] inject-modulepreload.mjs leaves static imports out of the hints.
       why now   — PR #2500 made the route budget follow static imports and found that
                   the hints the Studio and Playground pages carry are incomplete: 8
                   chunks (3.9KB gz) on studio, 14 (27KB gz) on playground, e.g.
                   prefetch-engine, diagnostic-overlay, deck-preview, split-sections.
                   A chunk without a hint is fetched only after its importer parses,
                   one round trip later.
       where     — docs/scripts/inject-modulepreload.mjs (how it collects the closure
                   for ENTRIES).
       done when — every static import reachable from an ENTRIES page's hinted chunks
                   has a modulepreload hint, or the ones left out are listed as
                   deliberately lazy.
       evidence  — `node docs/scripts/check-route-budget.mjs --measure docs/dist`
                   chunk counts vs the hint counts inject-modulepreload prints.
       verify    — tier 1: a built dist whose studio/playground HTML hints every chunk
                   the measure follows.
```
