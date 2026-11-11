---
origin: 2772
priority: P3
recorded: 2026-11-10
area: engine
severity: low
swimlane: engineering/decisions/2026-10-17-meta-record.md §4.4
source: https://github.com/Laticent/lattice/pull/2772
deferred: large — a new viewing mode in the HTML player (UI, keyboard verb, three widths, real-surface evidence)
---

# The HTML player shows reader notes nowhere yet.

D8 says the player's read view shows a slide's reader note under the slide, and its speaker view shows only the speaker
note. Step 2 carries the reader note into the player as its own hidden channel (`aside.lattice-reader`, from both the CLI
and the Studio's share export), so the data is there. The player has no read view to show it in.

```text
  P3 · [no ticket] Add a read view to the HTML player that shows `aside.lattice-reader` under each slide.
       why now   — a reader note reaches PDF and PPTX readers but not someone opening the shared HTML.
       where     — lib/export/player-core.mjs (the notes sheet reads aside.lattice-notes)
       done when — a deck with a `reader` field shows it under its slide in the player's read view, never in speaker view.
       evidence  — tools/screenshot.js at 1440, 820 and 390.
       verify    — tier 2: a player UI surface.
```
