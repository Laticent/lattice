---
origin: 2722
priority: P3
recorded: 2026-10-16
area: diagram
severity: low
swimlane: engineering/decisions/2026-10-15-bridges-and-two-hosts.md §8 P0
source: https://github.com/Laticent/lattice/pull/2722
---

# A Mermaid diagram handed back from the cache loses its click and tooltip bindings

```text
  P3 · settleFenceFromCache writes the cached SVG but never calls Mermaid's bindFunctions, so a
       diagram with `click A "url" "tooltip"` goes inert whenever the cache answers instead of a
       fresh render.
       why now   — pre-existing in the same-task cache replay; #2722 added a second caller
                   (restoreStrippedDiagrams, which redraws an SVG VS Code's built-in Mermaid
                   extension strips), so the gap is now reachable on every VS Code preview update
                   as well as on every Studio keystroke. Found by the #2722 maker-checker; not
                   reproduced.
       where     — lib/plugins/mermaid/mermaid.hydrate.js settleFenceFromCache (the cache stores
                   only `result.svg`; the render path calls `result.bindFunctions(target)`).
       done when — a cached hand-back of a diagram with a click directive keeps its link and
                   tooltip; an integration test clicks a node after a cache replay and after a
                   strip-and-restore.
       evidence  — that test, run in Chromium, failing on main.
       verify    — tier 1 checker, because it touches the runtime's diagram cache and the
                   strict-security click path (#22).
```
