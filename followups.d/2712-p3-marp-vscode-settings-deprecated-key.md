---
origin: 2712
priority: P3
recorded: 2026-10-15
area: engine
severity: low
swimlane: engineering/decisions/2026-10-15-bridges-and-two-hosts.md §8 P0
source: https://github.com/Laticent/lattice/pull/2712
---

# The Marp bundle writes a VS Code setting marp-vscode 3.6.1 deprecates

```text
  P3 · vscodeSettings() writes "markdown.marp.enableHtml": true.
       why now   — marp-vscode 3.6.1 marks the key deprecated in favor of "markdown.marp.html"
                   (off | default | all) and shows a warning popup when the old key is set. It
                   still works through a legacy branch. Measured on a real code-server 4.141.0
                   with marp-vscode 3.6.1 for #2712.
       where     — lib/core/marp-bundle.js vscodeSettings() (line ~508) and the bundle README text
                   that names the key.
       done when — the bundle writes "markdown.marp.html": "all" (decide whether to keep the old
                   key alongside for older extension versions), and the README says so.
```
