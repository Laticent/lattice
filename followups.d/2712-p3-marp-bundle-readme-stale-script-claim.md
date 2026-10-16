---
origin: 2712
priority: P3
recorded: 2026-10-15
area: docs
severity: low
swimlane: engineering/decisions/2026-10-15-bridges-and-two-hosts.md §8 P0
source: https://github.com/Laticent/lattice/pull/2712
---

# The Marp bundle README still says nobody can confirm whether VS Code runs its scripts

```text
  P3 · the generated README says whether the preview executes the deck's <script> tags "is not
       something we can confirm".
       why now   — engineering/gotchas/vscode.md settled it on 2026-09-06 and #2712 reproduced it:
                   blocked at the default preview security level (Strict, a nonce-only CSP), run
                   at Disable, which is a per-workspace setting no bundle file can ship.
       where     — lib/core/marp-bundle.js, the README template (line ~667).
       done when — the README states the measured behavior and the one way to enable it: a
                   trusted workspace plus Markdown: Change Preview Security Settings → Disable.
                   It also says that the two "Allow insecure … content" levels do NOT run scripts
                   (they keep the script nonce).
```
