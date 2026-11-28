---
origin: 3362
priority: P2
recorded: 2026-11-27
area: engine
severity: medium
deferred: off-path — it lives in tools/export-marp.js, outside 3362's code, and it changes exported bytes, which needs the owner's sign-off with renders (CLAUDE.md QUALITY BAR)
swimlane: engineering/decisions/2026-11-20-coda-and-marp-parity.md
source: https://github.com/Laticent/lattice/pull/3362
---

# `export:marp <deck> <out> <palette>` ships that palette but leaves the deck's `theme:`, so Marp draws it unstyled

```text
  P2 · [no ticket] make the palette argument reach the bundled deck's front matter
       why now   — measured 2026-11-27 in a real VS Code (1.142.0, marp-vscode 3.6.1):
                   `node tools/export-marp.js examples/coda-everywhere.md out cuoio`
                   writes themes/cuoio*.css and registers them in .vscode/settings.json,
                   but the deck keeps `theme: indaco`. Marp finds no `indaco` theme and
                   falls back to its default with no warning: white slides, no card fills,
                   split-panel's dark panel gone and its column clipped. Without the
                   argument the bundle is right (it ships the deck's own palette).
       done when — with a palette argument the bundled deck's `theme:` names that palette
                   (or the export refuses the mismatch), a unit test pins it, and the
                   owner has seen dark and light renders of a bundle made both ways.
```
