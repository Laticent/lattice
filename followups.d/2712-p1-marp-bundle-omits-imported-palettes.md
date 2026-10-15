---
origin: 2712
priority: P1
recorded: 2026-10-15
area: engine
severity: high
swimlane: engineering/decisions/2026-10-15-bridges-and-two-hosts.md §8 P0
source: https://github.com/Laticent/lattice/pull/2712
---

# The Marp bundle omits a palette its own palette imports

```text
  P1 · a Marp export ships the deck's palette but not the palette that file @imports.
       why now   — the exported deck renders without its colors in Marp. Found by the layer
                   census for #2712: five of 276 example decks. examples/accent-on-accent.md
                   (theme: atelier-dark) exports themes/atelier-dark.css, which is
                   `@import"atelier"`, and no atelier.css. examples/a11y.md
                   (a11y-deuteranopia) misses a11y-base and onyx. Also topic-shelf-floor.md
                   (onyx), dark-diagram-fills.md (laguna), deck-logo-dark-theme.md (indaco).
       where     — lib/core/marp-bundle.js, the asset manifest's palette set (and the CLI
                   producer tools/export-marp.js that copies it).
       done when — every palette a shipped palette @imports, transitively, is in themes/, and a
                   test exports a -dark and an a11y deck and asserts no unresolved @import.
       evidence  — engineering/decisions/2026-10-15-bridges-and-two-hosts/layer-census-results.jsonl,
                   field bundleMissingPalettes.
```
