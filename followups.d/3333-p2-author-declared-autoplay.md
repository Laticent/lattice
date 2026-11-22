---
origin: 3333
priority: P2
recorded: 2026-11-20
area: website
severity: medium
swimlane: engineering/decisions/2026-11-20-present-keeps-playing.md
source: https://github.com/Laticent/lattice/pull/3333
deferred: blocked — the front-matter shape is the owner's decision (D1 on #3333); it adds deck-format keys
---

# An author can make a deck start playing on its own

```text
  P2 · Author-declared autoplay for Present and the HTML player
       why now   — the owner asked for an autoplay deck setting with several axes (start, loop,
                   full screen), an entry in Deck settings and autocomplete.
       where     — lib/core/deck-settings.js, the front-matter schema, PresentOverlay.tsx,
                   lib/export/player-core.mjs (the player's own autoplay)
       done when — the decided keys (recommended: autoplay, autoplay-loop, autoplay-screen) parse,
                   autocomplete, show in Deck settings; Present and the player start, loop and
                   go full screen as declared; a browser that blocks sound until a tap shows
                   one "tap to start" instead of failing silently.
       evidence  — unit tests per key; the player e2e starting a declared deck
```
