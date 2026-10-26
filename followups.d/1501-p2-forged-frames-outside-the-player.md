---
origin: 1501
priority: P2
recorded: 2026-10-26
area: engine
severity: medium
swimlane: engineering/decisions/2026-08-04-shared-deck-narration-audio.md
source: https://github.com/Laticent/lattice/pull/2910
---

# Two more readers of the player's frames and notes that a deck can forge

```text
  P2 · [no ticket] root the video exporter's frame lookups and the player's notes lookup
       why now   — PR 2910 rooted the player's slide and frame lists at #lp-stage (#1501). The
                   independent checker found the same document-wide shape in two places it did
                   not touch (read from the code, NOT reproduced):
                     - video.mjs reads frames with document.querySelector(All)('.lp-frame…') at
                       about lines 182, 244-248, 368 and 524, so a slide carrying
                       <div class="lp-frame lp-active"> could skew the slide index and the crop.
                     - the player's hasNotes reads document.querySelector('aside.lattice-notes'),
                       and the current slide's notes come from s.querySelector(…), which can match
                       an author-nested section's notes (author content either way).
       where     — the video exporter (grep -rn "lp-frame" lib/export); player-core.mjs hasNotes.
       done when — both read only the player's own #lp-stage > .lp-frame > section, with a
                   forged-frame arm for the video path.
       evidence  — a forged deck exported to video before and after.
       verify    — tier 1 checker.
```
