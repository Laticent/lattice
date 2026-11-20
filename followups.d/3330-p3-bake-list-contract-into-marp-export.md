---
origin: 3330
priority: P3
recorded: 2026-11-20
area: engine
severity: low
swimlane: engineering/gotchas/vscode.md §Known preview gaps — transforms shipped without a `lattice-runtime.js` mirror
source: https://github.com/Laticent/lattice/pull/3330
deferred: blocked — it changes the bytes of an exported artifact (the Export-to-Marp bundle's Markdown), which needs the owner's export sign-off (CLAUDE.md Quality Bar)
---

# Bake the list contract into the Export-to-Marp bundle

```text
  P3 · the list contract in a default VS Code preview
       why now   — W2 (#3330) applies the contract in the engine and, for a Marp render, in the
                   runtime. A default (Strict) Marp for VS Code preview runs no scripts, so there a
                   `-` agenda or a `1.` cycle renders as it did before W2. The inversion review of
                   #3330 ranked it the strongest case against the design; it is logged as a preview
                   gap in engineering/gotchas/vscode.md.
       where     — lib/export/marp-bundle.js (the exported deck's Markdown), lib/core/list-contract.js
                   (the per-slide contract), lib/export/marp-fidelity.js (the row becomes `baked`)
       done when — the exported .md writes each slide's lists in the marker its contract reads, so the
                   preview needs no script; a `1.` on a prose / numbered-tags layout stays as written
       evidence  — a deck with every R3 layout written in the "wrong" marker, exported, rendered in a
                   real marp-cli with scripts off: each layout draws; the ledger row reads `baked`
       verify    — owner export sign-off on a light and a dark demo bundle (Quality Bar)
```
