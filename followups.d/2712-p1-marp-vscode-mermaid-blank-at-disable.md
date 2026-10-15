---
origin: 2712
priority: P1
recorded: 2026-10-15
area: diagram
severity: high
swimlane: engineering/decisions/2026-10-15-bridges-and-two-hosts.md §8 P0
source: https://github.com/Laticent/lattice/pull/2712
---

# Mermaid renders blank in the VS Code Marp preview even when scripts run

```text
  P1 · at the Disable security level the runtime loads and marks every Mermaid fence rendered,
       but each SVG is 0 px wide.
       why now   — Disable is the only preview security level that runs our scripts, and it is the
                   owner's usual setting, so this blank is what the owner sees in place of every
                   diagram. engineering/gotchas/vscode.md records the
                   symptom ("mechanism not chased"); #2712 reproduced it on code-server 4.141.0 with
                   marp-vscode 3.6.1 (7 of 7 fences in examples/diagram-narration.md).
       where     — the runtime's Mermaid pass (lib/plugins/mermaid/mermaid.hydrate.js) inside the
                   marp-vscode webview.
       done when — the diagrams paint at Disable in a real VS Code preview, with a screenshot.
```
