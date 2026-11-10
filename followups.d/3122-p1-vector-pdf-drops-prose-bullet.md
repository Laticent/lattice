---
origin: 3122
priority: P1
recorded: 2026-11-10
area: engine
severity: medium
swimlane: engineering/decisions/2026-09-13-pdf-export-text-layer.md
deferred: off-path — Lattice's own vector PDF writer; this PR changed only the Marp hand-offs
source: https://github.com/Laticent/lattice/pull/3122
---

# Lattice's vector PDF drops the bullet on a running-text list item (`li[data-prose]`)

```text
  P1 · the engine's PDF loses the list marker a Marp render keeps
       why now   — comparing the kit's video deck slide for slide (Lattice engine vs marp-cli) while
                   building PR 3122: slide 3's running-text item (a list item the engine marks
                   `data-prose`) has its bullet in the Marp render and none in Lattice's vector PDF.
                   Pre-existing; the HTML render was not checked.
       where     — the vector PDF writer's list-marker path (engineering/decisions/2026-09-13-pdf-export-text-layer.md);
                   the `[data-prose]` rules in the engine CSS decide whether a marker is drawn.
       done when — a `li[data-prose]` that shows a bullet on screen shows it in the vector PDF, pinned by a test
                   on a deck with one such item; or the decision that prose items carry no bullet is
                   written down and the screen render agrees.
       verify    — tier 0 plus one rendered PDF compared with the HTML render.
```
