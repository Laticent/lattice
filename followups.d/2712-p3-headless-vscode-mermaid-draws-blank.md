---
origin: 2712
priority: P3
recorded: 2026-10-15
area: diagram
severity: low
swimlane: engineering/decisions/2026-10-15-bridges-and-two-hosts.md §8 P0
source: https://github.com/Laticent/lattice/pull/2712
---

# Mermaid draws blank in the headless VS Code harness, but not in a real VS Code

```text
  P3 · in a headless code-server with marp-vscode at the Disable security level, the runtime loads
       and marks every Mermaid fence rendered, but each SVG is 0 px wide.
       why now   — the owner's real VS Code, same bundle and same setting, draws Mermaid fine, so
                   this is most likely a harness artifact: Mermaid measures text as 0 wide in a
                   frame that is not painted. Until it is explained, the headless harness cannot be
                   trusted for the runtime-loaded census the bridges note's §7 asks for.
                   engineering/gotchas/vscode.md records the symptom and one clue: the diagrams drew
                   when bierner.markdown-mermaid was also installed.
       where     — the headless driver (the method in engineering/gotchas/vscode.md) and the
                   runtime's Mermaid pass (lib/plugins/mermaid/mermaid.hydrate.js).
       done when — either the harness draws Mermaid (and the gotcha entry says what it needed), or
                   the cause is shown to be ours and fixed, with a screenshot from a real VS Code.
```
